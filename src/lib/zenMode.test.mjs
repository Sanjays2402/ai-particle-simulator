// zenMode: cursor-idle decision + key reducer for distraction-free mode.
import {
  CURSOR_IDLE_MS, ZEN_BODY_CLASS,
  shouldHideCursor, cursorVisibleRemaining, classifyZenKey, nextZenState,
  // R42.E — zen "Now Playing" overlay label formatting
  NOW_PLAYING_MAX_LEN, formatNowPlaying,
  // R43.E — zen "Now Playing" theme line
  THEME_LABEL_MAX_LEN, formatThemeName,
  // R44.E — zen "Now Playing" framing line
  FRAMING_LABEL_MAX_LEN, formatFramingLabel,
  // R45.E — composition-grid line
  GRID_LABEL_MAX_LEN, formatGridLabel,
  // R46.E — grid line spiral-orientation detail
  formatGridDetail,
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

// === R35.E: zen auto-orbit (ambient display) =========================
const r35e = await import('./zenMode.js')
const {
  ZEN_AUTO_ORBIT_SPEED, ZEN_ORBIT_IDLE_MS, ZEN_ORBIT_RAMP_MS,
  shouldZenAutoOrbit, zenOrbitSpeed,
} = r35e

// --- constants ---
ok(ZEN_AUTO_ORBIT_SPEED > 0 && ZEN_AUTO_ORBIT_SPEED < 2, 'ambient orbit speed is slow + positive')
ok(ZEN_ORBIT_IDLE_MS > CURSOR_IDLE_MS, 'orbit idle window is longer than the cursor-hide one')
ok(ZEN_ORBIT_RAMP_MS > 0, 'ramp window positive')

// --- shouldZenAutoOrbit ---
eq(shouldZenAutoOrbit(false, true, 0, 999999), false, 'not in zen → no orbit')
eq(shouldZenAutoOrbit(true, false, 0, 999999), false, 'preference off → no orbit')
eq(shouldZenAutoOrbit(true, true, 1000, 1000), false, 'just interacted → no orbit')
eq(shouldZenAutoOrbit(true, true, 1000, 1000 + ZEN_ORBIT_IDLE_MS - 1), false, 'within idle window → no orbit')
eq(shouldZenAutoOrbit(true, true, 1000, 1000 + ZEN_ORBIT_IDLE_MS), true, 'at idle threshold → orbit')
eq(shouldZenAutoOrbit(true, true, 1000, 1000 + ZEN_ORBIT_IDLE_MS + 9000), true, 'well past idle → orbit')
// custom idle window.
eq(shouldZenAutoOrbit(true, true, 0, 800, 1000), false, '0.8s into a 1s window → no orbit')
eq(shouldZenAutoOrbit(true, true, 0, 1000, 1000), true, 'at custom window → orbit')
// defensive: bad timestamps never orbit.
eq(shouldZenAutoOrbit(true, true, NaN, 5000), false, 'NaN lastInteract → no orbit')
eq(shouldZenAutoOrbit(true, true, 1000, NaN), false, 'NaN now → no orbit')
eq(shouldZenAutoOrbit(true, true, 1000, 5000, -1), false, 'negative idle → no orbit')

// --- zenOrbitSpeed: ramp ---
{
  const opts = { idleMs: 1000, rampMs: 2000, maxSpeed: 0.4 }
  // before the idle threshold → 0.
  eq(zenOrbitSpeed(true, true, 0, 500, opts), 0, 'pre-threshold → 0 speed')
  eq(zenOrbitSpeed(true, true, 0, 1000, opts), 0, 'exactly at threshold → 0 (ramp just begins)')
  // halfway through the ramp → half speed.
  near(zenOrbitSpeed(true, true, 0, 2000, opts), 0.2, 'halfway ramp → half max speed', 0.001)
  // ramp complete → full speed.
  near(zenOrbitSpeed(true, true, 0, 3000, opts), 0.4, 'ramp done → full speed', 0.001)
  // past ramp stays clamped at full.
  near(zenOrbitSpeed(true, true, 0, 9000, opts), 0.4, 'past ramp → still full (clamped)', 0.001)
}
// off conditions → 0 speed.
eq(zenOrbitSpeed(false, true, 0, 999999), 0, 'not zen → 0 speed')
eq(zenOrbitSpeed(true, false, 0, 999999), 0, 'preference off → 0 speed')
// zero ramp → instant full speed once orbiting.
{
  const opts = { idleMs: 1000, rampMs: 0, maxSpeed: 0.5 }
  eq(zenOrbitSpeed(true, true, 0, 500, opts), 0, 'zero ramp, pre-threshold → 0')
  near(zenOrbitSpeed(true, true, 0, 1000, opts), 0.5, 'zero ramp → instant full at threshold', 0.001)
}
// defaults applied when opts omitted.
{
  const v = zenOrbitSpeed(true, true, 0, ZEN_ORBIT_IDLE_MS + ZEN_ORBIT_RAMP_MS)
  near(v, ZEN_AUTO_ORBIT_SPEED, 'default opts ramp to the default max speed', 0.001)
}

// --- monotonic: speed never decreases as stillness grows ---
{
  let prev = -1
  for (let t = 0; t <= 8000; t += 250) {
    const v = zenOrbitSpeed(true, true, 0, t, { idleMs: 1000, rampMs: 2000, maxSpeed: 0.4 })
    ok(v >= prev - 1e-9, `orbit speed monotonic up at t=${t}`)
    prev = v
  }
  near(prev, 0.4, 'sweep reaches full speed')
}

// --- interaction resets the orbit (speed drops back to 0) ---
{
  const opts = { idleMs: 1000, rampMs: 2000, maxSpeed: 0.4 }
  // orbiting at full speed...
  near(zenOrbitSpeed(true, true, 0, 3000, opts), 0.4, 'orbiting at full before interaction')
  // ...user interacts at t=3000 (lastInteract jumps to 3000); now at 3100 → back to 0.
  eq(zenOrbitSpeed(true, true, 3000, 3100, opts), 0, 'interaction resets orbit to 0')
}

// --- R42.E: formatNowPlaying — zen now-playing label ---
{
  // happy path: a normal name passes through.
  eq(formatNowPlaying('Nebula Drift'), 'Nebula Drift', 'normal name passes through')
  // trims surrounding whitespace.
  eq(formatNowPlaying('  Aurora  '), 'Aurora', 'trims whitespace')
  // collapses internal whitespace runs.
  eq(formatNowPlaying('Solar\n  Flare'), 'Solar Flare', 'collapses internal whitespace')
  eq(formatNowPlaying('a\t\tb'), 'a b', 'collapses tabs')
  // empty / whitespace / non-string → fallback.
  eq(formatNowPlaying(''), 'Untitled', 'empty → fallback')
  eq(formatNowPlaying('   '), 'Untitled', 'whitespace-only → fallback')
  eq(formatNowPlaying(null), 'Untitled', 'null → fallback')
  eq(formatNowPlaying(undefined), 'Untitled', 'undefined → fallback')
  eq(formatNowPlaying(42), 'Untitled', 'number → fallback')
  eq(formatNowPlaying({}), 'Untitled', 'object → fallback')
  // custom fallback honoured.
  eq(formatNowPlaying('', { fallback: 'No preset' }), 'No preset', 'custom fallback')
  // truncation: over-long names get an ellipsis, bounded to maxLen.
  {
    const long = 'X'.repeat(80)
    const out = formatNowPlaying(long)
    ok(out.length <= NOW_PLAYING_MAX_LEN, `truncated within maxLen — got ${out.length}`)
    ok(out.endsWith('\u2026'), 'truncated name ends with ellipsis')
  }
  // a name exactly at maxLen is NOT truncated.
  {
    const exact = 'Y'.repeat(NOW_PLAYING_MAX_LEN)
    eq(formatNowPlaying(exact), exact, 'name exactly maxLen not truncated')
  }
  // one over maxLen IS truncated + bounded.
  {
    const over = 'Z'.repeat(NOW_PLAYING_MAX_LEN + 1)
    const out = formatNowPlaying(over)
    eq(out.length, NOW_PLAYING_MAX_LEN, 'one-over truncates to exactly maxLen')
    ok(out.endsWith('\u2026'), 'ends with ellipsis')
  }
  // custom maxLen honoured.
  {
    const out = formatNowPlaying('abcdefghij', { maxLen: 5 })
    eq(out.length, 5, 'custom maxLen bounds length')
    ok(out.endsWith('\u2026'), 'custom maxLen still ellipsizes')
  }
  // degenerate maxLen of 1 → just the ellipsis.
  eq(formatNowPlaying('abcdef', { maxLen: 1 }), '\u2026', 'maxLen 1 → lone ellipsis')
  // invalid maxLen falls back to the default.
  {
    const long = 'Q'.repeat(80)
    const out = formatNowPlaying(long, { maxLen: -3 })
    ok(out.length <= NOW_PLAYING_MAX_LEN, 'invalid maxLen → default budget')
  }
  // trailing space before ellipsis is trimmed (no "word …").
  {
    const out = formatNowPlaying('Hello ' + 'w'.repeat(60), { maxLen: 7 })
    ok(!out.includes(' \u2026'), 'no dangling space before ellipsis')
  }
}

// --- R43.E: formatThemeName -------------------------------------------
{
  // Title-cases a lowercase theme id.
  eq(formatThemeName('vaporwave'), 'Vaporwave', 'single-word theme title-cased')
  eq(formatThemeName('neon'), 'Neon', 'neon → Neon')
  eq(formatThemeName('deep sea'), 'Deep Sea', 'multi-word theme title-cased')
  // trims + collapses whitespace.
  eq(formatThemeName('  arctic  '), 'Arctic', 'trims surrounding whitespace')
  eq(formatThemeName('deep   sea'), 'Deep Sea', 'collapses internal whitespace')
  // non-string / empty → fallback.
  eq(formatThemeName(''), 'Default', 'empty → Default')
  eq(formatThemeName('   '), 'Default', 'whitespace-only → Default')
  eq(formatThemeName(null), 'Default', 'null → Default')
  eq(formatThemeName(42), 'Default', 'number → Default')
  // custom fallback honoured.
  eq(formatThemeName('', { fallback: 'Theme' }), 'Theme', 'custom fallback used')
  // truncation bounded to maxLen with ellipsis.
  {
    const out = formatThemeName('x'.repeat(40))
    ok(out.length <= THEME_LABEL_MAX_LEN, `theme label within maxLen — got ${out.length}`)
    ok(out.endsWith('\u2026'), 'over-long theme label ellipsized')
  }
  // exactly at maxLen → not truncated.
  {
    const exact = 'y'.repeat(THEME_LABEL_MAX_LEN)
    eq(formatThemeName(exact), 'Y' + 'y'.repeat(THEME_LABEL_MAX_LEN - 1), 'exactly maxLen not truncated')
  }
  // custom maxLen honoured.
  {
    const out = formatThemeName('abcdefghij', { maxLen: 5 })
    eq(out.length, 5, 'custom maxLen bounds the theme label')
    ok(out.endsWith('\u2026'), 'custom maxLen ellipsizes')
  }
  eq(formatThemeName('abcdef', { maxLen: 1 }), '\u2026', 'maxLen 1 → lone ellipsis')
}

// --- R44.E: framing label for the Now-Playing card ---
{
  // a normal frame label passes through trimmed.
  eq(formatFramingLabel('2.39'), '2.39', 'plain frame label kept')
  eq(formatFramingLabel('16:9'), '16:9', 'aspect label kept')
  eq(formatFramingLabel('  1.78  '), '1.78', 'surrounding whitespace trimmed')
  eq(formatFramingLabel('4  :  5'), '4 : 5', 'internal whitespace collapsed')
  // "off" / "none" / empty → '' so the card omits the line.
  eq(formatFramingLabel('Off'), '', 'Off → empty (no line)')
  eq(formatFramingLabel('off'), '', 'off lowercase → empty')
  eq(formatFramingLabel('NONE'), '', 'None (any case) → empty')
  eq(formatFramingLabel(''), '', 'empty → empty')
  eq(formatFramingLabel('   '), '', 'whitespace-only → empty')
  // non-string → '' (caller omits).
  eq(formatFramingLabel(null), '', 'null → empty')
  eq(formatFramingLabel(42), '', 'number → empty')
  eq(formatFramingLabel(undefined), '', 'undefined → empty')
  // optional prefix prepended.
  eq(formatFramingLabel('2.39', { prefix: 'Frame' }), 'Frame 2.39', 'prefix prepended')
  eq(formatFramingLabel('Off', { prefix: 'Frame' }), '', 'prefix not applied to an off frame')
  // truncation bounded to maxLen with ellipsis.
  {
    const out = formatFramingLabel('1'.repeat(40))
    ok(out.length <= FRAMING_LABEL_MAX_LEN, `framing label within maxLen — got ${out.length}`)
    ok(out.endsWith('\u2026'), 'over-long framing label ellipsized')
  }
  // custom maxLen honoured.
  {
    const out = formatFramingLabel('abcdefghij', { maxLen: 5 })
    eq(out.length, 5, 'custom maxLen bounds the framing label')
    ok(out.endsWith('\u2026'), 'custom maxLen ellipsizes')
  }
  eq(formatFramingLabel('abcdef', { maxLen: 1 }), '\u2026', 'maxLen 1 → lone ellipsis')
  // exactly at maxLen → not truncated.
  {
    const exact = 'x'.repeat(FRAMING_LABEL_MAX_LEN)
    eq(formatFramingLabel(exact), exact, 'exactly maxLen not truncated')
  }
}

// --- R45.E: composition-grid label for the Now-Playing card ---
{
  // a normal grid label passes through trimmed.
  eq(formatGridLabel('Thirds'), 'Thirds', 'plain grid label kept')
  eq(formatGridLabel('Cross'), 'Cross', 'cross label kept')
  eq(formatGridLabel('  Spiral  '), 'Spiral', 'surrounding whitespace trimmed')
  eq(formatGridLabel('Power  Points'), 'Power Points', 'internal whitespace collapsed')
  // "off" / "none" / empty → '' so the card omits the line.
  eq(formatGridLabel('Off'), '', 'Off → empty (no line)')
  eq(formatGridLabel('off'), '', 'off lowercase → empty')
  eq(formatGridLabel('NONE'), '', 'None (any case) → empty')
  eq(formatGridLabel(''), '', 'empty → empty')
  eq(formatGridLabel('   '), '', 'whitespace-only → empty')
  // non-string → '' (caller omits).
  eq(formatGridLabel(null), '', 'null → empty')
  eq(formatGridLabel(42), '', 'number → empty')
  eq(formatGridLabel(undefined), '', 'undefined → empty')
  // optional prefix prepended.
  eq(formatGridLabel('Thirds', { prefix: 'Grid' }), 'Grid Thirds', 'prefix prepended')
  eq(formatGridLabel('Off', { prefix: 'Grid' }), '', 'prefix not applied to an off grid')
  // truncation bounded to maxLen with ellipsis.
  {
    const out = formatGridLabel('g'.repeat(40))
    ok(out.length <= GRID_LABEL_MAX_LEN, `grid label within maxLen — got ${out.length}`)
    ok(out.endsWith('\u2026'), 'over-long grid label ellipsized')
  }
  // custom maxLen honoured.
  {
    const out = formatGridLabel('abcdefghij', { maxLen: 5 })
    eq(out.length, 5, 'custom maxLen bounds the grid label')
    ok(out.endsWith('\u2026'), 'custom maxLen ellipsizes')
  }
  eq(formatGridLabel('abcdef', { maxLen: 1 }), '\u2026', 'maxLen 1 → lone ellipsis')
  // exactly at maxLen → not truncated.
  {
    const exact = 'g'.repeat(GRID_LABEL_MAX_LEN)
    eq(formatGridLabel(exact), exact, 'exactly maxLen not truncated')
  }
}

// --- R46.E: grid line spiral-orientation detail ---
{
  // base + detail → "<label> · <detail>".
  eq(formatGridDetail('Spiral', 'Top-left', { maxLen: 26 }), 'Spiral \u00b7 Top-left', 'spiral + corner combined')
  eq(formatGridDetail('Spiral', 'Bottom-right', { maxLen: 26 }), 'Spiral \u00b7 Bottom-right', 'longest corner fits at maxLen 26')
  // a blank / non-string detail → just the formatted base label.
  eq(formatGridDetail('Thirds', ''), 'Thirds', 'empty detail → base label only')
  eq(formatGridDetail('Thirds', '   '), 'Thirds', 'whitespace-only detail → base label only')
  eq(formatGridDetail('Thirds', null), 'Thirds', 'null detail → base label only')
  eq(formatGridDetail('Thirds', 42), 'Thirds', 'non-string detail → base label only')
  // a blank / off base → '' (caller omits the line) regardless of detail.
  eq(formatGridDetail('Off', 'Top-left'), '', 'off base → empty even with a detail')
  eq(formatGridDetail('', 'Top-left'), '', 'empty base → empty')
  eq(formatGridDetail(null, 'Top-left'), '', 'non-string base → empty')
  // detail trimmed + internal whitespace collapsed.
  eq(formatGridDetail('Spiral', '  Top   left  ', { maxLen: 26 }), 'Spiral \u00b7 Top left', 'detail trimmed + collapsed')
  // the WHOLE combined string is bounded by maxLen with an ellipsis.
  {
    const out = formatGridDetail('Spiral', 'x'.repeat(40), { maxLen: 14 })
    ok(out.length <= 14, `grid detail within maxLen — got ${out.length}`)
    ok(out.endsWith('\u2026'), 'over-long grid detail ellipsized')
  }
  // default maxLen (GRID_LABEL_MAX_LEN) still applies when none passed.
  {
    const out = formatGridDetail('Spiral', 'y'.repeat(40))
    ok(out.length <= GRID_LABEL_MAX_LEN, 'default maxLen bounds the combined detail')
  }
  eq(formatGridDetail('Spiral', 'Top', { maxLen: 1 }), '\u2026', 'maxLen 1 → lone ellipsis')
}

console.log(`PASS: zenMode — ${passed} assertions (cursor idle decision, key reducer, integration, R35.E auto-orbit ramp, R42.E now-playing label, R43.E theme label, R44.E framing label, R45.E grid label, R46.E grid spiral detail)`)
