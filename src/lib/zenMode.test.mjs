// zenMode: cursor-idle decision + key reducer for distraction-free mode.
import {
  CURSOR_IDLE_MS, ZEN_BODY_CLASS,
  shouldHideCursor, cursorVisibleRemaining, classifyZenKey, nextZenState,
} from './zenMode.js'

let passed = 0
function fail(m) { console.error(`FAIL: ${m}`); process.exit(1) }
function ok(cond, m) { if (!cond) fail(m); else passed++ }
function eq(a, b, m) { if (a !== b) fail(`${m} — got ${a} expected ${b}`); else passed++ }
function near(a, b, m, eps = 0.001) { if (Math.abs(a - b) > eps) fail(`${m} — got ${a} expected ${b}`); else passed++ }

// --- constants ---
ok(CURSOR_IDLE_MS >= 1000, 'idle window at least 1s')
eq(ZEN_BODY_CLASS, 'zen-mode', 'body class name stable')

// --- shouldHideCursor ---
// Not in zen → never hide.
eq(shouldHideCursor(false, 0, 999999), false, 'not zen → cursor visible')
// In zen, just moved → visible.
eq(shouldHideCursor(true, 1000, 1000), false, 'just moved → visible')
eq(shouldHideCursor(true, 1000, 1000 + CURSOR_IDLE_MS - 1), false, 'within idle window → visible')
// In zen, idle past the window → hidden.
eq(shouldHideCursor(true, 1000, 1000 + CURSOR_IDLE_MS), true, 'at idle threshold → hidden')
eq(shouldHideCursor(true, 1000, 1000 + CURSOR_IDLE_MS + 5000), true, 'well past idle → hidden')
// Custom idle window.
eq(shouldHideCursor(true, 0, 500, 1000), false, '0.5s into a 1s window → visible')
eq(shouldHideCursor(true, 0, 1000, 1000), true, 'at custom window → hidden')
// Defensive: bad timestamps never hide (don't trap the user).
eq(shouldHideCursor(true, NaN, 5000), false, 'NaN lastMove → visible')
eq(shouldHideCursor(true, 1000, NaN), false, 'NaN now → visible')
eq(shouldHideCursor(true, 1000, 5000, 0), false, 'zero idle window → visible')
eq(shouldHideCursor(true, 1000, 5000, -100), false, 'negative idle → visible')

// --- cursorVisibleRemaining ---
near(cursorVisibleRemaining(1000, 1000, 2600), 2600, 'fresh move → full window remaining')
near(cursorVisibleRemaining(1000, 2300, 2600), 1300, 'partway → remaining decreases')
near(cursorVisibleRemaining(1000, 1000 + 2600, 2600), 0, 'at threshold → 0 remaining')
near(cursorVisibleRemaining(1000, 9999999, 2600), 0, 'long idle → 0 (clamped)')
near(cursorVisibleRemaining(NaN, 1000, 2600), 0, 'NaN → 0')
// Remaining never exceeds the window (e.g. now < last from clock skew).
near(cursorVisibleRemaining(5000, 1000, 2600), 2600, 'now<last clamps to full window')

// --- classifyZenKey ---
eq(classifyZenKey('KeyZ'), 'toggle', 'Z toggles')
eq(classifyZenKey('Escape'), 'exit', 'Escape exits')
eq(classifyZenKey('KeyA'), null, 'other key → null')
eq(classifyZenKey('Space'), null, 'space → null')
eq(classifyZenKey(''), null, 'empty → null')
eq(classifyZenKey(undefined), null, 'undefined → null')

// --- nextZenState reducer ---
eq(nextZenState(false, 'toggle'), true, 'toggle off→on')
eq(nextZenState(true, 'toggle'), false, 'toggle on→off')
eq(nextZenState(true, 'exit'), false, 'exit while on → off')
eq(nextZenState(false, 'exit'), false, 'exit while off → stays off')
eq(nextZenState(true, null), true, 'no key → unchanged (on)')
eq(nextZenState(false, null), false, 'no key → unchanged (off)')

// --- integration: a realistic key + idle sequence ---
{
  let zen = false
  // Press Z → enter zen.
  zen = nextZenState(zen, classifyZenKey('KeyZ'))
  eq(zen, true, 'Z enters zen')
  // Cursor moves at t=0, then sits still.
  const moveT = 0
  eq(shouldHideCursor(zen, moveT, 1000), false, '1s still → cursor visible')
  eq(shouldHideCursor(zen, moveT, CURSOR_IDLE_MS + 1), true, 'past window → cursor hidden')
  // Press Escape → exit zen; cursor must come back regardless of idle.
  zen = nextZenState(zen, classifyZenKey('Escape'))
  eq(zen, false, 'Escape exits zen')
  eq(shouldHideCursor(zen, moveT, 999999), false, 'out of zen → cursor always visible')
}

// --- purity: helpers take primitives, nothing to mutate, but verify
//     repeated calls are stable ---
{
  const a = shouldHideCursor(true, 100, 100 + CURSOR_IDLE_MS)
  const b = shouldHideCursor(true, 100, 100 + CURSOR_IDLE_MS)
  eq(a, b, 'shouldHideCursor deterministic')
}

console.log(`PASS: zenMode — ${passed} assertions (cursor idle decision, key reducer, integration)`)
