import { useRef, useMemo, useEffect, useCallback } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { EffectComposer, Bloom, ChromaticAberration, Vignette, Noise, DepthOfField } from '@react-three/postprocessing'
import * as THREE from 'three'
import { useStore, THEMES } from '../store'
import { cameraShakeOffset } from '../lib/cameraShake'
import { smoothstep } from '../lib/crossfade'
import { resolveReducedMotion } from '../lib/reducedMotion'
import { resolveCalmFor } from '../lib/calmMode'
import { windVector, applyWind } from '../lib/wind'
import { resolveTheme as resolveActiveTheme } from '../lib/customThemes'
import { applyNoise } from '../lib/noiseDeformer'
import { useTouchGestures } from '../lib/useTouchGestures'
import { buildHueFilterCss, computeReactiveHueDeg, pickAudioSignal } from '../lib/bgGradient'

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
          ref.current.innerHTML = `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#a855f7;box-shadow:0 0 8px #a855f7"></span> ${fpsRef.current} FPS · ${(count / 1000).toFixed(0)}K PARTICLES`
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
  const { camera, raycaster, pointer, gl } = useThree()
  const planeRef = useRef(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0))
  const intersectPoint = useRef(new THREE.Vector3())
  const draggingRef = useRef(false)
  const lastStampRef = useRef(0)

  // Paint-mode listeners: hold mouse and drag to stamp persistent attractors.
  // Place-field listener: a single pointer-up while in place-field mode sets
  // the force-field center and disables the mode again.
  useEffect(() => {
    const dom = gl.domElement
    const onDown = () => { draggingRef.current = true }
    const onUp = () => { draggingRef.current = false }
    const onClick = (e) => {
      const {
        placeFieldMode, setForceFieldCenter, setPlaceFieldMode,
        placingAttractorId, moveNamedAttractor, setPlacingAttractorId,
      } = useStore.getState()
      // Either legacy place-field mode OR named-attractor place mode
      // claims the next click; legacy wins if both are accidentally
      // armed at once.
      if (!placeFieldMode && !placingAttractorId) return
      // Raycast to the same z=0 plane the rest of the canvas uses.
      const rect = dom.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera({ x, y }, camera)
      const hit = new THREE.Vector3()
      raycaster.ray.intersectPlane(planeRef.current, hit)
      if (placeFieldMode) {
        setForceFieldCenter([hit.x, hit.y, hit.z])
        setPlaceFieldMode(false)
      } else if (placingAttractorId) {
        moveNamedAttractor(placingAttractorId, [hit.x, hit.y, hit.z])
        setPlacingAttractorId(null)
      }
      e.stopPropagation()
    }
    dom.addEventListener('pointerdown', onDown)
    window.addEventListener('pointerup', onUp)
    dom.addEventListener('click', onClick)
    return () => {
      dom.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      dom.removeEventListener('click', onClick)
    }
  }, [gl, camera, raycaster])

  useFrame(() => {
    const { mouseAttract, paintMode, addPaintPoint } = useStore.getState()
    if (!mouseAttract && !paintMode) return
    raycaster.setFromCamera(pointer, camera)
    raycaster.ray.intersectPlane(planeRef.current, intersectPoint.current)
    // Store mouse3D globally for particles to use
    window.__mousePos = intersectPoint.current

    // Stamp paint points at ~30 Hz while dragging in paint mode.
    if (paintMode && draggingRef.current) {
      const now = performance.now()
      if (now - lastStampRef.current > 33) {
        lastStampRef.current = now
        addPaintPoint([intersectPoint.current.x, intersectPoint.current.y, intersectPoint.current.z])
      }
    }
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
  // Crossfade scratchpads — reused every particle so the blend path
  // is still allocation-free. Only touched when blendActive is true.
  const _blendTarget = useMemo(() => new THREE.Vector3(), [])
  const _blendColor = useMemo(() => new THREE.Color(), [])

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
      case 'blob':   return 5
      case 'ring':   return 2
      case 'glow':   return 7   // bigger soft halo
      case 'dot':    return 1.2 // tiny crisp pixel
      default: return 2.5
    }
  }, [visualStyle])

  // Material tuning per visual style. Glow opens up to a bright halo,
  // dot stays small with size attenuation off for a starfield look.
  const matOpts = useMemo(() => {
    switch (visualStyle) {
      case 'glow': return { opacity: 0.35, sizeAttenuation: true }
      case 'dot':  return { opacity: 0.85, sizeAttenuation: false }
      case 'blob': return { opacity: 0.28, sizeAttenuation: true }
      case 'ring': return { opacity: 0.55, sizeAttenuation: true }
      default:     return { opacity: 0.2,  sizeAttenuation: true }
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
            audioBass, audioMid, audioTreble, audioBeat, audioMode,
            paintPoints,
            paletteEnabled, paletteA, paletteB, paletteMix,
            gravityEnabled, gravityStrength, collisionsEnabled,
            forceFieldType, forceFieldStrength, forceFieldCenter,
            namedAttractors,
            kaleidoscopeEnabled, kaleidoscopeSegments,
            hueCycleEnabled, hueCycleSpeed,
            windEnabled, windIntensity, windAzimuth, windPitch,
            noiseEnabled, noiseAmplitude, noiseFrequency, noiseSpeed,
            blendActive, blendTargetFn, blendProgress, advanceBlend } = useStore.getState()
    // Crossfade ticker — outside the per-particle loop so it advances
    // exactly once per frame regardless of particle count.
    if (blendActive) advanceBlend(delta)
    const customThemes = useStore.getState().customThemes
    const themeData = resolveActiveTheme(theme, THEMES, customThemes)
    const mousePos = window.__mousePos
    // Flat array of paint coords — avoids re-reading the .length each particle.
    const paintLen = paintPoints.length

    // Pre-parse palette hex strings once per frame so the per-particle
    // tint loop only does fmul/fadd, no string parsing.
    let paletteAR = 0, paletteAG = 0, paletteAB = 0
    let paletteBR = 0, paletteBG = 0, paletteBB = 0
    if (paletteEnabled) {
      const a = parseInt(paletteA.slice(1), 16) || 0
      const b = parseInt(paletteB.slice(1), 16) || 0
      paletteAR = ((a >> 16) & 0xff) / 255
      paletteAG = ((a >>  8) & 0xff) / 255
      paletteAB = ( a        & 0xff) / 255
      paletteBR = ((b >> 16) & 0xff) / 255
      paletteBG = ((b >>  8) & 0xff) / 255
      paletteBB = ( b        & 0xff) / 255
    }

    // Ensure velocity array exists
    if (!velocitiesRef.current || prevCountRef.current !== particleCount) {
      velocitiesRef.current = new Float32Array(particleCount * 3)
      prevCountRef.current = particleCount
    }
    const vel = velocitiesRef.current
    // Pre-filter active named attractors once per frame — avoids
    // walking the disabled / zero-strength ones N times per particle.
    // Each entry becomes [type, strengthScaled, cx, cy, cz, radiusSq].
    const namedActive = []
    if (Array.isArray(namedAttractors)) {
      for (let i = 0; i < namedAttractors.length; i++) {
        const a = namedAttractors[i]
        if (!a || !a.enabled) continue
        if (!a.strength || a.strength <= 0) continue
        const r = typeof a.radius === 'number' ? a.radius : 10
        namedActive.push([
          a.type,
          a.strength,
          a.position[0], a.position[1], a.position[2],
          r * r,
        ])
      }
    }
    const physicsActive = gravityEnabled || collisionsEnabled || forceFieldType || namedActive.length > 0
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

    // Kaleidoscope precomputation: leaderCount is the number of unique
    // particles we actually run the preset fn for; the rest are mirrors
    // of those leaders rotated around the Y axis. We use a single Math.
    // floor + atan2 trick to keep per-particle cost a few floats.
    const kaleidoSegs = (kaleidoscopeEnabled && kaleidoscopeSegments >= 2)
      ? kaleidoscopeSegments | 0
      : 1
    const leaderCount = (kaleidoSegs > 1)
      ? Math.max(1, Math.floor(particleCount / kaleidoSegs))
      : particleCount
    const kaleidoStep = (Math.PI * 2) / Math.max(1, kaleidoSegs)

    // Hue Cycle precomputation: convert cycles-per-minute to a 0..1
    // hue offset that wraps every (60 / speed) seconds. Computing this
    // once per frame keeps the per-particle work to a single offsetHSL.
    // Suppressed entirely under reduced motion so colour-strobing users
    // who flip the OS pref aren't forced into rainbow churn. R36.K — calm
    // mode also gates it (calm OR reduced → no hue drift).
    const reducedMotion = resolveReducedMotion(
      useStore.getState().reducedMotionMode,
      useStore.getState().osPrefersReducedMotion,
    )
    // R38.K — per-motion calm gate: calm mode suppresses hue-cycle only
    // when the user keeps hueCycle in the gated set (default yes).
    const motionCalm = resolveCalmFor('hueCycle', reducedMotion, useStore.getState().calmMode, useStore.getState().calmGates)
    const hueCycleOffset = (hueCycleEnabled && !motionCalm)
      ? ((t * (hueCycleSpeed / 60)) % 1 + 1) % 1
      : 0

    // Wind precomputation: one vector + magnitude per frame, used by
    // every particle. windEnabled+intensity=0 short-circuits to a zero
    // vector inside windVector(), so the per-particle applyWind() is
    // a single zero-check when wind is "off". Suppressed under reduced
    // motion — vestibular users skip the constant scene drift.
    const windVec = (windEnabled && !reducedMotion)
      ? windVector(windAzimuth, windPitch, windIntensity)
      : null

    // Trig-noise deformer: a flag + amplitude precheck lets the
    // per-particle path skip when the feature is off. Also suppressed
    // under reduced motion to avoid the shimmer.
    const noiseActive = noiseEnabled && noiseAmplitude > 0 && !reducedMotion

    for (let idx = 0; idx < particleCount; idx++) {
      _target.set(0, 0, 0)
      _color.setRGB(1, 1, 1)
      try {
        // In kaleidoscope mode, every slice computes positions for the
        // same `leaderCount` source indices, then rotates the output.
        const srcIdx = (kaleidoSegs > 1) ? (idx % leaderCount) : idx
        const srcCount = (kaleidoSegs > 1) ? leaderCount : particleCount
        compiledFn(srcIdx, srcCount, _target, _color, t, THREE, noop, noop, dv)
        // Crossfade overlay: if a blend is in flight, run the target
        // preset's fn into the scratchpads and lerp into _target/_color
        // by the blend progress. Blends with kaleidoscope just fine —
        // the rotation happens later on the blended position.
        if (blendActive && blendTargetFn) {
          _blendTarget.set(0, 0, 0)
          _blendColor.setRGB(1, 1, 1)
          try {
            blendTargetFn(srcIdx, srcCount, _blendTarget, _blendColor, t, THREE, noop, noop, dv)
            // Eased ramp — feels cinematic; flat linear was abrupt at the edges.
            const p = smoothstep(blendProgress)
            _target.lerp(_blendTarget, p)
            _color.lerp(_blendColor, p)
          } catch { /* target fn errors silently — host preset keeps rendering */ }
        }
      } catch (e) {
        if (!errorRef.current) { errorRef.current = e.message; console.error('Runtime error:', e) }
        break
      }

      // Apply rotational symmetry: every particle beyond the leader
      // slice gets its (x, z) rotated by (segId * 2π/N). Y stays put
      // so the symmetry axis is upright (matches the camera default).
      if (kaleidoSegs > 1) {
        const segId = Math.floor(idx / leaderCount)
        if (segId > 0 && segId < kaleidoSegs) {
          const ang = segId * kaleidoStep
          const c = Math.cos(ang), s = Math.sin(ang)
          const rx = _target.x * c - _target.z * s
          const rz = _target.x * s + _target.z * c
          _target.x = rx
          _target.z = rz
        }
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
          // Position relative to the (movable) field center.
          const fx = forceFieldCenter[0], fy = forceFieldCenter[1], fz = forceFieldCenter[2]
          const px = _target.x - fx, py = _target.y - fy, pz = _target.z - fz
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

        // Named attractors — additive force-field objects that layer
        // on top of the single legacy field. Squared-distance gate
        // keeps the per-attractor cost negligible far from each one;
        // the active set is pre-filtered once per frame.
        for (let ai = 0; ai < namedActive.length; ai++) {
          const a = namedActive[ai]
          const aType = a[0]
          const aStr  = a[1]
          const apx = _target.x - a[2]
          const apy = _target.y - a[3]
          const apz = _target.z - a[4]
          const ad2 = apx * apx + apy * apy + apz * apz
          if (ad2 >= a[5]) continue
          const ad = Math.sqrt(ad2) + 0.01
          const aS = aStr * dt
          if (aType === 'attractor') {
            vel[i3]     -= (apx / ad) * aS * 3
            vel[i3 + 1] -= (apy / ad) * aS * 3
            vel[i3 + 2] -= (apz / ad) * aS * 3
          } else if (aType === 'repulsor') {
            vel[i3]     += (apx / ad) * aS * 3
            vel[i3 + 1] += (apy / ad) * aS * 3
            vel[i3 + 2] += (apz / ad) * aS * 3
          } else if (aType === 'vortex') {
            vel[i3]     += (-apz / ad) * aS * 4
            vel[i3 + 2] += ( apx / ad) * aS * 4
          } else if (aType === 'turbulence') {
            vel[i3]     += Math.sin(apy * 3 + t * 2)   * aS * 5
            vel[i3 + 1] += Math.cos(apz * 3 + t * 1.7) * aS * 5
            vel[i3 + 2] += Math.sin(apx * 3 + t * 2.3) * aS * 5
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

      // Global wind drift — single vector mul + add per particle when
      // enabled, fast-pathed entirely when disabled. Time-step scaled
      // so framerate variation doesn't change perceived speed.
      if (windVec) applyWind(_target, windVec, dt)

      // Trig-noise deformer — global shimmer layered on top of every
      // preset's positional output. Cost when off: a single boolean
      // check. Cost when on: ~6 sin/cos per particle, branch-free.
      if (noiseActive) applyNoise(_target, idx, t, noiseAmplitude, noiseFrequency, noiseSpeed)

      // Paint-mode soft attractors — nudge particles toward each stamped
      // point. Capped at ~24 points in the store so this stays O(24N).
      if (paintLen > 0) {
        for (let pi = 0; pi < paintLen; pi++) {
          const pt = paintPoints[pi]
          const pdx = pt[0] - _target.x
          const pdy = pt[1] - _target.y
          const pdz = pt[2] - _target.z
          const psq = pdx * pdx + pdy * pdy + pdz * pdz
          // Squared-distance early-out keeps the cost tiny far from paint.
          if (psq < 9) {
            const pforce = 0.18 / (psq + 1)
            _target.x += pdx * pforce
            _target.y += pdy * pforce
            _target.z += pdz * pforce
          }
        }
      }

      // Audio modulation
      // Pick which audio signal drives the modulation. 'beat' pulses the
      // scale on each detected beat, 'bass' uses the bass band directly,
      // 'level' is the legacy full-spectrum average.
      const audioSignal =
        audioMode === 'beat' ? audioBeat :
        audioMode === 'bass' ? audioBass :
        audioLevel
      if (audioSignal > 0.01) {
        const scale = 1 + audioSignal * 0.5
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

      // Hue Cycle — global continuous hue drift layered on top of any
      // theme. Speed is in cycles per minute, so divide by 60 to get
      // cycles per second. Computed once per frame above and reused.
      if (hueCycleEnabled) {
        _color.offsetHSL(hueCycleOffset, 0, 0)
      }

      // Gradient palette tint — lerp each particle's color toward a
      // 2-stop gradient driven by its normalized z coord. Pre-parsed RGB
      // values keep this allocation-free in the per-particle loop.
      if (paletteEnabled) {
        // Map z roughly to [0,1]; clamp so far-out particles still pin.
        const zn = Math.max(0, Math.min(1, _target.z * 0.07 + 0.5))
        const tr = paletteAR * zn + paletteBR * (1 - zn)
        const tg = paletteAG * zn + paletteBG * (1 - zn)
        const tb = paletteAB * zn + paletteBB * (1 - zn)
        const m = paletteMix
        _color.r = _color.r * (1 - m) + tr * m
        _color.g = _color.g * (1 - m) + tg * m
        _color.b = _color.b * (1 - m) + tb * m
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
        sizeAttenuation={matOpts.sizeAttenuation}
        vertexColors
        transparent
        opacity={matOpts.opacity}
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
  const forceFieldCenter = useStore(s => s.forceFieldCenter)
  const placeFieldMode = useStore(s => s.placeFieldMode)

  useFrame((_, delta) => {
    if (!meshRef.current) return
    meshRef.current.rotation.y += delta * 0.5
    meshRef.current.rotation.x += delta * 0.3
  })

  if (!forceFieldType) return null

  const colorMap = { attractor: '#00ff88', repulsor: '#ff4444', vortex: '#8844ff', turbulence: '#ffaa00' }
  const col = colorMap[forceFieldType] || '#00ff88'
  // Subtle pulse highlight when "Place Field" is armed.
  const pulse = placeFieldMode ? 0.45 : 0.15 + forceFieldStrength * 0.05

  return (
    <group position={forceFieldCenter}>
      <mesh ref={meshRef}>
        <sphereGeometry args={[0.5, 16, 16]} />
        <meshBasicMaterial color={col} transparent opacity={pulse} wireframe />
      </mesh>
      {placeFieldMode && (
        <mesh>
          <sphereGeometry args={[0.7, 24, 24]} />
          <meshBasicMaterial color={col} transparent opacity={0.12} wireframe />
        </mesh>
      )}
    </group>
  )
}

function CameraShakeFX() {
  // Apply a small per-frame offset when the audio beat fires, then
  // restore on the next frame so the orbit-controls rest pose stays
  // anchored. Net effect: the camera kicks on each beat and snaps back
  // without drifting. Skipped entirely when the toggle is off so the
  // base scene has zero overhead. Also suppressed under reduced motion
  // — vestibular users get the rest of the scene without the kick.
  const { camera } = useThree()
  const lastOffset = useRef([0, 0])
  useFrame((_, delta) => {
    const { cameraShake, cameraShakeIntensity, audioReactive,
            audioMode, audioBeat, audioBass, audioLevel,
            reducedMotionMode, osPrefersReducedMotion, calmMode } = useStore.getState()
    // Always undo last frame's offset so we never accumulate drift,
    // even when the user toggles the feature off mid-shake.
    const [pdx, pdy] = lastOffset.current
    if (pdx !== 0 || pdy !== 0) {
      camera.position.x -= pdx
      camera.position.y -= pdy
      lastOffset.current = [0, 0]
    }
    if (!cameraShake || !audioReactive) return
    // R36.K/R38.K — calm mode (or reduced motion) suppresses the shake,
    // gated per-motion so a user can keep shake while calming the rest.
    if (resolveCalmFor('cameraShake', resolveReducedMotion(reducedMotionMode, osPrefersReducedMotion), calmMode, useStore.getState().calmGates)) return
    const impulse =
      audioMode === 'beat' ? audioBeat :
      audioMode === 'bass' ? audioBass :
      audioLevel
    if (impulse <= 0.01) return
    const [dx, dy] = cameraShakeOffset(impulse, cameraShakeIntensity, performance.now() / 1000)
    camera.position.x += dx
    camera.position.y += dy
    lastOffset.current = [dx, dy]
    // Suppress the unused `delta` warning while leaving the param so
    // the useFrame signature stays the standard one.
    void delta
  })
  return null
}

function CameraControls() {
  const orbitSpeed = useStore(s => s.orbitSpeed)
  const autoRotate = useStore(s => s.autoRotate)
  const autoRotateSpeed = useStore(s => s.autoRotateSpeed)
  const minDistance = useStore(s => s.minDistance)
  const maxDistance = useStore(s => s.maxDistance)
  const reducedMotionMode = useStore(s => s.reducedMotionMode)
  const osPrefersReducedMotion = useStore(s => s.osPrefersReducedMotion)
  // R36.K — calm mode gates the user's auto-rotate the same way reduced
  // motion does (calm OR reduced → no auto-rotate). The zen ambient orbit
  // is already forced to 0 upstream when calm mode is on.
  // R38.K — per-motion: only when the user keeps autoRotate in the gated
  // set (default yes).
  const calmMode = useStore(s => s.calmMode)
  const calmGates = useStore(s => s.calmGates)
  const reduced = resolveCalmFor('autoRotate', resolveReducedMotion(reducedMotionMode, osPrefersReducedMotion), calmMode, calmGates)
  // R35.E — ambient zen auto-orbit: a transient speed the ZenMode
  // controller writes when the screen is left alone in zen mode. When
  // > 0 it drives the orbit even if the user's own autoRotate is off,
  // so a forgotten tab becomes an ambient display.
  const zenAmbientOrbitSpeed = useStore(s => s.zenAmbientOrbitSpeed)
  const { camera } = useThree()
  const controlsRef = useRef()

  // Expose a tiny API on `window` so non-canvas components (like the
  // RightSidebar camera-views panel) can capture and restore the
  // OrbitControls state without prop-drilling refs through five layers
  // of HTML overlays. Re-installed on every mount.
  useEffect(() => {
    window.__particleCamera = {
      get: () => ({
        pos: [camera.position.x, camera.position.y, camera.position.z],
        target: controlsRef.current
          ? [controlsRef.current.target.x, controlsRef.current.target.y, controlsRef.current.target.z]
          : [0, 0, 0],
      }),
      set: ({ pos, target }) => {
        if (Array.isArray(pos) && pos.length === 3) camera.position.set(pos[0], pos[1], pos[2])
        if (Array.isArray(target) && target.length === 3 && controlsRef.current) {
          controlsRef.current.target.set(target[0], target[1], target[2])
          controlsRef.current.update()
        }
      },
    }
    return () => { if (window.__particleCamera) window.__particleCamera = null }
  }, [camera])

  // The ambient zen orbit takes precedence when it's active (speed > 0):
  // it turns the orbit on (even if the user's autoRotate is off) at the
  // slow ambient speed. Otherwise the user's own autoRotate settings
  // apply. Reduced motion suppresses the user-driven orbit; the ambient
  // one is already gated to 0 under reduced motion upstream.
  const zenOrbiting = zenAmbientOrbitSpeed > 0
  const effectiveAutoRotate = zenOrbiting || (autoRotate && !reduced)
  const effectiveAutoRotateSpeed = zenOrbiting ? zenAmbientOrbitSpeed : autoRotateSpeed

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      dampingFactor={0.05}
      rotateSpeed={orbitSpeed}
      zoomSpeed={0.8}
      autoRotate={effectiveAutoRotate}
      autoRotateSpeed={effectiveAutoRotateSpeed}
      minDistance={minDistance}
      maxDistance={maxDistance}
    />
  )
}

export default function ParticleCanvas() {
  const glowIntensity = useStore(s => s.glowIntensity)
  const trails = useStore(s => s.trails)
  const audioReactive = useStore(s => s.audioReactive)
  const chromaticAberration = useStore(s => s.chromaticAberration)
  const chromaticIntensity = useStore(s => s.chromaticIntensity)
  const vignette = useStore(s => s.vignette)
  const vignetteIntensity = useStore(s => s.vignetteIntensity)
  const filmGrain = useStore(s => s.filmGrain)
  const filmGrainIntensity = useStore(s => s.filmGrainIntensity)
  const depthOfField       = useStore(s => s.depthOfField)
  const dofFocusDistance   = useStore(s => s.dofFocusDistance)
  const dofFocalLength     = useStore(s => s.dofFocalLength)
  const dofBokehScale      = useStore(s => s.dofBokehScale)
  const fpsRef = useRef(null)
  const audioLevel = useStore(s => s.audioLevel)
  const audioBass = useStore(s => s.audioBass)
  const audioMid = useStore(s => s.audioMid)
  const audioTreble = useStore(s => s.audioTreble)
  const audioBeat   = useStore(s => s.audioBeat)
  const audioMode   = useStore(s => s.audioMode)
  const bgGradientEnabled = useStore(s => s.bgGradientEnabled)
  const bgGradientA       = useStore(s => s.bgGradientA)
  const bgGradientB       = useStore(s => s.bgGradientB)
  const bgGradientAngle   = useStore(s => s.bgGradientAngle)
  const bgGradientAudioReactive = useStore(s => s.bgGradientAudioReactive)
  const bgGradientAudioStrength = useStore(s => s.bgGradientAudioStrength)
  const bgGradientAudioCurve    = useStore(s => s.bgGradientAudioCurve)

  // Audio-reactive hue rotation on the gradient layer. Cheap pure
  // math: only kicks in when both reactivity flags are on AND the
  // gradient is showing. The CSS filter is recomputed each render the
  // audio signal changes (which the subscribed `audio*` selectors
  // already trigger).
  const bgFilter = (bgGradientEnabled && bgGradientAudioReactive && audioReactive)
    ? buildHueFilterCss(computeReactiveHueDeg(
        pickAudioSignal(audioMode, { level: audioLevel, bass: audioBass, beat: audioBeat }),
        bgGradientAudioStrength,
        bgGradientAudioCurve,
      ))
    : ''

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

  // Double-tap on mobile / double-click on desktop = play/pause.
  // We use the manual gap timer here instead of dblclick so it also
  // fires on iOS Safari where dblclick is fussy on canvases.
  const lastTapRef = useRef(0)
  const handleTap = () => {
    const now = performance.now()
    if (now - lastTapRef.current < 330) {
      const { playing, setPlaying } = useStore.getState()
      setPlaying(!playing)
      lastTapRef.current = 0
    } else {
      lastTapRef.current = now
    }
  }

  // Two-finger touch gestures: pinch = particle count, swipe = preset
  // nav. Wired to the wrapping div so it works regardless of where the
  // R3F canvas remounts internally.
  const wrapRef = useRef(null)
  useTouchGestures(wrapRef)

  return (
    <div ref={wrapRef} className="w-full h-full relative" onPointerUp={handleTap}>
      {/* Background gradient layer — sits behind the (transparent)
          canvas when the user enables it. Pure CSS so zero GPU cost
          beyond a normal compositor pass. Kept under the canvas via
          z-index so particles always render on top. */}
      {bgGradientEnabled && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 0,
          background: `linear-gradient(${bgGradientAngle}deg, ${bgGradientA} 0%, ${bgGradientB} 100%)`,
          pointerEvents: 'none',
          filter: bgFilter || undefined,
          transition: bgGradientAudioReactive ? 'filter 80ms linear' : 'none',
        }} />
      )}
      <Canvas
        camera={{ position: [0, 5, 15], fov: 60 }}
        gl={{ antialias: true, alpha: bgGradientEnabled, preserveDrawingBuffer: true }}
        style={{ background: bgGradientEnabled ? 'transparent' : '#050508', position: 'relative', zIndex: 1 }}
        id="particle-canvas"
      >
        {!bgGradientEnabled && <color attach="background" args={['#0a0a0f']} />}
        <Particles />
        <MouseAttractor />
        <ForceFieldVisual />
        {trails && <TrailEffect />}
        <CameraControls />
        <CameraShakeFX />
        <EffectComposer>
          <Bloom intensity={glowIntensity * 0.6} luminanceThreshold={0.8} luminanceSmoothing={0.4} radius={0.3} mipmapBlur />
          {depthOfField && (
            <DepthOfField
              focusDistance={dofFocusDistance}
              focalLength={dofFocalLength}
              bokehScale={dofBokehScale}
            />
          )}
          {chromaticAberration && (
            <ChromaticAberration offset={[chromaticIntensity, chromaticIntensity]} />
          )}
          {vignette && (
            <Vignette eskil={false} offset={0.2} darkness={vignetteIntensity} />
          )}
          {filmGrain && (
            <Noise opacity={filmGrainIntensity} premultiply />
          )}
        </EffectComposer>
      </Canvas>

      {/* Floating HUD */}
      <div ref={fpsRef}
        style={{
          position: 'absolute', bottom: audioReactive ? 36 : 12, right: 12,
          fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
          fontWeight: 500,
          color: '#e9d5ff',
          background: 'linear-gradient(135deg, rgba(139,92,246,0.14) 0%, rgba(236,72,153,0.10) 100%)',
          backdropFilter: 'blur(16px) saturate(140%)',
          WebkitBackdropFilter: 'blur(16px) saturate(140%)',
          border: '1px solid rgba(168,85,247,0.28)',
          padding: '7px 12px', borderRadius: 10, pointerEvents: 'none',
          boxShadow: '0 6px 20px rgba(0,0,0,0.35), 0 0 20px rgba(168,85,247,0.12), inset 0 1px 0 rgba(255,255,255,0.08)',
          zIndex: 10,
          letterSpacing: '0.02em',
          fontVariantNumeric: 'tabular-nums',
          display: 'flex', alignItems: 'center', gap: 8,
        }}
      >
        <span style={{
          display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
          background: '#a855f7', boxShadow: '0 0 8px #a855f7',
          animation: 'hud-pulse 2s ease-in-out infinite',
        }} />
        60 FPS · 20K PARTICLES
      </div>

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
            // Map bar index to a band so the visualizer reflects what the
            // analyser is actually seeing instead of just a sin wave.
            const band = i < 4 ? audioBass : i < 14 ? audioMid : audioTreble
            const h = Math.max(2, (band * 20 + audioLevel * 6) * (0.5 + Math.sin(i * 0.5 + Date.now() * 0.005) * 0.5))
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
