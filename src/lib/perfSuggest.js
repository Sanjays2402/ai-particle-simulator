// Performance auto-suggest.
//
// The simulator can push 50K particles, which tanks fps on weaker GPUs.
// Rather than silently stutter, watch the live fps and — only when it
// stays low for a sustained window — surface a ONE-TAP suggestion to
// drop to a lighter quality tier. The whole point is to help without
// nagging: it fires at most once per "low spell", respects a user who
// dismisses it, and never suggests dropping below the current tier or
// when the user is already on the lowest tier.
//
// This module is the pure decision engine (a small state machine fed
// one fps sample at a time) so it unit-tests without a clock or a GPU.
// The React side just pumps samples in and shows the toast when asked.

// Quality tiers, ascending particle counts. Mirrors the LeftSidebar
// "Quality Preset" chips so a suggestion maps cleanly onto a chip.
export const QUALITY_TIERS = [
  { id: 'low',   label: 'Low',   count: 2000 },
  { id: 'med',   label: 'Med',   count: 10000 },
  { id: 'high',  label: 'High',  count: 25000 },
  { id: 'ultra', label: 'Ultra', count: 50000 },
]

// fps at or below this for the sustained window → "struggling".
export const LOW_FPS_THRESHOLD = 40
// Must stay low for this long (ms) before we suggest — avoids reacting
// to a one-off hitch (a preset compile, a GC pause).
export const SUSTAINED_LOW_MS = 4000
// After a suggestion is shown (or dismissed), stay quiet for this long
// before we're allowed to suggest again — the anti-nag cooldown.
export const SUGGEST_COOLDOWN_MS = 60000

// Map a particle count to the nearest tier id (the tier whose count is
// closest). Used to figure out which tier the user is currently on,
// even if they set a custom count via the slider.
export function tierForCount(count) {
  const c = Number(count)
  if (!Number.isFinite(c)) return QUALITY_TIERS[QUALITY_TIERS.length - 1].id
  let best = QUALITY_TIERS[0]
  let bestDist = Infinity
  for (const t of QUALITY_TIERS) {
    const d = Math.abs(t.count - c)
    if (d < bestDist) { bestDist = d; best = t }
  }
  return best.id
}

// The tier one step BELOW the given count (the suggested target), or
// null if the user is already at/below the lowest tier. We pick the
// highest tier whose count is strictly less than the current count so
// a 50K user drops to High (25K), a 25K user to Med, etc.
export function nextLowerTier(count) {
  const c = Number(count)
  if (!Number.isFinite(c)) return null
  let candidate = null
  for (const t of QUALITY_TIERS) {
    if (t.count < c) {
      if (!candidate || t.count > candidate.count) candidate = t
    }
  }
  return candidate
}

// Create a fresh suggester state. `nowMs` seeds the cooldown clock so a
// freshly-mounted app doesn't fire in the first frame.
export function createSuggesterState(nowMs = 0) {
  return {
    lowSince: null,      // timestamp fps first dropped low (null = not low)
    lastSuggestAt: null, // timestamp of the last suggestion / dismissal
    booted: Number(nowMs) || 0,
  }
}

// Feed one fps sample. Returns { state, suggest } where `suggest` is
// either null (do nothing) or { targetTier, fps } when the UI should
// show the drop-quality toast. PURE: returns a NEW state, never mutates
// the input.
//
// opts:
//   currentCount  live particle count (to compute the target tier)
//   threshold     low-fps cutoff (default LOW_FPS_THRESHOLD)
//   sustainMs     how long fps must stay low (default SUSTAINED_LOW_MS)
//   cooldownMs    quiet period after a suggestion (default cooldown)
//   enabled       master switch; when false, never suggests (default true)
//   fxAvailable   when true, allow a suggestion to fire even if there's
//                 no lower particle-count tier (because a heavy post-FX
//                 can still be turned off — R35.D). Default false, so the
//                 classic "lowest tier never suggests" behaviour holds.
export function pushFpsSample(state, fps, nowMs, opts = {}) {
  const s = state && typeof state === 'object'
    ? state
    : createSuggesterState(nowMs)
  const f = Number(fps)
  const now = Number(nowMs)
  const threshold = numOr(opts.threshold, LOW_FPS_THRESHOLD)
  const sustainMs = numOr(opts.sustainMs, SUSTAINED_LOW_MS)
  const cooldownMs = numOr(opts.cooldownMs, SUGGEST_COOLDOWN_MS)
  const enabled = opts.enabled !== false

  // Bad inputs → no change, no suggestion.
  if (!Number.isFinite(f) || !Number.isFinite(now)) {
    return { state: s, suggest: null }
  }

  const isLow = f <= threshold
  let lowSince = s.lowSince

  if (!isLow) {
    // Recovered — clear the low streak. No suggestion.
    if (lowSince !== null) {
      return { state: { ...s, lowSince: null }, suggest: null }
    }
    return { state: s, suggest: null }
  }

  // fps is low. Start (or continue) the streak.
  if (lowSince === null) lowSince = now

  const sustainedLongEnough = (now - lowSince) >= sustainMs
  const target = nextLowerTier(opts.currentCount)
  // We can act if there's a lower tier to drop to OR (R35.D) a heavy
  // post-FX the UI told us it can turn off instead.
  const canAct = target !== null || opts.fxAvailable === true

  // Cooldown gate: stay quiet for cooldownMs after the last suggestion.
  const cooledDown = s.lastSuggestAt === null || (now - s.lastSuggestAt) >= cooldownMs

  if (enabled && sustainedLongEnough && cooledDown && canAct) {
    // Fire. Reset the streak + arm the cooldown so we don't re-fire
    // every frame while fps stays low.
    return {
      state: { ...s, lowSince: null, lastSuggestAt: now },
      suggest: { targetTier: target, fps: Math.round(f) },
    }
  }

  // Low but not yet actionable — just record the streak start.
  return { state: { ...s, lowSince }, suggest: null }
}

// Called when the user dismisses or accepts a suggestion: arm the
// cooldown so we don't immediately re-suggest. Pure.
export function markSuggestionHandled(state, nowMs) {
  const s = state && typeof state === 'object' ? state : createSuggesterState(nowMs)
  const now = Number(nowMs)
  return { ...s, lowSince: null, lastSuggestAt: Number.isFinite(now) ? now : s.lastSuggestAt }
}

function numOr(v, fallback) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

// --- R36.D: live perf-budget status pill -----------------------------
//
// The auto-suggest toast (above) is reactive — it only speaks up after a
// sustained low spell. Sometimes a user TUNING a heavy scene wants to
// watch their headroom continuously, the way a game's perf overlay
// shows a live green/amber/red dot. This pure helper maps the live fps
// into a small status descriptor a tiny opt-in pill can render, with no
// state machine + no nagging — just an at-a-glance "am I smooth?".
//
// Bands mirror the rest of the app (StatusStrip / fpsGraph): >= 55 good,
// >= 30 ok, else bad — so the pill agrees with the numeric fps colour
// the user already knows. Returns { level, label, color, fps }.
export const PERF_PILL_GOOD = 55
export const PERF_PILL_OK = 30

const PERF_PILL_STATUS = {
  good: { level: 'good', label: 'Smooth',  color: '#86efac' },
  ok:   { level: 'ok',   label: 'Tight',   color: '#fbbf24' },
  bad:  { level: 'bad',  label: 'Heavy',   color: '#f87171' },
  none: { level: 'none', label: '—',       color: '#6a6a80' },
}

export function perfBudgetStatus(fps) {
  const v = Number(fps)
  if (!Number.isFinite(v) || v <= 0) return { ...PERF_PILL_STATUS.none, fps: 0 }
  const rounded = Math.round(v)
  if (v >= PERF_PILL_GOOD) return { ...PERF_PILL_STATUS.good, fps: rounded }
  if (v >= PERF_PILL_OK) return { ...PERF_PILL_STATUS.ok, fps: rounded }
  return { ...PERF_PILL_STATUS.bad, fps: rounded }
}

// --- R35.D: post-FX lighter-touch alternative ------------------------
//
// Dropping particle count is the big hammer. Often a cheaper fix is to
// turn OFF an expensive post-processing pass — depth-of-field (a
// multi-tap bokeh blur) is by far the heaviest, then film grain, then
// chromatic aberration, then vignette. If one of those is ON we'd
// rather suggest disabling it FIRST (keeps the user's particle count +
// look mostly intact) and only fall back to a tier drop when no heavy
// FX is active. Bloom is intentionally excluded — it's the scene's core
// glow and isn't a simple toggle.
//
// Ordered heaviest → lightest so we always suggest the biggest single
// win first. `field` is the store flag; `setter` is the store action
// name the UI calls to turn it off.
export const POSTFX_EFFECTS = [
  { id: 'dof',       label: 'Depth of Field',      field: 'depthOfField',        setter: 'setDepthOfField' },
  { id: 'grain',     label: 'Film Grain',          field: 'filmGrain',           setter: 'setFilmGrain' },
  { id: 'chromatic', label: 'Chromatic Aberration', field: 'chromaticAberration', setter: 'setChromaticAberration' },
  { id: 'vignette',  label: 'Vignette',            field: 'vignette',            setter: 'setVignette' },
]

// Given a map of the live post-FX flags (e.g. the store slice), return
// the heaviest one that's currently ON, as its roster descriptor, or
// null if none are active. Pure + defensive (non-object → null).
export function pickHeaviestActivePostFx(activeFx) {
  if (!activeFx || typeof activeFx !== 'object') return null
  for (const fx of POSTFX_EFFECTS) {
    if (activeFx[fx.field]) return fx
  }
  return null
}

// Decide which remedy to offer for a fired suggestion: prefer turning
// off the heaviest active post-FX (lighter touch), else fall back to the
// particle-count tier drop. Returns a discriminated union:
//   { kind: 'postfx', fx, fps }            — disable this effect
//   { kind: 'tier', targetTier, fps }      — drop to this quality tier
//   null                                   — nothing to offer
// `suggest` is the object pushFpsSample handed back; `activeFx` is the
// live post-FX flag map. Pure.
export function chooseSuggestionRemedy(suggest, activeFx) {
  if (!suggest || typeof suggest !== 'object') return null
  const fx = pickHeaviestActivePostFx(activeFx)
  if (fx) return { kind: 'postfx', fx, fps: suggest.fps }
  if (suggest.targetTier) return { kind: 'tier', targetTier: suggest.targetTier, fps: suggest.fps }
  return null
}
