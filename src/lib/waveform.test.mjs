// waveform: byte→centered conversion, peak amplitude, canvas projection,
// analyser sampling (with stub).
import {
  SILENCE_BYTE, FULL_AMPLITUDE,
  bytesToCentered, peakAmplitude, projectToCanvas, sampleAnalyser,
  WAVEFORM_MODES, bytesToSpectrum, sampleAnalyserSpectrum,
  projectSpectrumToBars, normalizeWaveformMode,
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

console.log('PASS: waveform spectrum extensions')
