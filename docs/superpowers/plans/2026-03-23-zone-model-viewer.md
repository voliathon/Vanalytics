# Zone Model Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 3D zone/area model viewer that parses FFXI zone DAT files (MZB/MMB blocks with XOR encryption) and renders full textured environments in Three.js with orbit and fly camera modes.

**Architecture:** Zone DATs use the same DATHEAD block chain as entity DATs, but contain MZB (0x1C) and MMB (0x2E) blocks instead of VERT (0x2A). Both are XOR-encrypted. MZB provides instance transforms placing MMB mesh prefabs into world space. The parser decrypts, extracts prefabs + transforms, and the renderer uses Three.js InstancedMesh for efficient instancing. UI mirrors the NPC browser pattern — full-viewport fixed layout with floating overlay zone picker.

**Tech Stack:** TypeScript, React, React Three Fiber, drei, Three.js (InstancedMesh, PointerLockControls), static JSON zone index

---

## File Structure

**New parser files** (`src/Vanalytics.Web/src/lib/ffxi-dat/`):
- `ZoneDecrypt.ts` — XOR key tables + decryption functions for MZB/MMB blocks
- `MzbParser.ts` — MZB block parser: instance transforms + collision mesh
- `MmbParser.ts` — MMB block parser: mesh prefabs with position/normal/color/UV vertices
- `ZoneFile.ts` — Zone DAT orchestrator: block chain → decrypt → parse → assemble

**Modified parser files:**
- `types.ts` — Add `ParsedZoneMesh`, `ZoneMeshInstance`, `ParsedZone` types
- `index.ts` — Export `parseZoneFile` and new types

**New static data:**
- `public/data/zone-paths.json` — 158 zone entries from GearSwap README
- `scripts/generate-zone-paths.mjs` — Generator script

**New UI files:**
- `src/components/zone/ThreeZoneViewer.tsx` — Zone-specific Three.js renderer with instancing + fly camera
- `src/pages/ZoneBrowserPage.tsx` — Full-viewport zone browser page

**Modified UI files:**
- `src/App.tsx` — Add `/zones` route
- `src/components/Layout.tsx` — Add sidebar link

---

### Task 1: Zone Types and Exports

**Files:**
- Modify: `src/Vanalytics.Web/src/lib/ffxi-dat/types.ts`
- Modify: `src/Vanalytics.Web/src/lib/ffxi-dat/index.ts`

- [ ] **Step 1: Add zone types to `types.ts`**

Append these interfaces after the existing `ParsedDatFile` interface:

```typescript
export interface ParsedZoneMesh {
  vertices: number[]      // flat xyz (3 floats per vertex)
  normals: number[]       // flat xyz (3 floats per vertex)
  colors: number[]        // flat rgba 0.0-1.0 (4 floats per vertex)
  uvs: number[]           // flat uv (2 floats per vertex)
  indices: number[]       // triangle indices
  materialIndex: number   // texture index (sequential IMG block order)
}

export interface ZoneMeshInstance {
  meshIndex: number       // which MMB prefab (sequential MMB block order)
  transform: number[]     // 4x4 matrix (16 floats, row-major)
}

export interface ParsedZone {
  prefabs: ParsedZoneMesh[]       // unique MMB mesh prefabs
  instances: ZoneMeshInstance[]    // MZB placement transforms
  textures: ParsedTexture[]       // reused from entity pipeline
}
```

- [ ] **Step 2: Add zone exports to `index.ts`**

Add after the existing exports:

```typescript
export { parseZoneFile } from './ZoneFile'
export type { ParsedZoneMesh, ZoneMeshInstance, ParsedZone } from './types'
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd src/Vanalytics.Web && npx tsc --noEmit`
Expected: Errors about missing `./ZoneFile` module (not yet created). That's fine — it will resolve after Task 4.

---

### Task 2: XOR Decryption (`ZoneDecrypt.ts`)

**Files:**
- Create: `src/Vanalytics.Web/src/lib/ffxi-dat/ZoneDecrypt.ts`

**Reference:** Xenonsmurf NavMesh Builder `Common/dat/KeyTables.cs`, `Common/dat/Types/MZB.cs` (DecodeMzb), `Common/dat/Types/MMB.cs` (DecodeMmb)

- [ ] **Step 1: Create `ZoneDecrypt.ts` with key tables and decryption functions**

The file needs:

1. **Two 256-byte XOR key tables** (exact bytes from NavMesh Builder `KeyTables.cs`):

```typescript
// Key table 1 — used by MZB decryption and MMB phase 1
export const KEY_TABLE: Uint8Array = new Uint8Array([
  0xE2, 0xE5, 0x06, 0xA9, 0xED, 0x26, 0xF4, 0x42,
  0x15, 0xF4, 0x81, 0x7F, 0xDE, 0x9A, 0xDE, 0xD0,
  0x1A, 0x98, 0x20, 0x91, 0x39, 0x49, 0x48, 0xA4,
  0x0A, 0x9F, 0x40, 0x69, 0xEC, 0xBD, 0x81, 0x81,
  0x8D, 0xAD, 0x10, 0xB8, 0xC1, 0x88, 0x15, 0x05,
  0x11, 0xB1, 0xAA, 0xF0, 0x0F, 0x1E, 0x34, 0xE6,
  0x81, 0xAA, 0xCD, 0xAC, 0x02, 0x84, 0x33, 0x0A,
  0x19, 0x38, 0x9E, 0xE6, 0x73, 0x4A, 0x11, 0x5D,
  0xBF, 0x85, 0x77, 0x08, 0xCD, 0xD9, 0x96, 0x0D,
  0x79, 0x78, 0xCC, 0x35, 0x06, 0x8E, 0xF9, 0xFE,
  0x66, 0xB9, 0x21, 0x03, 0x20, 0x29, 0x1E, 0x27,
  0xCA, 0x86, 0x82, 0xE6, 0x45, 0x07, 0xDD, 0xA9,
  0xB6, 0xD5, 0xA2, 0x03, 0xEC, 0xAD, 0x62, 0x45,
  0x2D, 0xCE, 0x79, 0xBD, 0x8F, 0x2D, 0x10, 0x18,
  0xE6, 0x0A, 0x6F, 0xAA, 0x6F, 0x46, 0x84, 0x32,
  0x9F, 0x29, 0x2C, 0xC2, 0xF0, 0xEB, 0x18, 0x6F,
  0xF2, 0x3A, 0xDC, 0xEA, 0x7B, 0x0C, 0x81, 0x2D,
  0xCC, 0xEB, 0xA1, 0x51, 0x77, 0x2C, 0xFB, 0x49,
  0xE8, 0x90, 0xF7, 0x90, 0xCE, 0x5C, 0x01, 0xF3,
  0x5C, 0xF4, 0x41, 0xAB, 0x04, 0xE7, 0x16, 0xCC,
  0x3A, 0x05, 0x54, 0x55, 0xDC, 0xED, 0xA4, 0xD6,
  0xBF, 0x3F, 0x9E, 0x08, 0x93, 0xB5, 0x63, 0x38,
  0x90, 0xF7, 0x5A, 0xF0, 0xA2, 0x5F, 0x56, 0xC8,
  0x08, 0x70, 0xCB, 0x24, 0x16, 0xDD, 0xD2, 0x74,
  0x95, 0x3A, 0x1A, 0x2A, 0x74, 0xC4, 0x9D, 0xEB,
  0xAF, 0x69, 0xAA, 0x51, 0x39, 0x65, 0x94, 0xA2,
  0x4B, 0x1F, 0x1A, 0x60, 0x52, 0x39, 0xE8, 0x23,
  0xEE, 0x58, 0x39, 0x06, 0x3D, 0x22, 0x6A, 0x2D,
  0xD2, 0x91, 0x25, 0xA5, 0x2E, 0x71, 0x62, 0xA5,
  0x0B, 0xC1, 0xE5, 0x6E, 0x43, 0x49, 0x7C, 0x58,
  0x46, 0x19, 0x9F, 0x45, 0x49, 0xC6, 0x40, 0x09,
  0xA2, 0x99, 0x5B, 0x7B, 0x98, 0x7F, 0xA0, 0xD0,
])

// Key table 2 — used by MMB phase 2 block swapping
export const KEY_TABLE_2: Uint8Array = new Uint8Array([
  0xB8, 0xC5, 0xF7, 0x84, 0xE4, 0x5A, 0x23, 0x7B,
  0xC8, 0x90, 0x1D, 0xF6, 0x5D, 0x09, 0x51, 0xC1,
  0x07, 0x24, 0xEF, 0x5B, 0x1D, 0x73, 0x90, 0x08,
  0xA5, 0x70, 0x1C, 0x22, 0x5F, 0x6B, 0xEB, 0xB0,
  0x06, 0xC7, 0x2A, 0x3A, 0xD2, 0x66, 0x81, 0xDB,
  0x41, 0x62, 0xF2, 0x97, 0x17, 0xFE, 0x05, 0xEF,
  0xA3, 0xDC, 0x22, 0xB3, 0x45, 0x70, 0x3E, 0x18,
  0x2D, 0xB4, 0xBA, 0x0A, 0x65, 0x1D, 0x87, 0xC3,
  0x12, 0xCE, 0x8F, 0x9D, 0xF7, 0x0D, 0x50, 0x24,
  0x3A, 0xF3, 0xCA, 0x70, 0x6B, 0x67, 0x9C, 0xB2,
  0xC2, 0x4D, 0x6A, 0x0C, 0xA8, 0xFA, 0x81, 0xA6,
  0x79, 0xEB, 0xBE, 0xFE, 0x89, 0xB7, 0xAC, 0x7F,
  0x65, 0x43, 0xEC, 0x56, 0x5B, 0x35, 0xDA, 0x81,
  0x3C, 0xAB, 0x6D, 0x28, 0x60, 0x2C, 0x5F, 0x31,
  0xEB, 0xDF, 0x8E, 0x0F, 0x4F, 0xFA, 0xA3, 0xDA,
  0x12, 0x7E, 0xF1, 0xA5, 0xD2, 0x22, 0xA0, 0x0C,
  0x86, 0x8C, 0x0A, 0x0C, 0x06, 0xC7, 0x65, 0x18,
  0xCE, 0xF2, 0xA3, 0x68, 0xFE, 0x35, 0x96, 0x95,
  0xA6, 0xFA, 0x58, 0x63, 0x41, 0x59, 0xEA, 0xDD,
  0x7F, 0xD3, 0x1B, 0xA8, 0x48, 0x44, 0xAB, 0x91,
  0xFD, 0x13, 0xB1, 0x68, 0x01, 0xAC, 0x3A, 0x11,
  0x78, 0x30, 0x33, 0xD8, 0x4E, 0x6A, 0x89, 0x05,
  0x7B, 0x06, 0x8E, 0xB0, 0x86, 0xFD, 0x9F, 0xD7,
  0x48, 0x54, 0x04, 0xAE, 0xF3, 0x06, 0x17, 0x36,
  0x53, 0x3F, 0xA8, 0x11, 0x53, 0xCA, 0xA1, 0x95,
  0xC2, 0xCD, 0xE6, 0x1F, 0x57, 0xB4, 0x7F, 0xAA,
  0xF3, 0x6B, 0xF9, 0xA0, 0x27, 0xD0, 0x09, 0xEF,
  0xF6, 0x68, 0x73, 0x60, 0xDC, 0x50, 0x2A, 0x25,
  0x0F, 0x77, 0xB9, 0xB0, 0x04, 0x0B, 0xE1, 0xCC,
  0x35, 0x31, 0x84, 0xE6, 0x22, 0xF9, 0xC2, 0xAB,
  0x95, 0x91, 0x61, 0xD9, 0x2B, 0xB9, 0x72, 0x4E,
  0x10, 0x76, 0x31, 0x66, 0x0A, 0x0B, 0x2E, 0x83,
])
```

2. **`decodeMzb(data: Uint8Array): Uint8Array`** — MZB decryption. Port from NavMesh Builder `MZB.cs` `DecodeMzb()`:
   - Read decode length from first 3 bytes: `len = data[0] | (data[1] << 8) | (data[2] << 16)`
   - Derive key byte: `data[7] ^ 0xFF`
   - XOR variable-length blocks based on key bits
   - XOR node headers at offsets `0x20 + i * 0x64` with `0x55`

3. **`decodeMmb(data: Uint8Array): Uint8Array`** — MMB decryption. Port from NavMesh Builder `MMB.cs` `DecodeMmb()`:
   - Phase 1: If `data[3] >= 5`, XOR from offset 8 using rolling key from `KEY_TABLE[data[5] ^ 0xF0]`
   - Phase 2: If `data[6] == 0xFF && data[7] == 0xFF`, swap 8-byte blocks between halves using `KEY_TABLE_2[data[5] ^ 0xF0]`

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd src/Vanalytics.Web && npx tsc --noEmit`

---

### Task 3: MZB Parser (`MzbParser.ts`)

**Files:**
- Create: `src/Vanalytics.Web/src/lib/ffxi-dat/MzbParser.ts`

**Reference:** NavMesh Builder `MZB.cs` `ParseMzb()` and `ParseGridMesh()`, GalkaReeve `FFXILandscapeMesh.cpp`

- [ ] **Step 1: Create `MzbParser.ts`**

Port the MZB parsing logic. The function signature:

```typescript
import { DatReader } from './DatReader'
import type { ZoneMeshInstance } from './types'

export function parseMzbBlock(
  data: Uint8Array
): ZoneMeshInstance[]
```

**MZB internal structure** (from NavMesh Builder `ParseMzb`):
- Header: mesh offset (uint32), quad tree offset (uint32), total mesh count (uint32)
- At the mesh offset: array of mesh entries. Each mesh entry contains:
  - 4x4 float32 transformation matrix (64 bytes)
  - Vertex data offset, normal offset, triangle offset, triangle count
  - The mesh index correlates to the sequential MMB block order in the DAT

The parser extracts `ZoneMeshInstance[]` — each instance has a `meshIndex` (which MMB prefab) and a `transform` (16 floats for the 4x4 matrix).

**Important details from NavMesh Builder:**
- The transform matrix is read as 16 consecutive float32 values
- Mesh entries are at variable offsets determined by the header
- Triangle indices are masked with `& 0x3FFF`
- Winding order may need to be flipped based on the transform matrix determinant (negative determinant = mirrored instance)

**Validation after decryption:** Check that meshCount > 0 and < 10000, and that meshOffset points within the data bounds. Log a warning if these checks fail (indicates decryption failure).

- [ ] **Step 2: Verify TypeScript compiles**

---

### Task 4: MMB Parser (`MmbParser.ts`)

**Files:**
- Create: `src/Vanalytics.Web/src/lib/ffxi-dat/MmbParser.ts`

**Reference:** GalkaReeve `FFXILandscapeMesh.cpp` for vertex format, NavMesh Builder `MMB.cs` for header structure

- [ ] **Step 1: Create `MmbParser.ts`**

```typescript
import { DatReader } from './DatReader'
import type { ParsedZoneMesh } from './types'

export function parseMmbBlock(
  data: Uint8Array
): ParsedZoneMesh[]
```

**MMB internal structure:**
- `SMMBHEAD` (first few bytes): type, flags, version
- `SMMBHEAD2`: vertex count (uint32), vertex stride (uint32)
- Vertex data: `vertexCount × stride` bytes, each vertex containing:
  - Position: 3 × float32 (x, y, z)
  - Normal: 3 × float32 (nx, ny, nz)
  - RGBA color: 4 × uint8 → normalize to 0.0-1.0 by dividing by 255
  - UV: 2 × float32 (u, v)
- Material groups / sub-meshes, each with:
  - Primitive type flag (triangle list or strip)
  - Texture index (sequential IMG block order)
  - Index count + uint16 index data
  - For triangle strips, convert to triangle lists using the existing `triangleStripToList` from `MeshParser.ts`

Each material group becomes a separate `ParsedZoneMesh` with its own `materialIndex`.

**Note:** The exact byte offsets for headers and material groups will need to be confirmed by reading the C++ and C# sources during implementation. The NavMesh Builder's MMB parsing is minimal (it only extracts collision), so GalkaReeve's `FFXILandscapeMesh.cpp` is the primary reference for the rendering-quality vertex format.

- [ ] **Step 2: Verify TypeScript compiles**

---

### Task 5: Zone File Orchestrator (`ZoneFile.ts`)

**Files:**
- Create: `src/Vanalytics.Web/src/lib/ffxi-dat/ZoneFile.ts`

- [ ] **Step 1: Create `ZoneFile.ts`**

This is the main entry point for zone DAT parsing. It follows the same pattern as `DatFile.ts`:

```typescript
import { DatReader } from './DatReader'
import { parseTextureBlock } from './TextureParser'
import { decodeMzb, decodeMmb } from './ZoneDecrypt'
import { parseMzbBlock } from './MzbParser'
import { parseMmbBlock } from './MmbParser'
import type { ParsedZone, ParsedZoneMesh, ParsedTexture, ZoneMeshInstance } from './types'

const BLOCK_IMG = 0x20
const BLOCK_MZB = 0x1C
const BLOCK_MMB = 0x2E

const DATHEAD_SIZE = 8
const BLOCK_PADDING = 8

export function parseZoneFile(
  buffer: ArrayBuffer,
  onProgress?: (message: string) => void
): ParsedZone {
  // ... implementation
}
```

**Logic:**
1. Walk the block chain (duplicate `parseBlockChain` from `DatFile.ts` — keep it simple, don't extract to shared module unless complexity warrants it). Increase the block limit from 500 to 2000 for zone DATs which can have many more blocks.
2. First pass: parse IMG blocks (0x20) → textures using existing `parseTextureBlock`. Report progress: `onProgress?.('Parsing textures...')`
3. Second pass: decrypt + parse MMB blocks (0x2E) → prefabs. Each MMB block produces one or more `ParsedZoneMesh` entries. Report progress per MMB block.
4. Third pass: decrypt + parse MZB blocks (0x1C) → instance transforms. Report progress.
5. Return `{ prefabs, instances, textures }`.

**Error handling:** Each block parsed in try/catch. Failed blocks are skipped with `onProgress?.('Warning: skipped MMB block N')`. MZB failure logs an error but still returns whatever prefabs were parsed (may render without transforms).

**Block padding:** Same as entity DATs — data starts at `block.dataOffset + BLOCK_PADDING`.

- [ ] **Step 2: Update `index.ts` exports**

The export added in Task 1 will now resolve since `ZoneFile.ts` exists.

- [ ] **Step 3: Verify full TypeScript compile**

Run: `cd src/Vanalytics.Web && npx tsc --noEmit`
Expected: Clean build (0 errors)

---

### Task 6: Generate Zone Paths JSON

**Files:**
- Create: `src/Vanalytics.Web/scripts/generate-zone-paths.mjs`
- Create: `src/Vanalytics.Web/public/data/zone-paths.json`

- [ ] **Step 1: Create `generate-zone-paths.mjs`**

Parse the GearSwap README at `C:\Git\soverance\GearSwap\README.md`. The zone mappings are in 4 `<details>` sections under "### Area DAT File Reference". Each section has code blocks with lines like:

```
ROM/26/37.dat -- West Ronfaure
```

The script should:
1. Read the README file from disk (it's a local repo)
2. Parse each line matching the pattern `ROM[N]/folder/file.dat -- Zone Name`
3. Assign expansion based on ROM prefix: `ROM/` → "Original", `ROM2/` → "Zilart", `ROM3/` → "Promathia", `ROM4/` → "Aht Urhgan"
4. Output sorted JSON to `public/data/zone-paths.json`

Format:
```json
[
  { "name": "West Ronfaure", "path": "ROM/26/37.dat", "expansion": "Original" }
]
```

- [ ] **Step 2: Run the generator**

Run: `cd src/Vanalytics.Web && node scripts/generate-zone-paths.mjs`
Expected: Creates `public/data/zone-paths.json` with ~158 entries

- [ ] **Step 3: Verify JSON**

Check the output has all 4 expansions represented and reasonable counts.

---

### Task 7: Three.js Zone Viewer Component

**Files:**
- Create: `src/Vanalytics.Web/src/components/zone/ThreeZoneViewer.tsx`

- [ ] **Step 1: Create `ThreeZoneViewer.tsx`**

A zone-specific Three.js renderer, separate from the entity `ThreeModelViewer`. Takes a `ParsedZone` and renders it.

**Props:**
```typescript
interface ThreeZoneViewerProps {
  zoneData: ParsedZone
  lighting?: 'standard' | 'enhanced'
  cameraMode?: 'orbit' | 'fly'
}
```

**Key implementation details:**

1. **Instanced rendering:** For each unique prefab, count how many instances reference it from `zoneData.instances`. Create a `THREE.InstancedMesh` for each prefab×material combination, set instance matrices from the MZB transforms.

2. **Materials:** Create `MeshStandardMaterial` with `vertexColors: true` for zone meshes (they have RGBA vertex colors). Apply DXT textures from `zoneData.textures` using the same `DataTexture` approach as `ThreeModelViewer`.

3. **Camera setup:**
   - Compute bounding box of all instance transforms to determine zone bounds
   - **Orbit mode:** Position camera above zone center looking down (bird's-eye). Set far plane to `Math.max(1000, diagonalSize * 2)`.
   - **Fly mode:** Use `PointerLockControls` from drei/three. Click to enter pointer lock, Escape to exit. WASD key handler for movement. Scroll wheel adjusts speed. If pointer lock fails, log message and stay in orbit.

4. **Scale:** Zone coordinates are much larger than entity models. Orbit controls `maxDistance` should be very large. Fly speed should start at ~5 units/frame and scale with scroll wheel.

5. **Lighting:**
   - Standard: `ambientLight(0.6)` + `directionalLight(0.8)`
   - Enhanced: `ambientLight(0.3)` + stronger `directionalLight(1.2)` positioned high. No shadow maps (too expensive for zone geometry).

6. **R3F Canvas settings:** `<Canvas camera={{ far: 10000 }} ...>` to handle zone scale.

- [ ] **Step 2: Verify TypeScript compiles**

---

### Task 8: Zone Browser Page

**Files:**
- Create: `src/Vanalytics.Web/src/pages/ZoneBrowserPage.tsx`
- Modify: `src/Vanalytics.Web/src/App.tsx`
- Modify: `src/Vanalytics.Web/src/components/Layout.tsx`

- [ ] **Step 1: Create `ZoneBrowserPage.tsx`**

Mirror the NPC browser page pattern (`NpcBrowserPage.tsx`) with these zone-specific changes:

**Data source:** Load `/data/zone-paths.json` instead of NPC paths. Interface:
```typescript
interface ZoneEntry {
  name: string
  path: string
  expansion: string
}
```

**Categories:** Use `expansion` field instead of `category`. Four values: Original, Zilart, Promathia, Aht Urhgan.

**Layout:** Fixed positioning `fixed inset-0 lg:left-64 z-10` — same as NPC browser.

**Floating overlay browser panel:** Same structure as NPC browser:
- Top-left: Browse button + Random button + recent strip
- Browser overlay: expansion tabs on left (with zone counts), search + zone list on right
- Top-right: Camera mode toggle (Orbit / Fly) + Lighting toggle
- Bottom-left: Zone info badge (name, expansion, ROM path)
- Bottom-right: Parse log (collapsible, open by default)

**Camera mode toggle:** Two additional buttons in the top-right controls: "Orbit" and "Fly". State: `cameraMode: 'orbit' | 'fly'`. Pass to `ThreeZoneViewer`.

**Loading flow:**
```typescript
const loadZone = async (zone: ZoneEntry) => {
  log(`Zone: ${zone.name} (${zone.expansion})`)
  log(`DAT: ${zone.path}`)
  const buffer = await ffxi.readFile(zone.path)
  log(`Read ${buffer.byteLength} bytes`)
  const zoneData = parseZoneFile(buffer, log)
  log(`Prefabs: ${zoneData.prefabs.length}, Instances: ${zoneData.instances.length}, Textures: ${zoneData.textures.length}`)
  setZoneData(zoneData)
}
```

**Renderer:** Use `<ThreeZoneViewer>` instead of `<ThreeModelViewer>`. No wireframe mode for zones (3D only — wireframe of an entire zone isn't useful).

**Not-configured / not-authorized states:** Same FFXI directory prompts as NPC browser.

- [ ] **Step 2: Add route to `App.tsx`**

Add import and route:
```typescript
import ZoneBrowserPage from './pages/ZoneBrowserPage'
// ...
<Route path="/zones" element={<ProtectedRoute><ZoneBrowserPage /></ProtectedRoute>} />
```

Place it before the `/debug/models` route, after `/npcs`.

- [ ] **Step 3: Add sidebar link to `Layout.tsx`**

Import `Map` icon from lucide-react. Add sidebar link after NPC Models:

```typescript
<SidebarLink to="/zones" label="Zone Viewer" icon={<Map className="h-4 w-4 shrink-0" />} />
```

- [ ] **Step 4: Verify full build**

Run: `cd src/Vanalytics.Web && npx tsc --noEmit`
Expected: Clean build

---

### Task 9: Integration Testing

- [ ] **Step 1: Run the dev server and test**

Run: `cd src/Vanalytics.Web && npm run dev`

Test with the following zones to cover different expansions and zone types:
1. **West Ronfaure** (`ROM/26/37.dat`) — outdoor field zone, Original
2. **Southern San d'Oria** (`ROM/27/39.dat`) — city zone, Original
3. **The Boyahda Tree** (`ROM2/13/106.dat`) — dungeon zone, Zilart
4. **Al'Taieu** (`ROM3/3/15.dat`) — Sea zone, Promathia
5. **Wajaom Woodlands** (`ROM4/1/50.dat`) — outdoor field, Aht Urhgan

For each zone, verify:
- Zone loads without errors in the parse log
- Textures are applied (not all gray/white)
- Geometry looks like the expected zone (compare with in-game screenshots)
- Orbit camera works (rotate, zoom, pan)
- Fly camera works (click to enter, WASD, mouse look, Escape to exit)
- Bird's-eye view shows the full zone layout

- [ ] **Step 2: Fix any issues discovered during testing**

Zone DAT parsing involves binary format details that may need adjustment during testing. Common issues:
- XOR decryption producing garbage → check key table selection and decryption algorithm
- Missing or misaligned vertices → check stride and offset calculations in MMB parser
- Wrong texture binding → check material group texture index mapping
- Transform matrices producing scattered geometry → check matrix byte order (row-major vs column-major)
- Performance issues on large zones → reduce block limit, consider lazy loading

Iterate until at least 3 of the 5 test zones render correctly.
