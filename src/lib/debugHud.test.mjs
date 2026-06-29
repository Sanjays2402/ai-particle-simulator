// Tests for src/lib/debugHud.js (R45.O — compact/expanded HUD layout).
import {
  HUD_MODES, HUD_MODE_DEFAULT, sanitizeHudMode, nextHudMode,
  resolveHudSections, hudModeLabel,
  // R50.O — per-view (fps vs ms) density
  HUD_VIEWS, sanitizeHudViewModes, hudModeForView, toggleHudViewMode, resolveHudSectionsForView,
  // R51.O — sync both views to one mode
  syncHudViewModes,
} from './debugHud.js'

let passed = 0
function fail(m) { console.error('FAIL: ' + m); process.exit(1) }
function ok(c, m) { if (!c) fail(m); else passed++ }
function eq(a, b, m) { if (a !== b) fail(`${m} — got ${a} expected ${b}`); else passed++ }

// Roster + default.
eq(HUD_MODES.length, 2, 'two modes')
ok(HUD_MODES.includes('compact') && HUD_MODES.includes('expanded'), 'both modes present')
eq(HUD_MODE_DEFAULT, 'expanded', 'default expanded')

// sanitize.
eq(sanitizeHudMode('compact'), 'compact', 'compact passes')
eq(sanitizeHudMode('expanded'), 'expanded', 'expanded passes')
eq(sanitizeHudMode('gibberish'), 'expanded', 'unknown → default')
eq(sanitizeHudMode(null), 'expanded', 'null → default')
eq(sanitizeHudMode(42), 'expanded', 'number → default')

// next (2-state cycle).
eq(nextHudMode('compact'), 'expanded', 'compact → expanded')
eq(nextHudMode('expanded'), 'compact', 'expanded → compact')
eq(nextHudMode('junk'), 'compact', 'junk sanitizes to expanded then toggles')

// resolveHudSections.
{
  const e = resolveHudSections('expanded')
  ok(e.sparkline && e.trends && e.copyButtons && e.alwaysOn, 'expanded: all on')
  const c = resolveHudSections('compact')
  ok(!c.sparkline && !c.trends && !c.copyButtons, 'compact: heavy sections off')
  ok(c.alwaysOn === true, 'compact: essentials always on')
  ok(resolveHudSections('junk').sparkline === true, 'unknown → expanded sections')
}

// label.
eq(hudModeLabel('compact'), 'MIN', 'compact label')
eq(hudModeLabel('expanded'), 'FULL', 'expanded label')
eq(hudModeLabel(null), 'FULL', 'unknown → FULL')

console.log(`PASS: debugHud R45.O — ${passed} assertions (compact/expanded HUD layout)`)

// --- R50.O: per-view (fps vs ms) compact density ----------------------
{
  ok(HUD_VIEWS.includes('fps') && HUD_VIEWS.includes('ms'), 'two views')
  // legacy single-string upgrades to both-views-same
  const fromLegacy = sanitizeHudViewModes('compact')
  eq(fromLegacy.fps, 'compact', 'legacy string → fps compact')
  eq(fromLegacy.ms, 'compact', 'legacy string → ms compact')
  // object fills missing/unknown keys with default
  const partial = sanitizeHudViewModes({ fps: 'compact' })
  eq(partial.fps, 'compact', 'partial keeps fps')
  eq(partial.ms, 'expanded', 'partial fills ms with default')
  eq(sanitizeHudViewModes({ fps: 'junk', ms: 'compact' }).fps, 'expanded', 'junk view → default')
  const def = sanitizeHudViewModes(null)
  eq(def.fps, 'expanded', 'null → both default')
  eq(def.ms, 'expanded', 'null → both default')
  // hudModeForView
  eq(hudModeForView({ fps: 'compact', ms: 'expanded' }, 'fps'), 'compact', 'fps mode read')
  eq(hudModeForView({ fps: 'compact', ms: 'expanded' }, 'ms'), 'expanded', 'ms mode read')
  eq(hudModeForView({ fps: 'compact', ms: 'expanded' }, 'bogus'), 'expanded', 'unknown view → default')
  // toggleHudViewMode flips ONLY the named view
  const t = toggleHudViewMode({ fps: 'expanded', ms: 'expanded' }, 'fps')
  eq(t.fps, 'compact', 'toggle fps flips fps')
  eq(t.ms, 'expanded', 'toggle fps leaves ms untouched')
  const t2 = toggleHudViewMode({ fps: 'expanded', ms: 'expanded' }, 'ms')
  eq(t2.ms, 'compact', 'toggle ms flips ms')
  eq(t2.fps, 'expanded', 'toggle ms leaves fps untouched')
  // unknown view returns sanitized map unchanged
  const tj = toggleHudViewMode({ fps: 'compact', ms: 'expanded' }, 'bogus')
  eq(tj.fps, 'compact', 'unknown view: fps unchanged')
  eq(tj.ms, 'expanded', 'unknown view: ms unchanged')
  // per-view sections
  ok(resolveHudSectionsForView({ fps: 'compact', ms: 'expanded' }, 'fps').sparkline === false, 'fps compact: no sparkline')
  ok(resolveHudSectionsForView({ fps: 'compact', ms: 'expanded' }, 'ms').sparkline === true, 'ms expanded: sparkline on')
}

// R51.O — syncHudViewModes: both views snap to one mode, alternating off fps.
{
  // either expanded → both collapse
  let s = syncHudViewModes({ fps: 'expanded', ms: 'expanded' })
  eq(s.fps, 'compact', 'sync: both expanded → fps compact'); eq(s.ms, 'compact', 'sync: both expanded → ms compact')
  s = syncHudViewModes({ fps: 'expanded', ms: 'compact' })
  eq(s.fps, 'compact', 'sync: fps expanded → both compact'); eq(s.ms, 'compact', 'sync: mixed → both compact')
  // both compact → both expand
  s = syncHudViewModes({ fps: 'compact', ms: 'compact' })
  eq(s.fps, 'expanded', 'sync: both compact → fps expanded'); eq(s.ms, 'expanded', 'sync: both compact → ms expanded')
  // junk → both default (expanded), so first sync collapses both
  s = syncHudViewModes(null)
  eq(s.fps, 'compact', 'sync: junk → fps compact'); eq(s.ms, 'compact', 'sync: junk → ms compact')
}
console.log(`PASS: debugHud R50.O/R51.O — per-view fps/ms density + sync`)
