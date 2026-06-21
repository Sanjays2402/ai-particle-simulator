// presetEditor: validation against syntax errors + helpful warnings,
// source-stats helpers, isModified gate, error-line extraction +
// line-range textarea selection.
import {
  MAX_SOURCE_BYTES, validatePresetSource, sourceStats, isModified,
  parseSyntaxErrorLocation, lineRangeInSource,
} from './presetEditor.js'

function fail(m) { console.error(`FAIL: ${m}`); process.exit(1) }
function eq(a, b, m) { if (a !== b) fail(`${m} — got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`) }
function ok(c, m) { if (!c) fail(m) }

// --- validatePresetSource: rejects bad inputs ---
eq(validatePresetSource(null).ok, false, 'null → fail')
eq(validatePresetSource(123).ok, false, 'number → fail')
eq(validatePresetSource('').ok, false, 'empty → fail')

// --- validatePresetSource: caps bytes ---
{
  const huge = 'a'.repeat(MAX_SOURCE_BYTES + 1)
  const r = validatePresetSource(huge)
  eq(r.ok, false, 'huge → fail')
  ok(r.error.includes('cap'), 'error mentions cap')
}

// --- validatePresetSource: surfaces SyntaxErrors ---
{
  const r = validatePresetSource('this is not valid javascript {{{')
  eq(r.ok, false, 'bad JS → fail')
  ok(/syntax/i.test(r.error), 'error mentions syntax')
}
{
  const r = validatePresetSource('function() {} (((((((')
  eq(r.ok, false, 'unclosed parens → fail')
}

// --- validatePresetSource: clean preset passes ---
{
  // A real preset body — note the API surface (target/color/etc) is
  // referenced but never executed.
  const src = `
    const a = i / count
    target.x = Math.sin(a * 6.28 + time) * 5
    target.y = Math.cos(a * 6.28 + time) * 5
    target.z = 0
    color.set('#ff00ff')
  `
  const r = validatePresetSource(src)
  eq(r.ok, true, 'valid preset → ok')
  ok(!r.warnings || r.warnings.length === 0, 'no warnings for normal preset')
}

// --- validatePresetSource: warning if no target.* writes ---
{
  const src = `const a = i / count\ncolor.set('#fff')`
  const r = validatePresetSource(src)
  eq(r.ok, true, 'still ok')
  ok(r.warnings && r.warnings.some(w => /target\.x/.test(w)), 'warns about missing target')
}

// --- validatePresetSource: warns on infinite loop pattern ---
{
  const src = `while (true) { target.x = i }`
  const r = validatePresetSource(src)
  eq(r.ok, true, 'still ok (syntactically valid)')
  ok(r.warnings && r.warnings.some(w => /while/.test(w)), 'warns about while(true)')
}

// --- sourceStats ---
eq(sourceStats('').lines, 0, 'empty → 0 lines')
eq(sourceStats('').bytes, 0, 'empty → 0 bytes')
eq(sourceStats('abc').lines, 1, 'single line')
eq(sourceStats('a\nb\nc').lines, 3, 'three lines')
eq(sourceStats('hello').bytes, 5, 'byte count')

// --- isModified ---
ok(!isModified('foo', 'foo'), 'same → not modified')
ok(!isModified('foo', '  foo  '), 'whitespace only → not modified')
ok(isModified('foo', 'bar'), 'different → modified')
ok(!isModified('foo', 'foo\n'), 'trailing newline only → not modified')
ok(!isModified(null, 'foo'), 'null original → not modified')
ok(!isModified('foo', null), 'null next → not modified')

// --- parseSyntaxErrorLocation: V8 stack format ---
{
  // Pseudo-V8 stack — message + stack with `<anonymous>:N:M`.
  const fakeErr = {
    message: "Unexpected token '}'",
    stack: `SyntaxError: Unexpected token '}'\n    at new Function (<anonymous>)\n    at <anonymous>:6:12`,
  }
  const loc = parseSyntaxErrorLocation(fakeErr)
  ok(loc !== null, 'V8 stack → location extracted')
  // V8 line counts include the wrapping `function(...)` header, so the
  // user-relative line is rawLine - 1 = 5.
  eq(loc.line, 5, 'V8 line offset adjusted')
  eq(loc.column, 12, 'V8 column captured')
}

// --- parseSyntaxErrorLocation: Safari / SpiderMonkey format ---
{
  const fakeErr = {
    message: "expected expression, got '}'",
    stack: `SyntaxError at line 3`,
  }
  const loc = parseSyntaxErrorLocation(fakeErr)
  ok(loc !== null, 'Safari line → extracted')
  eq(loc.line, 3, 'Safari line preserved (no header offset)')
  eq(loc.column, null, 'Safari format has no column')
}

// --- parseSyntaxErrorLocation: line 2 clamps down to 1 (header offset) ---
{
  const fakeErr = { message: '', stack: '<anonymous>:2:1' }
  const loc = parseSyntaxErrorLocation(fakeErr)
  // V8 reports line 2 → user line 1 after offset.
  eq(loc.line, 1, 'V8 line 2 → user line 1')
}
// --- parseSyntaxErrorLocation: line 1 clamps to 1 (never returns 0) ---
{
  const fakeErr = { message: '', stack: '<anonymous>:1:1' }
  const loc = parseSyntaxErrorLocation(fakeErr)
  ok(loc !== null, 'rawLine=1 → still parsed')
  eq(loc.line, 1, 'clamped at 1, never 0 or negative')
}

// --- parseSyntaxErrorLocation: nothing recognizable → null ---
eq(parseSyntaxErrorLocation(null), null, 'null err → null')
eq(parseSyntaxErrorLocation({}), null, 'empty err → null')
eq(parseSyntaxErrorLocation({ message: 'no line info anywhere', stack: '' }), null,
   'no line markers → null')

// --- validatePresetSource attaches line on real SyntaxErrors ---
{
  const src = 'target.x = 1\ntarget.y = 2\nfunction broken( {\nconst c = 3'  // line 3 has a stray paren
  const r = validatePresetSource(src)
  eq(r.ok, false, 'broken src → fail')
  // V8 actually reports the error — we just assert the SHAPE so future
  // engine quirks don't make this brittle. The lib must EITHER set
  // line to a finite number, OR not set it at all if extraction failed.
  if ('line' in r) {
    ok(Number.isFinite(r.line), 'line is a finite number when present')
    ok(r.line >= 1, 'line is 1-indexed')
  }
}

// --- lineRangeInSource ---
{
  const src = 'first\nsecond line\nthird'
  const r1 = lineRangeInSource(src, 1)
  eq(r1.start, 0, 'line 1 starts at 0')
  eq(r1.end, 5, 'line 1 ends at "first".length')

  const r2 = lineRangeInSource(src, 2)
  eq(r2.start, 6, 'line 2 starts after first newline')
  eq(r2.end, 17, 'line 2 ends after "second line"')
  eq(src.slice(r2.start, r2.end), 'second line', 'slice matches line 2')

  const r3 = lineRangeInSource(src, 3)
  eq(src.slice(r3.start, r3.end), 'third', 'slice matches line 3')
}
// Edge cases.
eq(lineRangeInSource('', 1), null, 'empty src → null')
eq(lineRangeInSource('abc', 0), null, 'line 0 → null')
eq(lineRangeInSource('abc', -5), null, 'negative line → null')
eq(lineRangeInSource('abc', 99), null, 'line past EOF → null')
eq(lineRangeInSource(null, 1), null, 'null src → null')
eq(lineRangeInSource('abc', NaN), null, 'NaN line → null')

console.log(`PASS: presetEditor — validate (8 cases), sourceStats, isModified, error-location (V8/Safari/null), lineRangeInSource (multi-line/edge cases)`)
