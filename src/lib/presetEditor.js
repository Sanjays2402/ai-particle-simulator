// Editable preset-source helpers.
//
// When the source viewer is in Edit mode, the user types JS into a
// textarea. Before we hand the string to `loadCustomCode` (which
// compiles via `new Function` inside the store), we run a few cheap
// checks here so the UI can show a useful inline error instead of
// silently failing or crashing the render loop.
//
// We DON'T attempt to actually evaluate the code — that's
// loadCustomCode's job. We just:
//   - dry-run `new Function(...)` to surface SyntaxErrors
//   - flag obviously suspect patterns (empty, missing top-level
//     statements, exceeding a sane length cap)
//
// The function body wrap mirrors what compileParticleFn does in
// store.js: `new Function('i', 'target', 'color', 'controls', 'time',
// 'count', 'addControl', 'setInfo', code)`.

export const MAX_SOURCE_BYTES = 32 * 1024   // 32 KB — way more than any built-in
const COMPILER_ARGS = ['i', 'target', 'color', 'controls', 'time', 'count', 'addControl', 'setInfo']

// Pretty-print an Error or Error-like into a single-line message.
function formatError(err) {
  if (!err) return 'unknown error'
  if (typeof err === 'string') return err
  if (err.message) return err.message
  try { return String(err) } catch { return 'unknown error' }
}

// Parse the (1-indexed) line number out of a SyntaxError thrown by
// `new Function(...)`. V8 / Chrome / Edge / modern Node format the
// stack as e.g.:
//   SyntaxError: Unexpected token '}'
//       at new Function (<anonymous>)
//       at validatePresetSource (...presetEditor.js:38:5)
// and the parser annotates the message with `(<anonymous>:LINE:COL)`
// or `<anonymous>:LINE` further down. Safari/WebKit uses the slightly
// different "line N" prefix in the message itself.
//
// We try several patterns in order; first hit wins. Returns null when
// nothing matches so callers can fall back to "no underline, just a
// generic error".
//
// IMPORTANT: V8 wraps the body's contents in an outer `function(...) {`
// before evaluating, so the engine's reported line is OFFSET BY ONE
// from the user's source line. We subtract 1 to land on the user line.
export function parseSyntaxErrorLocation(err) {
  if (!err) return null
  const msg = (err.message || '') + ' ' + (err.stack || '')
  if (typeof msg !== 'string' || msg.length === 0) return null

  // V8 stack: "<anonymous>:N:M"
  const v8 = /<anonymous>:(\d+):(\d+)/.exec(msg)
  if (v8) {
    const rawLine = parseInt(v8[1], 10)
    const col     = parseInt(v8[2], 10)
    if (Number.isFinite(rawLine) && rawLine > 0) {
      // V8 puts the function header on line 1; the user's source starts
      // on line 2. Subtract 1 to make line numbers user-relative, and
      // clamp at 1 so we never produce a 0 or negative line.
      const line = Math.max(1, rawLine - 1)
      return { line, column: Number.isFinite(col) ? col : null }
    }
  }

  // SpiderMonkey / Safari fallback: "line N" or "at line N".
  const sm = /\bline\s+(\d+)/i.exec(msg)
  if (sm) {
    const line = parseInt(sm[1], 10)
    if (Number.isFinite(line) && line > 0) {
      // Safari starts its count at the first user line, no header
      // offset to subtract.
      return { line, column: null }
    }
  }
  return null
}

// Result shape: { ok: bool, error?: string, line?: number, column?: number, warnings?: string[] }
export function validatePresetSource(source) {
  if (typeof source !== 'string') {
    return { ok: false, error: 'Source must be a string.' }
  }
  if (source.length === 0) {
    return { ok: false, error: 'Source is empty — nothing to compile.' }
  }
  if (source.length > MAX_SOURCE_BYTES) {
    return { ok: false, error: `Source exceeds ${Math.round(MAX_SOURCE_BYTES / 1024)} KB cap.` }
  }
  // Dry-run the compile to surface SyntaxErrors without running the
  // body. `new Function` will throw on invalid JS but never executes
  // the body until we call the returned function.
  try {
    new Function(...COMPILER_ARGS, source)
  } catch (err) {
    const loc = parseSyntaxErrorLocation(err)
    const result = { ok: false, error: `Syntax error: ${formatError(err)}` }
    if (loc) {
      result.line = loc.line
      if (loc.column !== null) result.column = loc.column
    }
    return result
  }
  // Light warnings — non-blocking.
  const warnings = []
  if (!/target\s*\.\s*[xyz]/.test(source)) {
    warnings.push('No assignment to target.x / target.y / target.z detected.')
  }
  if (/\bwhile\s*\(\s*true\s*\)/.test(source)) {
    warnings.push('`while (true)` will hang the simulator.')
  }
  return warnings.length > 0
    ? { ok: true, warnings }
    : { ok: true }
}

// Helper for the UI: estimate how many lines / how many bytes the
// edit buffer takes up. Lets the chrome show "23 ln / 1.4K".
export function sourceStats(source) {
  if (typeof source !== 'string' || source.length === 0) {
    return { lines: 0, bytes: 0 }
  }
  const lines = source.split('\n').length
  return { lines, bytes: source.length }
}

// Return true when `next` differs from `original` after a trim — used
// to gate the Compile button when the user has typed nothing
// effectively different.
export function isModified(original, next) {
  if (typeof original !== 'string' || typeof next !== 'string') return false
  return original.trim() !== next.trim()
}

// Convert a 1-indexed line number into a textarea selection range.
// Used by the UI's "→ line N" button to focus the textarea at the
// failing line so the user can edit it without scrolling around.
//
// Returns null when the line doesn't exist in the source (e.g. the
// error landed past the EOF after a recent edit). Otherwise:
//   { start, end } — selectionStart/selectionEnd that span the line.
export function lineRangeInSource(source, line) {
  if (typeof source !== 'string' || source.length === 0) return null
  if (!Number.isFinite(line) || line < 1) return null
  const lines = source.split('\n')
  if (line > lines.length) return null
  // start = sum of (prev line length + 1 for the newline)
  let start = 0
  for (let i = 0; i < line - 1; i++) start += lines[i].length + 1
  const end = start + lines[line - 1].length
  return { start, end }
}
