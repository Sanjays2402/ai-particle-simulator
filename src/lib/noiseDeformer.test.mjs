// noiseDeformer: clamp + offset + apply.
import {
  clampAmplitude, clampFrequency, clampSpeed,
  noiseOffset, applyNoise,
  NOISE_AMP_MIN, NOISE_AMP_MAX,
  NOISE_FREQ_MIN, NOISE_FREQ_MAX,
  NOISE_SPEED_MIN, NOISE_SPEED_MAX,
} from './noiseDeformer.js'

function fail(m) { console.error(`FAIL: ${m}`); process.exit(1) }
function eq(a, b, m) { if (a !== b) fail(`${m} — got ${a} expected ${b}`) }
function near(a, b, m, tol = 1e-9) { if (Math.abs(a - b) > tol) fail(`${m} — got ${a} expected ~${b}`) }

// --- clamps ---
eq(clampAmplitude(0.5), 0.5, 'amp in range')
eq(clampAmplitude(-1),  NOISE_AMP_MIN, 'amp clamps below')
eq(clampAmplitude(99),  NOISE_AMP_MAX, 'amp clamps above')
eq(clampAmplitude(NaN), 0.5, 'amp NaN → 0.5 default')

eq(clampFrequency(1), 1, 'freq in range')
eq(clampFrequency(0), NOISE_FREQ_MIN, 'freq clamps below MIN')
eq(clampFrequency(99), NOISE_FREQ_MAX, 'freq clamps above MAX')
eq(clampFrequency(NaN), 1.5, 'freq NaN → 1.5 default')

eq(clampSpeed(2), 2, 'speed in range')
eq(clampSpeed(-1), NOISE_SPEED_MIN, 'speed clamps below 0')
eq(clampSpeed(99), NOISE_SPEED_MAX, 'speed clamps above MAX')
eq(clampSpeed(NaN), 1.0, 'speed NaN → 1.0 default')

// --- noiseOffset ---
{
  // Zero amplitude → exact zero vector.
  const v = noiseOffset(42, 1.0, 0, 2, 1)
  eq(v[0], 0, 'amp 0 → dx 0'); eq(v[1], 0, 'amp 0 → dy 0'); eq(v[2], 0, 'amp 0 → dz 0')
}
{
  // Bounded by amplitude — |dx|, |dy|, |dz| ≤ amp.
  // sin*cos has range [-1, 1] but only reaches |1| at perfect phase; we
  // just check the looser bound that no axis exceeds amp.
  for (let i = 0; i < 50; i++) {
    const v = noiseOffset(i, i * 0.1, 0.5, 2, 1)
    if (Math.abs(v[0]) > 0.5 + 1e-9) fail(`dx exceeds amp at idx ${i}: ${v[0]}`)
    if (Math.abs(v[1]) > 0.5 + 1e-9) fail(`dy exceeds amp at idx ${i}: ${v[1]}`)
    if (Math.abs(v[2]) > 0.5 + 1e-9) fail(`dz exceeds amp at idx ${i}: ${v[2]}`)
  }
}
{
  // Determinism — same inputs → same outputs across calls.
  const a = noiseOffset(123, 4.5, 0.7, 2.0, 1.5)
  const b = noiseOffset(123, 4.5, 0.7, 2.0, 1.5)
  near(a[0], b[0], 'deterministic dx')
  near(a[1], b[1], 'deterministic dy')
  near(a[2], b[2], 'deterministic dz')
}
{
  // Axes use different phases — output should NOT be a uniform [a,a,a].
  // Pick an idx/time where uniform output would be a real bug.
  const v = noiseOffset(7, 1.234, 1.0, 1.5, 1.0)
  if (v[0] === v[1] && v[1] === v[2]) fail(`axes are degenerate: ${v}`)
}
{
  // Speed scales the time-axis frequency: at t=0, the time term drops out
  // so amplitude-only changes (in s) should not change the result.
  const a = noiseOffset(10, 0, 0.5, 1.5, 0.1)
  const b = noiseOffset(10, 0, 0.5, 1.5, 4.0)
  near(a[0], b[0], 'speed irrelevant when time=0')
}
{
  // Stronger amplitude scales linearly.
  const small = noiseOffset(11, 2.5, 0.2, 1.5, 1)
  const big   = noiseOffset(11, 2.5, 0.4, 1.5, 1)
  // big should be ~2x small (same trig combo at same input).
  near(big[0], small[0] * 2, 'amp scales x linearly')
  near(big[1], small[1] * 2, 'amp scales y linearly')
  near(big[2], small[2] * 2, 'amp scales z linearly')
}

// --- applyNoise (mutates target in place) ---
{
  const t = { x: 1, y: 2, z: 3 }
  // Zero amplitude → no-op fast path.
  applyNoise(t, 5, 1, 0, 1.5, 1)
  eq(t.x, 1, 'amp 0 → x unchanged')
  eq(t.y, 2, 'amp 0 → y unchanged')
  eq(t.z, 3, 'amp 0 → z unchanged')
}
{
  const t = { x: 1, y: 2, z: 3 }
  // Real call modifies all three axes.
  applyNoise(t, 5, 1.0, 0.5, 1.5, 1)
  if (t.x === 1 && t.y === 2 && t.z === 3) fail('applyNoise should mutate target')
}
{
  // Null target is harmless.
  applyNoise(null, 5, 1.0, 0.5, 1.5, 1)
}

console.log(`PASS: noiseDeformer — amp ${NOISE_AMP_MIN}..${NOISE_AMP_MAX} · freq ${NOISE_FREQ_MIN}..${NOISE_FREQ_MAX} · speed ${NOISE_SPEED_MIN}..${NOISE_SPEED_MAX}`)
