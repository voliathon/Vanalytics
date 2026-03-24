import { DatReader } from './DatReader'
import { parseTextureBlock } from './TextureParser'
import { decodeMzb, decodeMmb } from './ZoneDecrypt'
import { parseMzbBlock } from './MzbParser'
import { parseMmbBlock } from './MmbParser'
import type { ParsedZone, ParsedZoneMesh, ParsedTexture, ZoneMeshInstance } from './types'

const DATHEAD_SIZE = 8
const BLOCK_PADDING = 8
const BLOCK_LIMIT = 2000

const BLOCK_IMG = 0x20
const BLOCK_MZB = 0x1C
const BLOCK_MMB = 0x2E

interface DatBlock {
  name: string
  type: number
  nextUnits: number
  dataOffset: number
  dataLength: number
}

function parseBlockChain(reader: DatReader): DatBlock[] {
  const blocks: DatBlock[] = []
  let offset = 0
  while (offset < reader.length - DATHEAD_SIZE) {
    reader.seek(offset)
    const name = reader.readString(4)
    const packed = reader.readUint32()
    const type = packed & 0x7F
    const nextUnits = (packed >> 7) & 0x7FFFF
    const blockSize = nextUnits * 16
    blocks.push({
      name, type, nextUnits,
      dataOffset: offset + DATHEAD_SIZE,
      dataLength: Math.max(0, blockSize - DATHEAD_SIZE),
    })
    if (nextUnits === 0) break
    offset += blockSize
    if (blocks.length > BLOCK_LIMIT) break
  }
  return blocks
}

/**
 * Read the SMMBHeader.imgID (16 chars at offset 16 after SMMBHEAD)
 * from decrypted MMB block data. This is the name used by MZB entries
 * to reference this MMB prefab.
 */
function readMmbName(decryptedData: Uint8Array): string {
  // SMMBHEAD is 16 bytes, then SMMBHeader starts with imgID[16]
  if (decryptedData.length < 32) return ''
  const bytes = decryptedData.slice(16, 32)
  let end = bytes.indexOf(0)
  if (end === -1) end = 16
  return new TextDecoder('utf-8').decode(bytes.subarray(0, end)).trim()
}

export function parseZoneFile(
  buffer: ArrayBuffer,
  onProgress?: (message: string) => void
): ParsedZone {
  const reader = new DatReader(buffer)
  const blocks = parseBlockChain(reader)

  onProgress?.(`Block chain: ${blocks.length} blocks`)

  const textures: ParsedTexture[] = []
  const prefabs: ParsedZoneMesh[] = []
  const instances: ZoneMeshInstance[] = []

  // ── Pass 1: Textures (with name→index map) ──
  const imgBlocks = blocks.filter(b => b.type === BLOCK_IMG)
  onProgress?.(`Parsing ${imgBlocks.length} textures...`)
  const textureNameMap = new Map<string, number>()
  for (const block of imgBlocks) {
    try {
      const result = parseTextureBlock(reader, block.dataOffset + BLOCK_PADDING, block.dataLength - BLOCK_PADDING)
      if (result) {
        textureNameMap.set(result.name, textures.length)
        textures.push(result.texture)
      }
    } catch { /* skip */ }
  }
  onProgress?.(`Textures: ${textures.length} parsed (${textureNameMap.size} named)`)

  // ── Pass 2: MMB prefabs (with name tracking) ──
  const mmbBlocks = blocks.filter(b => b.type === BLOCK_MMB)
  onProgress?.(`Parsing ${mmbBlocks.length} MMB blocks...`)

  // Map: MMB name → { startIdx, count } in the flat prefabs array
  const mmbNameMap = new Map<string, { startIdx: number; count: number }>()

  for (let i = 0; i < mmbBlocks.length; i++) {
    const block = mmbBlocks[i]
    const start = block.dataOffset + BLOCK_PADDING
    const len = block.dataLength - BLOCK_PADDING
    if (len <= 0) continue
    try {
      const blockData = new Uint8Array(buffer, start, len)
      const decryptedData = decodeMmb(blockData)
      const name = readMmbName(decryptedData)
      const meshes = parseMmbBlock(decryptedData)

      // Resolve texture names to material indices
      for (const mesh of meshes) {
        const texIdx = textureNameMap.get(mesh.textureName)
        if (texIdx !== undefined) {
          mesh.materialIndex = texIdx
        }
      }

      if (meshes.length > 0) {
        const startIdx = prefabs.length
        prefabs.push(...meshes)
        // Store the FIRST mapping for this name (some names may repeat)
        if (!mmbNameMap.has(name)) {
          mmbNameMap.set(name, { startIdx, count: meshes.length })
        }
      }
    } catch { /* skip */ }
  }
  onProgress?.(`MMB: ${prefabs.length} meshes from ${mmbBlocks.length} blocks, ${mmbNameMap.size} unique names`)

  // ── Pass 3: MZB transforms (with name-based lookup) ──
  const mzbBlocks = blocks.filter(b => b.type === BLOCK_MZB)
  onProgress?.(`Parsing ${mzbBlocks.length} MZB blocks...`)

  for (const block of mzbBlocks) {
    const start = block.dataOffset + BLOCK_PADDING
    const len = block.dataLength - BLOCK_PADDING
    if (len <= 0) continue
    try {
      const blockData = new Uint8Array(buffer, start, len)
      const decryptedData = decodeMzb(blockData)
      const rawInstances = parseMzbBlock(decryptedData)

      // Map MZB entry names to prefab indices
      for (let i = 0; i < rawInstances.length; i++) {
        const entryOffset = 32 + i * 100  // SMZBHeader(32) + i * sizeof(SMZBBlock100)
        if (entryOffset + 16 > decryptedData.length) break

        // Read id[16] as string
        const idBytes = decryptedData.slice(entryOffset, entryOffset + 16)
        let end = idBytes.indexOf(0)
        if (end === -1) end = 16
        const name = new TextDecoder('utf-8').decode(idBytes.subarray(0, end)).trim()

        const mapping = mmbNameMap.get(name)
        if (!mapping) continue

        const inst = rawInstances[i]
        // Create one instance per mesh in the MMB block
        for (let m = 0; m < mapping.count; m++) {
          instances.push({
            meshIndex: mapping.startIdx + m,
            transform: inst.transform,
          })
        }
      }
    } catch (err) {
      onProgress?.(`Warning: MZB parse failed — ${err}`)
    }
  }

  const unmatchedCount = (() => {
    // Count how many MZB entries didn't match any MMB name
    let total = 0
    let matched = 0
    for (const block of mzbBlocks) {
      const start = block.dataOffset + BLOCK_PADDING
      const len = block.dataLength - BLOCK_PADDING
      if (len <= 0) continue
      const blockData = new Uint8Array(buffer, start, len)
      const decryptedData = decodeMzb(blockData)
      const count = (decryptedData[4] | (decryptedData[5] << 8) | (decryptedData[6] << 16)) & 0xFFFFFF
      total = count
      for (let i = 0; i < count; i++) {
        const off = 32 + i * 100
        if (off + 16 > decryptedData.length) break
        const idBytes = decryptedData.slice(off, off + 16)
        let end = idBytes.indexOf(0)
        if (end === -1) end = 16
        const name = new TextDecoder('utf-8').decode(idBytes.subarray(0, end)).trim()
        if (mmbNameMap.has(name)) matched++
      }
    }
    return { total, matched }
  })()

  onProgress?.(`Instances: ${instances.length} (${unmatchedCount.matched}/${unmatchedCount.total} MZB entries matched MMB names)`)
  onProgress?.(`Result: ${prefabs.length} prefabs, ${instances.length} instances, ${textures.length} textures`)

  return { prefabs, instances, textures }
}
