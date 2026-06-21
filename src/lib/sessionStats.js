// Lightweight session/usage stats. Persisted to localStorage so users
// can see lifetime totals (presets loaded, gifs exported, screenshots,
// time spent). One source of truth — both the store action and the
// RightSidebar panel read/write through here so the format stays
// stable across reloads.
//
// Shape on disk (v1):
//   {
//     v: 1,
//     totalSessions: number,
//     lifetimeSeconds: number,        // accumulated across sessions
//     presetsLoaded: number,          // total loadPreset() calls
//     uniquePresets: string[],        // distinct preset ids ever touched
//     gifsExported: number,
//     videosExported: number,
//     screenshotsTaken: number,
//     firstSeenAt: epoch_ms,
//     lastSavedAt: epoch_ms,
//   }
//
// Mutations always go through the small set of helpers below so future
// migrations have exactly one place to fix.

export const STATS_KEY = 'particle-session-stats-v1'

export function emptyStats() {
  return {
    v: 1,
    totalSessions: 0,
    lifetimeSeconds: 0,
    presetsLoaded: 0,
    uniquePresets: [],
    gifsExported: 0,
    videosExported: 0,
    screenshotsTaken: 0,
    firstSeenAt: null,
    lastSavedAt: null,
  }
}

export function loadStats() {
  try {
    const raw = localStorage.getItem(STATS_KEY)
    if (!raw) return emptyStats()
    const parsed = JSON.parse(raw)
    if (!parsed || parsed.v !== 1) return emptyStats()
    // Defensive: re-merge against the empty shape so renamed/missing
    // fields land at sensible defaults.
    return { ...emptyStats(), ...parsed, uniquePresets: Array.isArray(parsed.uniquePresets) ? parsed.uniquePresets : [] }
  } catch {
    return emptyStats()
  }
}

export function saveStats(stats) {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify({ ...stats, lastSavedAt: Date.now() }))
  } catch { /* quota / private mode */ }
}

// Increment a numeric counter; returns the new stats object so callers
// can pipe it into setState without an extra read.
export function bumpStat(stats, key, by = 1) {
  if (typeof stats[key] !== 'number') return stats
  return { ...stats, [key]: stats[key] + by }
}

// Record that a preset id was loaded. Tracks both the total counter and
// the unique-id set (stored as an array for trivial JSON round-trip).
export function recordPresetLoad(stats, presetId) {
  if (!presetId) return stats
  const next = bumpStat(stats, 'presetsLoaded', 1)
  if (next.uniquePresets.includes(presetId)) return next
  return { ...next, uniquePresets: [...next.uniquePresets, presetId] }
}

// Begin a fresh session — bumps totalSessions and sets firstSeenAt on
// first run. The store calls this at module init exactly once.
export function beginSession(stats) {
  const out = bumpStat(stats, 'totalSessions', 1)
  if (!out.firstSeenAt) out.firstSeenAt = Date.now()
  return out
}

// Accumulate elapsed seconds since the session started. Called from a
// flush hook (page hide, beforeunload) so we don't lose time on crash.
export function addSessionSeconds(stats, seconds) {
  const s = Math.max(0, Math.floor(seconds))
  if (s === 0) return stats
  return bumpStat(stats, 'lifetimeSeconds', s)
}

// Pretty duration formatter. Returns "Nh Mm" or "Mm Ss" for short
// durations. Keeps the readout dense in the sidebar.
export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${sec}s`
  return `${sec}s`
}
