import { useRef, useCallback } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { ParsedAnimation } from '../lib/ffxi-dat/types'

interface UseAnimationPlaybackOptions {
  animations: ParsedAnimation[]
  skeleton: THREE.Skeleton | null
  bindPose: Array<{ position: THREE.Vector3; quaternion: THREE.Quaternion }> | null
  playing: boolean
  speed: number
  onFrameUpdate?: (frame: number, total: number) => void
}

const _quatA = new THREE.Quaternion()
const _quatB = new THREE.Quaternion()
const _quatResult = new THREE.Quaternion()
const _pos = new THREE.Vector3()
const _scale = new THREE.Vector3()

export function useAnimationPlayback({
  animations,
  skeleton,
  bindPose,
  playing,
  speed,
  onFrameUpdate,
}: UseAnimationPlaybackOptions) {
  const elapsedRef = useRef(0)

  useFrame((_, delta) => {
    if (!skeleton || !bindPose || animations.length === 0) return

    if (playing) {
      elapsedRef.current += delta * speed
    }

    const bones = skeleton.bones

    // Reset all bones to bind pose
    for (let i = 0; i < bones.length && i < bindPose.length; i++) {
      bones[i].position.copy(bindPose[i].position)
      bones[i].quaternion.copy(bindPose[i].quaternion)
      bones[i].scale.set(1, 1, 1)
    }

    // Apply each animation section (upper body, lower body, etc.)
    for (const anim of animations) {
      // Static pose: apply defaults directly, no interpolation
      if (anim.frameCount <= 1) {
        for (const ab of anim.bones) {
          if (ab.boneIndex < 0 || ab.boneIndex >= bones.length) continue
          const bone = bones[ab.boneIndex]
          _quatResult.set(ab.rotationDefault[0], ab.rotationDefault[1], ab.rotationDefault[2], ab.rotationDefault[3])
          bone.quaternion.multiply(_quatResult)
          bone.position.add(_pos.set(ab.translationDefault[0], ab.translationDefault[1], ab.translationDefault[2]))
          bone.scale.multiply(_scale.set(ab.scaleDefault[0], ab.scaleDefault[1], ab.scaleDefault[2]))
        }
        continue
      }

      const totalFrames = anim.frameCount - 1
      const frame = (elapsedRef.current * anim.speed * 30) % totalFrames
      const j = Math.floor(frame)
      const n = frame - j
      const j1 = Math.min(j + 1, totalFrames)

      for (const ab of anim.bones) {
        if (ab.boneIndex < 0 || ab.boneIndex >= bones.length) continue
        const bone = bones[ab.boneIndex]

        // Rotation: SLERP
        if (ab.rotationKeyframes) {
          const kf = ab.rotationKeyframes
          _quatA.set(kf[j * 4], kf[j * 4 + 1], kf[j * 4 + 2], kf[j * 4 + 3])
          _quatB.set(kf[j1 * 4], kf[j1 * 4 + 1], kf[j1 * 4 + 2], kf[j1 * 4 + 3])
          _quatResult.slerpQuaternions(_quatA, _quatB, n)
          bone.quaternion.multiply(_quatResult)
        } else {
          _quatResult.set(
            ab.rotationDefault[0], ab.rotationDefault[1],
            ab.rotationDefault[2], ab.rotationDefault[3],
          )
          bone.quaternion.multiply(_quatResult)
        }

        // Translation: LERP
        if (ab.translationKeyframes) {
          const kf = ab.translationKeyframes
          _pos.set(
            kf[j * 3] + (kf[j1 * 3] - kf[j * 3]) * n,
            kf[j * 3 + 1] + (kf[j1 * 3 + 1] - kf[j * 3 + 1]) * n,
            kf[j * 3 + 2] + (kf[j1 * 3 + 2] - kf[j * 3 + 2]) * n,
          )
          bone.position.add(_pos)
        } else {
          bone.position.add(_pos.set(
            ab.translationDefault[0], ab.translationDefault[1], ab.translationDefault[2],
          ))
        }

        // Scale: LERP
        if (ab.scaleKeyframes) {
          const kf = ab.scaleKeyframes
          _scale.set(
            kf[j * 3] + (kf[j1 * 3] - kf[j * 3]) * n,
            kf[j * 3 + 1] + (kf[j1 * 3 + 1] - kf[j * 3 + 1]) * n,
            kf[j * 3 + 2] + (kf[j1 * 3 + 2] - kf[j * 3 + 2]) * n,
          )
          bone.scale.multiply(_scale)
        } else {
          bone.scale.multiply(_scale.set(
            ab.scaleDefault[0], ab.scaleDefault[1], ab.scaleDefault[2],
          ))
        }
      }
    }

    // Let Three.js propagate the bone hierarchy and update bind matrices
    skeleton.update()

    // Report frame for UI
    if (animations.length > 0 && onFrameUpdate) {
      const anim = animations[0]
      const totalFrames = Math.max(1, anim.frameCount - 1)
      const frame = (elapsedRef.current * anim.speed * 30) % totalFrames
      onFrameUpdate(Math.floor(frame), anim.frameCount)
    }
  })

  const seekToFrame = useCallback((frame: number) => {
    if (animations.length === 0) return
    const anim = animations[0]
    elapsedRef.current = frame / (anim.speed * 30)
  }, [animations])

  return { seekToFrame }
}
