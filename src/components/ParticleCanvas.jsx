import { useRef, useMemo, useEffect, useCallback } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import * as THREE from 'three'
import { useStore, THEMES } from '../store'

// FPS counter component (renders as HTML overlay)
function FPSCounter() {
  const ref = useRef()
  const frames = useRef(0)
  const lastTime = useRef(performance.now())
  const fpsRef = useRef(60)

  useEffect(() => {
    let raf
    const update = () => {
      frames.current++
      const now = performance.now()
      if (now - lastTime.current >= 500) {
        fpsRef.current = Math.round(frames.current * 1000 / (now - lastTime.current))
        frames.current = 0
        lastTime.current = now
        if (ref.current) {
          const count = useStore.getState().particleCount
          ref.current.textContent = `${fpsRef.current} FPS | ${(count / 1000).toFixed(0)}K particles`
        }
      }
      raf = requestAnimationFrame(update)
    }
    raf = requestAnimationFrame(update)

    // Auto-adjust particle count
    const autoAdjust = setInterval(() => {
      const { performanceMode, particleCount, setParticleCount } = useStore.getState()
      if (fpsRef.current < 30 && particleCount > 2000) {
        const newCount = Math.max(2000, particleCount - 2000)
        setParticleCount(newCount)
        // Show notification
        const notif = document.getElementById('perf-notif')
        if (notif) {
          notif.textContent = `⚡ Auto-reduced to ${(newCount/1000).toFixed(0)}K particles (FPS: ${fpsRef.current})`
          notif.style.opacity = '1'
          setTimeout(() => { notif.style.opacity = '0' }, 3000)
        }
      }
    }, 2000)

    return () => { cancelAnimationFrame(raf); clearInterval(autoAdjust) }
  }, [])

  return null // rendered as HTML overlay in ParticleCanvas
}

function MouseAttractor() {
  const { camera, raycaster, pointer } = useThree()
  const planeRef = useRef(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0))
  const intersectPoint = useRef(new THREE.Vector3())

  useFrame(() => {
    const { mouseAttract } = useStore.getState()
    if (!mouseAttract) return
    raycaster.setFromCamera(pointer, camera)
    raycaster.ray.intersectPlane(planeRef.current, intersectPoint.current)
    // Store mouse3D globally for particles to use
    window.__mousePos = intersectPoint.current
  })

  return null
}

function Particles() {
  const meshRef = useRef()
  const { particleCount, speed, particleFnSource, playing, dynamicValues, visualStyle } = useStore()

  const timeRef = useRef(0)
  const errorRef = useRef(null)
  const velocitiesRef = useRef(null)
  const prevCountRef = useRef(0)

  const _target = useMemo(() => new THREE.Vector3(), [])
  const _color = useMemo(() => new THREE.Color(), [])

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

  const { positions, colors } = useMemo(() => {
    const pos = new Float32Array(particleCount * 3)
    const col = new Float32Array(particleCount * 3)
    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3
      pos[i3] = (Math.random() - 0.5) * 20
      pos[i3 + 1] = (Math.random() - 0.5) * 20
      pos[i3 + 2] = (Math.random() - 0.5) * 20
      col[i3] = 0.1; col[i3 + 1] = 0.1; col[i3 + 2] = 0.1
    }
    return { positions: pos, colors: col }
  }, [particleCount])

  const pointSize = useMemo(() => {
    switch (visualStyle) {
      case 'plasma': return 3.5
      case 'blob': return 5
      case 'ring': return 2
      default: return 2.5
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
    const dv = useStore.getState().dynamicValues
    const { mouseAttract, attractStrength, theme, audioLevel,
            gravityEnabled, gravityStrength, collisionsEnabled,
            forceFieldType, forceFieldStrength } = useStore.getState()
    const themeData = THEMES[theme]
    const mousePos = window.__mousePos

    // Ensure velocity array exists
    if (!velocitiesRef.current || prevCountRef.current !== particleCount) {
      velocitiesRef.current = new Float32Array(particleCount * 3)
      prevCountRef.current = particleCount
    }
    const vel = velocitiesRef.current
    const physicsActive = gravityEnabled || collisionsEnabled || forceFieldType
    const dt = Math.min(delta, 0.05) // cap delta

    // Spatial hash for collisions
    let cellMap = null
    if (collisionsEnabled) {
      cellMap = {}
      for (let idx = 0; idx < particleCount; idx++) {
        const i3 = idx * 3
        const cx = Math.floor(posArr[i3]) 
        const cy = Math.floor(posArr[i3 + 1])
        const cz = Math.floor(posArr[i3 + 2])
        const key = (cx * 73856093 ^ cy * 19349663 ^ cz * 83492791) | 0
        if (!cellMap[key]) cellMap[key] = []
        cellMap[key].push(idx)
      }
    }

    for (let idx = 0; idx < particleCount; idx++) {
      _target.set(0, 0, 0)
      _color.setRGB(1, 1, 1)
      try {
        compiledFn(idx, particleCount, _target, _color, t, THREE, noop, noop, dv)
      } catch (e) {
        if (!errorRef.current) { errorRef.current = e.message; console.error('Runtime error:', e) }
        break
      }

      const i3 = idx * 3

      // Physics: apply forces to velocity, then modify position
      if (physicsActive) {
        // Gravity
        if (gravityEnabled) {
          vel[i3 + 1] -= gravityStrength * 9.8 * dt
        }

        // Force fields
        if (forceFieldType) {
          const px = _target.x, py = _target.y, pz = _target.z
          const dist = Math.sqrt(px * px + py * py + pz * pz) + 0.01
          const radius = 10
          if (dist < radius) {
            const strength = forceFieldStrength * dt
            if (forceFieldType === 'attractor') {
              vel[i3]     -= (px / dist) * strength * 3
              vel[i3 + 1] -= (py / dist) * strength * 3
              vel[i3 + 2] -= (pz / dist) * strength * 3
            } else if (forceFieldType === 'repulsor') {
              vel[i3]     += (px / dist) * strength * 3
              vel[i3 + 1] += (py / dist) * strength * 3
              vel[i3 + 2] += (pz / dist) * strength * 3
            } else if (forceFieldType === 'vortex') {
              vel[i3]     += (-pz / dist) * strength * 4
              vel[i3 + 1] += 0
              vel[i3 + 2] += (px / dist) * strength * 4
            } else if (forceFieldType === 'turbulence') {
              vel[i3]     += Math.sin(py * 3 + t * 2) * strength * 5
              vel[i3 + 1] += Math.cos(pz * 3 + t * 1.7) * strength * 5
              vel[i3 + 2] += Math.sin(px * 3 + t * 2.3) * strength * 5
            }
          }
        }

        // Collisions - repel nearby particles
        if (collisionsEnabled && cellMap) {
          const cx = Math.floor(_target.x)
          const cy = Math.floor(_target.y)
          const cz = Math.floor(_target.z)
          const key = (cx * 73856093 ^ cy * 19349663 ^ cz * 83492791) | 0
          const neighbors = cellMap[key]
          if (neighbors && neighbors.length > 1) {
            for (let n = 0; n < neighbors.length; n++) {
              const other = neighbors[n]
              if (other === idx) continue
              const o3 = other * 3
              const dx = _target.x - posArr[o3]
              const dy = _target.y - posArr[o3 + 1]
              const dz = _target.z - posArr[o3 + 2]
              const d2 = dx * dx + dy * dy + dz * dz
              if (d2 < 0.25 && d2 > 0.0001) {
                const d = Math.sqrt(d2)
                const repulse = 0.5 * dt / d
                vel[i3]     += dx * repulse
                vel[i3 + 1] += dy * repulse
                vel[i3 + 2] += dz * repulse
              }
            }
          }
        }

        // Damping
        vel[i3] *= 0.99; vel[i3 + 1] *= 0.99; vel[i3 + 2] *= 0.99

        // Apply velocity to position
        _target.x += vel[i3] * dt
        _target.y += vel[i3 + 1] * dt
        _target.z += vel[i3 + 2] * dt

        // Floor bounce
        if (gravityEnabled && _target.y < 0) {
          _target.y = -_target.y * 0.3
          vel[i3 + 1] = -vel[i3 + 1] * 0.7
        }
      }

      // Mouse attraction
      if (mouseAttract && mousePos) {
        const dx = mousePos.x - _target.x
        const dy = mousePos.y - _target.y
        const dz = mousePos.z - _target.z
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.1
        if (dist < 8) {
          const force = attractStrength * 0.3 / (dist * dist + 1)
          _target.x += dx * force
          _target.y += dy * force
          _target.z += dz * force
        }
      }

      // Audio modulation
      if (audioLevel > 0.01) {
        const scale = 1 + audioLevel * 0.5
        _target.x *= scale
        _target.y *= scale
        _target.z *= scale
      }

      // Theme color transform
      if (themeData && themeData.hueShift !== 0) {
        const r = _color.r, g = _color.g, b = _color.b
        if (themeData.saturation === 0) {
          const lum = 0.299 * r + 0.587 * g + 0.114 * b
          _color.setRGB(lum, lum, lum)
        } else if (themeData.hueShift === -1) {
          const hShift = (idx / particleCount + t * 0.1) % 1.0
          _color.offsetHSL(hShift, 0, 0)
        } else {
          _color.offsetHSL(themeData.hueShift / 360, 0, 0)
        }
      }

      posArr[i3] = _target.x; posArr[i3 + 1] = _target.y; posArr[i3 + 2] = _target.z
      colArr[i3] = _color.r; colArr[i3 + 1] = _color.g; colArr[i3 + 2] = _color.b
    }
    geo.attributes.position.needsUpdate = true
    geo.attributes.color.needsUpdate = true

    // Recording: capture snapshot every ~100ms (every 6 frames)
    const store = useStore.getState()
    if (store.isRecording && store.recordingBuffer.length < 300) {
      if (!this._recFrameCount) this._recFrameCount = 0
      this._recFrameCount++
      if (this._recFrameCount % 6 === 0) {
        store.addRecordingFrame({
          positions: new Float32Array(posArr),
          colors: new Float32Array(colArr),
        })
      }
    } else if (!store.isRecording) {
      this._recFrameCount = 0
    }

    // Replay: override positions/colors from buffer
    if (store.isReplaying && store.recordingBuffer.length > 0) {
      const frame = store.recordingBuffer[Math.min(store.replayFrame, store.recordingBuffer.length - 1)]
      if (frame) {
        const len = Math.min(frame.positions.length, posArr.length)
        posArr.set(frame.positions.subarray(0, len))
        colArr.set(frame.colors.subarray(0, len))
        geo.attributes.position.needsUpdate = true
        geo.attributes.color.needsUpdate = true
      }
    }
  })

  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={particleCount} array={positions} itemSize={3} />
        <bufferAttribute attach="attributes-color" count={particleCount} array={colors} itemSize={3} />
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

// Trail effect: reduce clear alpha
function TrailEffect() {
  const { gl } = useThree()
  const trails = useStore(s => s.trails)
  
  useEffect(() => {
    if (trails) {
      gl.autoClear = false
    } else {
      gl.autoClear = true
    }
    return () => { gl.autoClear = true }
  }, [trails, gl])

  useFrame(() => {
    if (!trails) return
    // Draw a semi-transparent quad over the scene to create trail effect
    gl.clearDepth()
  })

  return null
}

function ForceFieldVisual() {
  const meshRef = useRef()
  const forceFieldType = useStore(s => s.forceFieldType)
  const forceFieldStrength = useStore(s => s.forceFieldStrength)

  useFrame((_, delta) => {
    if (!meshRef.current) return
    meshRef.current.rotation.y += delta * 0.5
    meshRef.current.rotation.x += delta * 0.3
  })

  if (!forceFieldType) return null

  const colorMap = { attractor: '#00ff88', repulsor: '#ff4444', vortex: '#8844ff', turbulence: '#ffaa00' }
  const col = colorMap[forceFieldType] || '#00ff88'

  return (
    <mesh ref={meshRef} position={[0, 0, 0]}>
      <sphereGeometry args={[0.5, 16, 16]} />
      <meshBasicMaterial color={col} transparent opacity={0.15 + forceFieldStrength * 0.05} wireframe />
    </mesh>
  )
}

function CameraControls() {
  const orbitSpeed = useStore(s => s.orbitSpeed)
  const autoRotate = useStore(s => s.autoRotate)
  const autoRotateSpeed = useStore(s => s.autoRotateSpeed)
  const minDistance = useStore(s => s.minDistance)
  const maxDistance = useStore(s => s.maxDistance)

  return (
    <OrbitControls
      enableDamping
      dampingFactor={0.05}
      rotateSpeed={orbitSpeed}
      zoomSpeed={0.8}
      autoRotate={autoRotate}
      autoRotateSpeed={autoRotateSpeed}
      minDistance={minDistance}
      maxDistance={maxDistance}
    />
  )
}

export default function ParticleCanvas() {
  const glowIntensity = useStore(s => s.glowIntensity)
  const trails = useStore(s => s.trails)
  const audioReactive = useStore(s => s.audioReactive)
  const fpsRef = useRef(null)
  const audioLevel = useStore(s => s.audioLevel)

  // FPS overlay
  useEffect(() => {
    let raf, frames = 0, last = performance.now(), fps = 60
    const update = () => {
      frames++
      const now = performance.now()
      if (now - last >= 500) {
        fps = Math.round(frames * 1000 / (now - last))
        frames = 0; last = now
        if (fpsRef.current) {
          const count = useStore.getState().particleCount
          fpsRef.current.textContent = `${fps} FPS | ${(count / 1000).toFixed(0)}K`
        }
        // Auto-adjust
        const { particleCount, setParticleCount } = useStore.getState()
        if (fps < 30 && particleCount > 2000) {
          const nc = Math.max(2000, particleCount - 2000)
          setParticleCount(nc)
          const notif = document.getElementById('perf-notif')
          if (notif) { notif.textContent = `⚡ Reduced to ${(nc/1000).toFixed(0)}K (${fps} FPS)`; notif.style.opacity = '1'; setTimeout(() => notif.style.opacity = '0', 3000) }
        }
      }
      raf = requestAnimationFrame(update)
    }
    raf = requestAnimationFrame(update)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="w-full h-full relative">
      <Canvas
        camera={{ position: [0, 5, 15], fov: 60 }}
        gl={{ antialias: true, alpha: false, preserveDrawingBuffer: true }}
        style={{ background: '#050508' }}
        id="particle-canvas"
      >
        <color attach="background" args={['#0a0a0f']} />
        <Particles />
        <MouseAttractor />
        <ForceFieldVisual />
        {trails && <TrailEffect />}
        <CameraControls />
        <EffectComposer>
          <Bloom intensity={glowIntensity * 0.6} luminanceThreshold={0.8} luminanceSmoothing={0.4} radius={0.3} mipmapBlur />
        </EffectComposer>
      </Canvas>

      {/* FPS Overlay */}
      <div ref={fpsRef}
        style={{
          position: 'absolute', top: 8, right: 8,
          fontFamily: 'monospace', fontSize: 11,
          color: 'var(--neon)', background: 'rgba(0,0,0,0.5)',
          padding: '4px 8px', borderRadius: 4, pointerEvents: 'none',
          zIndex: 10,
        }}
      >60 FPS | 20K</div>

      {/* Performance notification */}
      <div id="perf-notif"
        style={{
          position: 'absolute', bottom: audioReactive ? 40 : 12, left: '50%', transform: 'translateX(-50%)',
          fontFamily: 'monospace', fontSize: 11, color: '#ffaa00',
          background: 'rgba(0,0,0,0.7)', padding: '4px 12px', borderRadius: 4,
          pointerEvents: 'none', opacity: 0, transition: 'opacity 0.3s', zIndex: 10,
          whiteSpace: 'nowrap',
        }}
      />

      {/* Audio visualizer bar */}
      {audioReactive && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 24,
          background: 'rgba(0,0,0,0.4)', zIndex: 10, pointerEvents: 'none',
          display: 'flex', alignItems: 'flex-end', padding: '0 4px', gap: 2,
        }}>
          {Array.from({ length: 32 }, (_, i) => {
            const h = Math.max(2, audioLevel * 20 * (0.5 + Math.sin(i * 0.5 + Date.now() * 0.005) * 0.5))
            return <div key={i} style={{
              flex: 1, height: h, background: 'var(--neon)', opacity: 0.6,
              borderRadius: '2px 2px 0 0', transition: 'height 0.05s',
            }} />
          })}
        </div>
      )}
    </div>
  )
}
