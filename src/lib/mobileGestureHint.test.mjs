// mobileGestureHint: seen flag, gesture-demo state machine, gating.
import {
  STORAGE_KEY, shouldShowHint, hasSeenHint, markHintSeen,
  resetHintSeen, recordGesture, hasDemonstratedAll,
} from './mobileGestureHint.js'

function fail(m) { console.error(`FAIL: ${m}`); process.exit(1) }
function eq(a, b, m) { if (a !== b) fail(`${m} — got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`) }
function ok(c, m) { if (!c) fail(m) }

function makeStorage() {
  const map = new Map()
  return {
    getItem(k)    { return map.has(k) ? map.get(k) : null },
    setItem(k, v) { map.set(k, String(v)) },
    removeItem(k) { map.delete(k) },
    _raw: map,
  }
}

// --- STORAGE_KEY exposed and stable ---
eq(typeof STORAGE_KEY, 'string', 'STORAGE_KEY is string')
ok(STORAGE_KEY.length > 0, 'STORAGE_KEY non-empty')

// --- shouldShowHint gating ---
eq(shouldShowHint({ isMobile: false, hasSeen: false }), false, 'desktop never shows')
eq(shouldShowHint({ isMobile: true,  hasSeen: false }), true,  'mobile + unseen → show')
eq(shouldShowHint({ isMobile: true,  hasSeen: true  }), false, 'mobile + seen → hide')
eq(shouldShowHint({ isMobile: false, hasSeen: true  }), false, 'desktop + seen → hide')

// --- hasSeenHint / markHintSeen / resetHintSeen round-trip ---
{
  const s = makeStorage()
  eq(hasSeenHint(s), false, 'fresh storage → unseen')
  ok(markHintSeen(s), 'markHintSeen returns true on success')
  eq(hasSeenHint(s), true, 'after mark → seen')
  eq(s._raw.get(STORAGE_KEY), '1', 'flag value is "1"')
  ok(resetHintSeen(s), 'resetHintSeen returns true on success')
  eq(hasSeenHint(s), false, 'after reset → unseen')
}

// --- Safe defaults when storage is missing ---
{
  // hasSeenHint with no storage returns true (don't nag in private mode).
  eq(hasSeenHint(null), true, 'no-storage → assume seen (don\'t harass)')
  eq(markHintSeen(null), false, 'no-storage → mark fails false')
  eq(resetHintSeen(null), false, 'no-storage → reset fails false')
}

// --- Throwing storage (private mode) is swallowed ---
{
  const throwing = {
    getItem()    { throw new Error('quota') },
    setItem()    { throw new Error('quota') },
    removeItem() { throw new Error('quota') },
  }
  eq(hasSeenHint(throwing), true, 'throw on get → seen (fail closed)')
  eq(markHintSeen(throwing), false, 'throw on set → false')
  eq(resetHintSeen(throwing), false, 'throw on remove → false')
}

// --- recordGesture builds state immutably ---
{
  const initial = recordGesture(null, 'pinch-in')
  eq(initial.pinchSeen, true, 'null state + pinch → pinchSeen')
  eq(initial.swipeSeen, false, 'null state + pinch → swipe still false')

  // Doesn't mutate input.
  const before = { pinchSeen: false, swipeSeen: false }
  const after = recordGesture(before, 'swipe-right')
  eq(before.pinchSeen, false, 'input pinchSeen unchanged')
  eq(before.swipeSeen, false, 'input swipeSeen unchanged')
  eq(after.pinchSeen, false, 'after pinchSeen false (only swipe came in)')
  eq(after.swipeSeen, true, 'after swipeSeen true')
  ok(after !== before, 'new object returned')
}
{
  // Each gesture type maps correctly.
  eq(recordGesture({}, 'pinch-in').pinchSeen, true, 'pinch-in → pinchSeen')
  eq(recordGesture({}, 'pinch-out').pinchSeen, true, 'pinch-out → pinchSeen')
  eq(recordGesture({}, 'swipe-left').swipeSeen, true, 'swipe-left → swipeSeen')
  eq(recordGesture({}, 'swipe-right').swipeSeen, true, 'swipe-right → swipeSeen')
  // Unknown gestures are no-ops.
  const after = recordGesture({ pinchSeen: false, swipeSeen: false }, 'wiggle')
  eq(after.pinchSeen, false, 'unknown gesture leaves pinchSeen alone')
  eq(after.swipeSeen, false, 'unknown gesture leaves swipeSeen alone')
}
{
  // State accumulates across calls.
  let st = { pinchSeen: false, swipeSeen: false }
  st = recordGesture(st, 'pinch-in')
  st = recordGesture(st, 'swipe-left')
  ok(st.pinchSeen, 'pinch retained')
  ok(st.swipeSeen, 'swipe also seen')
}

// --- hasDemonstratedAll truth table ---
eq(hasDemonstratedAll(null), false, 'null state → not done')
eq(hasDemonstratedAll({}), false, 'empty state → not done')
eq(hasDemonstratedAll({ pinchSeen: true, swipeSeen: false }), false, 'pinch only → not done')
eq(hasDemonstratedAll({ pinchSeen: false, swipeSeen: true }), false, 'swipe only → not done')
eq(hasDemonstratedAll({ pinchSeen: true, swipeSeen: true }), true, 'both → done')

console.log('PASS: mobileGestureHint — gating, seen flag (storage + throws + null), gesture state machine, demonstration predicate')
