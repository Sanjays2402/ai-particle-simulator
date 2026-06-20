# ai-particle-simulator — autoship STATE

Owner-of-record (cron): Cake (cron) `51058514+Sanjays2402@users.noreply.github.com`
Branch: **feature/autoship** (off local main HEAD at 169b31b)
Never merge to main, never tag, never open PRs. Quality gate ONCE per batch.

## App snapshot (so future ticks don't re-read the world)

React 19 + Vite + Three.js + R3F + Drei + EffectComposer (bloom/CA/vignette/noise).
Zustand store (`src/store.js`) holds simulation, UI, AI, persistence.
Per-frame loop in `src/components/ParticleCanvas.jsx` (`Particles` mesh):
  walks every particle, calls compiled preset fn, applies physics, mouse-attract,
  paint attractors, audio scaling, theme hue shift, gradient palette tint.

Existing capabilities (do not re-ship):
- 46 presets, 11 themes, 6 visual styles, 4 force-field types
- Audio reactivity (level / bass / beat)
- Gravity + collisions + spatial-hash physics
- Post-FX: bloom + chromatic aberration + vignette + film-grain
- Recording / replay with timeline scrubber, GIF + WebM/MP4 export
- Mouse attract + Paint mode (drag to drop attractors)
- v2 share URL (round-trips palette, FX, audio, camera flags), Tweet button
- Quality-preset chips, performance auto-throttle, debug HUD (FPS/heap)
- Settings persistence + JSON import/export, error boundary, onboarding tour
- Command palette (⌘K), help overlay (?), mouse trail, mobile drawers

## Roadmap (Cake's queue — never overlap with shipped list above)

Status legend: [ ] todo · [x] done · [/] in-progress

### Batch 1 — discoverability + interaction + visual depth
- [ ] **R1.01** Preset categories + filter chips (group the 46 presets so Shape Presets list is browseable)
- [ ] **R1.02** Kaleidoscope / radial symmetry mode (2/4/6/8-fold rotational mirror of the leader particles)
- [ ] **R1.03** Click-to-drop force-field center (place the active field anywhere instead of always at origin; visible marker)
- [ ] **R1.04** Camera presets — save/restore named camera views with persistence
- [ ] **R1.05** Hue Cycle / animated theme drift (gentle rainbow drift over time, layered on any theme)

### Future queue (refill when batch closes)
- [ ] R2.01 Snapshot gallery — last 8 screenshots stashed in an overlay strip with re-download / share
- [ ] R2.02 Echo / trail FBO that survives EffectComposer (current trails are gl.autoClear hack)
- [ ] R2.03 Camera shake on beat (subtle kick when audio-reactive+beat is on)
- [ ] R2.04 Built-in demo audio loops (so users without a mic can drive audio mode)
- [ ] R2.05 Live preset code viewer/editor (read-only first, edit later) — see preset source
- [ ] R2.06 Stats: total session time, presets visited, GIFs exported, kept in localStorage
- [ ] R2.07 Scene bookmarks panel — save current full scene to localStorage gallery
- [ ] R2.08 3D depth-of-field post-FX (Bokeh) toggle
- [ ] R2.09 Particle "wind" — global directional drift vector + UI sliders
- [ ] R2.10 Multi-preset blend (crossfade two presets over t seconds)
- [ ] R2.11 Color theme editor (build a custom theme with picker, save to localStorage)
- [ ] R2.12 Preset thumbnail rendering during carousel idle (offscreen cache)
- [ ] R2.13 Touch gestures: pinch zoom maps to particle count, two-finger swipe = next preset
- [ ] R2.14 Reduced-motion accessibility mode (respect prefers-reduced-motion)
- [ ] R2.15 Background gradient picker for the canvas clear color (subtle nebula bg)
- [ ] R2.16 Keyboard remap UI (rebind shortcuts, persist)
- [ ] R2.17 Trigonometric noise particle deformer (global "shake" applied after the preset fn)
- [ ] R2.18 Mini-map overlay showing camera angle vs particle bounds
- [ ] R2.19 Auto-cycle presets — slideshow mode, dwell N seconds per preset
- [ ] R2.20 Onscreen MIDI controller mapping (Web MIDI) to live sliders

## TICK LOG
- (this tick adds entries below)
