// waveform: byte→centered conversion, peak amplitude, canvas projection,
// analyser sampling (with stub).
import {
  SILENCE_BYTE, FULL_AMPLITUDE,
  bytesToCentered, peakAmplitude, projectToCanvas, sampleAnalyser,
  WAVEFORM_MODES, bytesToSpectrum, sampleAnalyserSpectrum,
  projectSpectrumToBars, projectSpectrumToLogBars, normalizeWaveformMode,
  makePeakHoldState, tickPeakHolds, resetPeakHolds,
  PEAK_HOLD_FRAMES, PEAK_DECAY_PX,
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

console.log(`PASS: waveform peak-hold lines · HOLD=${PEAK_HOLD_FRAMES} frames · DECAY=${PEAK_DECAY_PX}px/frame (R10.19)`)
