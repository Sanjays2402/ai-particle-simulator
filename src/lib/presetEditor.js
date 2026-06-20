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

// Result shape: { ok: bool, error?: string, warnings?: string[] }
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
    return { ok: false, error: `Syntax error: ${formatError(err)}` }
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
