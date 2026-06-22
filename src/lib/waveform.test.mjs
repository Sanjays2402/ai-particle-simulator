// waveform: byte→centered conversion, peak amplitude, canvas projection,
// analyser sampling (with stub).
import {
  SILENCE_BYTE, FULL_AMPLITUDE,
  bytesToCentered, peakAmplitude, projectToCanvas, sampleAnalyser,
  WAVEFORM_MODES, bytesToSpectrum, sampleAnalyserSpectrum,
  projectSpectrumToBars, projectSpectrumToLogBars, normalizeWaveformMode,
  makePeakHoldState, tickPeakHolds, resetPeakHolds,
  PEAK_HOLD_FRAMES, PEAK_DECAY_PX,
  // R15.07 — peak-hold fade-out tail
  PEAK_TRAIL_LENGTH, PEAK_TRAIL_ALPHA_MAX, PEAK_TRAIL_ALPHA_MIN,
  readPeakTrail,
  // R16.17 — per-bar fade-out curve preset
  PEAK_TRAIL_CURVES, applyTrailCurve, nextTrailCurve,
  // R19.12 — per-curve tunable params (exp.exponent, log.base)
  PEAK_TRAIL_CURVE_PARAMS, defaultPeakTrailCurveParams,
  sanitizeCurveParamValue, sanitizeCurveParams,
  setCurveParam, isCurveParamsAtDefaults,
  // R20.13 — per-bar frequency-coloured tint for the trail
  TRAIL_HUE_START, TRAIL_HUE_END, TRAIL_HUE_DEFAULT,
  peakTrailHueForBarIndex,
} from './waveform.js'

function fail(m) { console.error(`FAIL: ${m}`); process.exit(1) }
function eq(a, b, m) { if (a !== b) fail(`${m} — got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`) }
function near(a, b, m, tol = 1e-6) { if (Math.abs(a - b) > tol) fail(`${m} — got ${a} expected ~${b}`) }
function ok(c, m) { if (!c) fail(m) }

// --- bytesToCentered ---
{
  // Silence (all 128s) → all zeros.
  const buf = new Uint8Array(8).fill(SILENCE_BYTE)
  const c = bytesToCentered(buf)
  eq(c.length, 8, 'preserves length')
  for (let i = 0; i < 8; i++) near(c[i], 0, `silence sample[${i}]`)
}
{
  // Peak +127 → +1.0
  const buf = new Uint8Array([255, 128, 1, 0])
  const c = bytesToCentered(buf)
  near(c[0], (255 - 128) / 127, '255 → ~1')
  near(c[1], 0, '128 → 0')
  near(c[2], (1 - 128) / 127, '1 → ~-1')
  near(c[3], (0 - 128) / 127, '0 → ~-1.008')
}
{
  // Bad inputs → empty.
  eq(bytesToCentered(null).length, 0, 'null → empty')
  eq(bytesToCentered({}).length, 0, 'no length → empty')
}

// --- peakAmplitude ---
{
  const c = new Float32Array([0, 0.3, -0.7, 0.1])
  near(peakAmplitude(c), 0.7, 'peak finds max abs')
}
eq(peakAmplitude(null), 0, 'null → 0')
eq(peakAmplitude(new Float32Array(0)), 0, 'empty → 0')
{
  const c = new Float32Array([0, 0, 0])
  eq(peakAmplitude(c), 0, 'silence → 0 peak')
}

// --- projectToCanvas ---
{
  // Silence over 100x40 → straight line at y=20.
  const c = new Float32Array(200).fill(0)
  const pts = projectToCanvas(c, 100, 40, 4)
  eq(pts.length, 100, 'one point per pixel column')
  for (const [x, y] of pts) {
    ok(x >= 0 && x < 100, `x in canvas`)
    near(y, 20, `silence → centered y at ${x}`)
  }
}
{
  // Peak +1 → y above center by (h/2 - pad). h=40, pad=4 → y = 4.
  const c = new Float32Array(50).fill(1)
  const pts = projectToCanvas(c, 50, 40, 4)
  ok(pts.length > 0, 'pts emitted')
  near(pts[0][1], 4, 'peak +1 → top y')
}
{
  // Peak -1 → y below center by (h/2 - pad). h=40, pad=4 → y = 36.
  const c = new Float32Array(50).fill(-1)
  const pts = projectToCanvas(c, 50, 40, 4)
  near(pts[0][1], 36, 'peak -1 → bottom y')
}
{
  // Out-of-canvas values get clamped to ±1 before projection.
  const c = new Float32Array(10).fill(99)
  const pts = projectToCanvas(c, 10, 40, 4)
  near(pts[0][1], 4, 'huge positive → clamped to +1 → top y')
}
{
  // Empty input → empty output.
  eq(projectToCanvas(null, 100, 40).length, 0, 'null → empty')
  eq(projectToCanvas(new Float32Array(0), 100, 40).length, 0, 'empty input → empty')
}
{
  // Bad size → defaults.
  const c = new Float32Array(10).fill(0)
  const pts = projectToCanvas(c, 0, 0)
  ok(pts.length > 0, 'bad size still emits with defaults')
}

// --- sampleAnalyser ---
{
  // Null analyser → empty.
  eq(sampleAnalyser(null).length, 0, 'null analyser → empty')
  eq(sampleAnalyser({}).length, 0, 'analyser without method → empty')
}
{
  // Fake analyser with a known time-domain signal.
  const fake = {
    fftSize: 8,
    getByteTimeDomainData(buf) {
      buf[0] = 128; buf[1] = 255; buf[2] = 128; buf[3] = 0
      buf[4] = 128; buf[5] = 200; buf[6] = 128; buf[7] = 50
    },
  }
  const out = sampleAnalyser(fake)
  eq(out.length, 8, 'length matches fftSize')
  near(out[0], 0, 'sample[0] silent')
  near(out[1], (255 - 128) / 127, 'sample[1] peak +')
  near(out[3], (0 - 128) / 127, 'sample[3] peak -')
}
{
  // Scratch buffer reuse path — wrong-size scratch gets replaced.
  const fake = {
    fftSize: 4,
    getByteTimeDomainData(buf) { buf[0] = 128; buf[1] = 128; buf[2] = 128; buf[3] = 128 },
  }
  const bigBuf = new Uint8Array(16)
  const out = sampleAnalyser(fake, bigBuf)
  eq(out.length, 4, 'mismatched scratch → reallocated to fftSize')
}

console.log(`PASS: waveform — bytesToCentered (silence/peak/bad), peakAmplitude, projectToCanvas (silence/+1/-1/clamp/empty), sampleAnalyser (null/fake), bytesToSpectrum + sampleAnalyserSpectrum + projectSpectrumToBars (spectrum mode), normalizeWaveformMode`)
eq(SILENCE_BYTE, 128, 'silence byte constant')
eq(FULL_AMPLITUDE, 127, 'full-amplitude constant')

// --- WAVEFORM_MODES contract ---
eq(WAVEFORM_MODES.includes('time'), true, 'time mode listed')
eq(WAVEFORM_MODES.includes('frequency'), true, 'frequency mode listed')
eq(WAVEFORM_MODES.length, 2, 'exactly two documented modes')

// --- bytesToSpectrum: 0..255 → 0..1 ---
{
  const buf = new Uint8Array([0, 64, 128, 192, 255])
  const s = bytesToSpectrum(buf)
  eq(s.length, 5, 'spectrum length preserved')
  near(s[0], 0, 'byte 0 → 0')
  near(s[1], 64 / 255, 'byte 64 → ~0.25')
  near(s[2], 128 / 255, 'byte 128 → ~0.5')
  near(s[4], 1, 'byte 255 → 1')
}
{
  eq(bytesToSpectrum(null).length, 0, 'null → empty')
  eq(bytesToSpectrum({}).length, 0, 'bad shape → empty')
}

// --- sampleAnalyserSpectrum ---
{
  eq(sampleAnalyserSpectrum(null).length, 0, 'null analyser → empty')
  eq(sampleAnalyserSpectrum({}).length, 0, 'no method → empty')
  const noFreqFn = { fftSize: 8 }
  eq(sampleAnalyserSpectrum(noFreqFn).length, 0, 'time-only analyser → empty for spectrum')
}
{
  // Fake analyser with a known frequency response.
  const fake = {
    frequencyBinCount: 4,
    fftSize: 8,
    getByteFrequencyData(buf) {
      buf[0] = 200  // bass
      buf[1] = 100  // low-mid
      buf[2] = 50   // mid
      buf[3] = 0    // treble
    },
  }
  const s = sampleAnalyserSpectrum(fake)
  eq(s.length, 4, 'length matches frequencyBinCount')
  near(s[0], 200 / 255, 'bass bin normalized')
  near(s[3], 0, 'silent treble bin')
}
{
  // Scratch reuse — wrong-size scratch gets replaced.
  const fake = {
    frequencyBinCount: 4,
    fftSize: 8,
    getByteFrequencyData(buf) { for (let i = 0; i < buf.length; i++) buf[i] = 128 },
  }
  const bigBuf = new Uint8Array(16)
  const out = sampleAnalyserSpectrum(fake, bigBuf)
  eq(out.length, 4, 'mismatched scratch → reallocated')
}

// --- projectSpectrumToBars ---
{
  // 16 bins → 4 bars: each bar averages 4 bins.
  const s = new Float32Array(16).fill(0)
  s[0] = 1; s[1] = 1; s[2] = 1; s[3] = 1     // bar 0: avg 1
  s[4] = 0.5                                  // bar 1: avg 0.125
  // bars 2 and 3 stay at 0
  const bars = projectSpectrumToBars(s, 100, 40, 4, 4)
  eq(bars.length, 4, 'bar count = 4')
  near(bars[0][0], 0, 'bar 0 starts at x=0')
  near(bars[0][1], 32, 'bar 0 full-height (40 - 8 pad = 32)')
  near(bars[1][0], 25, 'bar 1 starts at x=25 (100 / 4)')
  near(bars[1][1], 4, 'bar 1 quarter-height (0.125 * 32)')
  near(bars[2][1], 0, 'bar 2 silent')
  near(bars[3][1], 0, 'bar 3 silent')
}
{
  // Clamped: values above 1 cap at maxBarPx, negative values floor at 0.
  const s = new Float32Array([5, -3])
  const bars = projectSpectrumToBars(s, 100, 40, 2, 4)
  near(bars[0][1], 32, 'huge value clamped to max height')
  near(bars[1][1], 0, 'negative value floored to 0')
}
{
  // Empty input → empty output.
  eq(projectSpectrumToBars(null, 100, 40, 8).length, 0, 'null → empty')
  eq(projectSpectrumToBars(new Float32Array(0), 100, 40, 8).length, 0, 'empty → empty')
}
{
  // Bad dimensions → defaults.
  const s = new Float32Array(8).fill(0.5)
  const bars = projectSpectrumToBars(s, 0, 0, 4)
  eq(bars.length, 4, 'bad dims still emits bars')
}
{
  // Bar count must be at least 1.
  const s = new Float32Array(8).fill(0.5)
  const bars = projectSpectrumToBars(s, 100, 40, 0)
  eq(bars.length, 1, 'barCount=0 clamped to 1')
}

// --- normalizeWaveformMode ---
eq(normalizeWaveformMode('time'), 'time', 'time → time')
eq(normalizeWaveformMode('frequency'), 'frequency', 'frequency → frequency')
eq(normalizeWaveformMode('garbage'), 'time', 'unknown → time fallback')
eq(normalizeWaveformMode(null), 'time', 'null → time fallback')
eq(normalizeWaveformMode(undefined), 'time', 'undefined → time fallback')

// --- projectSpectrumToLogBars (R9.19) ---
{
  // Empty input → empty output.
  eq(projectSpectrumToLogBars(null, 100, 40, 8).length, 0, 'null → empty')
  eq(projectSpectrumToLogBars(new Float32Array(0), 100, 40, 8).length, 0, 'empty → empty')
}
{
  // Bar count == 32 (default), 64 bins → produces 32 bars whose
  // start/end indices grow exponentially.
  const s = new Float32Array(64).fill(0)
  const bars = projectSpectrumToLogBars(s, 320, 40, 32, 4)
  eq(bars.length, 32, 'log bars: 32 bars produced')
  // X positions evenly spaced (visual layout stays even — the LOG
  // distribution is about which bins map to which bar, not pixel x).
  near(bars[0][0],  0,  'bar 0 starts at x=0')
  near(bars[1][0], 10, 'bar 1 starts at x=10 (320/32)')
  near(bars[31][0], 310, 'last bar starts at x=310')
}
{
  // Concentrated bass: bins 0..3 hot, rest silent. In LOG layout the
  // first few bars cover bins 0..N (small step), so the bass should
  // visibly survive in the leftmost bar — even though linear mode
  // would split it across many bars too. The point of this test is
  // that the curve doesn't crash and the leftmost bar reflects the
  // bass content.
  const s = new Float32Array(64).fill(0)
  s[0] = 1; s[1] = 1; s[2] = 1; s[3] = 1
  const bars = projectSpectrumToLogBars(s, 320, 40, 32, 4)
  ok(bars[0][1] > 0, 'leftmost log bar shows bass energy')
}
{
  // Treble-heavy: only the last bin is hot. In linear mode the last
  // bar would average bins 60..63 (binsPerBar = 2). In log mode the
  // last bar covers a wider chunk of high bins, but it must still be
  // non-zero because at least one of those bins is hot.
  const s = new Float32Array(64).fill(0)
  s[63] = 1
  const bars = projectSpectrumToLogBars(s, 320, 40, 32, 4)
  ok(bars[31][1] > 0, 'rightmost log bar reflects treble energy')
}
{
  // Crucial guard: when N < B (more bars than bins), the curve degenerates;
  // we still need to emit one bar per bar slot without crashing.
  const s = new Float32Array(4).fill(0.5)
  const bars = projectSpectrumToLogBars(s, 320, 40, 32, 4)
  eq(bars.length, 32, 'still 32 bars even when N << B')
  // Every bar height is clamped non-negative.
  for (const [_, h] of bars) ok(h >= 0, 'log bar height non-negative')
}
{
  // Heights clamp to maxBarPx like the linear variant.
  const s = new Float32Array(64).fill(5)  // huge values
  const bars = projectSpectrumToLogBars(s, 320, 40, 32, 4)
  for (const [_, h] of bars) ok(h <= 32, 'log bar height ≤ maxBarPx (h - 2*pad)')
}
{
  // barCount=0 clamps to 1 (same contract as linear).
  const s = new Float32Array(64).fill(0.5)
  const bars = projectSpectrumToLogBars(s, 320, 40, 0)
  eq(bars.length, 1, 'log barCount=0 clamped to 1')
}
{
  // Bad dimensions → defaults; the projector still emits the right
  // number of bars.
  const s = new Float32Array(32).fill(0.5)
  const bars = projectSpectrumToLogBars(s, 0, 0, 8)
  eq(bars.length, 8, 'log bad dims still emits bars')
}

console.log('PASS: waveform spectrum extensions + log-frequency bars (R9.19, ~10 fresh asserts) + peak holds (R10.19)')

// --- peak-hold lines (R10.19) ----------------------------------------
// State allocates the right typed arrays.
{
  const s = makePeakHoldState(8)
  eq(s.peaks.length, 8, 'peaks Float32Array sized')
  eq(s.ages.length, 8, 'ages Int32Array sized')
  for (let i = 0; i < 8; i++) {
    eq(s.peaks[i], 0, `peaks start at 0 [${i}]`)
    eq(s.ages[i], 0,  `ages start at 0 [${i}]`)
  }
}
eq(makePeakHoldState(-1).peaks.length, 0, 'negative bar count → 0-length')
eq(makePeakHoldState(NaN).peaks.length, 0, 'NaN bar count → 0-length')

// First tick with fresh bars locks in peaks instantly, ages reset.
{
  const s = makePeakHoldState(3)
  const bars = [[0, 10], [10, 20], [20, 5]]
  tickPeakHolds(s, bars)
  near(s.peaks[0], 10, 'fresh peak[0] = 10')
  near(s.peaks[1], 20, 'fresh peak[1] = 20')
  near(s.peaks[2], 5,  'fresh peak[2] = 5')
  eq(s.ages[0], 0, 'age[0] reset')
  eq(s.ages[1], 0, 'age[1] reset')
}

// Bar drops below peak → age increments, peak holds during HOLD_FRAMES.
{
  const s = makePeakHoldState(1)
  tickPeakHolds(s, [[0, 20]])   // lock peak at 20
  near(s.peaks[0], 20, 'initial peak locked')
  // Now feed a lower bar for HOLD_FRAMES frames — peak should not move.
  for (let i = 0; i < PEAK_HOLD_FRAMES; i++) {
    tickPeakHolds(s, [[0, 5]])
    near(s.peaks[0], 20, `frame ${i + 1}: peak held during plateau`)
    eq(s.ages[0], i + 1, `age tracks frames since plateau started`)
  }
  // Next frame decays by PEAK_DECAY_PX, never below the live bar.
  tickPeakHolds(s, [[0, 5]])
  near(s.peaks[0], 20 - PEAK_DECAY_PX, 'first decay step')
  // After enough decay frames, peak settles at the live bar height (5).
  for (let i = 0; i < 200; i++) tickPeakHolds(s, [[0, 5]])
  near(s.peaks[0], 5, 'decay floor = live bar height')
}

// Spike higher than the held peak instantly lifts it (no smoothing).
{
  const s = makePeakHoldState(1)
  tickPeakHolds(s, [[0, 10]])
  tickPeakHolds(s, [[0, 30]])  // spike
  near(s.peaks[0], 30, 'spike lifts peak instantly')
  eq(s.ages[0], 0, 'spike resets age')
}

// Custom hold/decay opts work as overrides.
{
  const s = makePeakHoldState(1)
  tickPeakHolds(s, [[0, 100]])
  tickPeakHolds(s, [[0, 0]], { holdFrames: 0, decayPx: 50 })
  // holdFrames=0 means decay starts the very next plateau frame.
  near(s.peaks[0], 50, 'custom decay applied immediately')
}

// resetPeakHolds clears the in-place arrays without re-allocating.
{
  const s = makePeakHoldState(4)
  tickPeakHolds(s, [[0, 10], [10, 20], [20, 5], [30, 8]])
  resetPeakHolds(s)
  for (let i = 0; i < 4; i++) {
    eq(s.peaks[i], 0, `peaks zeroed [${i}]`)
    eq(s.ages[i], 0, `ages zeroed [${i}]`)
  }
}

// Defensive: null/garbage state passes through.
eq(tickPeakHolds(null, [[0, 5]]), null, 'tickPeakHolds null state → null')
eq(tickPeakHolds({}, [[0, 5]]).peaks, undefined, 'tickPeakHolds malformed → returns input')
eq(resetPeakHolds(null), null, 'resetPeakHolds null → null')

// Defensive: missing bars treated as zero (don't crash on transient drops).
{
  const s = makePeakHoldState(3)
  tickPeakHolds(s, [[0, 10], [10, 20], [20, 5]])
  tickPeakHolds(s, [])  // analyser blip: zero bars
  // peaks held (no decay yet because age just hit 1, not past HOLD_FRAMES).
  eq(s.peaks[0], 10, 'empty bars treated as fresh=0 → hold engaged')
  eq(s.ages[0], 1,  'empty bars increments age')
}

// --- R15.07 peak-hold fade trail ---
// State allocates a per-bar trail of the documented length.
{
  const s = makePeakHoldState(4)
  ok(s.trail instanceof Float32Array, 'trail allocated as Float32Array')
  eq(s.trail.length, 4 * PEAK_TRAIL_LENGTH, 'trail sized barCount * TRAIL_LENGTH')
  eq(s.trailLen, PEAK_TRAIL_LENGTH, 'trailLen recorded on state')
  for (let i = 0; i < s.trail.length; i++) eq(s.trail[i], 0, `trail slot[${i}] starts at 0`)
}
// Empty trail allocation when bar count is 0.
{
  const s = makePeakHoldState(0)
  eq(s.trail.length, 0, 'zero-bar trail is empty')
}

// Each tick writes the latest peak height into trail slot 0 of every bar.
{
  const s = makePeakHoldState(1)
  tickPeakHolds(s, [[0, 30]])
  eq(s.trail[0], 30, 'head slot reflects fresh peak after first tick')
  tickPeakHolds(s, [[0, 20]])  // bar dropped — peak held at 30
  eq(s.trail[0], 30, 'head slot stays at held peak')
  eq(s.trail[1], 30, 'previous head shifted down to slot 1')
  // 9 more ticks at the held height — slots 0..9 all see 30.
  for (let k = 0; k < 9; k++) tickPeakHolds(s, [[0, 20]])
  for (let i = 0; i < Math.min(PEAK_TRAIL_LENGTH, 11); i++) {
    eq(s.trail[i], 30, `slot ${i} held peak after ${i + 1} ticks`)
  }
}

// readPeakTrail returns oldest → newest non-head samples with alpha
// climbing from MIN (oldest) to MAX (newest). Skips samples at or
// below the live bar (they would visually live INSIDE the bar).
{
  const s = makePeakHoldState(1)
  // Lock peak high.
  tickPeakHolds(s, [[0, 50]])
  // Decay it down by feeding lower bars for many ticks — the trail
  // captures successive decayed peak heights.
  for (let k = 0; k < PEAK_TRAIL_LENGTH; k++) tickPeakHolds(s, [[0, 10]])
  // Live bar = 10 → trail samples ≤ 11 are filtered out by the
  // `current` arg. Everything above the bar shows up.
  const tail = readPeakTrail(s, 0, 10)
  ok(tail.length > 0, 'trail emits non-floor samples above the live bar')
  // Alpha is monotonically non-decreasing across the returned array
  // (oldest → newest) — the head-leading flame gradient contract.
  for (let i = 1; i < tail.length; i++) {
    ok(tail[i].alpha >= tail[i - 1].alpha, `alpha[${i}] >= alpha[${i - 1}]`)
  }
  // Alpha bounds.
  for (const sample of tail) {
    ok(sample.alpha >= PEAK_TRAIL_ALPHA_MIN, `alpha >= MIN`)
    ok(sample.alpha <= PEAK_TRAIL_ALPHA_MAX, `alpha <= MAX`)
    ok(sample.height > 10, 'sample height above live bar')
  }
}

// `current` filter: a tall current bar suppresses tail samples beneath it.
{
  const s = makePeakHoldState(1)
  tickPeakHolds(s, [[0, 30]])
  for (let k = 0; k < 4; k++) tickPeakHolds(s, [[0, 10]])  // trail fills with 30s
  // Live bar = 40 (taller than every trail sample at 30) → empty tail.
  eq(readPeakTrail(s, 0, 40).length, 0, 'tall live bar suppresses entire trail')
  // Live bar = 0 → all non-zero samples emerge.
  ok(readPeakTrail(s, 0, 0).length > 0, 'zero live bar lets trail through')
}

// readPeakTrail defensive cases.
eq(readPeakTrail(null,        0, 0).length, 0, 'null state → empty')
eq(readPeakTrail({},          0, 0).length, 0, 'no trail field → empty')
eq(readPeakTrail(makePeakHoldState(2), -1, 0).length, 0, 'bad index → empty')
eq(readPeakTrail(makePeakHoldState(2),  5, 0).length, 0, 'out-of-range index → empty')

// resetPeakHolds zeroes the trail in-place.
{
  const s = makePeakHoldState(2)
  tickPeakHolds(s, [[0, 10], [10, 20]])
  for (let k = 0; k < 5; k++) tickPeakHolds(s, [[0, 5], [10, 5]])
  resetPeakHolds(s)
  for (let i = 0; i < s.trail.length; i++) eq(s.trail[i], 0, `trail zeroed[${i}]`)
}

// Trail walks at exactly one slot per tick — verify shift semantics
// don't accidentally smear by checking that the oldest slot stays
// blank until we've ticked TRAIL_LENGTH frames.
{
  const s = makePeakHoldState(1)
  tickPeakHolds(s, [[0, 100]])
  for (let k = 1; k < PEAK_TRAIL_LENGTH - 1; k++) {
    eq(s.trail[PEAK_TRAIL_LENGTH - 1], 0, `oldest slot still empty at tick ${k}`)
    tickPeakHolds(s, [[0, 100]])
  }
  // One more tick fills the very last slot.
  tickPeakHolds(s, [[0, 100]])
  eq(s.trail[PEAK_TRAIL_LENGTH - 1], 100, 'oldest slot filled exactly at TRAIL_LENGTH ticks')
}

// Alpha bounds for a trivial 2-sample trail (degenerate divisor guard).
ok(PEAK_TRAIL_LENGTH >= 3, 'trail length ≥ 3 so the lerp denominator is non-zero')

// --- R16.17: applyTrailCurve / nextTrailCurve / curve-aware readPeakTrail ---

// PEAK_TRAIL_CURVES roster
eq(PEAK_TRAIL_CURVES.length, 3, 'three curves shipped: linear/exp/log')
eq(PEAK_TRAIL_CURVES[0], 'linear', 'linear is the canonical default at index 0')
ok(PEAK_TRAIL_CURVES.includes('exp'), 'exp curve in roster')
ok(PEAK_TRAIL_CURVES.includes('log'), 'log curve in roster')

// applyTrailCurve — endpoints + midpoint shape
near(applyTrailCurve(0, 'linear'), 0, 'linear: 0 → 0')
near(applyTrailCurve(1, 'linear'), 1, 'linear: 1 → 1')
near(applyTrailCurve(0.5, 'linear'), 0.5, 'linear: 0.5 → 0.5 (identity)')
near(applyTrailCurve(0, 'exp'), 0, 'exp: 0 → 0')
near(applyTrailCurve(1, 'exp'), 1, 'exp: 1 → 1')
near(applyTrailCurve(0.5, 'exp'), 0.25, 'exp at midpoint = 0.25 (squared)')
near(applyTrailCurve(0, 'log'), 0, 'log: 0 → 0')
near(applyTrailCurve(1, 'log'), 1, 'log: 1 → 1')
// R19.12 — `log` upgraded from sqrt(t) to log(1+(base-1)*t)/log(base)
// with default base=4 so users can tune the curve. Endpoint shape is
// the same (0→0, 1→1); inner shape is now slightly less aggressive
// than sqrt (base=4 lifts 0.25 to ~0.404 vs sqrt's 0.5), but still
// solidly tail-leading vs linear (0.25). The "exp < linear < log"
// invariant below still holds for every shipped base.
near(applyTrailCurve(0.25, 'log'), Math.log(1 + 3 * 0.25) / Math.log(4),
  'log at 0.25 follows default-base curve (R19.12: base=4)')
ok(applyTrailCurve(0.25, 'log') > 0.25,
  'log at 0.25 still lifts above linear (tail-leading invariant preserved)')

// Shape invariant: at any inner point, exp < linear < log.
// (This is the whole point — `exp` biases toward the head end, `log`
// toward the tail end. If this stops holding, the chip visual lies.)
for (const t of [0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9]) {
  const l = applyTrailCurve(t, 'linear')
  const e = applyTrailCurve(t, 'exp')
  const g = applyTrailCurve(t, 'log')
  ok(e < l, `exp(${t}) < linear(${t}) — head-leading`)
  ok(g > l, `log(${t}) > linear(${t}) — tail-leading`)
}

// applyTrailCurve — defensive: out-of-range / non-finite / unknown
near(applyTrailCurve(-0.5, 'linear'), 0, 'negative t clamps to 0')
near(applyTrailCurve(2, 'linear'), 1, 't > 1 clamps to 1')
near(applyTrailCurve(NaN, 'linear'), 0, 'NaN t treated as 0 (no NaN propagation)')
near(applyTrailCurve(Infinity, 'linear'), 1, 'Infinity t clamps to 1')
near(applyTrailCurve(-Infinity, 'exp'), 0, '-Infinity t clamps to 0 (also for exp)')
near(applyTrailCurve(0.5, 'unknown'), 0.5, 'unknown curve falls back to linear')
near(applyTrailCurve(0.5),            0.5, 'omitted curve defaults to linear')
near(applyTrailCurve(0.5, null),      0.5, 'null curve falls back to linear')

// nextTrailCurve — wraparound + unknown
eq(nextTrailCurve('linear'), 'exp', 'linear → exp')
eq(nextTrailCurve('exp'),    'log', 'exp → log')
eq(nextTrailCurve('log'),    'linear', 'log → linear (wrap)')
eq(nextTrailCurve('unknown'), 'linear', 'unknown current → first entry')
eq(nextTrailCurve(),          'linear', 'undefined current → first entry')

// Curve-aware readPeakTrail: alpha distribution differs between curves
// for the SAME trail. The freshest-non-head sample's alpha is highest
// with `exp` (head bias) and lowest with `log` (tail bias).
{
  const s = makePeakHoldState(1)
  // Fill the trail with strictly increasing heights so every step
  // passes the filter and we get all PEAK_TRAIL_LENGTH-1 samples back.
  // The actual heights matter only insofar as they exceed the live bar.
  for (let k = 0; k < PEAK_TRAIL_LENGTH; k++) {
    tickPeakHolds(s, [[0, 50 + k * 5]])
  }
  const linear = readPeakTrail(s, 0, 0, { curve: 'linear' })
  const exp    = readPeakTrail(s, 0, 0, { curve: 'exp' })
  const log    = readPeakTrail(s, 0, 0, { curve: 'log' })
  // All three return the SAME number of samples (only alpha differs).
  eq(exp.length,  linear.length, 'exp returns same sample count as linear')
  eq(log.length,  linear.length, 'log returns same sample count as linear')
  ok(linear.length >= 3, 'long enough trail to actually compare curves')

  // Pick an inner sample (NOT the endpoints — at t=0/t=1 all three
  // curves converge by definition). Mid-trail comparison: exp shapes
  // alpha mass toward the head, log toward the tail, so an inner
  // sample's alpha walks: exp < linear < log when read at the
  // SAME index across all three trails.
  const innerIdx = Math.floor(linear.length / 2)
  ok(innerIdx > 0 && innerIdx < linear.length - 1, 'inner index is strictly inside the range')
  ok(exp[innerIdx].alpha < linear[innerIdx].alpha, 'inner sample dimmer with exp (head bias)')
  ok(log[innerIdx].alpha > linear[innerIdx].alpha, 'inner sample brighter with log (tail bias)')

  // Alpha bounds preserved for all three curves (anchors are MIN/MAX).
  for (const arr of [linear, exp, log]) {
    for (const sample of arr) {
      ok(sample.alpha >= PEAK_TRAIL_ALPHA_MIN - 1e-9, 'curve never floors below MIN')
      ok(sample.alpha <= PEAK_TRAIL_ALPHA_MAX + 1e-9, 'curve never ceilings above MAX')
    }
  }

  // Heights are identical across curves — only alpha is shaped.
  for (let i = 0; i < linear.length; i++) {
    eq(exp[i].height, linear[i].height, `height stable across curves at idx ${i}`)
    eq(log[i].height, linear[i].height, `height stable across curves at idx ${i}`)
  }
}

// Unknown curve passed through opts falls back to linear (no crash).
{
  const s = makePeakHoldState(1)
  for (let k = 0; k < PEAK_TRAIL_LENGTH; k++) tickPeakHolds(s, [[0, 80]])
  const baseline = readPeakTrail(s, 0, 0)  // default linear
  const fallback = readPeakTrail(s, 0, 0, { curve: 'bogus' })
  eq(fallback.length, baseline.length, 'unknown curve still returns trail')
  for (let i = 0; i < baseline.length; i++) {
    near(fallback[i].alpha, baseline[i].alpha, `unknown curve alpha matches linear at idx ${i}`)
  }
}

console.log(`PASS: waveform peak-hold lines · HOLD=${PEAK_HOLD_FRAMES} frames · DECAY=${PEAK_DECAY_PX}px/frame (R10.19) + fade trail · TRAIL=${PEAK_TRAIL_LENGTH} frames · α ${PEAK_TRAIL_ALPHA_MIN}→${PEAK_TRAIL_ALPHA_MAX} (R15.07) + curve presets ${PEAK_TRAIL_CURVES.join('/')} (R16.17) + per-curve tunable params (R19.12)`)

// --- R19.12: per-curve tunable params (exp.exponent, log.base) ---

// Schema shape: linear has no params, exp + log each have one.
eq(Object.keys(PEAK_TRAIL_CURVE_PARAMS.linear).length, 0, 'linear has no tunable params')
eq(Object.keys(PEAK_TRAIL_CURVE_PARAMS.exp).length, 1, 'exp has exactly one param')
eq(Object.keys(PEAK_TRAIL_CURVE_PARAMS.log).length, 1, 'log has exactly one param')
ok('exponent' in PEAK_TRAIL_CURVE_PARAMS.exp, 'exp param is `exponent`')
ok('base' in PEAK_TRAIL_CURVE_PARAMS.log, 'log param is `base`')
// Schema defaults match the shipped R16.17 curves (exponent=2 → t^2, base=4 → ≈sqrt-ish at 4)
eq(PEAK_TRAIL_CURVE_PARAMS.exp.exponent.default, 2, 'exp default exponent = 2 (matches R16.17 t^2)')
eq(PEAK_TRAIL_CURVE_PARAMS.log.base.default, 4, 'log default base = 4')
// Min/max sanity: exponent 1..6 (1 degenerates to linear), base 2..8.
eq(PEAK_TRAIL_CURVE_PARAMS.exp.exponent.min, 1, 'exp.exponent.min = 1 (linear degenerate)')
eq(PEAK_TRAIL_CURVE_PARAMS.exp.exponent.max, 6, 'exp.exponent.max = 6')
eq(PEAK_TRAIL_CURVE_PARAMS.log.base.min, 2, 'log.base.min = 2')
eq(PEAK_TRAIL_CURVE_PARAMS.log.base.max, 8, 'log.base.max = 8')
// Every entry carries the UI's required metadata (label + hint).
for (const [curve, schema] of Object.entries(PEAK_TRAIL_CURVE_PARAMS)) {
  for (const [key, def] of Object.entries(schema)) {
    ok(typeof def.label === 'string' && def.label.length > 0, `${curve}.${key} has label`)
    ok(typeof def.hint  === 'string' && def.hint.length  > 0, `${curve}.${key} has hint`)
    ok(Number.isFinite(def.step) && def.step > 0, `${curve}.${key} step > 0`)
  }
}

// defaultPeakTrailCurveParams returns a fresh tree matching the schema defaults.
{
  const d = defaultPeakTrailCurveParams()
  eq(d.exp.exponent, 2, 'defaults snapshot: exp.exponent = 2')
  eq(d.log.base, 4, 'defaults snapshot: log.base = 4')
  ok(Object.keys(d.linear).length === 0, 'defaults: linear is empty')
  // Mutating the returned object MUST NOT change the next call's defaults.
  d.exp.exponent = 99
  eq(defaultPeakTrailCurveParams().exp.exponent, 2, 'defaults are not aliased — second call still 2')
}

// sanitizeCurveParamValue: clamp + non-finite → default.
eq(sanitizeCurveParamValue('exp', 'exponent', 3.5), 3.5, 'in-range value returned as-is')
eq(sanitizeCurveParamValue('exp', 'exponent', 0.5), 1, 'below-min clamps to min')
eq(sanitizeCurveParamValue('exp', 'exponent', 100), 6, 'above-max clamps to max')
eq(sanitizeCurveParamValue('exp', 'exponent', NaN), 2, 'NaN → default')
eq(sanitizeCurveParamValue('exp', 'exponent', Infinity), 2, 'Infinity → default')
eq(sanitizeCurveParamValue('exp', 'exponent', undefined), 2, 'undefined → default')
eq(sanitizeCurveParamValue('log', 'base', 7), 7, 'log.base in-range')
eq(sanitizeCurveParamValue('log', 'base', 1), 2, 'log.base below-min clamps to 2')
// Unknown curve/key returns input unchanged (so a typo in caller code can't NaN the renderer).
eq(sanitizeCurveParamValue('bogus', 'whatever', 42), 42, 'unknown curve: input unchanged')
eq(sanitizeCurveParamValue('exp', 'nonsense', 42), 42, 'unknown key: input unchanged')

// sanitizeCurveParams: partial input + drop unknown keys.
{
  const partial = sanitizeCurveParams({ exp: { exponent: 4 } })
  eq(partial.exp.exponent, 4, 'partial: exp.exponent preserved')
  eq(partial.log.base, 4, 'partial: missing log → fallback default')
  const dropUnknown = sanitizeCurveParams({ exp: { exponent: 2, mystery: 99 }, foo: { bar: 1 } })
  eq(dropUnknown.exp.exponent, 2, 'known key kept')
  ok(!('mystery' in dropUnknown.exp), 'unknown key dropped')
  ok(!('foo' in dropUnknown), 'unknown curve dropped')
  const corrupt = sanitizeCurveParams({ exp: { exponent: NaN }, log: 'not-an-object' })
  eq(corrupt.exp.exponent, 2, 'NaN exponent → default')
  eq(corrupt.log.base, 4, 'non-object log curve map → fallback default')
  const empty = sanitizeCurveParams(null)
  eq(empty.exp.exponent, 2, 'null → fallback defaults')
  const totallyEmpty = sanitizeCurveParams('not-an-object')
  eq(totallyEmpty.log.base, 4, 'string → fallback defaults')
}

// setCurveParam: ref-equal on no-op, fresh ref on change, defensive on bad curve/key.
{
  const a = defaultPeakTrailCurveParams()
  const noop = setCurveParam(a, 'exp', 'exponent', 2)
  ok(noop === a, 'no-change → same ref returned (skip persist)')
  const changed = setCurveParam(a, 'exp', 'exponent', 3.5)
  ok(changed !== a, 'change → fresh ref')
  eq(changed.exp.exponent, 3.5, 'change applied')
  eq(a.exp.exponent, 2, 'input not mutated')
  // Sanitised through schema — clamp on the way in.
  const clamped = setCurveParam(a, 'exp', 'exponent', 100)
  eq(clamped.exp.exponent, 6, 'set with out-of-range value clamps')
  // Bad curve/key returns the input unchanged.
  const badCurve = setCurveParam(a, 'bogus', 'whatever', 1)
  ok(badCurve === a, 'unknown curve: input ref returned')
  const badKey = setCurveParam(a, 'exp', 'nonsense', 1)
  ok(badKey === a, 'unknown key: input ref returned')
  // null/undefined input rebuilds from defaults.
  const fromNull = setCurveParam(null, 'exp', 'exponent', 3.5)
  eq(fromNull.exp.exponent, 3.5, 'null params: rebuild from defaults + apply')
}

// isCurveParamsAtDefaults
ok(isCurveParamsAtDefaults(defaultPeakTrailCurveParams()), 'fresh defaults: at defaults')
ok(isCurveParamsAtDefaults(null), 'null treated as defaults (no params = no diff)')
ok(isCurveParamsAtDefaults({}), 'empty object treated as defaults')
{
  const tweaked = setCurveParam(defaultPeakTrailCurveParams(), 'exp', 'exponent', 3)
  ok(!isCurveParamsAtDefaults(tweaked), 'after tweak: NOT at defaults')
  const restored = setCurveParam(tweaked, 'exp', 'exponent', 2)
  ok(isCurveParamsAtDefaults(restored), 'after restore: at defaults again')
}

// applyTrailCurve(t, curve, params) — endpoint invariance + monotonicity + extremes.
// Endpoint anchoring: every (curve, params) combination returns 0 at t=0 and 1 at t=1.
for (const exponent of [1, 1.5, 2, 3, 4, 6]) {
  const p = { exp: { exponent } }
  near(applyTrailCurve(0, 'exp', p), 0, `exp(exponent=${exponent}) at t=0 → 0`)
  near(applyTrailCurve(1, 'exp', p), 1, `exp(exponent=${exponent}) at t=1 → 1`)
}
for (const base of [2, 3, 4, 6, 8]) {
  const p = { log: { base } }
  near(applyTrailCurve(0, 'log', p), 0, `log(base=${base}) at t=0 → 0`)
  near(applyTrailCurve(1, 'log', p), 1, `log(base=${base}) at t=1 → 1`)
}
// Default exponent (2) matches the shipped R16.17 squared curve.
near(applyTrailCurve(0.5, 'exp', defaultPeakTrailCurveParams()), 0.25, 'default exp params match R16.17 (t=0.5 → 0.25)')
// exponent=1 degenerates to linear (identity).
near(applyTrailCurve(0.5, 'exp', { exp: { exponent: 1 } }), 0.5, 'exp with exponent=1 degenerates to linear')
near(applyTrailCurve(0.3, 'exp', { exp: { exponent: 1 } }), 0.3, 'exp with exponent=1: t=0.3 → 0.3')
// Higher exponent biases more strongly toward the head — at t=0.5, t^4 < t^2 < t^1.
{
  const a = applyTrailCurve(0.5, 'exp', { exp: { exponent: 4 } })
  const b = applyTrailCurve(0.5, 'exp', { exp: { exponent: 2 } })
  ok(a < b, `higher exponent (4) more head-biased than lower (2) at midpoint: ${a} < ${b}`)
}
// Higher log base biases more tail-ward.
{
  const a = applyTrailCurve(0.5, 'log', { log: { base: 2 } })
  const b = applyTrailCurve(0.5, 'log', { log: { base: 8 } })
  ok(b > a, `higher log base (8) more tail-biased than lower (2) at midpoint: ${b} > ${a}`)
}
// Monotonicity on t: ascending t produces ascending output for every (curve, params) combo.
for (const params of [
  { exp: { exponent: 1.5 } },
  { exp: { exponent: 4 } },
  { log: { base: 3 } },
  { log: { base: 7 } },
]) {
  const curve = params.exp ? 'exp' : 'log'
  let prev = -Infinity
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const v = applyTrailCurve(t, curve, params)
    ok(v >= prev - 1e-9, `${curve} params monotonic at t=${t.toFixed(2)}: ${v} ≥ ${prev}`)
    prev = v
  }
}
// Corrupt params → defaults silently.
near(applyTrailCurve(0.5, 'exp', { exp: { exponent: NaN } }), 0.25, 'NaN exponent → default (t^2)')
near(applyTrailCurve(0.5, 'log', { log: { base: NaN } }), Math.log(1 + 3 * 0.5) / Math.log(4), 'NaN base → default (4)')
near(applyTrailCurve(0.5, 'exp', null), 0.25, 'null params → defaults')
near(applyTrailCurve(0.5, 'exp', {}), 0.25, 'empty params → defaults')

// readPeakTrail honours curveParams — non-default exponent reshapes the alpha distribution.
{
  const s = makePeakHoldState(1)
  for (let k = 0; k < PEAK_TRAIL_LENGTH; k++) tickPeakHolds(s, [[0, 50 + k * 5]])
  const defaultExp = readPeakTrail(s, 0, 0, { curve: 'exp' })  // exponent=2 implicit
  const sharperExp = readPeakTrail(s, 0, 0, { curve: 'exp', curveParams: { exp: { exponent: 5 } } })
  eq(defaultExp.length, sharperExp.length, 'same trail length regardless of params')
  // Inner sample should dim further with the sharper exponent (head bias stronger).
  const inner = Math.floor(defaultExp.length / 2)
  ok(sharperExp[inner].alpha < defaultExp[inner].alpha,
    `sharper exp dims inner sample further: ${sharperExp[inner].alpha} < ${defaultExp[inner].alpha}`)
  // Curve params object that's missing the relevant curve key falls back to defaults — no crash.
  const partial = readPeakTrail(s, 0, 0, { curve: 'exp', curveParams: { log: { base: 5 } } })
  eq(partial.length, defaultExp.length, 'partial params: falls back to default for unspecified curve')
  for (let i = 0; i < partial.length; i++) {
    near(partial[i].alpha, defaultExp[i].alpha, `partial params: alpha matches default exp at idx ${i}`)
  }
}

// --- R20.13: peakTrailHueForBarIndex (frequency-coloured trail tint) ---
// Roster + constants — pinned so the warm→cool intent doesn't drift.
ok(TRAIL_HUE_START   < TRAIL_HUE_END,    `warm start (${TRAIL_HUE_START}) < cool end (${TRAIL_HUE_END})`)
ok(TRAIL_HUE_DEFAULT >= 0 && TRAIL_HUE_DEFAULT <= 360, 'default hue in [0,360]')
ok(TRAIL_HUE_START   >= 0 && TRAIL_HUE_START   <= 60,  'warm start in warm zone (≤60° red/orange)')
ok(TRAIL_HUE_END     >= 200 && TRAIL_HUE_END   <= 320, 'cool end in cool zone (200°-320° blue/violet)')

// Endpoint anchors — first bar = warm start, last bar = cool end.
{
  near(peakTrailHueForBarIndex(0, 32),  TRAIL_HUE_START, 'bar 0 → warm start')
  near(peakTrailHueForBarIndex(31, 32), TRAIL_HUE_END,   'last bar (31/32) → cool end')
  near(peakTrailHueForBarIndex(0, 1),   (TRAIL_HUE_START + TRAIL_HUE_END) / 2, 'totalBars=1 → midpoint')
}

// Mid-bar lerps to midpoint hue.
{
  const mid = peakTrailHueForBarIndex(15, 31)  // exactly halfway (idx 15 of [0..30])
  near(mid, (TRAIL_HUE_START + TRAIL_HUE_END) / 2, `mid-bar = midpoint hue (got ${mid.toFixed(2)})`)
}

// Monotonicity — ascending barIndex → ascending hue (warm → cool, no folding back).
{
  let prev = -Infinity
  for (let i = 0; i < 32; i++) {
    const h = peakTrailHueForBarIndex(i, 32)
    ok(h >= prev - 1e-9, `monotonic at i=${i}: ${h} >= ${prev}`)
    prev = h
  }
}

// Defensive contract.
near(peakTrailHueForBarIndex(NaN, 32),       TRAIL_HUE_DEFAULT, 'NaN barIndex → default hue')
near(peakTrailHueForBarIndex(Infinity, 32),  TRAIL_HUE_DEFAULT, '+Infinity barIndex → default hue')
near(peakTrailHueForBarIndex(-Infinity, 32), TRAIL_HUE_DEFAULT, '-Infinity barIndex → default hue')
near(peakTrailHueForBarIndex(5, 0),          TRAIL_HUE_DEFAULT, 'totalBars=0 → default hue')
near(peakTrailHueForBarIndex(5, -10),        TRAIL_HUE_DEFAULT, 'negative totalBars → default hue')
near(peakTrailHueForBarIndex(5, NaN),        TRAIL_HUE_DEFAULT, 'NaN totalBars → default hue')
near(peakTrailHueForBarIndex(5, Infinity),   TRAIL_HUE_DEFAULT, 'Infinity totalBars → default hue')

// Out-of-range barIndex clamps before lerp (no extrapolation past endpoints).
near(peakTrailHueForBarIndex(-5, 32),  TRAIL_HUE_START, 'negative barIndex clamps to first')
near(peakTrailHueForBarIndex(100, 32), TRAIL_HUE_END,   'huge barIndex clamps to last')
near(peakTrailHueForBarIndex(32, 32),  TRAIL_HUE_END,   'barIndex === totalBars clamps to last (off-by-one safe)')

// Float barIndex floors to int — barIndex=15.7 with 32 bars equals barIndex=15.
{
  const a = peakTrailHueForBarIndex(15, 32)
  const b = peakTrailHueForBarIndex(15.7, 32)
  near(b, a, 'float barIndex floors to int (15.7 → 15)')
}

// Pure — same input always returns same output.
{
  const a = peakTrailHueForBarIndex(10, 32)
  const b = peakTrailHueForBarIndex(10, 32)
  eq(a, b, 'pure: deterministic across calls')
}

