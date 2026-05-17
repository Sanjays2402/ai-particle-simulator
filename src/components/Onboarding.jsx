import { useEffect, useState } from 'react'
import { Sparkles, Keyboard, Shuffle, Zap, ArrowRight, X } from 'lucide-react'

// One-shot welcome card shown on the very first visit. We gate it on a
// localStorage flag so it only shows up once per browser profile. A
// "Show again" affordance lives in Settings later if we want it.
const SEEN_KEY = 'particle-onboarding-v1-seen'

const STEPS = [
  {
    title: 'Welcome to Particle Simulator',
    body: 'A live, GPU-friendly playground for procedural particle scenes. Pick a preset, tweak the sliders, and watch the math come alive.',
    icon: Sparkles,
  },
  {
    title: 'Roll a random scene',
    body: 'Hit the Shuffle button (or press R) for a new preset. Hit Smash (\u26a1) for a fully random combo \u2014 preset, style, theme.',
    icon: Shuffle,
  },
  {
    title: 'Speed up with shortcuts',
    body: 'Press ? any time for the full keyboard cheat sheet. ' +
          'Space plays/pauses, S screenshots, F fullscreen, \u2318K opens the command palette.',
    icon: Keyboard,
  },
  {
    title: 'Push it further',
    body: 'Enable Physics (gravity, vortex, attractors), record a clip, export a GIF or WebM video, or share the URL to send a friend the exact scene.',
    icon: Zap,
  },
]

export default function Onboarding() {
  const [visible, setVisible] = useState(false)
  const [step, setStep] = useState(0)

  useEffect(() => {
    // Wait until the splash has gone so we don't double-overlay the user.
    const t = setTimeout(() => {
      try {
        if (!localStorage.getItem(SEEN_KEY)) setVisible(true)
      } catch { /* private mode */ }
    }, 2000)
    return () => clearTimeout(t)
  }, [])

  const close = () => {
    try { localStorage.setItem(SEEN_KEY, '1') } catch { /* ignore */ }
    setVisible(false)
  }

  if (!visible) return null

  const cur = STEPS[step]
  const Icon = cur.icon
  const last = step === STEPS.length - 1

  return (
    <div style={{
      position: 'fixed', bottom: 120, right: 24, zIndex: 100,
      width: 340, maxWidth: '90vw',
      background: 'linear-gradient(180deg, rgba(20,20,30,0.95) 0%, rgba(14,14,22,0.96) 100%)',
      backdropFilter: 'blur(28px) saturate(140%)',
      WebkitBackdropFilter: 'blur(28px) saturate(140%)',
      border: '1px solid rgba(168,85,247,0.3)',
      borderRadius: 16,
      padding: '16px 18px 14px',
      boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 30px rgba(168,85,247,0.18)',
      animation: 'onb-rise 0.35s cubic-bezier(0.2,0.8,0.2,1)',
    }}>
      <style>{`@keyframes onb-rise { from { opacity: 0; transform: translateY(20px) } to { opacity: 1; transform: translateY(0) } }`}</style>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 32, height: 32, borderRadius: 10,
          background: 'linear-gradient(135deg, #6366f1, #a855f7, #ec4899)',
          boxShadow: '0 6px 16px rgba(168,85,247,0.4)',
        }}>
          <Icon size={16} strokeWidth={2.2} color="#fff" />
        </span>
        <button
          onClick={close}
          title="Skip tour"
          style={{
            width: 26, height: 26, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 7, background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.06)', color: '#9a9ab0', cursor: 'pointer',
          }}
        ><X size={13} /></button>
      </div>

      <h3 style={{ fontSize: 14, fontWeight: 600, color: '#eeeef0', marginBottom: 6, letterSpacing: '-0.02em' }}>
        {cur.title}
      </h3>
      <p style={{ fontSize: 12.5, lineHeight: 1.55, color: '#a8a8b8', marginBottom: 14 }}>
        {cur.body}
      </p>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'inline-flex', gap: 5 }}>
          {STEPS.map((_, idx) => (
            <span key={idx} style={{
              width: idx === step ? 18 : 6, height: 6, borderRadius: 3,
              background: idx === step ? 'linear-gradient(90deg, #a855f7, #ec4899)' : 'rgba(255,255,255,0.12)',
              transition: 'all 0.25s cubic-bezier(0.2,0.8,0.2,1)',
            }} />
          ))}
        </div>
        <button
          onClick={() => last ? close() : setStep(s => s + 1)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '7px 14px', borderRadius: 9,
            background: 'linear-gradient(135deg, #6366f1, #a855f7, #ec4899)',
            color: '#fff', border: 'none', cursor: 'pointer',
            fontSize: 12, fontWeight: 600, letterSpacing: '-0.005em',
            boxShadow: '0 4px 14px rgba(168,85,247,0.35)',
          }}
        >
          {last ? 'Got it' : 'Next'}
          {!last && <ArrowRight size={12} strokeWidth={2.4} />}
        </button>
      </div>
    </div>
  )
}
