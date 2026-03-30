import { useRef, useMemo, useCallback } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import * as THREE from 'three'
import { useStore } from '../store'

function Particles() {
  const meshRef = useRef()
  const { particleCount, speed, particleFn, particleFnSource, playing, dynamicValues, dynamicControls, visualStyle } = useStore()

  const timeRef = useRef(0)
  const errorRef = useRef(null)

  // Reusable vectors
  const _target = useMemo(() => new THREE.Vector3(), [])
  const _color = useMemo(() => new THREE.Color(), [])

  // Compile the actual callable function (memoized on source change)
  const compiledFn = useMemo(() => {
    if (!particleFnSource) return null
    errorRef.current = null
    try {
      return new Function(
        'i', 'count', 'target', 'color', 'time', 'THREE', 'addControl', 'setInfo', 'controls',
        `"use strict";\n${particleFnSource}`
      )
    } catch (e) {
      errorRef.current = e.message
      console.error('Compile error:', e)
      return null
    }
  }, [particleFnSource])

  // Build geometry - scatter initially so bloom doesn't overexpose
  const { positions, colors } = useMemo(() => {
    const pos = new Float32Array(particleCount * 3)
    const col = new Float32Array(particleCount * 3)
    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3
      pos[i3] = (Math.random() - 0.5) * 20
      pos[i3 + 1] = (Math.random() - 0.5) * 20
      pos[i3 + 2] = (Math.random() - 0.5) * 20
      col[i3] = 0.1
      col[i3 + 1] = 0.1
      col[i3 + 2] = 0.1
    }
    return { positions: pos, colors: col }
  }, [particleCount])

  const pointSize = useMemo(() => {
    switch (visualStyle) {
      case 'plasma': return 3.5
      case 'blob': return 5
      case 'ring': return 2
      default: return 2.5 // sparkle
    }
  }, [visualStyle])

  useFrame((_, delta) => {
    if (!playing || !compiledFn || !meshRef.current) return
    timeRef.current += delta * speed

    const geo = meshRef.current.geometry
    const posArr = geo.attributes.position.array
    const colArr = geo.attributes.color.array
    const t = timeRef.current
    const noop = () => {}

    for (let idx = 0; idx < particleCount; idx++) {
      _target.set(0, 0, 0)
      _color.setRGB(1, 1, 1)
      try {
        compiledFn(idx, particleCount, _target, _color, t, THREE, noop, noop, dynamicValues)
      } catch (e) {
        if (!errorRef.current) {
          errorRef.current = e.message
          console.error('Runtime error:', e)
        }
        break
      }
      const i3 = idx * 3
      posArr[i3] = _target.x
      posArr[i3 + 1] = _target.y
      posArr[i3 + 2] = _target.z
      colArr[i3] = _color.r
      colArr[i3 + 1] = _color.g
      colArr[i3 + 2] = _color.b
    }
    geo.attributes.position.needsUpdate = true
    geo.attributes.color.needsUpdate = true
  })

  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={particleCount}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={particleCount}
          array={colors}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={pointSize * 0.25}
        sizeAttenuation
        vertexColors
        transparent
        opacity={0.2}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
      />
    </points>
  )
}

export default function ParticleCanvas() {
  const glowIntensity = useStore(s => s.glowIntensity)

  return (
    <Canvas
      camera={{ position: [0, 5, 15], fov: 60 }}
      gl={{ antialias: true, alpha: false }}
      style={{ background: '#0a0a0f' }}
    >
      <color attach="background" args={['#0a0a0f']} />
      <Particles />
      <OrbitControls
        enableDamping
        dampingFactor={0.05}
        rotateSpeed={0.5}
        zoomSpeed={0.8}
      />
      <EffectComposer>
        <Bloom
          intensity={glowIntensity * 0.6}
          luminanceThreshold={0.8}
          luminanceSmoothing={0.4}
          radius={0.3}
          mipmapBlur
        />
      </EffectComposer>
    </Canvas>
  )
}
