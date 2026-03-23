import { DatReader } from './DatReader';
import type { ZoneMeshInstance } from './types';

const ENTRY_SIZE = 0x64; // 100 bytes per mesh entry
const MATRIX_FLOAT_COUNT = 16;
const MATRIX_BYTE_SIZE = MATRIX_FLOAT_COUNT * 4; // 64 bytes
const MESH_INDEX_BYTE_SIZE = 4; // uint32
const REMAINING_SKIP = ENTRY_SIZE - MATRIX_BYTE_SIZE - MESH_INDEX_BYTE_SIZE; // 32 bytes

export function parseMzbBlock(data: Uint8Array): ZoneMeshInstance[] {
  const reader = new DatReader(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer);

  // Read header
  const meshOffset = reader.readUint32();
  reader.skip(4); // quadTreeOffset — not used
  const totalMeshCount = reader.readUint32();

  // Validate
  if (totalMeshCount === 0) {
    return [];
  }

  if (totalMeshCount > 10000) {
    console.warn(`MZB: totalMeshCount ${totalMeshCount} seems unreasonable (> 10000), skipping`);
    return [];
  }

  if (meshOffset >= data.byteLength) {
    console.warn(`MZB: meshOffset 0x${meshOffset.toString(16)} is out of bounds (data length: ${data.byteLength}), skipping`);
    return [];
  }

  reader.seek(meshOffset);

  const instances: ZoneMeshInstance[] = [];

  for (let i = 0; i < totalMeshCount; i++) {
    try {
      const transform: number[] = new Array(MATRIX_FLOAT_COUNT);
      for (let j = 0; j < MATRIX_FLOAT_COUNT; j++) {
        transform[j] = reader.readFloat32();
      }

      const meshIndex = reader.readUint32();

      reader.skip(REMAINING_SKIP);

      instances.push({ meshIndex, transform });
    } catch (err) {
      console.warn(`MZB: failed to parse mesh entry ${i}, skipping:`, err);
      // Attempt to advance past the failed entry to recover
      try {
        const entryStart = meshOffset + i * ENTRY_SIZE;
        const nextEntryStart = entryStart + ENTRY_SIZE;
        if (nextEntryStart <= data.byteLength) {
          reader.seek(nextEntryStart);
        } else {
          break;
        }
      } catch {
        break;
      }
    }
  }

  return instances;
}
