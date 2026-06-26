import { useEffect, useRef } from 'react'
import { useStore } from '../store'
import { showToast } from './Toast'
import {
  createSuggesterState, pushFpsSample,
} from '../lib/perfSuggest'
import { Gauge } from 'lucide-react'

// Performance auto-suggest driver. Samples the live frame rate once a
// second and feeds it into the pure perfSuggest state machine. When fps
// stays low for a sustained window AND the user isn't already on the
// lowest tier, it surfaces a single one-tap toast offering to drop the
// quality. Anti-nag by construction: at most one suggestion per low
// spell, a long cooldown between spells, and a hard opt-out once the
// user dismisses it for the session.
//
// Renders nothing — it's a headless controller that lives alongside the
// other App-level overlays.
export default function PerfAutoSuggest() {
  const stateRef = useRef(createSuggesterState(performance.now()))
  // Once the user dismisses (or we've accepted) we set this so we never
  // pester them again this session. Persisted opt-out would be heavier
  // than warranted — a fresh page load is a fresh chance to help.
  const optedOutRef = useRef(false)

  useEffect(() => {
    let frames = 0
    let last = performance.now()
    let raf = 0
    const loop = (t) => {
      frames++
      const dt = t - last
      if (dt >= 1000) {
        const fps = (frames * 1000) / dt
        frames = 0
        last = t
        if (!optedOutRef.current) {
          const { particleCount, performanceMode } = useStore.getState()
          // If the user already flipped on the auto-throttle perf mode,
          // don't second-guess them with a tier-drop suggestion.
          const enabled = !performanceMode
          const r = pushFpsSample(stateRef.current, fps, t, {
            currentCount: particleCount,
            enabled,
          })
          stateRef.current = r.state
          if (r.suggest) showSuggestion(r.suggest)
        }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  // Show the drop-quality toast. The action chip applies the suggested
  // tier and opts the user out for the rest of the session (they've
  // handled it — no reason to ask again). If they IGNORE the toast, the
  // 60s cooldown in the state machine prevents another suggestion until
  // a full minute of continued struggle has passed, so at worst it's a
  // gentle once-a-minute nudge while the GPU is genuinely overloaded.
  const showSuggestion = (suggest) => {
    const { targetTier, fps } = suggest
    showToast(
      `Running at ${fps} fps — drop to ${targetTier.label} for smoother motion?`,
      <Gauge size={15} strokeWidth={2.2} color="#fbbf24" />,
      {
        label: `Set ${targetTier.label}`,
        onClick: () => {
          const s = useStore.getState()
          if (s.performanceMode) s.setPerformanceMode(false)
          s.setParticleCount(targetTier.count)
          // Accepted → never suggest again this session.
          optedOutRef.current = true
        },
      },
    )
  }

  return null
}
