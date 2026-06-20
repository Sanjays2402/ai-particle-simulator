// Demo audio loops — pure WebAudio synthesis so users without a mic
// (or who don't want to grant mic permission) can still drive the
// audio-reactive visuals. Each loop is a small graph of oscillators +
// gain envelopes + filters that produces a steady musical pattern.
//
// Design contract:
// - createLoop(ctx, kind) returns { node, stop, kind } where `node` is
//   the AudioNode you can connect to an AnalyserNode (and through that
//   to the visualizer pipeline). The loop is NOT connected to
//   destination by default — caller decides whether to play it audibly.
// - stop() must always be safe to call (idempotent, no errors after).
// - Loops are designed to land hits on the bass band so the beat
//   detector triggers naturally.

export const DEMO_LOOPS = [
  { id: 'pulse',   label: 'Pulse',  desc: '4-on-the-floor kick — drives the Beat detector' },
  { id: 'ambient', label: 'Ambient', desc: 'Slow swelling pad — favours Level mode' },
  { id: 'arp',     label: 'Arp',    desc: 'Sixteenth-note arpeggio — busy mids' },
  { id: 'bass',    label: 'Bass',   desc: 'Walking bass line — heavy low end' },
]

// Music theory plumbing — convert MIDI note → Hz so the patterns are
// readable as scale degrees instead of magic frequencies.
export function midiToHz(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

// 16-step pattern grids, expressed as MIDI notes per step. 0 = rest.
// Patterns are looped at PATTERN_LEN_SEC / 16 per step.
const PATTERN_LEN_SEC = 2.0
export const STEP_COUNT = 16
const PATTERNS = {
  pulse:   [36, 0, 0, 0, 36, 0, 36, 0, 36, 0, 0, 0, 36, 0, 36, 0],
  bass:    [36, 0, 43, 0, 36, 0, 41, 0, 36, 0, 43, 0, 39, 0, 41, 0],
  arp:     [60, 64, 67, 72, 67, 64, 67, 71, 60, 64, 67, 72, 67, 64, 60, 64],
  ambient: [48, 0, 0, 0, 55, 0, 0, 0, 60, 0, 0, 0, 63, 0, 0, 0],
}

// Per-loop voice synthesis. Each function builds + schedules the
// next 16-step bar starting at `startTime` (AudioContext time). The
// loop scheduler calls them ahead of time so playback is gapless.
function scheduleStep(ctx, out, kind, note, when, stepDur) {
  if (!note) return
  const freq = midiToHz(note)
  if (kind === 'pulse') {
    // Short pitched-down kick — sine sweep + click.
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(120, when)
    osc.frequency.exponentialRampToValueAtTime(40, when + 0.12)
    gain.gain.setValueAtTime(0.0001, when)
    gain.gain.exponentialRampToValueAtTime(0.9, when + 0.005)
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.18)
    osc.connect(gain).connect(out)
    osc.start(when)
    osc.stop(when + 0.22)
  } else if (kind === 'bass') {
    // Detuned saw with low-pass — punchy, midrange-aware.
    const osc1 = ctx.createOscillator()
    const osc2 = ctx.createOscillator()
    const filt = ctx.createBiquadFilter()
    const gain = ctx.createGain()
    osc1.type = 'sawtooth'
    osc2.type = 'sawtooth'
    osc1.frequency.setValueAtTime(freq, when)
    osc2.frequency.setValueAtTime(freq * 1.005, when)
    filt.type = 'lowpass'
    filt.frequency.setValueAtTime(450, when)
    gain.gain.setValueAtTime(0.0001, when)
    gain.gain.exponentialRampToValueAtTime(0.5, when + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, when + stepDur * 0.85)
    osc1.connect(filt)
    osc2.connect(filt)
    filt.connect(gain).connect(out)
    osc1.start(when); osc2.start(when)
    osc1.stop(when + stepDur); osc2.stop(when + stepDur)
  } else if (kind === 'arp') {
    // Square pluck with fast decay.
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'square'
    osc.frequency.setValueAtTime(freq, when)
    gain.gain.setValueAtTime(0.0001, when)
    gain.gain.exponentialRampToValueAtTime(0.18, when + 0.005)
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.14)
    osc.connect(gain).connect(out)
    osc.start(when)
    osc.stop(when + 0.18)
  } else if (kind === 'ambient') {
    // Sustained triangle pad — slow attack/release so notes blur.
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(freq, when)
    const dur = stepDur * 4 // hold across multiple steps for swell
    gain.gain.setValueAtTime(0.0001, when)
    gain.gain.exponentialRampToValueAtTime(0.35, when + dur * 0.3)
    gain.gain.exponentialRampToValueAtTime(0.0001, when + dur)
    osc.connect(gain).connect(out)
    osc.start(when)
    osc.stop(when + dur + 0.05)
  }
}

// Build a loop with a small scheduler that re-arms itself every bar.
// We return both the output `node` (so the caller can connect to an
// analyser) and a `stop()` to cancel the scheduler + ramp gain down.
export function createLoop(ctx, kind) {
  if (!ctx || !PATTERNS[kind]) return null
  const pattern = PATTERNS[kind]
  const out = ctx.createGain()
  out.gain.value = 0.9
  const stepDur = PATTERN_LEN_SEC / STEP_COUNT
  // First bar starts at "now + lookahead" so the scheduler has time
  // to set up the steps before they're due.
  let nextBarStart = ctx.currentTime + 0.05
  let stopped = false
  let timerId = null

  const armNextBar = () => {
    if (stopped) return
    for (let i = 0; i < STEP_COUNT; i++) {
      scheduleStep(ctx, out, kind, pattern[i], nextBarStart + i * stepDur, stepDur)
    }
    nextBarStart += PATTERN_LEN_SEC
    // Re-arm half a bar before the next one is due so we never miss it.
    timerId = setTimeout(armNextBar, PATTERN_LEN_SEC * 1000 * 0.5)
  }
  armNextBar()

  const stop = () => {
    if (stopped) return
    stopped = true
    if (timerId !== null) { clearTimeout(timerId); timerId = null }
    try {
      const now = ctx.currentTime
      out.gain.cancelScheduledValues(now)
      out.gain.setValueAtTime(out.gain.value, now)
      out.gain.exponentialRampToValueAtTime(0.0001, now + 0.1)
    } catch { /* node already disconnected */ }
  }
  return { node: out, stop, kind }
}
