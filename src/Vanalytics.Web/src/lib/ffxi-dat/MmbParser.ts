import { DatReader } from './DatReader'
import type { ParsedZoneMesh } from './types'
import { triangleStripToList } from './MeshParser'

/**
 * Parses MMB blocks (type 0x2E) from FFXI zone DAT files.
 *
 * MMB blocks contain mesh prefab data: position, normal, color, and UV vertices.
 * Data is expected to have already been decrypted before being passed here.
 *
 * Structure based on GalkaReeve FFXILandscapeMesh.cpp + NavMesh Builder MMB.cs:
 *
 * SMMBHEAD (4 bytes):
 *   - Byte 0: id/type marker
 *   - Bytes 1-3: flags (shadow, version, etc.)
 *
 * SMMBHEAD2 (8 bytes at offset 4):
 *   - uint32: vertex count
 *   - uint32: buffer size / stride info
 *
 * Material group count (4 bytes at offset 12):
 *   - uint32: imgCount (number of texture/material groups)
 *
 * Offset table (imgCount × uint32):
 *   - Per-group offsets to index data
 *
 * Vertex buffer (vertexCount × 36 bytes):
 *   - Position:  3 × float32 (x, y, z)         — 12 bytes
 *   - Normal:    3 × float32 (nx, ny, nz)        — 12 bytes
 *   - Color:     4 × uint8  (r, g, b, a) /255    —  4 bytes
 *   - UV:        2 × float32 (u, v)              —  8 bytes
 *
 * Index data (after vertex buffer, per material group):
 *   - uint16: materialIndex
 *   - uint16: indexCount
 *   - indexCount × uint16: triangle-strip indices
 */
export function parseMmbBlock(data: Uint8Array): ParsedZoneMesh[] {
  const reader = new DatReader(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer)
  const meshes: ParsedZoneMesh[] = []

  if (data.length < 16) return meshes

  // SMMBHEAD: 4 bytes
  reader.skip(4) // id/type marker + flags

  // SMMBHEAD2: vertex info
  const vertexCount = reader.readUint32()
  reader.skip(4) // buffer size (informational)

  // Number of material/texture groups
  const imgCount = reader.readUint32()

  // Sanity checks to avoid runaway parsing on corrupt data
  if (vertexCount === 0 || vertexCount > 100000) return meshes
  if (imgCount > 100) return meshes

  // Read per-group offsets (currently stored for potential future use)
  const groupOffsets: number[] = []
  for (let i = 0; i < imgCount; i++) {
    groupOffsets.push(reader.readUint32())
  }

  // Vertex data begins immediately after the header + offset table
  const vertexDataOffset = reader.position
  const VERTEX_STRIDE = 36

  const allVertices: number[] = []
  const allNormals: number[] = []
  const allColors: number[] = []
  const allUvs: number[] = []

  reader.seek(vertexDataOffset)
  for (let i = 0; i < vertexCount; i++) {
    if (reader.remaining < VERTEX_STRIDE) break

    // Position (x, y, z)
    allVertices.push(reader.readFloat32(), reader.readFloat32(), reader.readFloat32())

    // Normal (nx, ny, nz)
    allNormals.push(reader.readFloat32(), reader.readFloat32(), reader.readFloat32())

    // RGBA color: 4 × uint8, normalized to [0.0, 1.0]
    allColors.push(
      reader.readUint8() / 255,
      reader.readUint8() / 255,
      reader.readUint8() / 255,
      reader.readUint8() / 255,
    )

    // UV (u, v)
    allUvs.push(reader.readFloat32(), reader.readFloat32())
  }

  // Index data follows immediately after the vertex buffer
  const indexDataOffset = vertexDataOffset + vertexCount * VERTEX_STRIDE
  reader.seek(indexDataOffset)

  for (let g = 0; g < imgCount; g++) {
    if (reader.remaining < 4) break

    const materialIndex = reader.readUint16()
    const indexCount = reader.readUint16()

    if (indexCount === 0 || reader.remaining < indexCount * 2) break

    const indices: number[] = []
    for (let i = 0; i < indexCount; i++) {
      indices.push(reader.readUint16())
    }

    // Zone meshes commonly use triangle strips; convert to triangle list
    const triIndices = triangleStripToList(indices)
    if (triIndices.length === 0) continue

    meshes.push({
      vertices: allVertices,
      normals: allNormals,
      colors: allColors,
      uvs: allUvs,
      indices: triIndices,
      materialIndex,
    })
  }

  // Fallback: if no material groups parsed but vertices exist, emit a single mesh
  if (meshes.length === 0 && allVertices.length > 0) {
    const indices: number[] = []
    for (let i = 0; i < vertexCount; i++) indices.push(i)

    meshes.push({
      vertices: allVertices,
      normals: allNormals,
      colors: allColors,
      uvs: allUvs,
      indices: triangleStripToList(indices),
      materialIndex: 0,
    })
  }

  return meshes
}
