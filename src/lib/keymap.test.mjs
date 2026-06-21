// keymap: defaults, load/save round-trip, resolveAction, conflict
// detection, label helpers. Tests use a stub localStorage so we can
// verify persistence without the real DOM.
import {
  STORAGE_KEY, ACTIONS,
  defaultsByAction, loadKeymap, saveKeymap, resetKeymap,
  resolveAction, conflictsFor, labelForCode, labelForBinding, setBinding,
} from './keymap.js'

function fail(m) { console.error(`FAIL: ${m}`); process.exit(1) }
function eq(a, b, m) { if (a !== b) fail(`${m} — got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`) }
function ok(c, m) { if (!c) fail(m) }

// Tiny localStorage stub so the lib's persistence path can be tested
// in plain Node. The lib reads `typeof localStorage` so we need a
// global; the test cleans it up afterwards.
function installLocalStorage() {
  const map = new Map()
  globalThis.localStorage = {
    getItem(k)         { return map.has(k) ? map.get(k) : null },
    setItem(k, v)      { map.set(k, String(v)) },
    removeItem(k)      { map.delete(k) },
    clear()            { map.clear() },
    key(i)             { return Array.from(map.keys())[i] || null },
    get length()       { return map.size },
  }
  return map
}
function uninstallLocalStorage() { delete globalThis.localStorage }

// --- defaultsByAction returns every action ---
{
  const d = defaultsByAction()
  for (const a of ACTIONS) {
    eq(d[a.id], a.defaultCode, `default for ${a.id}`)
  }
}

// --- loadKeymap falls back to defaults when no storage ---
{
  installLocalStorage()
  const m = loadKeymap()
  eq(m.play, 'Space', 'play default')
  eq(m.random, 'KeyR', 'random default')
  uninstallLocalStorage()
}

// --- saveKeymap + loadKeymap round trip ---
{
  installLocalStorage()
  const m = { ...defaultsByAction(), random: 'KeyX' }
  saveKeymap(m)
  const back = loadKeymap()
  eq(back.random, 'KeyX', 'random rebinding persisted')
  eq(back.play, 'Space', 'unchanged action keeps default')
  uninstallLocalStorage()
}

// --- saveKeymap filters out unknown keys ---
{
  const store = installLocalStorage()
  saveKeymap({ random: 'KeyX', bogus: 'KeyZ' })
  const raw = JSON.parse(store.get(STORAGE_KEY))
  eq(raw.random, 'KeyX', 'random saved')
  eq(raw.bogus, undefined, 'bogus filtered')
  uninstallLocalStorage()
}

// --- resetKeymap wipes storage and returns defaults ---
{
  const store = installLocalStorage()
  saveKeymap({ ...defaultsByAction(), random: 'KeyX' })
  ok(store.has(STORAGE_KEY), 'storage populated')
  const back = resetKeymap()
  ok(!store.has(STORAGE_KEY), 'storage cleared after reset')
  eq(back.random, 'KeyR', 'random back to default')
  uninstallLocalStorage()
}

// --- resolveAction matches code + modifiers ---
{
  const m = defaultsByAction()
  // Plain Space → play.
  eq(resolveAction(m, { code: 'Space' }), 'play', 'Space → play')
  // KeyR with no mods → random.
  eq(resolveAction(m, { code: 'KeyR' }), 'random', 'KeyR → random')
  // KeyR with Cmd → null (don't hijack Cmd+R refresh).
  eq(resolveAction(m, { code: 'KeyR', metaKey: true }), null, 'Cmd+R should not trigger random')
  // KeyF → fullscreen; Shift+KeyF → favorite.
  eq(resolveAction(m, { code: 'KeyF' }), 'fullscreen', 'KeyF → fullscreen')
  eq(resolveAction(m, { code: 'KeyF', shiftKey: true }), 'favorite', 'Shift+KeyF → favorite')
  // Unknown code → null.
  eq(resolveAction(m, { code: 'KeyZ' }), null, 'KeyZ → null')
  // Null event → null.
  eq(resolveAction(m, null), null, 'null event → null')
  eq(resolveAction(m, {}), null, 'event with no code → null')
}

// --- resolveAction follows rebindings ---
{
  const m = setBinding(defaultsByAction(), 'random', 'KeyZ')
  eq(resolveAction(m, { code: 'KeyZ' }), 'random', 'rebinding takes effect')
  eq(resolveAction(m, { code: 'KeyR' }), null, 'old binding no longer triggers')
}

// --- conflictsFor finds collisions ---
{
  // Default keymap → no conflicts on plain 'random'.
  const m = defaultsByAction()
  eq(conflictsFor(m, 'random').length, 0, 'no default conflicts on random')
  // Bind 'random' to the same key as 'screenshot' → conflict.
  const m2 = setBinding(m, 'random', 'KeyS')
  const c = conflictsFor(m2, 'random')
  ok(c.includes('screenshot'), 'random vs screenshot conflict surfaced')
}

// --- conflictsFor ignores modifier-distinct bindings ---
{
  const m = defaultsByAction()
  // KeyF (fullscreen) vs Shift+KeyF (favorite) — same code, different mods.
  eq(conflictsFor(m, 'fullscreen').length, 0, 'fullscreen has no plain-code conflicts')
  eq(conflictsFor(m, 'favorite').length, 0, 'favorite (Shift+F) has no conflicts with fullscreen (F)')
}

// --- labelForCode handles known + fallback ---
eq(labelForCode('Space'), 'Space', 'Space → Space')
eq(labelForCode('KeyR'), 'R', 'KeyR → R')
eq(labelForCode('Digit7'), '7', 'Digit7 → 7')
eq(labelForCode('Slash'), '/', 'Slash → /')
eq(labelForCode('F12'), 'F12', 'unknown → passthrough')
eq(labelForCode(null), '\u2014', 'null → dash')

// --- labelForBinding includes modifiers ---
{
  const m = defaultsByAction()
  eq(labelForBinding('favorite', m), 'Shift+F', 'favorite shows Shift+F')
  eq(labelForBinding('random', m), 'R', 'random shows R')
  eq(labelForBinding('help', m), 'Shift+/', 'help shows Shift+/')
}

// --- setBinding is immutable ---
{
  const m = defaultsByAction()
  const m2 = setBinding(m, 'random', 'KeyX')
  ok(m !== m2, 'setBinding returns new object')
  eq(m.random, 'KeyR', 'original untouched')
  eq(m2.random, 'KeyX', 'copy updated')
  // Unknown action → returns same map.
  const m3 = setBinding(m, 'totally-fake', 'KeyZ')
  eq(m3, m, 'unknown action returns same map')
  // Empty code → returns same map.
  const m4 = setBinding(m, 'random', '')
  eq(m4, m, 'empty code returns same map')
}

console.log(`PASS: keymap — ${ACTIONS.length} actions, defaults/load/save/reset/resolve/conflicts/labels`)
