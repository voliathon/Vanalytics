import { DatReader } from './DatReader'
import type { ParsedAnimation, AnimationBone } from './types'

const BLOCK_ANIM = 0x2B
const DATHEAD_SIZE = 8
const BLOCK_PADDING = 8 // 8 bytes of zeros after DATHEAD, same as other block types
const DAT2B_HEADER_SIZE = 10
const DAT2B_BONE_SIZE = 84

/**
 * Parse animation data from an FFXI DAT file containing 0x2B blocks.
 * Returns one ParsedAnimation per 0x2B block found (typically 1-3 per DAT
 * for the upper/lower/additional body sections).
 */
export function parseAnimationDat(buffer: ArrayBuffer, debugPath?: string): ParsedAnimation[] {
  const reader = new DatReader(buffer)
  const animations: ParsedAnimation[] = []
  const blockTypes = new Map<number, number>()

  let offset = 0
  while (offset < reader.length - DATHEAD_SIZE) {
    reader.seek(offset)
    reader.skip(4) // block name
    const packed = reader.readUint32()
    const type = packed & 0x7F
    const nextUnits = (packed >> 7) & 0x7FFFF
    const blockSize = nextUnits * 16

    blockTypes.set(type, (blockTypes.get(type) ?? 0) + 1)

    if (type === BLOCK_ANIM) {
      try {
        const dataStart = offset + DATHEAD_SIZE + BLOCK_PADDING
        const dataLength = Math.max(0, blockSize - DATHEAD_SIZE - BLOCK_PADDING)
        // DEBUG: log first few 0x2B block headers
        if (animations.length === 0 && debugPath && blockTypes.get(BLOCK_ANIM)! <= 3) {
          const r = new DatReader(buffer)
          r.seek(dataStart)
          const raw = Array.from({ length: 16 }, () => r.readUint8())
          console.log(`[AnimParser] 0x2B block at offset=${offset} blockSize=${blockSize} dataStart=${dataStart} raw header bytes:`, raw)
        }
        const anim = parseAnimBlock(buffer, dataStart, dataLength)
        if (anim) animations.push(anim)
      } catch (err) {
        if (debugPath) console.warn(`[AnimParser] parseAnimBlock error:`, err)
      }
    }

    if (nextUnits === 0) break
    offset += blockSize
    if (offset > reader.length) break
  }

  if (debugPath && animations.length === 0) {
    const types = Array.from(blockTypes.entries())
      .map(([t, c]) => `0x${t.toString(16)}:${c}`)
      .join(' ')
    console.log(`[AnimParser] ${debugPath}: no 0x2B blocks. Found types: ${types}`)
  }

  return animations
}

function parseAnimBlock(
  buffer: ArrayBuffer,
  dataStart: number,
  dataLength: number,
): ParsedAnimation | null {
  const reader = new DatReader(buffer)
  reader.seek(dataStart)

  // DAT2BHeader2: 10 bytes — skip ver(1) + nazo(1)
  reader.skip(2)
  const element = reader.readUint16()
  const frameCount = reader.readUint16()
  const speed = reader.readFloat32()

  if (element === 0 || frameCount === 0) return null
  if (element > 500) return null // sanity check

  // Create float view over entire block payload for keyframe pool access.
  // The idx_* fields are absolute indices into this view (C union pattern).
  // Use buffer.slice to ensure 4-byte alignment for Float32Array.
  const floatView = new Float32Array(
    buffer.slice(dataStart, dataStart + dataLength),
  )

  // DEBUG: log first parse
  const shouldLog = typeof window !== 'undefined' && !(window as unknown as Record<string, unknown>).__animParsed
  if (shouldLog) {
    ;(window as unknown as Record<string, unknown>).__animParsed = true
    console.log(`[AnimParser] header: element=${element} frame=${frameCount} speed=${speed} dataLen=${dataLength} floatPoolSize=${floatView.length}`)
    console.log(`[AnimParser] metadata size: ${DAT2B_HEADER_SIZE + element * DAT2B_BONE_SIZE} bytes = ${(DAT2B_HEADER_SIZE + element * DAT2B_BONE_SIZE) / 4} floats`)
  }

  // Read DAT2B bone descriptors (84 bytes each)
  const bones: AnimationBone[] = []
  let loggedBone = false
  for (let i = 0; i < element; i++) {
    const boneOffset = dataStart + DAT2B_HEADER_SIZE + i * DAT2B_BONE_SIZE
    reader.seek(boneOffset)

    const boneIndex = reader.readInt32()

    // Rotation indices + defaults
    const idx_qtx = reader.readInt32()
    const idx_qty = reader.readInt32()
    const idx_qtz = reader.readInt32()
    const idx_qtw = reader.readInt32()
    const qtx = reader.readFloat32()
    const qty = reader.readFloat32()
    const qtz = reader.readFloat32()
    const qtw = reader.readFloat32()

    // Translation indices + defaults
    const idx_tx = reader.readInt32()
    const idx_ty = reader.readInt32()
    const idx_tz = reader.readInt32()
    const tx = reader.readFloat32()
    const ty = reader.readFloat32()
    const tz = reader.readFloat32()

    // Scale indices + defaults
    const idx_sx = reader.readInt32()
    const idx_sy = reader.readInt32()
    const idx_sz = reader.readInt32()
    const sx = reader.readFloat32()
    const sy = reader.readFloat32()
    const sz = reader.readFloat32()

    // Skip flag: high bit of idx_qtx means no animation for this bone
    if (idx_qtx & 0x80000000) continue

    // DEBUG: log first non-skipped bone's idx values
    if (shouldLog && !loggedBone) {
      loggedBone = true
      console.log(`[AnimParser] bone[${i}] idx=${boneIndex} idx_qtx=${idx_qtx} idx_qty=${idx_qty} idx_qtz=${idx_qtz} idx_qtw=${idx_qtw}`)
      console.log(`  defaults: rot=[${qtx},${qty},${qtz},${qtw}] trans=[${tx},${ty},${tz}]`)
      console.log(`  pool[idx_qtx]=${idx_qtx > 0 ? floatView[idx_qtx] : 'N/A'} pool[idx_qtx+1]=${idx_qtx > 0 ? floatView[idx_qtx + 1] : 'N/A'}`)
      console.log(`  idx_tx=${idx_tx} idx_ty=${idx_ty} idx_tz=${idx_tz}`)
    }

    // Extract keyframe arrays from the float pool
    const rotKf = extractRotationKeyframes(floatView, idx_qtx, idx_qty, idx_qtz, idx_qtw, frameCount)
    const transKf = extractTranslationKeyframes(floatView, idx_tx, idx_ty, idx_tz, frameCount)
    const scaleKf = extractScaleKeyframes(floatView, idx_sx, idx_sy, idx_sz, frameCount)

    bones.push({
      boneIndex,
      rotationKeyframes: rotKf,
      rotationDefault: [qtx, qty, qtz, qtw],
      translationKeyframes: transKf,
      translationDefault: [tx, ty, tz],
      scaleKeyframes: scaleKf,
      scaleDefault: [sx, sy, sz],
    })
  }

  return { frameCount, speed, bones }
}

function extractRotationKeyframes(
  pool: Float32Array,
  idxX: number, idxY: number, idxZ: number, idxW: number,
  frameCount: number,
): Float32Array | null {
  if (idxX === 0 && idxY === 0 && idxZ === 0 && idxW === 0) return null

  const kf = new Float32Array(frameCount * 4)
  for (let f = 0; f < frameCount; f++) {
    kf[f * 4 + 0] = idxX > 0 && idxX + f < pool.length ? pool[idxX + f] : 0
    kf[f * 4 + 1] = idxY > 0 && idxY + f < pool.length ? pool[idxY + f] : 0
    kf[f * 4 + 2] = idxZ > 0 && idxZ + f < pool.length ? pool[idxZ + f] : 0
    kf[f * 4 + 3] = idxW > 0 && idxW + f < pool.length ? pool[idxW + f] : 1
  }
  return kf
}

function extractTranslationKeyframes(
  pool: Float32Array,
  idxX: number, idxY: number, idxZ: number,
  frameCount: number,
): Float32Array | null {
  if (idxX === 0 && idxY === 0 && idxZ === 0) return null

  const kf = new Float32Array(frameCount * 3)
  for (let f = 0; f < frameCount; f++) {
    kf[f * 3 + 0] = idxX > 0 && idxX + f < pool.length ? pool[idxX + f] : 0
    kf[f * 3 + 1] = idxY > 0 && idxY + f < pool.length ? pool[idxY + f] : 0
    kf[f * 3 + 2] = idxZ > 0 && idxZ + f < pool.length ? pool[idxZ + f] : 0
  }
  return kf
}

function extractScaleKeyframes(
  pool: Float32Array,
  idxX: number, idxY: number, idxZ: number,
  frameCount: number,
): Float32Array | null {
  if (idxX === 0 && idxY === 0 && idxZ === 0) return null

  const kf = new Float32Array(frameCount * 3)
  for (let f = 0; f < frameCount; f++) {
    kf[f * 3 + 0] = idxX > 0 && idxX + f < pool.length ? pool[idxX + f] : 1
    kf[f * 3 + 1] = idxY > 0 && idxY + f < pool.length ? pool[idxY + f] : 1
    kf[f * 3 + 2] = idxZ > 0 && idxZ + f < pool.length ? pool[idxZ + f] : 1
  }
  return kf
}
