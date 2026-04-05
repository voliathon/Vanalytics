-- addon/vanalytics/moves.lua
-- Inventory move order polling, validation, and execution module

local moves = {}

-- Dependencies (set via init)
local settings = nil
local http_request_fn = nil
local json_encode_fn = nil
local json_decode_fn = nil
local log_fn = nil
local log_error_fn = nil
local log_success_fn = nil
local enqueue_fn = nil -- function to add work to the main work queue

-- Pending moves from last poll
local pending_moves = nil

-----------------------------------------------------------------------
-- API bag name -> Windower bag ID mapping
-- Used for packet injection (outgoing 0x029)
-----------------------------------------------------------------------
local api_to_bag_id = {
    Inventory = 0,
    Safe      = 1,
    Storage   = 2,
    Locker    = 3,
    Satchel   = 5,
    Sack      = 6,
    Case      = 7,
    Wardrobe  = 8,
    Safe2     = 9,
    Wardrobe2 = 10,
    Wardrobe3 = 11,
    Wardrobe4 = 12,
    Wardrobe5 = 13,
    Wardrobe6 = 14,
    Wardrobe7 = 15,
    Wardrobe8 = 16,
}

-- API bag name -> Windower bag key (for get_items() access check)
local api_to_bag_key = {
    Inventory = 'inventory',
    Safe      = 'safe',
    Storage   = 'storage',
    Locker    = 'locker',
    Satchel   = 'satchel',
    Sack      = 'sack',
    Case      = 'case',
    Wardrobe  = 'wardrobe',
    Safe2     = 'safe2',
    Wardrobe2 = 'wardrobe2',
    Wardrobe3 = 'wardrobe3',
    Wardrobe4 = 'wardrobe4',
    Wardrobe5 = 'wardrobe5',
    Wardrobe6 = 'wardrobe6',
    Wardrobe7 = 'wardrobe7',
    Wardrobe8 = 'wardrobe8',
}

-----------------------------------------------------------------------
-- Initialize with dependencies from the main addon
-----------------------------------------------------------------------
function moves.init(deps)
    settings = deps.settings
    http_request_fn = deps.http_request
    json_encode_fn = deps.json_encode
    json_decode_fn = deps.json_decode
    log_fn = deps.log
    log_error_fn = deps.log_error
    log_success_fn = deps.log_success
    enqueue_fn = deps.enqueue
end

-----------------------------------------------------------------------
-- Poll for pending moves (called during sync cycle)
-- Does NOT execute — just checks and notifies the user.
-----------------------------------------------------------------------
function moves.check_pending()
    if settings.ApiKey == '' then return end

    local player = windower.ffxi.get_player()
    if not player then return end

    local ltn12 = require('ltn12')
    local response_body = {}

    local result, status_code = http_request_fn({
        url = settings.ApiUrl .. '/api/sync/inventory/moves/pending',
        method = 'GET',
        headers = {
            ['X-Api-Key'] = settings.ApiKey,
        },
        sink = ltn12.sink.table(response_body),
    })

    if not result or status_code ~= 200 then
        if result then
            log_error_fn('Failed to check pending moves (HTTP ' .. tostring(status_code) .. ')')
        end
        return
    end

    local body = table.concat(response_body)
    local data = json_decode_fn(body)
    if not data or not data.moves or #data.moves == 0 then
        pending_moves = nil
        return
    end

    pending_moves = data.moves
    log_fn(#pending_moves .. ' pending inventory move(s). Type //va moves execute to run them.')
end

-----------------------------------------------------------------------
-- Show status of pending moves
-----------------------------------------------------------------------
function moves.status()
    if not pending_moves or #pending_moves == 0 then
        log_fn('No pending inventory moves.')
        return
    end

    log_fn(#pending_moves .. ' pending move(s):')
    for _, m in ipairs(pending_moves) do
        log_fn('  ' .. m.quantity .. 'x ' .. m.itemName .. ': ' .. m.fromBag .. ' -> ' .. m.toBag)
    end
end

-----------------------------------------------------------------------
-- Check which bags are currently accessible
-- Returns a set of API bag names that are accessible
-----------------------------------------------------------------------
local function get_accessible_bags()
    local items = windower.ffxi.get_items()
    if not items then return {} end

    local accessible = {}
    for api_name, bag_key in pairs(api_to_bag_key) do
        if items[bag_key] then
            accessible[api_name] = true
        end
    end
    return accessible
end

-----------------------------------------------------------------------
-- Build the packet data for outgoing 0x029 (Item Move)
-- Slot index in the packet is 0-based; API/Windower use 1-based.
-----------------------------------------------------------------------
local function build_move_packet(quantity, from_bag_id, to_bag_id, from_slot_1based)
    local from_slot_0based = from_slot_1based - 1
    return string.char(
        -- bytes 0x04-0x07: quantity (little-endian uint32)
        bit.band(quantity, 0xFF),
        bit.band(bit.rshift(quantity, 8), 0xFF),
        bit.band(bit.rshift(quantity, 16), 0xFF),
        bit.band(bit.rshift(quantity, 24), 0xFF),
        -- byte 0x08: source bag
        from_bag_id,
        -- byte 0x09: destination bag
        to_bag_id,
        -- byte 0x0A: source slot (0-based)
        from_slot_0based,
        -- byte 0x0B: padding
        0
    )
end

-----------------------------------------------------------------------
-- Execute all pending moves (called by //va moves execute)
-----------------------------------------------------------------------
function moves.execute()
    if not pending_moves or #pending_moves == 0 then
        log_fn('No pending inventory moves.')
        return
    end

    local accessible = get_accessible_bags()

    -- Partition into executable and skipped
    local executable = {}
    local skipped = {}
    local missing_bags = {}

    for _, m in ipairs(pending_moves) do
        local from_ok = accessible[m.fromBag]
        local to_ok = accessible[m.toBag]
        if from_ok and to_ok then
            table.insert(executable, m)
        else
            table.insert(skipped, m)
            if not from_ok and not missing_bags[m.fromBag] then
                missing_bags[m.fromBag] = true
            end
            if not to_ok and not missing_bags[m.toBag] then
                missing_bags[m.toBag] = true
            end
        end
    end

    if #executable == 0 then
        local bag_list = {}
        for bag in pairs(missing_bags) do table.insert(bag_list, bag) end
        log_error_fn('Cannot execute — requires access to: ' .. table.concat(bag_list, ', ') .. '. Try from your Mog House.')
        return
    end

    if #skipped > 0 then
        local bag_list = {}
        for bag in pairs(missing_bags) do table.insert(bag_list, bag) end
        log_fn('Skipped ' .. #skipped .. ' move(s) — requires access to: ' .. table.concat(bag_list, ', '))
    end

    -- Enqueue each move as a work queue entry (one per frame)
    local executed_ids = {}

    for i, m in ipairs(executable) do
        enqueue_fn(function()
            local from_bag_id = api_to_bag_id[m.fromBag]
            local to_bag_id = api_to_bag_id[m.toBag]

            if from_bag_id and to_bag_id then
                local packet = build_move_packet(m.quantity, from_bag_id, to_bag_id, m.fromSlot)
                windower.packets.inject_outgoing(0x29, packet)
                log_fn('Moving ' .. m.quantity .. 'x ' .. m.itemName .. ': ' .. m.fromBag .. ' -> ' .. m.toBag)
            else
                log_error_fn('Unknown bag in move order: ' .. tostring(m.fromBag) .. ' / ' .. tostring(m.toBag))
            end

            table.insert(executed_ids, m.id)
        end)
    end

    -- Enqueue the acknowledge call after all moves
    enqueue_fn(function()
        if #executed_ids == 0 then return end

        local ltn12 = require('ltn12')
        local payload = json_encode_fn({ moveIds = executed_ids })
        local response_body = {}

        local result, status_code = http_request_fn({
            url = settings.ApiUrl .. '/api/sync/inventory/moves/acknowledge',
            method = 'POST',
            headers = {
                ['Content-Type'] = 'application/json',
                ['Content-Length'] = tostring(#payload),
                ['X-Api-Key'] = settings.ApiKey,
            },
            source = ltn12.source.string(payload),
            sink = ltn12.sink.table(response_body),
        })

        if result and status_code == 200 then
            log_success_fn('Executed ' .. #executed_ids .. ' inventory move(s).')
        else
            log_error_fn('Failed to acknowledge moves (HTTP ' .. tostring(status_code) .. '). Moves may re-appear on next sync.')
        end

        pending_moves = nil
    end)
end

return moves
