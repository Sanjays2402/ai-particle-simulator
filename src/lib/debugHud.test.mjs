// Tests for src/lib/debugHud.js (R45.O — compact/expanded HUD layout).
import {
  HUD_MODES, HUD_MODE_DEFAULT, sanitizeHudMode, nextHudMode,
  resolveHudSections, hudModeLabel,
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
