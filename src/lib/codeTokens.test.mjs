// codeTokens: verify round-trip preservation, keyword / number / string
// classification, and comment handling. The tokenizer is naive on
// purpose — the goal is *colour*, not parsing — so the contract is
// "every byte comes back out" rather than "AST is correct".
import { tokenize, joinTokens, tokenLength } from './codeTokens.js'

function assertEq(actual, expected, msg) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected)
  if (a !== b) {
    console.error(`FAIL: ${msg} — got ${a} expected ${b}`)
    process.exit(1)
  }
}

// 1. Empty / bad input.
assertEq(tokenize(''), [], 'empty string')
assertEq(tokenize(null), [], 'null input')
assertEq(tokenize(123), [], 'number input')

// 2. Round-trip: joining tokens reproduces the source exactly.
const samples = [
  'const x = 42',
  'function setup() { addControl("speed", "Speed", 0, 10, 1) }',
  '// hi there\nconst y = 1.5e3',
  'target.set(Math.cos(time * 2), Math.sin(time * 2), 0)',
  'color.setHSL((i / count + time * 0.1) % 1, 1, 0.5)',
  '/* block\ncomment */ const z = 0x1f',
  'const s = "hello\\nworld"',
  '`template ${literal}`',
]
for (const s of samples) {
  const toks = tokenize(s)
  assertEq(joinTokens(toks), s, `round-trip "${s.slice(0, 24)}"`)
  assertEq(tokenLength(toks), s.length, 'total length preserved')
}

// 3. Keyword detection.
{
  const toks = tokenize('const x = function() { return 0 }')
  const kinds = toks.filter(([k, t]) => k === 'keyword').map(([, t]) => t)
  assertEq(kinds, ['const', 'function', 'return'], 'keywords flagged')
}

// 4. Comment + string + number classification.
{
  const toks = tokenize('// hi\nconst n = 0.5; const s = "x"')
  const hasComment = toks.some(([k]) => k === 'comment')
  const hasString = toks.some(([k]) => k === 'string')
  const hasNumber = toks.some(([k]) => k === 'number')
  if (!hasComment || !hasString || !hasNumber) {
    console.error('FAIL: missing comment/string/number classification')
    process.exit(1)
  }
}

// 5. Builtin recognition for particle-fn callbacks.
{
  const toks = tokenize('addControl("a", "A", 0, 1, 0.5); target.set(0, 0, 0)')
  const builtins = toks.filter(([k]) => k === 'builtin').map(([, t]) => t)
  if (!builtins.includes('addControl') || !builtins.includes('target')) {
    console.error('FAIL: builtins not recognised')
    process.exit(1)
  }
}

// 6. Hex number stays a single token (not split into 0 + xff).
{
  const toks = tokenize('const c = 0xff00aa')
  const numbers = toks.filter(([k]) => k === 'number').map(([, t]) => t)
  assertEq(numbers, ['0xff00aa'], 'hex stays whole')
}

// 7. Multi-line block comment doesn't swallow the rest of the file.
{
  const toks = tokenize('/* a */ const x = 1\nconst y = 2')
  const comments = toks.filter(([k]) => k === 'comment').map(([, t]) => t)
  assertEq(comments, ['/* a */'], 'block comment closes correctly')
  const idents = toks.filter(([k]) => k === 'ident').map(([, t]) => t)
  if (!idents.includes('x') || !idents.includes('y')) {
    console.error('FAIL: idents after block comment lost')
    process.exit(1)
  }
}

console.log('PASS: codeTokens round-trip + keyword/builtin/number/comment')
