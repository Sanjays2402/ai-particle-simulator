// MIDI controller-preset bundles — pre-baked CC→action maps for
// common hardware so the user doesn't have to Learn-tap fourteen
// knobs the first time they plug in a controller.
//
// Each preset is { id, name, description, vendor, map: { ccStr: actionId } }
// where actionId is one of the registered ACTIONS in midiMap.js. We
// keep the file dependency-free so the import doesn't pull the
// browser-coupled localStorage path during tests.
//
// Layouts follow each controller's factory defaults — that's what
// matters because the typical user plugs the controller in for the
// first time and hasn't reconfigured it yet.
//
// Layout sources:
//   - nanoKONTROL2:    factory slider/knob CC = 0..7 / 16..23
//   - Launch Control XL: factory pots row 1/2/3 + faders
//   - MPK Mini Mk2/3:   K1..K8 default = CC 70..77
//   - Generic (8 KNOBS): CC 1..8 — works as a friendly fallback for
//                        nameless USB-class-compliant controllers that
//                        send "MIDI input" with no vendor signature
//
// We deliberately ship a small, opinionated set rather than 80 device
// rows: too many choices is its own form of friction, and the same
// "8 generic knobs" preset covers most cheap controllers.

import { ACTIONS } from './midiMap.js'

const ACTION_IDS = new Set(ACTIONS.map(a => a.id))

// Validator — keeps every preset honest. We run this once at module
// load so a typo in a presets table fails the build's lint pass via
// the throw, rather than silently shipping a half-broken bundle.
function validateMap(presetId, map) {
  if (!map || typeof map !== 'object') {
    throw new Error(`midiPresets: '${presetId}' has no map`)
  }
  for (const [cc, actionId] of Object.entries(map)) {
    const n = parseInt(cc, 10)
    if (!Number.isFinite(n) || n < 0 || n > 127) {
      throw new Error(`midiPresets: '${presetId}' CC '${cc}' out of range`)
    }
    if (typeof actionId !== 'string' || !ACTION_IDS.has(actionId)) {
      throw new Error(`midiPresets: '${presetId}' unknown actionId '${actionId}' at CC ${cc}`)
    }
  }
}

// nanoKONTROL2: 8 faders (CC 0..7) + 8 knobs (CC 16..23). Faders →
// the "looks of the scene" lane (count, glow, attract, FX), knobs →
// the "motion of the scene" lane (speed, orbit, wind, noise).
const KORG_NANOKONTROL2 = {
  id:          'korg-nanokontrol2',
  name:        'Korg nanoKONTROL2',
  description: 'Factory layout — faders + knobs.',
  vendor:      'Korg',
  map: {
    '0':  'particleCount',
    '1':  'glow',
    '2':  'attract',
    '3':  'paletteMix',
    '4':  'caInt',
    '5':  'vgInt',
    '6':  'fgInt',
    '7':  'shakeInt',
    '16': 'speed',
    '17': 'orbit',
    '18': 'windInt',
    '19': 'windAz',
    '20': 'noiseAmp',
    '21': 'noiseFreq',
  },
}

// Novation Launch Control XL: factory layout sends CC 13..20 on the
// top knob row, 29..36 mid, 49..56 bottom, faders 77..84. Our 14-slot
// action registry doesn't need all 32 — we pick top row + faders for
// a clean "looks vs motion" split that mirrors nanoKONTROL2.
const NOVATION_LCXL = {
  id:          'novation-launch-control-xl',
  name:        'Novation Launch Control XL',
  description: 'Factory layout — top knob row + faders.',
  vendor:      'Novation',
  map: {
    '77': 'particleCount',
    '78': 'glow',
    '79': 'attract',
    '80': 'paletteMix',
    '81': 'caInt',
    '82': 'vgInt',
    '83': 'fgInt',
    '84': 'shakeInt',
    '13': 'speed',
    '14': 'orbit',
    '15': 'windInt',
    '16': 'windAz',
    '17': 'noiseAmp',
    '18': 'noiseFreq',
  },
}

// Akai MPK Mini Mk2/3: K1..K8 ship on CC 70..77 by default. We get 8
// knobs total, so the bundle covers the most "tweakable" actions only.
const AKAI_MPK_MINI = {
  id:          'akai-mpk-mini',
  name:        'Akai MPK Mini',
  description: 'Factory knob layout — K1..K8 on CC 70..77.',
  vendor:      'Akai',
  map: {
    '70': 'speed',
    '71': 'glow',
    '72': 'attract',
    '73': 'paletteMix',
    '74': 'caInt',
    '75': 'vgInt',
    '76': 'windInt',
    '77': 'noiseAmp',
  },
}

// Generic 8-knob fallback: most "MIDI 1.0 class-compliant" cheap
// controllers default to CC 1..8 because that's what the manufacturer
// ships when they didn't bother customising. Useful when the device
// shows up as "MIDI input" with no vendor signature.
const GENERIC_8_KNOBS = {
  id:          'generic-8-knobs',
  name:        'Generic 8 Knobs',
  description: 'CC 1..8 — works with most class-compliant controllers.',
  vendor:      'Generic',
  map: {
    '1': 'speed',
    '2': 'glow',
    '3': 'attract',
    '4': 'paletteMix',
    '5': 'caInt',
    '6': 'vgInt',
    '7': 'windInt',
    '8': 'noiseAmp',
  },
}

// User-authored controller preset bundles (R13.05) — power users
// can save the CURRENT CC→action map as their own named bundle and
// re-apply it later (or even share the JSON). Persisted to
// localStorage under STORAGE_KEY_USER_PRESETS. Stored shape:
//   { v: 1, items: [{ id, name, description, vendor, map, createdAt }, ...] }
// User presets are CLEARLY distinguished from shipped ones (vendor
// === 'Custom') and capped at MAX_USER_PRESETS to keep the chip bar
// readable.

export const STORAGE_KEY_USER_PRESETS = 'particle-midi-user-presets-v1'
export const MAX_USER_PRESETS = 8
const USER_PRESET_PREFIX = 'user-'

// R16.19 — per-bundle COLOR tag. Users can choose a colour for each
// user-authored bundle's chip; gives visual sort beyond just the name
// when 8 bundles share the chip bar. The palette intentionally
// matches accents already used elsewhere in the app (pink/violet/
// indigo/cyan/emerald/amber/rose/slate) so the chips look at home in
// the existing UI language. 'pink' is the default — matches the
// existing shipped user-bundle chip accent in PresetBar so adopting
// the colour tag costs nothing for a saved-but-unchanged bundle.
export const USER_PRESET_COLORS = ['pink', 'violet', 'indigo', 'cyan', 'emerald', 'amber', 'rose', 'slate']
export const DEFAULT_USER_PRESET_COLOR = 'pink'

export const USER_PRESET_COLOR_STYLES = {
  pink:    { accent: '#ec4899', accentRgb: '236,72,153' },
  violet:  { accent: '#a855f7', accentRgb: '168,85,247' },
  indigo:  { accent: '#6366f1', accentRgb: '99,102,241' },
  cyan:    { accent: '#06b6d4', accentRgb: '6,182,212' },
  emerald: { accent: '#10b981', accentRgb: '16,185,129' },
  amber:   { accent: '#f59e0b', accentRgb: '245,158,11' },
  rose:    { accent: '#f43f5e', accentRgb: '244,63,94' },
  slate:   { accent: '#64748b', accentRgb: '100,116,139' },
}

// True when `c` is a recognised colour tag (case-sensitive lowercase).
// Defensive sanitizer for any persisted-but-out-of-roster value.
export function isValidUserPresetColor(c) {
  return typeof c === 'string' && USER_PRESET_COLORS.includes(c)
}

// Sanitiser used by load/save — unknown → default so legacy bundles
// upgrade silently and a typo in the JSON doesn't break a chip.
export function sanitizeUserPresetColor(c) {
  return isValidUserPresetColor(c) ? c : DEFAULT_USER_PRESET_COLOR
}

// Pre-built CSS-ready style bundle for a colour tag. Matches the
// shape of attractorTypeStyle in namedAttractors.js — same opacity
// stops so the new colour chips drop into the existing design
// language without adjusting alpha math at the callsite.
export function userPresetColorStyle(color) {
  const base = USER_PRESET_COLOR_STYLES[sanitizeUserPresetColor(color)]
  const rgb = base.accentRgb
  return {
    accent:    base.accent,
    accentRgb: rgb,
    border:      `rgba(${rgb},0.45)`,
    borderSoft:  `rgba(${rgb},0.30)`,
    borderFaint: `rgba(${rgb},0.18)`,
    bg:          `rgba(${rgb},0.16)`,
    bgSoft:      `rgba(${rgb},0.08)`,
    fg:          base.accent,
    fgMuted:     `rgba(${rgb},0.75)`,
    glow:        `0 0 12px rgba(${rgb},0.25)`,
  }
}

// R16.19 — set a user bundle's colour tag in place by id. Returns
// a NEW array (matching the rename/move family contract) OR the
// input ref on no-op (already at this colour / missing id / invalid
// colour). Caller persists via saveUserPresets.
export function setUserPresetColor(list, id, color) {
  if (!Array.isArray(list) || !id) return list
  if (!isValidUserPresetColor(color)) return list
  let changed = false
  const next = list.map(p => {
    if (!p || p.id !== id) return p
    const current = sanitizeUserPresetColor(p.color)
    if (current === color) return p
    changed = true
    return { ...p, color }
  })
  return changed ? next : list
}

// R20.11 — per-bundle keyboard shortcut. Lets a user assign a hotkey
// to apply a bundle without opening the MIDI panel. The hotkey is a
// stable string token (e.g. 'shift+1', 'alt+f4') that's matched
// against a normalised event signature so cross-platform layouts
// produce the same hotkey identity.
//
// Format: 'meta+ctrl+alt+shift+<key>'. Modifiers in canonical order
// (meta first, then ctrl, alt, shift) so two equivalent hotkeys with
// reversed modifier order both compare equal. Key part uses
// e.key.toLowerCase() for letters / digits / punctuation. Function
// keys, arrows, etc. are normalised: 'arrowup' → 'up', 'arrowdown'
// → 'down', 'arrowleft' → 'left', 'arrowright' → 'right'. Backspace
// / escape / tab / space stay as their literal lowercase names.
//
// Cap: 1 hotkey per bundle. The same hotkey can't be bound to two
// bundles (the second assignment silently un-binds the first to
// avoid a "which bundle wins?" question).
//
// Defensive: invalid hotkey tokens (empty, non-string, no key part)
// → null setter behaviour returns the input list unchanged. Setting
// to null clears the hotkey.
const VALID_HOTKEY_KEYS = new Set([
  // Letters
  'a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t','u','v','w','x','y','z',
  // Digits
  '0','1','2','3','4','5','6','7','8','9',
  // Function keys
  'f1','f2','f3','f4','f5','f6','f7','f8','f9','f10','f11','f12',
  // Arrows + nav
  'up','down','left','right',
  // Common controls
  'escape','tab','space','backspace','enter','delete','home','end','pageup','pagedown',
  // Punctuation (small allowlist — broader than this gets layout-dependent)
  ',','.','/',';',"'",'[',']','\\','-','=','`',
])

// Normalise a raw event into a stable hotkey string.
// Returns null when no actionable key is pressed (modifier-only).
export function hotkeyFromEvent(event) {
  if (!event || typeof event !== 'object' || typeof event.key !== 'string') return null
  let key = event.key.toLowerCase()
  if (key.startsWith('arrow')) key = key.slice(5)
  if (key === ' ') key = 'space'
  // Skip pure modifier presses ('control', 'shift', 'alt', 'meta').
  if (key === 'control' || key === 'shift' || key === 'alt' || key === 'meta') return null
  if (!VALID_HOTKEY_KEYS.has(key)) return null
  const parts = []
  if (event.metaKey)  parts.push('meta')
  if (event.ctrlKey)  parts.push('ctrl')
  if (event.altKey)   parts.push('alt')
  if (event.shiftKey) parts.push('shift')
  parts.push(key)
  return parts.join('+')
}

// Validate a hotkey token string. Returns the CANONICAL form (modifiers
// re-ordered to meta/ctrl/alt/shift; key part lowercased) or null when
// invalid. Used by the persistence path + by the UI's "is this binding
// valid" check.
export function sanitizeHotkey(raw) {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim().toLowerCase()
  if (!trimmed) return null
  const parts = trimmed.split('+').map(s => s.trim()).filter(Boolean)
  if (parts.length === 0) return null
  const key = parts[parts.length - 1]
  if (!VALID_HOTKEY_KEYS.has(key)) return null
  const mods = new Set(parts.slice(0, -1))
  // Reject any unknown modifier.
  for (const m of mods) {
    if (m !== 'meta' && m !== 'ctrl' && m !== 'alt' && m !== 'shift') return null
  }
  const out = []
  if (mods.has('meta'))  out.push('meta')
  if (mods.has('ctrl'))  out.push('ctrl')
  if (mods.has('alt'))   out.push('alt')
  if (mods.has('shift')) out.push('shift')
  out.push(key)
  return out.join('+')
}

// Set a user bundle's hotkey in place. Two-step semantics:
//   1. If `hotkey` is null/'' → clears the bundle's hotkey (no-op
//      when already empty).
//   2. If `hotkey` is valid → un-binds the same hotkey from any
//      OTHER bundle (avoids ambiguous mappings), then assigns it
//      to the named bundle.
// Returns a NEW array on change OR the input ref on no-op. Caller
// persists via saveUserPresets.
export function setUserPresetHotkey(list, id, hotkey) {
  if (!Array.isArray(list) || !id) return list
  const safe = hotkey === null || hotkey === '' ? null : sanitizeHotkey(hotkey)
  // Invalid input — refuse, return input ref unchanged.
  if (hotkey != null && hotkey !== '' && safe == null) return list
  let changed = false
  const next = list.map(p => {
    if (!p) return p
    if (p.id === id) {
      const current = sanitizeHotkey(p.hotkey)
      if (current === safe) return p   // no-op
      changed = true
      const np = { ...p }
      if (safe) np.hotkey = safe
      else delete np.hotkey
      return np
    }
    // Other bundles: strip the hotkey if it matches what we're about
    // to assign (one-binding-per-hotkey invariant). Only relevant when
    // safe is non-null.
    if (safe && sanitizeHotkey(p.hotkey) === safe) {
      changed = true
      const np = { ...p }
      delete np.hotkey
      return np
    }
    return p
  })
  return changed ? next : list
}

// Look up a user bundle by hotkey. Returns the bundle or null.
// Used by the global keydown listener to resolve a key event to the
// bundle it should apply.
export function findUserPresetByHotkey(list, hotkey) {
  if (!Array.isArray(list)) return null
  const safe = sanitizeHotkey(hotkey)
  if (!safe) return null
  for (const p of list) {
    if (!p) continue
    if (sanitizeHotkey(p.hotkey) === safe) return p
  }
  return null
}

// R21.25 — detect a hotkey conflict BEFORE setUserPresetHotkey lands.
// Used by the UI to surface a warning toast when a binding will be
// silently stolen from another bundle (setUserPresetHotkey's
// "1-binding-per-hotkey invariant" strips the hotkey from whichever
// other bundle was carrying it, with no in-band feedback).
//
// Returns the OTHER bundle the user is about to displace, or null
// when the hotkey is unbound / belongs to the target bundle itself /
// is invalid. The shape mirrors findUserPresetByHotkey so the UI can
// pull .name / .color / .id off the result for the toast.
//
// `targetId` is the bundle the user is ABOUT TO assign the hotkey to.
// Re-binding the SAME hotkey to the SAME bundle never reports a
// conflict (it's the no-op path). Clearing a hotkey (null / '') never
// reports a conflict (nothing to steal). Invalid input returns null
// (the setter would refuse anyway).
export function detectHotkeyConflict(list, targetId, hotkey) {
  if (!Array.isArray(list) || !targetId) return null
  if (hotkey == null || hotkey === '') return null
  const safe = sanitizeHotkey(hotkey)
  if (!safe) return null
  for (const p of list) {
    if (!p) continue
    if (p.id === targetId) continue   // self — not a conflict
    if (sanitizeHotkey(p.hotkey) === safe) return p
  }
  return null
}

// Load + sanitize the persisted user-preset list. Drops any entry
// that fails the same validateMap gate as shipped bundles.
export function loadUserPresets() {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY_USER_PRESETS)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.items)) return []
    const out = []
    for (const item of parsed.items) {
      if (!item || typeof item !== 'object') continue
      const id = typeof item.id === 'string' && item.id.startsWith(USER_PRESET_PREFIX) ? item.id : null
      if (!id) continue
      const name = sanitizePresetName(item.name)
      if (!name) continue
      const map = sanitizePresetMap(item.map)
      if (!map) continue
      out.push({
        id,
        name,
        description: typeof item.description === 'string' ? item.description.slice(0, 80) : 'Custom bundle',
        vendor: 'Custom',
        map,
        // R16.19 — colour tag for the chip; missing/invalid → DEFAULT.
        color: sanitizeUserPresetColor(item.color),
        // R20.11 — per-bundle hotkey. Missing/invalid → undefined
        // (no hotkey). Sanitised on load so a corrupt persisted value
        // can never reject the whole bundle.
        ...(sanitizeHotkey(item.hotkey) ? { hotkey: sanitizeHotkey(item.hotkey) } : {}),
        createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
      })
      if (out.length >= MAX_USER_PRESETS) break
    }
    return out
  } catch { return [] }
}

export function saveUserPresets(list) {
  if (typeof localStorage === 'undefined') return false
  try {
    const cleaned = (Array.isArray(list) ? list : [])
      .map(p => {
        const map = sanitizePresetMap(p && p.map)
        if (!map) return null
        const name = sanitizePresetName(p && p.name)
        if (!name) return null
        const id = typeof p.id === 'string' && p.id.startsWith(USER_PRESET_PREFIX) ? p.id : `${USER_PRESET_PREFIX}${Date.now()}`
        return {
          id, name,
          description: typeof p.description === 'string' ? p.description.slice(0, 80) : 'Custom bundle',
          vendor: 'Custom',
          map,
          // R16.19 — colour tag; missing/invalid → DEFAULT.
          color: sanitizeUserPresetColor(p.color),
          // R20.11 — per-bundle hotkey; sanitised; absent when null.
          ...(sanitizeHotkey(p.hotkey) ? { hotkey: sanitizeHotkey(p.hotkey) } : {}),
          createdAt: typeof p.createdAt === 'number' ? p.createdAt : Date.now(),
        }
      })
      .filter(Boolean)
      .slice(0, MAX_USER_PRESETS)
    localStorage.setItem(STORAGE_KEY_USER_PRESETS, JSON.stringify({ v: 1, items: cleaned }))
    return true
  } catch { return false }
}

function sanitizePresetName(s) {
  if (typeof s !== 'string') return ''
  const t = s.trim().slice(0, 32)
  return t.length > 0 ? t : ''
}

// Same shape as validateMap above but defensive — returns the sanitized
// map (or null on bad data) instead of throwing, so load/save can drop
// corrupt rows silently rather than blowing up the whole bundle list.
function sanitizePresetMap(map) {
  if (!map || typeof map !== 'object') return null
  const out = {}
  let kept = 0
  for (const [cc, actionId] of Object.entries(map)) {
    const n = parseInt(cc, 10)
    if (!Number.isFinite(n) || n < 0 || n > 127) continue
    if (typeof actionId !== 'string' || !ACTION_IDS.has(actionId)) continue
    out[String(n)] = actionId
    kept++
  }
  return kept > 0 ? out : null
}

// Mint a stable id for a new user bundle. Numbered for clean URLs
// + log output; falls back to a timestamp suffix when all numbered
// slots are taken (extremely unlikely with MAX_USER_PRESETS = 8).
export function nextUserPresetId(existing) {
  const ids = new Set((existing || []).map(p => p && p.id))
  for (let i = 1; i <= MAX_USER_PRESETS + 32; i++) {
    const id = `${USER_PRESET_PREFIX}${i}`
    if (!ids.has(id)) return id
  }
  return `${USER_PRESET_PREFIX}${Date.now()}`
}

// Build a new user bundle from the live binding map. Filters to
// known action ids only so corrupt entries can't leak into the
// stored bundle. Returns null if there's nothing to save.
export function buildUserPresetFromMap(name, currentMap, existing = [], nowMs = Date.now()) {
  const cleanName = sanitizePresetName(name)
  if (!cleanName) return null
  const cleanMap = sanitizePresetMap(currentMap || {})
  if (!cleanMap) return null
  return {
    id: nextUserPresetId(existing),
    name: cleanName,
    description: `${Object.keys(cleanMap).length} binding${Object.keys(cleanMap).length === 1 ? '' : 's'} saved ${new Date(nowMs).toISOString().slice(0, 10)}`,
    vendor: 'Custom',
    map: cleanMap,
    // R16.19 — start every new bundle on the default colour so a
    // user who never visits the colour-tag picker still gets the
    // same pink chips the original shipped behaviour painted.
    color: DEFAULT_USER_PRESET_COLOR,
    createdAt: nowMs,
  }
}

// Append a user bundle to the list. Caps at MAX_USER_PRESETS by
// dropping the oldest entry (FIFO). Returns the new list; never
// mutates the input.
export function addUserPreset(list, preset) {
  if (!preset || !preset.id) return list || []
  const base = Array.isArray(list) ? list.filter(p => p && p.id !== preset.id) : []
  const next = [...base, preset]
  return next.slice(-MAX_USER_PRESETS)
}

export function removeUserPreset(list, id) {
  if (!Array.isArray(list)) return []
  return list.filter(p => p && p.id !== id)
}

// R14.18 — rename a user-authored bundle in place by id. Returns a
// NEW array with the entry's `name` (and `description` if it followed
// the auto-generated pattern, see below) updated through the same
// sanitizer as save/load so a blank-after-trim name is rejected
// without mutating anything. Caller is responsible for persisting
// the returned list via saveUserPresets.
//
// Why bother rewriting the description? The shipped buildUserPreset
// FromMap sets description to `N bindings saved YYYY-MM-DD` —
// purely derived. If we leave that text alone after a rename, the
// chip tooltip says "8 bindings saved 2026-06-21" even after the
// user renames "OLD" → "NEW" and the rename feels less complete.
// We ONLY rewrite when the description still matches the auto
// template (preserves any custom description the user might have
// hand-edited via JSON import or future per-bundle UI).
export function renameUserPreset(list, id, newName) {
  if (!Array.isArray(list) || !id) return list
  const cleanName = sanitizePresetName(newName)
  if (!cleanName) return list  // refuse blank-after-trim
  let changed = false
  const next = list.map(p => {
    if (!p || p.id !== id) return p
    if (p.name === cleanName) return p  // no-op for identical name
    changed = true
    // Rewrite the auto-generated description if it still matches.
    const autoDescPattern = /^\d+ binding(s)? saved \d{4}-\d{2}-\d{2}$/
    const nextDescription = (typeof p.description === 'string' && autoDescPattern.test(p.description))
      ? `${Object.keys(p.map || {}).length} binding${Object.keys(p.map || {}).length === 1 ? '' : 's'} saved ${new Date(p.createdAt || Date.now()).toISOString().slice(0, 10)}`
      : p.description
    return { ...p, name: cleanName, description: nextDescription }
  })
  return changed ? next : list
}

// True when this id is a USER-authored bundle (vs a shipped one).
// Stable check via the id prefix; vendor-name fallback for older
// entries that might lack the prefix.
export function isUserPresetId(id) {
  return typeof id === 'string' && id.startsWith(USER_PRESET_PREFIX)
}

export const MIDI_PRESETS = [
  KORG_NANOKONTROL2,
  NOVATION_LCXL,
  AKAI_MPK_MINI,
  GENERIC_8_KNOBS,
]

// Validate every shipped preset at module load — a typo in one of
// the maps above turns into a loud throw rather than a silent
// "binding does nothing" at runtime.
for (const p of MIDI_PRESETS) validateMap(p.id, p.map)

const PRESETS_BY_ID = new Map(MIDI_PRESETS.map(p => [p.id, p]))

// Look up by id — searches BOTH shipped presets AND any user-saved
// bundle (R13.05). Pass `userPresets` from the live state so the
// lookup stays in sync with whatever's currently persisted.
export function getMidiPreset(id, userPresets = []) {
  const shipped = PRESETS_BY_ID.get(id)
  if (shipped) return shipped
  if (Array.isArray(userPresets)) {
    return userPresets.find(p => p && p.id === id) || null
  }
  return null
}

// Build a fresh CC→action map from a preset by id. Returns {} on a
// bad id so callers can apply without a try/catch.
export function buildMidiMapFromPreset(id, userPresets = []) {
  const p = getMidiPreset(id, userPresets)
  if (!p) return {}
  // Defensive copy — we never want a downstream mutation to alter
  // the shipped (or user-saved) preset's source-of-truth.
  return { ...p.map }
}

// Match a connected MIDIInput by `name` to the most likely preset.
// Useful for the UI's "auto-detect" hint — surfaces a preset chip
// next to the device row without committing the binding.
//
// Heuristic: case-insensitive vendor+model substring match. Returns
// the preset id, or null when nothing matches well enough.
export function detectPresetForInput(inputName) {
  if (typeof inputName !== 'string' || inputName.length === 0) return null
  const lower = inputName.toLowerCase()
  if (lower.includes('nanokontrol'))     return KORG_NANOKONTROL2.id
  if (lower.includes('launch control'))  return NOVATION_LCXL.id
  if (lower.includes('launchcontrol'))   return NOVATION_LCXL.id
  if (lower.includes('mpk mini'))        return AKAI_MPK_MINI.id
  if (lower.includes('mpkmini'))         return AKAI_MPK_MINI.id
  if (lower.includes('mpk-mini'))        return AKAI_MPK_MINI.id
  return null
}

// Merge a preset into an existing map. Strategy "replace" wipes the
// existing map first; "merge" keeps existing bindings that the
// preset doesn't touch. The latter is useful when the user has
// already Learn-bound a couple of their favourite knobs and just
// wants the rest auto-filled. Searches both shipped and user
// bundles via getMidiPreset.
export function applyPresetToMap(currentMap, presetId, mode = 'replace', userPresets = []) {
  const incoming = buildMidiMapFromPreset(presetId, userPresets)
  if (mode === 'merge') {
    return { ...(currentMap || {}), ...incoming }
  }
  // replace
  return incoming
}

// Friendly counts for the UI — e.g. "14 actions" / "8 knobs".
export function presetBindingCount(id, userPresets = []) {
  const p = getMidiPreset(id, userPresets)
  if (!p) return 0
  return Object.keys(p.map).length
}
