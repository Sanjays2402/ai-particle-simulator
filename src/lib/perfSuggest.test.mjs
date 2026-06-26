// perfSuggest: sustained-low-fps quality-drop suggestion state machine.
import {
  QUALITY_TIERS, LOW_FPS_THRESHOLD, SUSTAINED_LOW_MS, SUGGEST_COOLDOWN_MS,
  tierForCount, nextLowerTier, createSuggesterState, pushFpsSample,
  markSuggestionHandled,
} from './perfSuggest.js'

let passed = 0
function fail(m) { console.error(`FAIL: ${m}`); process.exit(1) }
function ok(cond, m) { if (!cond) fail(m); else passed++ }
function eq(a, b, m) { if (a !== b) fail(`${m} — got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`); else passed++ }

// --- tiers roster ---
ok(QUALITY_TIERS.length === 4, 'four quality tiers')
eq(QUALITY_TIERS[0].id, 'low', 'lowest tier first')
for (let i = 1; i < QUALITY_TIERS.length; i++) {
  ok(QUALITY_TIERS[i].count > QUALITY_TIERS[i - 1].count, 'tiers ascend by count')
}

// --- tierForCount ---
eq(tierForCount(2000), 'low', 'exact low')
eq(tierForCount(50000), 'ultra', 'exact ultra')
eq(tierForCount(9000), 'med', 'near med snaps to med')
eq(tierForCount(40000), 'ultra', '40K closer to ultra(50K) than high(25K)')
eq(tierForCount(NaN), 'ultra', 'NaN → top tier (conservative)')

// --- nextLowerTier ---
eq(nextLowerTier(50000).id, 'high', '50K → drop to High')
eq(nextLowerTier(25000).id, 'med', '25K → drop to Med')
eq(nextLowerTier(10000).id, 'low', '10K → drop to Low')
eq(nextLowerTier(2000), null, '2K (lowest) → no lower tier')
eq(nextLowerTier(1000), null, 'below lowest → null')
eq(nextLowerTier(NaN), null, 'NaN → null')
// A custom in-between count drops to the highest tier strictly below it.
eq(nextLowerTier(30000).id, 'high', '30K → High (25K, the tier below)')

// --- createSuggesterState ---
{
  const st = createSuggesterState(1000)
  eq(st.lowSince, null, 'fresh: not low')
  eq(st.lastSuggestAt, null, 'fresh: never suggested')
}

// --- pushFpsSample: healthy fps never suggests ---
{
  let st = createSuggesterState(0)
  for (let t = 0; t < 20000; t += 250) {
    const r = pushFpsSample(st, 60, t, { currentCount: 50000 })
    st = r.state
    eq(r.suggest, null, `60fps at t=${t} never suggests`)
  }
}

// --- sustained low fps fires exactly once, then cools down ---
{
  let st = createSuggesterState(0)
  let fires = 0
  let firstFireAt = null
  // 30fps (below 40 threshold) sustained from t=0.
  for (let t = 0; t <= 12000; t += 250) {
    const r = pushFpsSample(st, 30, t, { currentCount: 50000 })
    st = r.state
    if (r.suggest) {
      fires++
      if (firstFireAt === null) firstFireAt = t
      eq(r.suggest.targetTier.id, 'high', 'suggests dropping 50K → High')
      ok(r.suggest.fps === 30, 'suggestion carries the fps')
    }
  }
  // Should fire once around the 4s sustain mark, then stay quiet for the
  // 60s cooldown (so within a 12s window: exactly one fire).
  eq(fires, 1, 'sustained low fires exactly once in 12s (cooldown blocks repeats)')
  ok(firstFireAt >= SUSTAINED_LOW_MS && firstFireAt <= SUSTAINED_LOW_MS + 500, 'fires right after the sustain window')
}

// --- a brief dip under the sustain window never fires ---
{
  let st = createSuggesterState(0)
  let fires = 0
  // Low for only 2s (< 4s sustain), then recovers.
  for (let t = 0; t <= 2000; t += 250) {
    const r = pushFpsSample(st, 25, t, { currentCount: 50000 }); st = r.state; if (r.suggest) fires++
  }
  for (let t = 2250; t <= 8000; t += 250) {
    const r = pushFpsSample(st, 60, t, { currentCount: 50000 }); st = r.state; if (r.suggest) fires++
  }
  eq(fires, 0, 'brief 2s dip never suggests')
}

// --- recovery resets the streak (low, recover, low again needs full window) ---
{
  let st = createSuggesterState(0)
  // Low 3s (not enough), recover, then low again — the second streak
  // must itself last the full sustain window.
  let r
  r = pushFpsSample(st, 30, 0, { currentCount: 50000 }); st = r.state
  r = pushFpsSample(st, 30, 3000, { currentCount: 50000 }); st = r.state
  eq(r.suggest, null, '3s low not yet enough')
  r = pushFpsSample(st, 60, 3250, { currentCount: 50000 }); st = r.state // recover
  eq(st.lowSince, null, 'recovery clears the streak')
  r = pushFpsSample(st, 30, 3500, { currentCount: 50000 }); st = r.state // low again
  r = pushFpsSample(st, 30, 6000, { currentCount: 50000 }); st = r.state // 2.5s into new streak
  eq(r.suggest, null, 'second streak must restart the clock')
  r = pushFpsSample(st, 30, 7600, { currentCount: 50000 }); st = r.state // >4s into new streak
  ok(r.suggest !== null, 'second streak fires after its own full window')
}

// --- lowest tier never suggests (nothing to drop to) ---
{
  let st = createSuggesterState(0)
  let fires = 0
  for (let t = 0; t <= 12000; t += 250) {
    const r = pushFpsSample(st, 20, t, { currentCount: 2000 }); st = r.state; if (r.suggest) fires++
  }
  eq(fires, 0, 'already on lowest tier → never suggests')
}

// --- enabled:false never suggests ---
{
  let st = createSuggesterState(0)
  let fires = 0
  for (let t = 0; t <= 12000; t += 250) {
    const r = pushFpsSample(st, 20, t, { currentCount: 50000, enabled: false }); st = r.state; if (r.suggest) fires++
  }
  eq(fires, 0, 'disabled → never suggests')
}

// --- cooldown: after a fire, a second low spell within cooldown stays quiet ---
{
  let st = createSuggesterState(0)
  // First fire at ~4s.
  let r, firstFire = null, secondFire = null
  for (let t = 0; t <= 5000; t += 250) {
    r = pushFpsSample(st, 30, t, { currentCount: 50000 }); st = r.state
    if (r.suggest && firstFire === null) firstFire = t
  }
  ok(firstFire !== null, 'first fire happened')
  // Keep fps low — within the 60s cooldown there must be no second fire.
  for (let t = 5250; t <= 50000; t += 250) {
    r = pushFpsSample(st, 30, t, { currentCount: 50000 }); st = r.state
    if (r.suggest && secondFire === null) secondFire = t
  }
  eq(secondFire, null, 'no second fire inside the 60s cooldown')
}

// --- cooldown expiry: after 60s a fresh sustained-low fires again ---
{
  let st = createSuggesterState(0)
  let r, fires = 0
  for (let t = 0; t <= 130000; t += 250) {
    r = pushFpsSample(st, 30, t, { currentCount: 50000 }); st = r.state
    if (r.suggest) fires++
  }
  // ~130s of continuous low with a 60s cooldown → fires roughly at 4s,
  // ~64s, ~124s = 3 times.
  ok(fires >= 2 && fires <= 3, `cooldown lets it re-fire across 130s (got ${fires})`)
}

// --- defensive inputs ---
{
  let st = createSuggesterState(0)
  let r = pushFpsSample(st, NaN, 1000, { currentCount: 50000 })
  eq(r.suggest, null, 'NaN fps → no suggest')
  eq(r.state, st, 'NaN fps → state unchanged ref')
  r = pushFpsSample(st, 30, NaN, { currentCount: 50000 })
  eq(r.suggest, null, 'NaN now → no suggest')
  // null state bootstraps without throwing.
  r = pushFpsSample(null, 30, 0, { currentCount: 50000 })
  ok(r.state && typeof r.state === 'object', 'null state bootstraps')
}

// --- markSuggestionHandled arms the cooldown ---
{
  let st = createSuggesterState(0)
  st = markSuggestionHandled(st, 5000)
  eq(st.lastSuggestAt, 5000, 'handled stamps lastSuggestAt')
  eq(st.lowSince, null, 'handled clears the streak')
  // A sustained low immediately after must wait out the cooldown.
  let r, fires = 0
  for (let t = 5250; t <= 12000; t += 250) {
    r = pushFpsSample(st, 30, t, { currentCount: 50000 }); st = r.state; if (r.suggest) fires++
  }
  eq(fires, 0, 'cooldown after handled blocks immediate re-suggest')
}

// --- purity: input state not mutated ---
{
  const st = createSuggesterState(0)
  const snapshot = JSON.stringify(st)
  pushFpsSample(st, 30, 5000, { currentCount: 50000 })
  eq(JSON.stringify(st), snapshot, 'pushFpsSample does not mutate input state')
}

// --- constants sane ---
ok(LOW_FPS_THRESHOLD > 0 && LOW_FPS_THRESHOLD < 60, 'threshold in a sane range')
ok(SUSTAINED_LOW_MS >= 1000, 'sustain window at least 1s')
ok(SUGGEST_COOLDOWN_MS >= SUSTAINED_LOW_MS, 'cooldown longer than sustain window')

console.log(`PASS: perfSuggest — ${passed} assertions (sustained-low detection, anti-nag cooldown, tier mapping)`)
