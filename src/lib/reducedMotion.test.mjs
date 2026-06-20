// reducedMotion: resolve user override + OS pref into an effective flag,
// motionMultiplier behaviour, and subscribeOSReducedMotion in absence
// of matchMedia.
import {
  resolveReducedMotion, motionMultiplier,
  getOSPrefersReduced, subscribeOSReducedMotion,
  REDUCED_MOTION_MODES,
} from './reducedMotion.js'

function fail(m) { console.error(`FAIL: ${m}`); process.exit(1) }
function eq(a, b, m) { if (a !== b) fail(`${m} — got ${a} expected ${b}`) }

// 1. 'reduce' override always wins.
eq(resolveReducedMotion('reduce', false), true, 'reduce + OS off → on')
eq(resolveReducedMotion('reduce', true),  true, 'reduce + OS on  → on')

// 2. 'full' override always wins (escape hatch).
eq(resolveReducedMotion('full', false), false, 'full + OS off → off')
eq(resolveReducedMotion('full', true),  false, 'full + OS on  → off')

// 3. 'auto' defers to OS.
eq(resolveReducedMotion('auto', false), false, 'auto + OS off → off')
eq(resolveReducedMotion('auto', true),  true,  'auto + OS on  → on')

// 4. Unknown user-mode defers to OS (safety: never crash on stored junk).
eq(resolveReducedMotion('weird',     false), false, 'unknown + OS off → off')
eq(resolveReducedMotion('weird',     true),  true,  'unknown + OS on  → on')
eq(resolveReducedMotion(undefined,   true),  true,  'undefined + OS on → on')
eq(resolveReducedMotion(null,        false), false, 'null + OS off → off')

// 5. motionMultiplier zero-or-one contract — the renderer multiplies by
//    this and can therefore disable a per-frame motion in one place.
eq(motionMultiplier(true),  0, 'reduced → 0 multiplier (no motion)')
eq(motionMultiplier(false), 1, 'full motion → 1 multiplier')

// 6. REDUCED_MOTION_MODES whitelist contains the three modes UI uses.
eq(REDUCED_MOTION_MODES.includes('auto'),   true, 'auto mode listed')
eq(REDUCED_MOTION_MODES.includes('reduce'), true, 'reduce mode listed')
eq(REDUCED_MOTION_MODES.includes('full'),   true, 'full mode listed')

// 7. getOSPrefersReduced returns false in non-browser env (no window).
//    We can't easily simulate window without polluting global; just
//    assert it doesn't throw and yields a boolean.
{
  const v = getOSPrefersReduced()
  if (typeof v !== 'boolean') fail(`getOSPrefersReduced should return a boolean, got ${typeof v}`)
}

// 8. subscribeOSReducedMotion no-ops cleanly without matchMedia and
//    returns an unsubscribe function (never throws on cleanup).
{
  const unsub = subscribeOSReducedMotion(() => {})
  if (typeof unsub !== 'function') fail('subscribe should return an unsubscribe fn')
  unsub() // must not throw
}

// 9. With a fake matchMedia, subscribe wires through to addEventListener
//    and the unsubscribe call drops the listener.
{
  let added = 0, removed = 0
  let savedHandler = null
  const fakeMql = {
    matches: false,
    addEventListener: (_evt, h) => { added++; savedHandler = h },
    removeEventListener: (_evt, h) => { if (h === savedHandler) removed++ },
  }
  const prev = globalThis.window
  globalThis.window = { matchMedia: () => fakeMql }
  let lastCalledWith = null
  const unsub = subscribeOSReducedMotion((v) => { lastCalledWith = v })
  eq(added, 1, 'subscribe registers exactly one listener')
  // Simulate an OS-level change.
  savedHandler({ matches: true })
  eq(lastCalledWith, true, 'callback receives the new pref value')
  unsub()
  eq(removed, 1, 'unsubscribe removes the listener')
  globalThis.window = prev
}

console.log(`PASS: reducedMotion — ${REDUCED_MOTION_MODES.length} modes · resolve/multiplier/subscribe`)
