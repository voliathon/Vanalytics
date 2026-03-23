# Zone Model Viewer Design

## Goal

Build a 3D zone/area model viewer for Vanalytics that parses FFXI zone DAT files and renders full textured environments in a web browser. Users can explore Vana'diel's zones from a bird's-eye perspective impossible in-game, or fly through them in first-person.

## Architecture

Zone DATs use the same block-chain container as entity DATs (DATHEAD + sequential blocks), but contain different block types: MZB (0x1C) for zone layout/transforms and MMB (0x2E) for reusable mesh prefabs. Both are XOR-encrypted. Textures use the same DXT1/DXT3 format already supported by the existing `TextureParser.ts`.

The parser pipeline: walk block chain → decrypt MZB/MMB blocks → parse mesh prefabs (MMB) → parse instance transforms (MZB) → apply transforms to place prefabs in world space → bind textures. The assembled geometry is rendered via Three.js with instanced meshes for performance.

## Tech Stack

- TypeScript zone parsers (new files in `src/lib/ffxi-dat/`)
- React Three Fiber + drei for 3D rendering
- Three.js `InstancedMesh` for efficient prefab instancing
- Three.js `PointerLockControls` for fly camera mode
- Static JSON for zone index data (seeded from GearSwap README)

---

## Parser: Zone DAT Pipeline

### New Files

#### `ZoneDecrypt.ts`
XOR decryption for MZB and MMB block data. Contains two 256-byte key tables ported from the NavMesh Builder's `KeyTables.cs`. Exports a `decryptZoneBlock(data: Uint8Array): Uint8Array` function.

**Decryption scope:** Applied to the block data payload only (after DATHEAD + 8-byte block padding, same padding as IMG/VERT blocks). The DATHEAD and padding are not encrypted. A single key table rotates through the decrypted data bytes (key index = byte offset % 256). After decryption, validate by checking for expected structural patterns (e.g., non-zero vertex/instance counts, reasonable float ranges) to detect key table mismatches early.

#### `MzbParser.ts`
Parses MZB blocks (type 0x1C) after decryption. Block type `0x1C` is the 7-bit type code extracted via `packed & 0x7F` in the existing `parseBlockChain` logic (confirmed within the 0x00-0x7F range).

**MZB header structure** (ported from NavMesh Builder `MZB.cs`):
- Offset 0x00: `meshCount` (uint32) — number of mesh object entries
- Offset 0x04: `meshOffset` (uint32) — byte offset to mesh object table
- Followed by mesh object entries, each containing:
  - 4x4 transformation matrix (64 bytes = 16 × float32) — world-space placement
  - MMB prefab reference (uint32) — sequential index into the ordered list of MMB blocks in the DAT
  - Bounding box data for culling (future use)

**Collision geometry** (optional, for future use): raw vertices (3 floats XYZ), normal vectors, and triangle indices stored in separate sub-sections of the MZB.

Reference: NavMesh Builder `Common/dat/Types/MZB.cs` for struct layouts, GalkaReeve `FFXILandscapeMesh.cpp` for instance assembly. Exact struct offsets and sub-block layouts will be confirmed against the C# source during implementation.

#### `MmbParser.ts`
Parses MMB blocks (type 0x2E) after decryption. Block type `0x2E` is the 7-bit type code (confirmed within 0x00-0x7F range).

**MMB header structure** (ported from NavMesh Builder `MMB.cs` + GalkaReeve):
- `SMMBHEAD`: type (uint8), shadow flags, version identifier
- `SMMBHEAD2`: vertex count (uint32), vertex stride (uint32)
- Followed by one or more material groups, each containing:
  - Primitive type flag (determines triangle list vs. triangle strip per group)
  - Texture reference (sequential IMG block index — textures are bound by their order in the DAT, matching the `textureMap` pattern from the entity parser)
  - Index count + index data (uint16)

**Vertex format** per vertex (stride from header):
- Position: 3 × float32 (12 bytes)
- Normal/displacement: 3 × float32 (12 bytes)
- RGBA vertex color: 4 × uint8 (4 bytes) — normalized to 0.0-1.0 during parsing
- UV coordinates: 2 × float32 (8 bytes)

Total ~36 bytes per vertex (actual stride confirmed from header). Simpler than entity vertices — no bone weights.

**Sub-meshes:** A single MMB block can contain multiple material groups (sub-meshes), each with its own primitive type, texture reference, and index buffer. Each group becomes a separate `ParsedZoneMesh` entry.

Reference: NavMesh Builder `Common/dat/Types/MMB.cs` for struct definitions, GalkaReeve `FFXILandscapeMesh.cpp` for vertex format and texture binding specifics. Exact struct offsets will be confirmed against sources during implementation.

#### `ZoneFile.ts`
Orchestrator (analogous to `DatFile.ts` for entities). Reuses `parseBlockChain` extracted from `DatFile.ts` into a shared utility (or duplicated — implementer's choice based on complexity). Walks the block chain, dispatches to parsers:
1. IMG blocks (0x20) → existing `TextureParser.ts` (reused, no changes)
2. MZB blocks (0x1C) → `ZoneDecrypt.ts` → `MzbParser.ts`
3. MMB blocks (0x2E) → `ZoneDecrypt.ts` → `MmbParser.ts`

Block padding: MZB/MMB blocks use the same 8-byte padding after DATHEAD as IMG/VERT blocks (`dataOffset = blockOffset + DATHEAD_SIZE`, effective data starts at `dataOffset + BLOCK_PADDING`). Decryption starts after this padding.

Assembles the final zone model by applying MZB instance transforms to MMB prefab vertices. Returns a `ParsedZone` containing the assembled meshes and textures.

**Error handling:** Each block is parsed in a try/catch. If an individual MMB prefab fails to parse (decryption garbage, unexpected format), it is skipped and logged — remaining prefabs still render. This matches the entity parser's resilience pattern. If MZB parsing fails entirely, the zone cannot render and an error is surfaced to the user.

**Performance note:** Large zone DATs may cause main-thread blocking during parse. If this becomes a problem in practice, the parse pipeline can be moved to a Web Worker in a follow-up. Not in v1 scope.

### Modified Files

#### `types.ts`
New types:
```typescript
interface ParsedZoneMesh {
  vertices: number[]      // flat xyz
  normals: number[]       // flat xyz
  colors: number[]        // flat rgba (0-1)
  uvs: number[]           // flat uv
  indices: number[]       // triangle indices
  materialIndex: number   // texture reference
}

interface ZoneMeshInstance {
  meshIndex: number       // which MMB prefab
  transform: number[]     // 4x4 matrix (16 floats)
}

interface ParsedZone {
  prefabs: ParsedZoneMesh[]       // unique MMB mesh prefabs
  instances: ZoneMeshInstance[]    // MZB placement transforms
  textures: ParsedTexture[]       // reused from entity pipeline
}
```

#### `index.ts`
Export `parseZoneFile` and new types.

---

## Static Data

### `public/data/zone-paths.json`
158 zones seeded from the GearSwap README, organized by expansion:

```json
[
  { "name": "West Ronfaure", "path": "ROM/26/37.dat", "expansion": "Original" },
  { "name": "Cape Teriggan", "path": "ROM2/13/95.dat", "expansion": "Zilart" },
  { "name": "Promyvion-Holla", "path": "ROM3/2/126.dat", "expansion": "Promathia" },
  { "name": "Al Zahbi", "path": "ROM4/1/47.dat", "expansion": "Aht Urhgan" }
]
```

Expansion breakdown:
- Original Areas: ~82 zones (ROM/26/, ROM/27/)
- Rise of the Zilart: ~44 zones (ROM2/13/, ROM2/14/)
- Chains of Promathia: ~38 zones (ROM3/2/, ROM3/3/)
- Treasures of Aht Urhgan: ~34 zones (ROM4/1/)

### `scripts/generate-zone-paths.mjs`
Generator script that parses the GearSwap README markdown, extracts ROM path → zone name mappings from each expansion section, outputs the sorted JSON. Same pattern as `generate-npc-paths.mjs`.

---

## UI: Zone Browser Page

### `src/pages/ZoneBrowserPage.tsx`
Route: `/zones`. Sidebar link with Map icon from lucide-react.

**Layout:** Fixed positioning (`fixed inset-0 lg:left-64 z-10`) — full-viewport, edge-to-edge. Same pattern as NPC browser.

**Floating overlay browser panel** (triggered by top-left button):
- Category-first navigation with 4 expansion tabs, zone counts per expansion
- Searchable zone list within selected expansion (or all)
- Random zone button for discovery
- Recently viewed strip (last 8 zones)

**Floating controls** (top-right):
- Camera mode toggle: Orbit / Fly
- Lighting toggle (standard / enhanced)

**Zone info badge** (bottom-left): zone name, expansion, ROM path.

**Parse log** (bottom-right): collapsible, open by default. Shows detailed parse progress: "Decrypting MZB... Parsing 47 textures... Assembling 312 mesh instances..."

**Loading state:** Zone DATs are large (multi-MB). Progress messages update as each parse phase completes.

**Not-configured / not-authorized states:** Same FFXI directory prompts as NPC browser.

### Camera Modes

**Orbit (default):** `OrbitControls` from drei. Ideal for bird's-eye overview — zoom out to see the entire zone from above (something impossible in-game). Auto-positions camera above the zone center based on bounding box.

**Fly:** Click viewport to enter fly mode (pointer lock). WASD for movement, mouse for look direction. Scroll wheel adjusts movement speed. Escape exits back to orbit mode. Uses Three.js `PointerLockControls` with custom WASD key handler. If pointer lock is denied by the browser (throttled or unsupported), show a brief message and keep orbit mode active. Fly mode is not available on mobile/touch devices — orbit-only on those platforms.

### `src/components/zone/ThreeZoneViewer.tsx`
Zone-specific Three.js renderer, separate from entity `ThreeModelViewer`:

- **Instanced meshes**: uses Three.js `InstancedMesh` where the same MMB prefab is placed multiple times. Each unique prefab gets one `InstancedMesh` with N instance transforms from MZB. Major performance win over duplicating geometry.
- **Vertex colors**: MMB vertices include RGBA color data. Materials use `vertexColors: true` on `MeshStandardMaterial`.
- **Scale handling**: zones are orders of magnitude larger than entity models. Camera far plane, initial position, and controls sensitivity account for this. Auto-compute bounding box for initial bird's-eye position.
- **Lighting**: standard (ambient + directional) and enhanced (stronger directional, no shadow maps for performance on large zones).

---

## Out of Scope (Future)

- **Minimap**: requires parsing in-game 2D map images from DAT files, rendering them as an overlay with a position dot. Separate feature.
- **Additional expansions**: Wings of the Goddess, Seekers of Adoulin, Rhapsodies zones. Can be added via manual data or a zone scan tool.
- **Zone scan tool**: auto-discover zone DATs from the user's VTABLE/FTABLE by heuristic (file size, block types). Future addition for complete coverage.
- **Frustum culling / LOD**: MZB data contains octree bounding boxes. Can be implemented if performance demands it.
- **Utility overlays**: NPC spawn points, treasure locations, zone connections, camp spots overlaid on terrain. Requires linking zone data with mob/NPC databases.
- **Furnishing model viewer**: needs client-side item DAT parsing for ResourceID extraction. Separate feature.
- **In-game map image extraction**: parsing the 2D zone map DATs for minimap rendering.
