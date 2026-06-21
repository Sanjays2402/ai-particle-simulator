// cameraShake: verify clamping, zero-input shortcut, NaN handling,
// amplitude bounds, and the apply helper restores correctly.
import {
  cameraShakeOffset, applyShake, SHAKE_MAX_AMPLITUDE,
} from './cameraShake.js'

function assertEq(actual, expected, msg) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected)
  if (a !== b) {
    console.error(`FAIL: ${msg} — got ${a} expected ${b}`)
    process.exit(1)
  }
}
function assertWithin(value, max, msg) {
  if (Math.abs(value) > max + 1e-9) {
    console.error(`FAIL: ${msg} — |${value}| > ${max}`)
    process.exit(1)
  }
}

// 1. Zero impulse → zero offset (early-out).
assertEq(cameraShakeOffset(0, 1, 12.34), [0, 0], 'zero impulse short-circuits')
assertEq(cameraShakeOffset(1, 0, 12.34), [0, 0], 'zero intensity short-circuits')

// 2. NaN / Infinity inputs degrade to zero (don't poison the camera).
assertEq(cameraShakeOffset(NaN, 1, 0), [0, 0], 'NaN impulse')
assertEq(cameraShakeOffset(1, Infinity, 0), [0, 0], 'infinite intensity')
assertEq(cameraShakeOffset(1, 1, NaN), [0, 0], 'NaN time')

// 3. Clamping — impulse/intensity > 1 capped at MAX_AMPLITUDE.
{
  let maxObserved = 0
  for (let t = 0; t < 100; t += 0.05) {
    const [dx, dy] = cameraShakeOffset(2.5, 5, t)
    maxObserved = Math.max(maxObserved, Math.abs(dx), Math.abs(dy))
  }
  assertWithin(maxObserved, SHAKE_MAX_AMPLITUDE, 'max amplitude respected even with extreme inputs')
}

// 4. Amplitude scales linearly with impulse * intensity.
{
  const [dx1, dy1] = cameraShakeOffset(1, 1, 3.7)
  const [dx2, dy2] = cameraShakeOffset(0.5, 1, 3.7)
  // Both x and y should halve when impulse halves.
  if (Math.abs(dx1 / 2 - dx2) > 1e-9 || Math.abs(dy1 / 2 - dy2) > 1e-9) {
    console.error('FAIL: amplitude is not linear in impulse')
    process.exit(1)
  }
}

// 5. applyShake mutates camera.position and returns the same delta.
{
  const cam = { position: { x: 10, y: 5, z: -3 } }
  const [dx, dy] = applyShake(cam, 1, 1, 2.5)
  assertEq(cam.position.x, 10 + dx, 'x mutated correctly')
  assertEq(cam.position.y, 5 + dy, 'y mutated correctly')
  assertEq(cam.position.z, -3, 'z untouched')
}

// 6. applyShake on a missing camera is a no-op.
{
  const out = applyShake(null, 1, 1, 0)
  assertEq(out, [0, 0], 'null camera safe')
}

// 7. With impulse decaying naturally (mimic the audio decay), the
// max-frame amplitude also decays.
{
  let prevMax = Infinity
  for (let i = 1; i >= 0; i -= 0.1) {
    let frameMax = 0
    for (let t = 0; t < 1; t += 0.05) {
      const [dx, dy] = cameraShakeOffset(i, 1, t)
      frameMax = Math.max(frameMax, Math.abs(dx), Math.abs(dy))
    }
    if (frameMax > prevMax + 1e-9) {
      console.error(`FAIL: amplitude grew as impulse fell (impulse=${i.toFixed(1)}, frameMax=${frameMax}, prevMax=${prevMax})`)
      process.exit(1)
    }
    prevMax = frameMax
  }
}

console.log(`PASS: cameraShake offset/clamp/apply · MAX=${SHAKE_MAX_AMPLITUDE}`)
