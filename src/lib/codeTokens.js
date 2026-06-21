// Minimal syntax-token splitter for the read-only preset viewer.
// We don't need a real JS parser — just enough to colour comments,
// strings, numbers, and keywords distinctly so the dense preset
// closures are scannable. Anything we can't classify falls through as
// plain text.
//
// Returns an array of [type, text] tuples. Types are intentionally
// limited so the consumer can map them to ~5 colours.

const KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for',
  'while', 'break', 'continue', 'new', 'class', 'this', 'true', 'false',
  'null', 'undefined', 'try', 'catch', 'throw', 'switch', 'case',
  'default', 'do', 'of', 'in', 'typeof', 'instanceof', 'async', 'await',
])

// Recognise typical particle-fn callbacks so users immediately see the
// "API surface" their code is touching.
const BUILTINS = new Set([
  'addControl', 'setInfo', 'target', 'color', 'controls', 'time',
  'count', 'THREE', 'Math', 'i',
])

export function tokenize(source) {
  if (typeof source !== 'string' || source.length === 0) return []
  const tokens = []
  let i = 0
  const n = source.length

  while (i < n) {
    const ch = source[i]

    // Line comment
    if (ch === '/' && source[i + 1] === '/') {
      let j = i + 2
      while (j < n && source[j] !== '\n') j++
      tokens.push(['comment', source.slice(i, j)])
      i = j
      continue
    }
    // Block comment
    if (ch === '/' && source[i + 1] === '*') {
      let j = i + 2
      while (j < n && !(source[j] === '*' && source[j + 1] === '/')) j++
      j = Math.min(n, j + 2)
      tokens.push(['comment', source.slice(i, j)])
      i = j
      continue
    }
    // String (single, double, backtick) — naive (no template-expr split)
    if (ch === '"' || ch === '\'' || ch === '`') {
      const quote = ch
      let j = i + 1
      while (j < n && source[j] !== quote) {
        if (source[j] === '\\' && j + 1 < n) j += 2
        else j++
      }
      j = Math.min(n, j + 1)
      tokens.push(['string', source.slice(i, j)])
      i = j
      continue
    }
    // Number (decimal / hex)
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(source[i + 1] || ''))) {
      let j = i
      if (ch === '0' && (source[i + 1] === 'x' || source[i + 1] === 'X')) {
        j = i + 2
        while (j < n && /[0-9a-fA-F]/.test(source[j])) j++
      } else {
        while (j < n && /[0-9.eE_]/.test(source[j])) j++
      }
      tokens.push(['number', source.slice(i, j)])
      i = j
      continue
    }
    // Identifier / keyword / builtin
    if (/[a-zA-Z_$]/.test(ch)) {
      let j = i + 1
      while (j < n && /[a-zA-Z0-9_$]/.test(source[j])) j++
      const word = source.slice(i, j)
      const type = KEYWORDS.has(word) ? 'keyword'
        : BUILTINS.has(word) ? 'builtin'
        : 'ident'
      tokens.push([type, word])
      i = j
      continue
    }
    // Whitespace
    if (/\s/.test(ch)) {
      let j = i + 1
      while (j < n && /\s/.test(source[j])) j++
      tokens.push(['ws', source.slice(i, j)])
      i = j
      continue
    }
    // Punctuation / operators — group runs of operator chars together
    if (/[+\-*/=<>!&|^%~?:,;.(){}[\]]/.test(ch)) {
      tokens.push(['punct', ch])
      i++
      continue
    }
    // Fallback: pass through as plain text so we never drop a byte.
    tokens.push(['text', ch])
    i++
  }
  return tokens
}

// Sum the lengths of all tokens — used in tests to confirm round-trip
// preservation (token text never lost or duplicated).
export function tokenLength(tokens) {
  let n = 0
  for (const [, t] of tokens) n += t.length
  return n
}

// Reassemble the original source from a token list. Verifies the
// tokenizer is faithful when wired to a "show original" toggle.
export function joinTokens(tokens) {
  let out = ''
  for (const [, t] of tokens) out += t
  return out
}
