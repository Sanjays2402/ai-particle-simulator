// Audio waveform overlay helpers.
//
// The waveform strip samples the raw time-domain output of the
// shared AudioContext analyser (exposed via window.__particleAudioAnalyser
// by TopBar). The renderer paints a polyline of the samples each
// frame; lib/waveform.js handles the math so the React layer stays
// drawing-only and the math gets unit-tested.
//
// AnalyserNode.getByteTimeDomainData fills a Uint8Array with values
// 0..255 where 128 is silence. We convert to centered floats in
// [-1, 1] for an easy "draw an oscilloscope" workflow.

export const SILENCE_BYTE = 128
export const FULL_AMPLITUDE = 127  // distance from silence at peak +/-

// Convert a raw Uint8Array time-domain sample into normalized
// [-1, 1] floats. Returns a new Float32Array (we don't mutate the
// caller's buffer because TopBar reuses it).
export function bytesToCentered(bytes) {
  if (!bytes || typeof bytes.length !== 'number') return new Float32Array(0)
  const n = bytes.length
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    out[i] = (bytes[i] - SILENCE_BYTE) / FULL_AMPLITUDE
  }
  return out
}

// Approximate peak amplitude in a sample window — useful for the
// "is the signal silent?" check, lets the renderer dim/skip when
// nothing's playing.
export function peakAmplitude(centered) {
  if (!centered || centered.length === 0) return 0
  let p = 0
  for (let i = 0; i < centered.length; i++) {
    const a = Math.abs(centered[i])
    if (a > p) p = a
  }
  return p
}

// Project the normalized samples into polyline points (x, y) for a
// canvas of `width` x `height`. Y is centered at height/2 with peak
// excursion = (height/2) - padPx. Returns an array of [x, y] tuples
// at length = min(samples.length, width) so we never draw more
// points than pixels available.
export function projectToCanvas(centered, width, height, padPx = 4) {
  const w = (width > 0 && Number.isFinite(width)) ? width : 100
  const h = (height > 0 && Number.isFinite(height)) ? height : 40
  const out = []
  if (!centered || centered.length === 0) return out
  const n = centered.length
  const stride = Math.max(1, Math.floor(n / w))
  const halfH = h / 2
  const peakPx = halfH - padPx
  for (let x = 0, idx = 0; x < w && idx < n; x++, idx += stride) {
    const v = centered[idx]
    // Clamp [-1, 1] so a hot signal doesn't shoot off-canvas.
    const cv = v < -1 ? -1 : v > 1 ? 1 : v
    const y = halfH - cv * peakPx
    out.push([x, y])
  }
  return out
}

// Sample the live analyser node. Returns a Float32Array of centered
// [-1, 1] values, or an empty array if the analyser is missing.
// `scratch` (optional) is a Uint8Array to reuse for the raw fetch —
// pass a single allocated buffer to avoid per-frame allocations.
export function sampleAnalyser(analyser, scratch) {
  if (!analyser || typeof analyser.getByteTimeDomainData !== 'function') {
    return new Float32Array(0)
  }
  const n = analyser.fftSize || (analyser.frequencyBinCount ? analyser.frequencyBinCount * 2 : 512)
  let buf = scratch
  if (!buf || buf.length !== n) buf = new Uint8Array(n)
  analyser.getByteTimeDomainData(buf)
  return bytesToCentered(buf)
}

// --- Frequency-spectrum mode (new) ----------------------------------
//
// The waveform overlay can also render the *frequency* spectrum instead
// of the raw time-domain wiggle. Spectrum view is dramatically more
// "musical" — bass on the left, treble on the right — and matches what
// every commercial visualizer ships.
//
// AnalyserNode.getByteFrequencyData fills a Uint8Array with values
// 0..255 where 0 is silence and 255 is full intensity. We convert to
// normalized 0..1 floats so the projector stays mode-agnostic.

export const WAVEFORM_MODES = ['time', 'frequency']

// Convert a raw Uint8Array frequency-domain sample (0..255 per bin)
// into normalized 0..1 floats. Always positive, unlike bytesToCentered.
export function bytesToSpectrum(bytes) {
  if (!bytes || typeof bytes.length !== 'number') return new Float32Array(0)
  const n = bytes.length
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    out[i] = bytes[i] / 255
  }
  return out
}

// Sample the live analyser's frequency-domain buffer. Returns a
// Float32Array of normalized 0..1 bin intensities. Mirrors
// sampleAnalyser's scratch contract so the overlay can reuse the
// same allocation strategy.
export function sampleAnalyserSpectrum(analyser, scratch) {
  if (!analyser || typeof analyser.getByteFrequencyData !== 'function') {
    return new Float32Array(0)
  }
  // frequencyBinCount = fftSize / 2 — that's the spectrum bin count.
  const n = analyser.frequencyBinCount || ((analyser.fftSize || 512) / 2)
  let buf = scratch
  if (!buf || buf.length !== n) buf = new Uint8Array(n)
  analyser.getByteFrequencyData(buf)
  return bytesToSpectrum(buf)
}

// Project a spectrum Float32Array into a list of [x, barHeight] tuples
// suitable for drawing vertical bars. Reduces the bin count to fit
// `barCount` columns by averaging adjacent bins — keeps the bar count
// small enough to look like a graphic-EQ rather than a noisy noise rug.
// Returns [] for empty input. Bar heights are clamped to [0, maxBarPx].
export function projectSpectrumToBars(spectrum, width, height, barCount = 32, padPx = 4) {
  const w = (width > 0 && Number.isFinite(width)) ? width : 100
  const h = (height > 0 && Number.isFinite(height)) ? height : 40
  const bc = Math.max(1, barCount | 0)
  const out = []
  if (!spectrum || spectrum.length === 0) return out
  const maxBarPx = Math.max(0, h - padPx * 2)
  const binsPerBar = Math.max(1, Math.floor(spectrum.length / bc))
  const colWidth = w / bc
  for (let b = 0; b < bc; b++) {
    let sum = 0
    let count = 0
    const start = b * binsPerBar
    for (let i = start; i < start + binsPerBar && i < spectrum.length; i++) {
      sum += spectrum[i]
      count++
    }
    const avg = count > 0 ? sum / count : 0
    const barH = Math.max(0, Math.min(maxBarPx, avg * maxBarPx))
    out.push([b * colWidth, barH])
  }
  return out
}

// Log-frequency variant — instead of linear binsPerBar, the i-th bar
// covers an exponentially widening range of bins. This matches how
// humans perceive pitch (octaves are equal-spaced in log frequency,
// not linear) and brings out the musical structure: bass occupies a
// large chunk of the screen, treble doesn't get squeezed into 2 bars
// at the far right.
//
// Math: the spectrum has N bins indexed [0..N-1]. We map each bar's
// start/end to bins via:
//   start_i = round((N) * (10^(i/B) - 1) / (10 - 1))    (zero-based)
// where B = barCount. This is a "log10 over [0..1]" curve renormalised
// so bar 0 starts at bin 0 and bar B-1 ends near bin N-1.
//
// We guard against degenerate cases: when start_i === end_i (which
// happens for the first few bars when N << B), we still average the
// single bin so the bar height isn't zero.
export function projectSpectrumToLogBars(spectrum, width, height, barCount = 32, padPx = 4) {
  const w = (width > 0 && Number.isFinite(width)) ? width : 100
  const h = (height > 0 && Number.isFinite(height)) ? height : 40
  const bc = Math.max(1, barCount | 0)
  const out = []
  if (!spectrum || spectrum.length === 0) return out
  const N = spectrum.length
  const maxBarPx = Math.max(0, h - padPx * 2)
  const colWidth = w / bc
  // Pre-compute the cumulative-log denominator so we can map bar i
  // to a bin offset in [0..N).
  const denom = Math.pow(10, 1) - 1  // = 9, the curve's tail at i=B
  for (let i = 0; i < bc; i++) {
    const t0 = i / bc
    const t1 = (i + 1) / bc
    // Two-anchor log curve — start at 0, end at N when t=1.
    const start = Math.floor(N * (Math.pow(10, t0) - 1) / denom)
    let end     = Math.floor(N * (Math.pow(10, t1) - 1) / denom)
    if (end <= start) end = start + 1  // ensure at least one bin / bar
    if (end > N) end = N
    let sum = 0
    let count = 0
    for (let j = start; j < end; j++) {
      sum += spectrum[j]
      count++
    }
    const avg = count > 0 ? sum / count : 0
    const barH = Math.max(0, Math.min(maxBarPx, avg * maxBarPx))
    out.push([i * colWidth, barH])
  }
  return out
}

// Validator — accept only the documented modes, fall through to 'time'.
export function normalizeWaveformMode(mode) {
  return WAVEFORM_MODES.includes(mode) ? mode : 'time'
}

// --- Spectrum peak-hold lines ---------------------------------------
//
// Classic EQ visualizers paint a thin horizontal line over each bar at
// the bar's recent peak height, and let that line fall slowly. The
// effect makes transients legible — a kick drum's spike sits in the air
// for ~half a second instead of vanishing in a single 16ms frame.
//
// Math: each peak holds for HOLD_FRAMES of plateau (bar dipped below
// peak), then decays at DECAY_PER_FRAME pixels per frame. A FRESH bar
// height that exceeds the held peak instantly raises the peak (no
// smoothing — we want the spike to read crisply).
//
// State shape (per bar): { peak, age }
//   peak: held bar-pixel height (0 = floor)
//   age:  frames since the last time the bar height >= peak. While age
//         is below HOLD_FRAMES the peak holds; after that, it decays.
//
// Pure function — caller maintains the `prev` Float32Array (peaks) +
// Int32Array (ages) and passes the freshly-rendered bars back in. Use
// makePeakHoldState(barCount) to mint a clean slate.

export const PEAK_HOLD_FRAMES = 18
export const PEAK_DECAY_PX = 0.6
export const PEAK_LINE_THICKNESS = 1.5

// R15.07 — peak-hold fade-out tail. After the peak line decays / drops,
// we keep painting it at a quickly-falling alpha for ~12 frames (200ms
// @ 60Hz) so transients leave a cinematic afterimage instead of
// vanishing crisply. A ring buffer per bar records (peakY, alpha)
// samples so the renderer can replay the trail with no extra state
// management — the trail walks itself forward on every tick.
//
// Footprint: TRAIL_LENGTH * barCount Float32 entries. At 32 bars * 12
// frames = 384 entries (~1.5 KB total) — well under any frame budget.
//
// The trail is INTENTIONALLY separate from the held-peak math above so
// disabling the trail (e.g. for a performance mode) is a one-line guard
// in the renderer; the live peak-hold lines keep working unchanged.
export const PEAK_TRAIL_LENGTH = 12      // ~200ms @ 60Hz
export const PEAK_TRAIL_ALPHA_MAX = 0.55 // freshest trail step alpha
export const PEAK_TRAIL_ALPHA_MIN = 0.04 // oldest trail step still drawn

export function makePeakHoldState(barCount) {
  const n = Math.max(0, barCount | 0)
  return {
    peaks: new Float32Array(n),
    ages:  new Int32Array(n),
    // Trail: row-major (barIndex * TRAIL_LENGTH + step) of recent
    // peak heights. Slot 0 is the head (latest frame); we shift-down
    // on every tick by copying entries[1..end] to entries[0..end-1].
    // A typed array beats a 2D array for the row-major copy speed.
    trail:     n > 0 ? new Float32Array(n * PEAK_TRAIL_LENGTH) : new Float32Array(0),
    trailLen:  PEAK_TRAIL_LENGTH,
  }
}

// Walk one frame forward. `bars` is the output of projectSpectrumToBars
// (or its log variant) — an array of [x, barHeight] tuples. Mutates
// state in-place for speed (this runs at 60Hz) and returns it for
// fluent use. New peaks lock in instantly; lower bars trigger the hold
// timer; expired holds decay by PEAK_DECAY_PX per frame, never below 0.
//
// R15.07 — also advances the per-bar trail ring buffer: shift all
// trail samples down one slot and write the freshly-resolved peak
// height into slot 0. Reading the trail later (drawPeakTrails) walks
// from oldest to newest and paints each step at a decreasing alpha.
export function tickPeakHolds(state, bars, opts = {}) {
  if (!state || !state.peaks || !state.ages) return state
  const n = state.peaks.length
  const holdFrames = Number.isFinite(opts.holdFrames) ? opts.holdFrames : PEAK_HOLD_FRAMES
  const decayPx    = Number.isFinite(opts.decayPx)    ? opts.decayPx    : PEAK_DECAY_PX
  const trail    = state.trail
  const trailLen = state.trailLen || 0
  for (let i = 0; i < n; i++) {
    const fresh = (bars && i < bars.length) ? Math.max(0, bars[i][1] || 0) : 0
    const prev = state.peaks[i]
    if (fresh >= prev) {
      // New high (or matched the previous peak) — lock it in, reset age.
      state.peaks[i] = fresh
      state.ages[i]  = 0
    } else {
      // Bar dipped below the held peak. Hold for HOLD_FRAMES, then decay.
      const age = state.ages[i] + 1
      state.ages[i] = age
      if (age > holdFrames) {
        const next = prev - decayPx
        // Don't let the peak drop below the fresh bar (it would look
        // wrong to have the held line below the live bar top) and never
        // below zero.
        state.peaks[i] = Math.max(0, next, fresh)
      }
    }
    // R15.07 — shift the trail ring buffer down one slot, then write
    // the latest peak height to head. We do this even when the peak
    // didn't change so the trail spacing stays in lockstep with the
    // 60Hz tick (a missed shift would compress the visible trail).
    if (trail && trailLen > 0) {
      const base = i * trailLen
      // Walk from the OLDEST slot backwards so we never overwrite a
      // source before we've copied it. (trailLen-1) gets (trailLen-2),
      // (trailLen-2) gets (trailLen-3), …, slot 1 gets slot 0.
      for (let s = trailLen - 1; s > 0; s--) {
        trail[base + s] = trail[base + s - 1]
      }
      trail[base] = state.peaks[i]
    }
  }
  return state
}

// Reset the hold state without re-allocating — used when the bar count
// changes or the mode flips back to time-domain (peaks shouldn't carry
// over a mode swap and look stale). R15.07 — also zeroes the trail.
export function resetPeakHolds(state) {
  if (!state || !state.peaks || !state.ages) return state
  state.peaks.fill(0)
  state.ages.fill(0)
  if (state.trail) state.trail.fill(0)
  return state
}

// R15.07 — read the trail for a single bar. Returns an array of
// { height, alpha } samples from OLDEST to NEWEST. Zero-height samples
// (the buffer hasn't filled in yet, OR the trail is at the floor for
// that bar) are filtered out so the renderer doesn't paint a million
// no-op rectangles at y = floor. `current` (optional) is the live bar
// height; the trail filters out any sample at or below it because the
// trail is meant to live ABOVE the bar (a sample lower than the bar
// would visually live INSIDE the bar, which looks like a glitch).
//
// Alpha walks linearly from PEAK_TRAIL_ALPHA_MIN (oldest) to
// PEAK_TRAIL_ALPHA_MAX (newest) — gives the trail a clean head-leading
// gradient. We skip the head-most (newest) slot because that's the
// SAME height as the live peak-hold line; rendering both at full alpha
// would just paint over it.
export function readPeakTrail(state, barIndex, current = 0) {
  if (!state || !state.trail || !state.peaks) return []
  const trailLen = state.trailLen || 0
  if (trailLen <= 1) return []
  const n = state.peaks.length
  if (barIndex < 0 || barIndex >= n) return []
  const base = barIndex * trailLen
  const out = []
  // Walk oldest → newest, but skip slot 0 (head); see comment above.
  for (let s = trailLen - 1; s >= 1; s--) {
    const h = state.trail[base + s] || 0
    // Skip floor samples + anything not visibly above the live bar.
    if (h <= current + 1) continue
    // Alpha grows as we approach the head. s=trailLen-1 → MIN,
    // s=1 → MAX (almost). Lerp linearly between MIN and MAX as a
    // function of how close `s` is to the head.
    const t = (trailLen - 1 - s) / (trailLen - 2)  // 0 (oldest) → 1 (newest non-head)
    const alpha = PEAK_TRAIL_ALPHA_MIN + t * (PEAK_TRAIL_ALPHA_MAX - PEAK_TRAIL_ALPHA_MIN)
    out.push({ height: h, alpha })
  }
  return out
}
