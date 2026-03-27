# Equipment Model DAT Path Generation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a complete `model-dat-paths.json` from AltanaView + LandSandBoat data, replacing the ~50% coverage file to fix "No model available" errors across all AF/expansion equipment.

**Architecture:** Single Node.js generation script fetches AltanaView equipment CSVs (ROM paths) and LandSandBoat item_equipment.sql (authoritative model IDs), cross-references them by normalized item name, and outputs the existing JSON format with no consumer code changes.

**Tech Stack:** Node.js ESM script (`.mjs`), `fetch()` for HTTP, `fs` for output. No dependencies.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `scripts/generate-model-dat-paths.mjs` | Create | Main generation script |
| `scripts/model-id-overrides.json` | Create | Manual overrides for unmatched models |
| `public/data/model-dat-paths.json` | Overwrite | Output (same format, better coverage) |

All paths relative to `src/Vanalytics.Web/`.

---

### Task 1: Create script scaffold with constants and CLI entry point

**Files:**
- Create: `src/Vanalytics.Web/scripts/generate-model-dat-paths.mjs`

- [ ] **Step 1: Create the script file with constants, race/slot mappings, and main() entry point**

```js
/**
 * Generates model-dat-paths.json from AltanaView equipment CSVs + LandSandBoat item_equipment.sql.
 *
 * AltanaView provides ROM paths for every visual equipment model per race/slot.
 * LandSandBoat provides authoritative model IDs (MId) used by the game client.
 * The script cross-references them by normalized item name to produce a complete mapping.
 *
 * Run:    node scripts/generate-model-dat-paths.mjs
 * Output: public/data/model-dat-paths.json
 */

const AV_BASE = 'https://raw.githubusercontent.com/mynameisgonz/AltanaView/master/List/PC'
const LSB_EQUIP_URL = 'https://raw.githubusercontent.com/LandSandBoat/server/base/sql/item_equipment.sql'

const RACES = [
  { folder: 'HumeM',    raceId: 1, label: 'Hume Male' },
  { folder: 'HumeF',    raceId: 2, label: 'Hume Female' },
  { folder: 'ElvaanM',  raceId: 3, label: 'Elvaan Male' },
  { folder: 'ElvaanF',  raceId: 4, label: 'Elvaan Female' },
  { folder: 'Tarutaru', raceId: 5, label: 'Tarutaru' },
  { folder: 'Mithra',   raceId: 7, label: 'Mithra' },
  { folder: 'Galka',    raceId: 8, label: 'Galka' },
]

// Tarutaru M/F share models — race 6 reuses race 5 data
const TARU_FEMALE_RACE_ID = 6

const SLOTS = [
  { csv: 'Head.csv',  slotId: 2, label: 'Head' },
  { csv: 'Body.csv',  slotId: 3, label: 'Body' },
  { csv: 'Hands.csv', slotId: 4, label: 'Hands' },
  { csv: 'Legs.csv',  slotId: 5, label: 'Legs' },
  { csv: 'Feet.csv',  slotId: 6, label: 'Feet' },
  { csv: 'Main.csv',  slotId: 7, label: 'Main' },
  { csv: 'Sub.csv',   slotId: 8, label: 'Sub' },
  { csv: 'Range.csv', slotId: 9, label: 'Range' },
]

// item_equipment.sql slot bitmask → model slot ID
const SLOT_BITMASK_TO_ID = {
  1: 7, 2: 8, 3: 7, 4: 9,
  16: 2, 32: 3, 64: 4, 128: 5, 256: 6,
}

async function main() {
  console.log('Generating model-dat-paths.json...\n')

  // Steps 2-6 will fill this in
  console.log('TODO: implement pipeline')
}

main().catch(err => { console.error(err); process.exit(1) })
```

- [ ] **Step 2: Verify the script runs**

Run: `cd src/Vanalytics.Web && node scripts/generate-model-dat-paths.mjs`
Expected: Prints "Generating model-dat-paths.json..." then "TODO: implement pipeline"

- [ ] **Step 3: Commit**

```bash
git add src/Vanalytics.Web/scripts/generate-model-dat-paths.mjs
git commit -m "feat: scaffold generate-model-dat-paths script"
```

---

### Task 2: Add name normalization and abbreviation expansion

**Files:**
- Modify: `src/Vanalytics.Web/scripts/generate-model-dat-paths.mjs`

- [ ] **Step 1: Add the normalization function after the constants**

This function normalizes both LandSandBoat item names (e.g., `'vlr._surcoat_+2'`) and AltanaView display names (e.g., `Valor Surcoat (PLD AF2)`) to a common form for matching.

```js
// Known abbreviations in LandSandBoat item names → full forms used by AltanaView
const ABBREVIATIONS = {
  'vlr': 'valor',
  'cab': 'caballarius',
  'ftrs': 'fighters',
  'tmpl': 'temple',
  'hlrs': 'healers',
  'wzds': 'wizards',
  'wlks': 'warlocks',
  'rgns': 'rogues',
  'glnt': 'gallant',
  'chs': 'chaos',
  'bsts': 'beast',
  'chrl': 'choral',
  'hntrs': 'hunters',
  'myochin': 'myochin',
  'koga': 'koga',
  'wyrm': 'wyrm',
  'smnrs': 'summoners',
  'dncrs': 'dancers',
  'schlrs': 'scholars',
  'mgs': 'magus',
  'crss': 'corsairs',
  'pptrn': 'puppetry',
  'mntr': 'monster',
  'brd': 'bards',
  'scts': 'scouts',
  'stms': 'saotome',
  'asn': 'assassins',
  'dsts': 'duelist',
  'srcs': 'sorcerers',
  'clrc': 'clerics',
  'mle': 'melee',
  'wrrs': 'warriors',
  'rvlrs': 'ravagers',
  'crds': 'cirds',
  'jstcorps': 'justaucorps',
  'jstcrps': 'justaucorps',
  'o.bow': 'other bow',
}

/**
 * Normalize an item name for cross-reference matching.
 * Handles both LSB format ('vlr._surcoat_+2') and AV format ('Valor Surcoat (PLD AF2)').
 */
function normalizeName(name) {
  let n = name.toLowerCase()

  // Remove AF labels like "(PLD AF1)", "(WAR AF2)", etc.
  n = n.replace(/\s*\([^)]*af\d*\)\s*/gi, '')

  // Remove +N suffixes
  n = n.replace(/[_\s]*\+\d+/g, '')

  // Replace underscores and dots with spaces, collapse whitespace
  n = n.replace(/[_.]/g, ' ').replace(/\s+/g, ' ').trim()

  // Expand known abbreviations (whole-word only)
  const words = n.split(' ')
  const expanded = words.map(w => ABBREVIATIONS[w] || w)
  n = expanded.join(' ')

  // Strip remaining punctuation except spaces
  n = n.replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()

  return n
}
```

- [ ] **Step 2: Add a quick self-test block at the end of main() to verify normalization**

```js
  // Normalization self-test
  const tests = [
    ["'vlr._surcoat_+2'", 'vlr._surcoat_+2', 'valor surcoat'],
    ['AV: Valor Surcoat (PLD AF2)', 'Valor Surcoat (PLD AF2)', 'valor surcoat'],
    ["'cab._surcoat_+1'", 'cab._surcoat_+1', 'caballarius surcoat'],
    ["'gallant_surcoat'", 'gallant_surcoat', 'gallant surcoat'],
    ["'ftrs._lorica'", 'ftrs._lorica', 'fighters lorica'],
    ['AV: Choral Jstcorps', 'Choral Jstcorps (BRD AF1)', 'choral justaucorps'],
  ]
  let passed = 0
  for (const [label, input, expected] of tests) {
    const result = normalizeName(input)
    if (result === expected) {
      passed++
    } else {
      console.error(`  FAIL: ${label}: got "${result}", expected "${expected}"`)
    }
  }
  console.log(`Normalization self-test: ${passed}/${tests.length} passed`)
  if (passed < tests.length) process.exit(1)
```

- [ ] **Step 3: Run to verify normalization works**

Run: `cd src/Vanalytics.Web && node scripts/generate-model-dat-paths.mjs`
Expected: "Normalization self-test: 6/6 passed"

- [ ] **Step 4: Commit**

```bash
git add src/Vanalytics.Web/scripts/generate-model-dat-paths.mjs
git commit -m "feat: add name normalization with abbreviation expansion"
```

---

### Task 3: Parse LandSandBoat item_equipment.sql

**Files:**
- Modify: `src/Vanalytics.Web/scripts/generate-model-dat-paths.mjs`

- [ ] **Step 1: Add the fetch + parse function after normalizeName()**

```js
/**
 * Fetch and parse LandSandBoat item_equipment.sql.
 * Returns: Map<slotId, Map<MId, Set<normalizedName>>>
 *
 * Each slot maps model IDs to the set of normalized item names that use that model.
 * Multiple items often share the same visual model (e.g., Valor Surcoat, Vlr. Surcoat +1,
 * Cab. Surcoat all use MId 77).
 */
async function fetchLsbEquipment() {
  console.log('Fetching LandSandBoat item_equipment.sql...')
  const res = await fetch(LSB_EQUIP_URL)
  if (!res.ok) throw new Error(`Failed to fetch item_equipment.sql: ${res.status}`)
  const sql = await res.text()

  // Parse: (itemId,'name',level,ilevel,jobs,MId,shieldSize,scriptType,slot,rslot,rslotlook,su_level)
  const regex = /\((\d+),'([^']*)',\d+,\d+,\d+,(\d+),\d+,\d+,(\d+),\d+,\d+,\d+\)/g

  // slotId → Map<MId, Set<normalizedName>>
  const bySlot = new Map()

  let match
  let total = 0
  while ((match = regex.exec(sql)) !== null) {
    const name = match[2]
    const modelId = parseInt(match[3], 10)
    const slotBitmask = parseInt(match[4], 10)

    if (modelId <= 0) continue
    const slotId = SLOT_BITMASK_TO_ID[slotBitmask]
    if (!slotId) continue

    if (!bySlot.has(slotId)) bySlot.set(slotId, new Map())
    const slotMap = bySlot.get(slotId)
    if (!slotMap.has(modelId)) slotMap.set(modelId, new Set())
    slotMap.get(modelId).add(normalizeName(name))
    total++
  }

  console.log(`  Parsed ${total} equipment entries across ${bySlot.size} slots`)
  return bySlot
}
```

- [ ] **Step 2: Call it from main() and print summary stats**

Replace the "TODO" line in `main()` with:

```js
  const lsbData = await fetchLsbEquipment()
  for (const [slotId, models] of [...lsbData.entries()].sort((a, b) => a[0] - b[0])) {
    const slotLabel = SLOTS.find(s => s.slotId === slotId)?.label || `Slot ${slotId}`
    console.log(`  ${slotLabel}: ${models.size} unique model IDs`)
  }
```

- [ ] **Step 3: Run and verify**

Run: `cd src/Vanalytics.Web && node scripts/generate-model-dat-paths.mjs`
Expected output like:
```
Fetching LandSandBoat item_equipment.sql...
  Parsed ~7000+ equipment entries across 8 slots
  Head: ~300+ unique model IDs
  Body: ~300+ unique model IDs
  ...
```

- [ ] **Step 4: Commit**

```bash
git add src/Vanalytics.Web/scripts/generate-model-dat-paths.mjs
git commit -m "feat: parse LandSandBoat item_equipment.sql for model IDs"
```

---

### Task 4: Parse AltanaView equipment CSVs

**Files:**
- Modify: `src/Vanalytics.Web/scripts/generate-model-dat-paths.mjs`

- [ ] **Step 1: Add the AltanaView CSV parser**

Armor CSVs (Head, Body, Hands, Legs, Feet) have plain `folder/file,Name` lines.
Weapon CSVs (Main, Sub, Range) have `@Category` header lines interspersed.
Both formats need to produce a sequential array where data-line index = AV model index.

```js
/**
 * Parse an AltanaView equipment CSV into an array of { romPath, name, avIndex }.
 * Skips @Category headers and blank lines. Data-line index = AV model index.
 *
 * CSV format: "folder/file,DisplayName" → ROM path "ROM/{folder}/{file}.dat"
 */
function parseEquipmentCsv(text) {
  const entries = []
  let dataIndex = 0

  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('@')) continue

    const comma = trimmed.indexOf(',')
    if (comma < 0) continue

    const pathPart = trimmed.slice(0, comma).trim()
    const name = trimmed.slice(comma + 1).trim()

    // Parse "folder/file" → "ROM/folder/file.dat"
    const slash = pathPart.indexOf('/')
    if (slash < 0) continue
    const folder = pathPart.slice(0, slash)
    const file = pathPart.slice(slash + 1)
    const romPath = `ROM/${folder}/${file}.dat`

    entries.push({ avIndex: dataIndex, romPath, name })
    dataIndex++
  }

  return entries
}

/**
 * Fetch an AltanaView equipment CSV for a given race folder and slot CSV name.
 */
async function fetchAvCsv(raceFolder, csvName) {
  const url = `${AV_BASE}/${raceFolder}/${csvName}`
  const res = await fetch(url)
  if (!res.ok) {
    console.warn(`  Failed to fetch ${raceFolder}/${csvName}: ${res.status}`)
    return []
  }
  return parseEquipmentCsv(await res.text())
}
```

- [ ] **Step 2: Add a test call in main() to fetch one CSV and verify parsing**

Add after the LSB summary:

```js
  console.log('\nTesting AV CSV parse (HumeM/Body.csv)...')
  const testCsv = await fetchAvCsv('HumeM', 'Body.csv')
  console.log(`  Parsed ${testCsv.length} entries`)
  console.log(`  [0]: avIndex=${testCsv[0].avIndex} path=${testCsv[0].romPath} name="${testCsv[0].name}"`)
  console.log(`  [1]: avIndex=${testCsv[1].avIndex} path=${testCsv[1].romPath} name="${testCsv[1].name}"`)

  // Verify known entry: AV index 56 should be Gallant Surcoat
  const gallant = testCsv.find(e => e.avIndex === 56)
  if (gallant && /gallant/i.test(gallant.name)) {
    console.log(`  Spot check PASS: AV[56] = "${gallant.name}" at ${gallant.romPath}`)
  } else {
    console.error(`  Spot check FAIL: AV[56] = ${JSON.stringify(gallant)}`)
  }
```

- [ ] **Step 3: Run and verify**

Run: `cd src/Vanalytics.Web && node scripts/generate-model-dat-paths.mjs`
Expected:
```
Testing AV CSV parse (HumeM/Body.csv)...
  Parsed 406 entries
  [0]: avIndex=0 path=ROM/28/7.dat name="None"
  [1]: avIndex=1 path=ROM/28/8.dat name="Leather Vest"
  Spot check PASS: AV[56] = "Gallant Surcoat (PLD AF1)" at ROM/95/92.dat
```

- [ ] **Step 4: Test weapon CSV parsing (has @Category headers)**

Add:

```js
  console.log('\nTesting AV CSV parse (HumeM/Main.csv)...')
  const testWeapons = await fetchAvCsv('HumeM', 'Main.csv')
  console.log(`  Parsed ${testWeapons.length} entries (should skip @Category lines)`)
  console.log(`  [0]: name="${testWeapons[0].name}" path=${testWeapons[0].romPath}`)
  console.log(`  [1]: name="${testWeapons[1].name}" path=${testWeapons[1].romPath}`)
```

Expected: `[0]` = "None", `[1]` = "Avengers" (both @None and @Hand headers skipped)

- [ ] **Step 5: Commit**

```bash
git add src/Vanalytics.Web/scripts/generate-model-dat-paths.mjs
git commit -m "feat: parse AltanaView equipment CSVs for ROM paths"
```

---

### Task 5: Build the name cross-reference engine

**Files:**
- Modify: `src/Vanalytics.Web/scripts/generate-model-dat-paths.mjs`

- [ ] **Step 1: Add the cross-reference function**

```js
/**
 * Build a mapping from LSB MId → AV index for a given slot.
 *
 * @param avEntries - Parsed AltanaView CSV entries for one race+slot
 * @param lsbModels - Map<MId, Set<normalizedName>> from item_equipment.sql for this slot
 * @param overrides - Optional Map<MId, avIndex> for manual overrides
 * @returns { midToAvIndex: Map<number, number>, unmatchedMids: Map<number, Set<string>> }
 */
function buildCrossReference(avEntries, lsbModels, overrides) {
  const midToAvIndex = new Map()
  const unmatchedMids = new Map()

  // Build AV normalized name → avIndex lookup
  const avByName = new Map()
  for (const entry of avEntries) {
    const normalized = normalizeName(entry.name)
    if (normalized && !avByName.has(normalized)) {
      avByName.set(normalized, entry.avIndex)
    }
  }

  for (const [mid, nameSet] of lsbModels) {
    // Tier 0: Manual override
    if (overrides?.has(mid)) {
      midToAvIndex.set(mid, overrides.get(mid))
      continue
    }

    // Tier 1: Direct index match (models 0-49)
    if (mid < 50 && mid < avEntries.length) {
      midToAvIndex.set(mid, mid)
      continue
    }

    // Tier 2: Name matching
    let matched = false
    for (const normalizedName of nameSet) {
      if (avByName.has(normalizedName)) {
        midToAvIndex.set(mid, avByName.get(normalizedName))
        matched = true
        break
      }
    }

    if (!matched) {
      unmatchedMids.set(mid, nameSet)
    }
  }

  return { midToAvIndex, unmatchedMids }
}
```

- [ ] **Step 2: Add a test in main() for body slot cross-reference**

Replace the test CSV code from Task 4 with:

```js
  // Test cross-reference for body slot
  console.log('\nTesting cross-reference (Body slot)...')
  const bodyCsv = await fetchAvCsv('HumeM', 'Body.csv')
  const bodyLsb = lsbData.get(3) // slot 3 = Body
  const { midToAvIndex, unmatchedMids } = buildCrossReference(bodyCsv, bodyLsb, null)

  console.log(`  Matched: ${midToAvIndex.size}/${bodyLsb.size} LSB model IDs`)
  console.log(`  Unmatched: ${unmatchedMids.size}`)

  // Spot checks
  const checks = [
    [1, 1, 'Leather Vest'],
    [34, 34, 'Scorpion Harness'],
    [76, 56, 'Gallant Surcoat'],
    [77, 106, 'Valor Surcoat'],
    [64, 50, "Fighter's Lorica"],
  ]
  for (const [mid, expectedAv, label] of checks) {
    const actual = midToAvIndex.get(mid)
    const status = actual === expectedAv ? 'PASS' : `FAIL (got ${actual})`
    console.log(`  MId ${mid} → AV ${actual} [${status}] ${label}`)
  }

  if (unmatchedMids.size > 0) {
    console.log('\n  Sample unmatched:')
    let count = 0
    for (const [mid, names] of unmatchedMids) {
      if (count++ >= 10) break
      console.log(`    MId ${mid}: ${[...names].join(', ')}`)
    }
  }
```

- [ ] **Step 3: Run and check results**

Run: `cd src/Vanalytics.Web && node scripts/generate-model-dat-paths.mjs`
Expected: Gallant Surcoat (MId 76 → AV 56) and Valor Surcoat (MId 77 → AV 106) should PASS. Note any unmatched MIds — these will guide overrides.

- [ ] **Step 4: Iterate on normalization if needed**

If spot checks fail, add missing abbreviation expansions to the `ABBREVIATIONS` map or adjust `normalizeName()`. Common issues:
- LSB uses abbreviations not in our map
- AV uses parenthetical suffixes we don't strip
- Special characters in names

Run again after each fix until all 5 spot checks pass.

- [ ] **Step 5: Commit**

```bash
git add src/Vanalytics.Web/scripts/generate-model-dat-paths.mjs
git commit -m "feat: build name cross-reference engine for LSB MId to AV index"
```

---

### Task 6: Add manual overrides support

**Files:**
- Create: `src/Vanalytics.Web/scripts/model-id-overrides.json`
- Modify: `src/Vanalytics.Web/scripts/generate-model-dat-paths.mjs`

- [ ] **Step 1: Create the overrides file**

Start with an empty object. Overrides will be populated after the first run reveals unmatched models.

```json
{}
```

Format: `{ "slotId": { "lsbMId": avIndex } }` — e.g., `{ "3": { "77": 106 } }` maps body slot MId 77 to AV index 106.

- [ ] **Step 2: Add override loading to the script**

Add after the `SLOT_BITMASK_TO_ID` constant:

```js
/**
 * Load manual overrides from scripts/model-id-overrides.json.
 * Returns: Map<slotId, Map<MId, avIndex>>
 */
async function loadOverrides() {
  const fs = await import('fs')
  const overridePath = new URL('./model-id-overrides.json', import.meta.url).pathname
    .replace(/^\/([A-Z]:)/, '$1')

  try {
    const raw = JSON.parse(fs.readFileSync(overridePath, 'utf8'))
    const result = new Map()
    for (const [slotStr, entries] of Object.entries(raw)) {
      const slotId = parseInt(slotStr, 10)
      const map = new Map()
      for (const [midStr, avIdx] of Object.entries(entries)) {
        map.set(parseInt(midStr, 10), avIdx)
      }
      result.set(slotId, map)
    }
    const total = [...result.values()].reduce((sum, m) => sum + m.size, 0)
    if (total > 0) console.log(`Loaded ${total} manual overrides`)
    return result
  } catch {
    return new Map()
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/Vanalytics.Web/scripts/model-id-overrides.json src/Vanalytics.Web/scripts/generate-model-dat-paths.mjs
git commit -m "feat: add manual override support for unmatched model IDs"
```

---

### Task 7: Build the main generation pipeline and write output

**Files:**
- Modify: `src/Vanalytics.Web/scripts/generate-model-dat-paths.mjs`

- [ ] **Step 1: Replace main() with the full pipeline**

Replace the entire `main()` function:

```js
async function main() {
  console.log('Generating model-dat-paths.json...\n')

  // 1. Fetch LandSandBoat equipment data
  const lsbData = await fetchLsbEquipment()

  // 2. Load manual overrides
  const overrides = await loadOverrides()

  // 3. Process each race × slot
  const output = {}
  const stats = []
  const allUnmatched = new Map() // slotId → Map<MId, Set<names>>

  for (const { folder, raceId, label } of RACES) {
    console.log(`\n${label} (race ${raceId}):`)

    for (const { csv, slotId, label: slotLabel } of SLOTS) {
      const avEntries = await fetchAvCsv(folder, csv)
      if (avEntries.length === 0) continue

      const lsbModels = lsbData.get(slotId) || new Map()
      const slotOverrides = overrides.get(slotId) || null
      const { midToAvIndex, unmatchedMids } = buildCrossReference(avEntries, lsbModels, slotOverrides)

      // Build the model ID → ROM path mapping for this race+slot
      const key = `${raceId}:${slotId}`
      const mapping = {}

      // Add all cross-referenced LSB MId entries
      for (const [mid, avIdx] of midToAvIndex) {
        if (avIdx < avEntries.length) {
          mapping[String(mid)] = avEntries[avIdx].romPath
        }
      }

      // Add AV-only entries (models not referenced by any LSB item)
      // Only include if the AV index doesn't collide with an existing key
      const mappedAvIndices = new Set(midToAvIndex.values())
      for (const entry of avEntries) {
        if (!mappedAvIndices.has(entry.avIndex)) {
          const avKey = String(entry.avIndex)
          if (!(avKey in mapping)) {
            mapping[avKey] = entry.romPath
          }
        }
      }

      output[key] = mapping

      const mappedCount = Object.keys(mapping).length
      console.log(`  ${slotLabel}: ${mappedCount}/${avEntries.length} models mapped (${unmatchedMids.size} LSB MIds unmatched)`)

      stats.push({ raceId, slotId, slotLabel, mapped: mappedCount, total: avEntries.length, unmatched: unmatchedMids.size })

      // Collect unmatched (only once per slot, not per race — numbering is shared)
      if (raceId === 1 && unmatchedMids.size > 0) {
        allUnmatched.set(slotId, unmatchedMids)
      }
    }
  }

  // 4. Copy race 5 data for race 6 (Tarutaru F = Tarutaru M)
  for (const { slotId } of SLOTS) {
    const srcKey = `5:${slotId}`
    const dstKey = `${TARU_FEMALE_RACE_ID}:${slotId}`
    if (output[srcKey]) {
      output[dstKey] = { ...output[srcKey] }
    }
  }

  // 5. Sort keys for stable output
  const sorted = {}
  for (const key of Object.keys(output).sort()) {
    const inner = {}
    for (const mid of Object.keys(output[key]).sort((a, b) => Number(a) - Number(b))) {
      inner[mid] = output[key][mid]
    }
    sorted[key] = inner
  }

  // 6. Write output
  const fs = await import('fs')
  const outPath = new URL('../public/data/model-dat-paths.json', import.meta.url).pathname
    .replace(/^\/([A-Z]:)/, '$1')
  fs.writeFileSync(outPath, JSON.stringify(sorted, null, 2))
  console.log(`\nWrote ${outPath}`)

  // 7. Print coverage summary
  console.log('\n=== Coverage Summary ===')
  for (const { slotLabel, raceId, mapped, total, unmatched } of stats) {
    if (raceId !== 1) continue // Only show race 1 for brevity
    const pct = total > 0 ? Math.round(mapped / total * 100) : 0
    console.log(`  ${slotLabel}: ${mapped}/${total} (${pct}%) — ${unmatched} unmatched LSB MIds`)
  }

  // 8. Print unmatched LSB MIds
  if (allUnmatched.size > 0) {
    console.log('\n=== Unmatched LSB Model IDs (add to model-id-overrides.json) ===')
    for (const [slotId, mids] of allUnmatched) {
      const slotLabel = SLOTS.find(s => s.slotId === slotId)?.label || `Slot ${slotId}`
      console.log(`\n  ${slotLabel}:`)
      for (const [mid, names] of mids) {
        console.log(`    MId ${mid}: ${[...names].join(', ')}`)
      }
    }
  }

  // 9. Spot-check known mappings
  console.log('\n=== Spot Checks ===')
  const checks = [
    ['1:3', '1', 'ROM/28/8.dat', 'Leather Vest'],
    ['1:3', '77', 'ROM/131/35.dat', 'Valor Surcoat'],
    ['1:3', '76', 'ROM/95/92.dat', 'Gallant Surcoat'],
    ['1:3', '64', null, "Fighter's Lorica"], // verify it exists (path TBD)
  ]
  for (const [key, mid, expectedPath, label] of checks) {
    const actual = sorted[key]?.[mid]
    if (expectedPath) {
      const status = actual === expectedPath ? 'PASS' : `FAIL (got ${actual})`
      console.log(`  ${key}[${mid}] = ${actual} [${status}] ${label}`)
    } else {
      const status = actual ? 'PASS (has path)' : 'FAIL (missing)'
      console.log(`  ${key}[${mid}] = ${actual} [${status}] ${label}`)
    }
  }
}
```

- [ ] **Step 2: Remove the test/debug code from Tasks 2-5**

Delete the normalization self-test block and the test CSV/cross-reference code that was added for debugging. The spot checks in the pipeline now cover validation.

- [ ] **Step 3: Run the full pipeline**

Run: `cd src/Vanalytics.Web && node scripts/generate-model-dat-paths.mjs`

Expected:
- Fetches LSB data + 56 AltanaView CSVs (7 races × 8 slots)
- Prints coverage per slot (target: 80%+ for armor, varies for weapons)
- Spot checks: Leather Vest PASS, Valor Surcoat PASS, Gallant Surcoat PASS
- Writes `public/data/model-dat-paths.json`
- Lists any unmatched LSB MIds for manual override consideration

- [ ] **Step 4: Commit**

```bash
git add src/Vanalytics.Web/scripts/generate-model-dat-paths.mjs
git commit -m "feat: full model-dat-paths generation pipeline"
```

---

### Task 8: Populate overrides and finalize output

**Files:**
- Modify: `src/Vanalytics.Web/scripts/model-id-overrides.json`
- Overwrite: `src/Vanalytics.Web/public/data/model-dat-paths.json`

- [ ] **Step 1: Review unmatched LSB MIds from the pipeline output**

Look at the "Unmatched LSB Model IDs" section. For each unmatched MId:
1. Check the item names listed
2. Search the AltanaView CSV output for a matching entry (may need creative name matching)
3. Add to `model-id-overrides.json` if a match is found

- [ ] **Step 2: Add overrides to model-id-overrides.json**

Based on unmatched output, populate the file. Example (actual values will depend on first run):

```json
{
  "3": {
    "77": 106
  }
}
```

- [ ] **Step 3: Re-run the pipeline with overrides**

Run: `cd src/Vanalytics.Web && node scripts/generate-model-dat-paths.mjs`

Verify:
- Override entries now show as matched
- Spot checks still pass
- Coverage improved

Iterate steps 2-3 until unmatched count is acceptable (some models may genuinely have no AV entry).

- [ ] **Step 4: Verify no regression vs. current file**

```bash
cd src/Vanalytics.Web && node -e "
const fs = require('fs');
const oldData = JSON.parse(fs.readFileSync('public/data/model-dat-paths.json.bak', 'utf8'));
const newData = JSON.parse(fs.readFileSync('public/data/model-dat-paths.json', 'utf8'));
for (const key of Object.keys(oldData)) {
  const oldCount = Object.keys(oldData[key]).length;
  const newCount = Object.keys(newData[key] || {}).length;
  if (newCount < oldCount) console.log('REGRESSION: ' + key + ' old=' + oldCount + ' new=' + newCount);
}
console.log('Done');
"
```

Before running the pipeline for real, copy the current file:
```bash
cp public/data/model-dat-paths.json public/data/model-dat-paths.json.bak
```

Expected: No REGRESSION lines. Delete the .bak file after verification.

- [ ] **Step 5: Commit the final generated output and overrides**

```bash
git add src/Vanalytics.Web/scripts/model-id-overrides.json src/Vanalytics.Web/public/data/model-dat-paths.json
git commit -m "feat: regenerate model-dat-paths.json with full AltanaView coverage"
```

---

### Task 9: Manual verification in the app

- [ ] **Step 1: Start the dev server**

Run: `cd src/Vanalytics.Web && npm run dev`

- [ ] **Step 2: Verify Cab. Surcoat +1 item detail page**

Navigate to the item detail page for "Cab. Surcoat +1" (item 26813). Confirm:
- The "No model available" message is gone
- A 3D model preview renders (requires FFXI install directory access)

- [ ] **Step 3: Verify character model viewer**

Navigate to a character detail page for a character wearing PLD AF2 body armor. Confirm:
- Body armor model loads and renders
- No console errors related to model resolution

- [ ] **Step 4: Spot check other previously-missing items**

Try a few other items that were in the 64-93 model range:
- Fighter's Lorica (WAR AF1, MId 64)
- Gallant Surcoat (PLD AF1, MId 76)
- Any AF2 body (MId 100+)

Confirm model previews render or at least show "No model available" only when the user hasn't granted FFXI directory access (not due to missing mapping).
