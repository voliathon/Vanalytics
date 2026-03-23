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

export function parseZoneFile(
  buffer: ArrayBuffer,
  onProgress?: (message: string) => void
): ParsedZone {
  const reader = new DatReader(buffer)
  const blocks = parseBlockChain(reader)

  const textures: ParsedTexture[] = []
  const prefabs: ParsedZoneMesh[] = []
  const instances: ZoneMeshInstance[] = []

  // Pass 1 — Textures
  const imgBlocks = blocks.filter(b => b.type === BLOCK_IMG)
  onProgress?.(`Parsing ${imgBlocks.length} texture block(s)...`)
  for (let i = 0; i < imgBlocks.length; i++) {
    const block = imgBlocks[i]
    try {
      const result = parseTextureBlock(reader, block.dataOffset + BLOCK_PADDING, block.dataLength - BLOCK_PADDING)
      if (result) {
        textures.push(result.texture)
      }
    } catch { /* skip */ }
    onProgress?.(`Texture ${i + 1}/${imgBlocks.length} parsed`)
  }

  // Pass 2 — MMB prefabs
  const mmbBlocks = blocks.filter(b => b.type === BLOCK_MMB)
  onProgress?.(`Parsing ${mmbBlocks.length} MMB prefab block(s)...`)
  for (let i = 0; i < mmbBlocks.length; i++) {
    const block = mmbBlocks[i]
    const start = block.dataOffset + BLOCK_PADDING
    const len = block.dataLength - BLOCK_PADDING
    if (len <= 0) continue
    try {
      const blockData = new Uint8Array(buffer, start, len)
      const decryptedData = decodeMmb(blockData)
      const meshes = parseMmbBlock(decryptedData)
      prefabs.push(...meshes)
      onProgress?.(`MMB block ${i + 1}/${mmbBlocks.length} parsed (${meshes.length} mesh(es))`)
    } catch (err) {
      onProgress?.(`Warning: MMB block ${i + 1}/${mmbBlocks.length} failed — ${err}`)
    }
  }

  // Pass 3 — MZB transforms
  const mzbBlocks = blocks.filter(b => b.type === BLOCK_MZB)
  onProgress?.(`Parsing ${mzbBlocks.length} MZB transform block(s)...`)
  for (let i = 0; i < mzbBlocks.length; i++) {
    const block = mzbBlocks[i]
    const start = block.dataOffset + BLOCK_PADDING
    const len = block.dataLength - BLOCK_PADDING
    if (len <= 0) continue
    try {
      const blockData = new Uint8Array(buffer, start, len)
      const decryptedData = decodeMzb(blockData)
      const newInstances = parseMzbBlock(decryptedData)
      instances.push(...newInstances)
      onProgress?.(`MZB block ${i + 1}/${mzbBlocks.length} parsed (${newInstances.length} instance(s))`)
    } catch (err) {
      onProgress?.(`Warning: MZB block ${i + 1}/${mzbBlocks.length} failed — ${err}`)
    }
  }

  return { prefabs, instances, textures }
}
