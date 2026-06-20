// User-configurable keyboard shortcuts.
//
// The TopBar `keydown` handler is the master dispatcher — instead of
// hard-coding `e.code === 'Space'` etc, it now resolves the user's
// active binding through this module. Defaults match what the help
// overlay has documented forever, so the out-of-box behaviour is
// unchanged. Settings → Keyboard lets the user rebind any action,
// detect conflicts, and reset to defaults.
//
// Storage shape (localStorage key = STORAGE_KEY):
//   { play: 'Space', random: 'KeyR', ... }
// We persist KeyboardEvent.code (layout-independent: 'KeyR' rather
// than 'r') so QWERTY/DVORAK/AZERTY users all get the physical key
// they bound, not the character.

export const STORAGE_KEY = 'particle-keymap-v1'

// Action registry — the source of truth. The TopBar handler iterates
// this list to dispatch; the SettingsModal renders this list in order.
// Each entry: { id, label, group, defaultCode, modifiers? }
//   modifiers: { shift?, meta?, ctrl?, alt? }  (all default false)
export const ACTIONS = [
  { id: 'play',          label: 'Play / pause',                group: 'Playback', defaultCode: 'Space' },
  { id: 'random',        label: 'Random preset',               group: 'Playback', defaultCode: 'KeyR' },
  { id: 'next',          label: 'Next preset',                 group: 'Playback', defaultCode: 'ArrowRight' },
  { id: 'prev',          label: 'Previous preset',             group: 'Playback', defaultCode: 'ArrowLeft' },
  { id: 'fullscreen',    label: 'Toggle fullscreen',           group: 'View',     defaultCode: 'KeyF' },
  { id: 'favorite',      label: 'Favorite / unfavorite',       group: 'View',     defaultCode: 'KeyF',
    modifiers: { shift: true } },
  { id: 'screenshot',    label: 'Screenshot to PNG',           group: 'View',     defaultCode: 'KeyS' },
  { id: 'saveView',      label: 'Save camera view',            group: 'View',     defaultCode: 'KeyV' },
  { id: 'bookmark',      label: 'Save scene bookmark',         group: 'Tools',    defaultCode: 'KeyB' },
  { id: 'bookmarkPanel', label: 'Toggle bookmarks panel',      group: 'Tools',    defaultCode: 'KeyB',
    modifiers: { shift: true } },
  { id: 'help',          label: 'Toggle help overlay',         group: 'Tools',    defaultCode: 'Slash',
    modifiers: { shift: true } },
]

// Index for O(1) lookup by id.
const ACTION_BY_ID = new Map(ACTIONS.map(a => [a.id, a]))

// Build the default map { id -> code }. Used as fallback whenever a
// user binding is missing / invalid.
export function defaultsByAction() {
  const out = {}
  for (const a of ACTIONS) out[a.id] = a.defaultCode
  return out
}

// Load the persisted remap, merged on top of defaults. Filter to
// known action ids so stale storage from a renamed action doesn't
// blow up the dispatcher.
export function loadKeymap() {
  const base = defaultsByAction()
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    if (!raw) return base
    const parsed = JSON.parse(raw)
    for (const a of ACTIONS) {
      const v = parsed[a.id]
      if (typeof v === 'string' && v.length > 0) base[a.id] = v
    }
    return base
  } catch { return base }
}

export function saveKeymap(map) {
  if (!map || typeof map !== 'object') return
  try {
    if (typeof localStorage === 'undefined') return
    const out = {}
    for (const a of ACTIONS) {
      const v = map[a.id]
      if (typeof v === 'string' && v.length > 0) out[a.id] = v
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(out))
  } catch { /* quota / private mode */ }
}

// Reset to defaults. Returns the fresh map.
export function resetKeymap() {
  try { if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY) } catch { /* */ }
  return defaultsByAction()
}

// Look up the action triggered by a given KeyboardEvent-like object.
// Returns the action id or null. We respect modifiers — Shift+F is a
// different binding from F. We also reject events where Ctrl/Meta are
// set unless the action's modifiers asked for them, so the user can
// still Cmd+R (browser refresh) without it triggering 'random'.
export function resolveAction(map, event) {
  if (!event || typeof event.code !== 'string') return null
  const m = map || defaultsByAction()
  // Build a comparable mod fingerprint for the event.
  const evMods = {
    shift: !!event.shiftKey,
    meta:  !!event.metaKey,
    ctrl:  !!event.ctrlKey,
    alt:   !!event.altKey,
  }
  for (const a of ACTIONS) {
    if (m[a.id] !== event.code) continue
    const want = a.modifiers || {}
    if (!!want.shift !== evMods.shift) continue
    if (!!want.meta  !== evMods.meta)  continue
    if (!!want.ctrl  !== evMods.ctrl)  continue
    if (!!want.alt   !== evMods.alt)   continue
    return a.id
  }
  return null
}

// Find all actions that collide on a given code+modifier combo. Used
// in the Settings panel to flag conflicts in red so the user knows
// two bindings will fight. Returns an array of action ids.
export function conflictsFor(map, actionId) {
  const target = ACTION_BY_ID.get(actionId)
  if (!target) return []
  const code = map[actionId]
  if (!code) return []
  const want = target.modifiers || {}
  const out = []
  for (const a of ACTIONS) {
    if (a.id === actionId) continue
    if (map[a.id] !== code) continue
    const m = a.modifiers || {}
    if (!!m.shift !== !!want.shift) continue
    if (!!m.meta  !== !!want.meta)  continue
    if (!!m.ctrl  !== !!want.ctrl)  continue
    if (!!m.alt   !== !!want.alt)   continue
    out.push(a.id)
  }
  return out
}

// Human-friendly label for a KeyboardEvent.code. We don't try to be
// exhaustive — covers the keys the simulator actually uses + a
// fallback that strips the leading 'Key'/'Digit' prefix.
const CODE_LABELS = {
  Space: 'Space',
  ArrowLeft: '\u2190',
  ArrowRight: '\u2192',
  ArrowUp: '\u2191',
  ArrowDown: '\u2193',
  Enter: 'Enter',
  Escape: 'Esc',
  Slash: '/',
  Backslash: '\\',
  Period: '.',
  Comma: ',',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Tab: 'Tab',
  Backspace: 'Bksp',
}
export function labelForCode(code) {
  if (!code) return '\u2014'
  if (CODE_LABELS[code]) return CODE_LABELS[code]
  if (code.startsWith('Key'))   return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  return code
}

// Compose modifier list + key into a readable token for the UI.
export function labelForBinding(actionId, map) {
  const a = ACTION_BY_ID.get(actionId)
  if (!a) return ''
  const code = map[actionId] || a.defaultCode
  const tokens = []
  const want = a.modifiers || {}
  if (want.meta)  tokens.push('\u2318')
  if (want.ctrl)  tokens.push('Ctrl')
  if (want.alt)   tokens.push('Alt')
  if (want.shift) tokens.push('Shift')
  tokens.push(labelForCode(code))
  return tokens.join('+')
}

// Rebind a single action. Returns a NEW map (no mutation) so the
// SettingsModal can drive React updates from it.
export function setBinding(map, actionId, code) {
  if (!ACTION_BY_ID.has(actionId)) return map
  if (typeof code !== 'string' || code.length === 0) return map
  return { ...map, [actionId]: code }
}
