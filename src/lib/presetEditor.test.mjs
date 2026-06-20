// presetEditor: validation against syntax errors + helpful warnings,
// source-stats helpers, isModified gate.
import { MAX_SOURCE_BYTES, validatePresetSource, sourceStats, isModified } from './presetEditor.js'

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

console.log(`PASS: presetEditor — validate (8 cases), sourceStats, isModified`)
