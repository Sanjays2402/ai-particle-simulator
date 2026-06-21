// sessionStats: verify counters, unique-set dedupe, and the duration
// formatter. Pure functions only — no localStorage touched.
import {
  emptyStats, bumpStat, recordPresetLoad, beginSession,
  addSessionSeconds, formatDuration,
} from './sessionStats.js'

function assertEq(actual, expected, msg) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected)
  if (a !== b) {
    console.error(`FAIL: ${msg} — got ${a} expected ${b}`)
    process.exit(1)
  }
}

// 1. emptyStats has the expected shape.
{
  const s = emptyStats()
  assertEq(s.v, 1, 'version is 1')
  assertEq(s.presetsLoaded, 0, 'presets start at 0')
  assertEq(s.uniquePresets, [], 'unique set starts empty')
}

// 2. bumpStat increments numeric keys, ignores non-numeric.
{
  let s = emptyStats()
  s = bumpStat(s, 'gifsExported', 2)
  s = bumpStat(s, 'gifsExported', 1)
  assertEq(s.gifsExported, 3, 'gifs incremented twice')
  const same = bumpStat(s, 'uniquePresets', 5)
  assertEq(same.uniquePresets, [], 'array key is left alone')
}

// 3. recordPresetLoad tracks total + unique.
{
  let s = emptyStats()
  s = recordPresetLoad(s, 'spiral-galaxy')
  s = recordPresetLoad(s, 'spiral-galaxy') // dupe — should not grow set
  s = recordPresetLoad(s, 'aurora')
  assertEq(s.presetsLoaded, 3, 'total counts all loads')
  assertEq(s.uniquePresets, ['spiral-galaxy', 'aurora'], 'unique set is deduped')
  // Null / empty id is a no-op.
  const same = recordPresetLoad(s, null)
  assertEq(same, s, 'null id is a no-op')
}

// 4. beginSession bumps totalSessions and sets firstSeenAt on the first call.
{
  let s = emptyStats()
  s = beginSession(s)
  assertEq(s.totalSessions, 1, 'first session counted')
  const firstSeen = s.firstSeenAt
  if (!firstSeen) { console.error('FAIL: firstSeenAt was not set'); process.exit(1) }
  s = beginSession(s)
  assertEq(s.totalSessions, 2, 'second session counted')
  assertEq(s.firstSeenAt, firstSeen, 'firstSeenAt sticks across sessions')
}

// 5. addSessionSeconds accumulates and rejects negatives.
{
  let s = emptyStats()
  s = addSessionSeconds(s, 42.9)  // floored to 42
  s = addSessionSeconds(s, 8)
  s = addSessionSeconds(s, -100)  // clamped to 0
  assertEq(s.lifetimeSeconds, 50, 'seconds accumulate and floor')
}

// 6. formatDuration covers seconds / minutes / hours branches.
assertEq(formatDuration(0), '0s', '0 seconds')
assertEq(formatDuration(45), '45s', 'sub-minute')
assertEq(formatDuration(125), '2m 5s', 'minutes + seconds')
assertEq(formatDuration(3725), '1h 2m', 'hours + minutes')
assertEq(formatDuration(-5), '0s', 'negative clamps to 0')
assertEq(formatDuration(undefined), '0s', 'undefined clamps to 0')

console.log('PASS: sessionStats counters, unique-set, duration fmt')
