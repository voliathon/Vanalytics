import { useRef, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { ZoneSpawnDto } from '../../types/api'

interface SpawnMarkersProps {
  spawns: ZoneSpawnDto[]
  visible: boolean
  onHover?: (spawn: ZoneSpawnDto | null, screenPos?: { x: number; y: number }) => void
}

const SPHERE_RADIUS = 0.5
const SPHERE_SEGMENTS = 8

const COLORS = {
  monster: new THREE.Color('#ff4444'),
  npc: new THREE.Color('#4488ff'),
  unknown: new THREE.Color('#44cc88'),
}

function getColor(spawn: ZoneSpawnDto): THREE.Color {
  return spawn.isMonster === true ? COLORS.monster : spawn.isMonster === false ? COLORS.npc : COLORS.unknown
}

export default function SpawnMarkers({ spawns, visible, onHover }: SpawnMarkersProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const geometry = useMemo(() => new THREE.SphereGeometry(SPHERE_RADIUS, SPHERE_SEGMENTS, SPHERE_SEGMENTS), [])
  const material = useMemo(() => new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.7,
  }), [])

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh || spawns.length === 0) return

    const dummy = new THREE.Object3D()
    const color = new THREE.Color()

    for (let i = 0; i < spawns.length; i++) {
      const s = spawns[i]
      dummy.position.set(s.x, s.y, s.z)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      mesh.setColorAt(i, color.copy(getColor(s)))
    }

    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [spawns])

  if (!visible || spawns.length === 0) return null

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, spawns.length]}
      onPointerMove={(e) => {
        e.stopPropagation()
        if (e.instanceId != null) {
          onHover?.(spawns[e.instanceId], { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY })
        }
      }}
      onPointerLeave={(e) => { e.stopPropagation(); onHover?.(null) }}
    />
  )
}
