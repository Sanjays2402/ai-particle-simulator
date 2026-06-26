import { useEffect, useRef } from 'react'
import { useStore } from '../store'
import { showToast } from './Toast'
import {
  createSuggesterState, pushFpsSample, pickHeaviestActivePostFx,
  chooseSuggestionRemedy,
} from '../lib/perfSuggest'
import { Gauge } from 'lucide-react'

// Performance auto-suggest driver. Samples the live frame rate once a
// second and feeds it into the pure perfSuggest state machine. When fps
// stays low for a sustained window it surfaces a single one-tap toast.
//
// R35.D — lighter-touch remedy: if a heavy post-processing pass
// (depth-of-field / film grain / chromatic aberration / vignette) is
// ON, the toast offers to turn THAT off first — it's often the single
// biggest win and keeps the user's particle count + look mostly intact.
// Only when no heavy FX is active does it fall back to dropping the
// quality tier. Because an FX disable is available even on the lowest
// particle tier, the suggester is allowed to fire there too (via the
// fxAvailable flag) — previously a low-tier user with DoF on got no help.
//
// Anti-nag by construction: at most one suggestion per low spell, a long
// cooldown between spells, and a hard opt-out once the user acts.
// Renders nothing — a headless controller alongside the other overlays.
export default function PerfAutoSuggest() {
  const stateRef = useRef(createSuggesterState(performance.now()))
  // Once the user acts (or dismisses) we set this so we never pester
  // them again this session. A fresh page load is a fresh chance to help.
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
          const s = useStore.getState()
          const { particleCount, performanceMode } = s
          // If the user already flipped on the auto-throttle perf mode,
          // don't second-guess them with a suggestion.
          const enabled = !performanceMode
          // A heavy post-FX being ON means we have a remedy to offer even
          // on the lowest particle tier — let the suggester fire there.
          const fxAvailable = pickHeaviestActivePostFx(s) !== null
          const r = pushFpsSample(stateRef.current, fps, t, {
            currentCount: particleCount,
            enabled,
            fxAvailable,
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

  // Show the remedy toast. We re-read the live FX flags AT FIRE TIME (not
  // when the streak started) so a pass the user toggled off in the
  // meantime isn't suggested. The action chip applies the remedy and
  // opts the user out for the session.
  const showSuggestion = (suggest) => {
    const remedy = chooseSuggestionRemedy(suggest, useStore.getState())
    if (!remedy) return
    if (remedy.kind === 'postfx') {
      const { fx, fps } = remedy
      showToast(
        `Running at ${fps} fps — turn off ${fx.label} for a quick boost?`,
        <Gauge size={15} strokeWidth={2.2} color="#fbbf24" />,
        {
          label: `Disable ${fx.label}`,
          onClick: () => {
            const s = useStore.getState()
            const setter = s[fx.setter]
            if (typeof setter === 'function') setter(false)
            optedOutRef.current = true
          },
        },
      )
      return
    }
    // Tier-drop fallback.
    const { targetTier, fps } = remedy
    showToast(
      `Running at ${fps} fps — drop to ${targetTier.label} for smoother motion?`,
      <Gauge size={15} strokeWidth={2.2} color="#fbbf24" />,
      {
        label: `Set ${targetTier.label}`,
        onClick: () => {
          const s = useStore.getState()
          if (s.performanceMode) s.setPerformanceMode(false)
          s.setParticleCount(targetTier.count)
          optedOutRef.current = true
        },
      },
    )
  }

  return null
}
