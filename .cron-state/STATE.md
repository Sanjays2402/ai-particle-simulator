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
- Audio reactivity (level / bass / beat) — mic OR built-in demo loops (4 kinds)
- Gravity + collisions + spatial-hash physics
- Post-FX: bloom + chromatic aberration + vignette + film-grain
- Recording / replay with timeline scrubber, GIF + WebM/MP4 export
- Mouse attract + Paint mode (drag to drop attractors)
- v2 share URL (round-trips palette, FX, audio, camera flags), Tweet button
- Quality-preset chips, performance auto-throttle, debug HUD (FPS/heap)
- Settings persistence + JSON import/export, error boundary, onboarding tour
- Command palette (⌘K), help overlay (?), mouse trail, mobile drawers
- Preset category filter chips, kaleidoscope, hue cycle, click-drop force fields
- Saved camera views (V quick-save, up to 6), camera shake on beat
- Session stats (lifetime presets / gifs / screenshots / time)
- Snapshot gallery (last 8 PNGs in localStorage, re-download + delete)
- Live preset source viewer (read-only, copy button, syntax-coloured)
- Scene bookmarks (B quick-save, up to 12, preset + palette + FX + force + camera shake)
- Custom background gradient (alpha canvas + CSS layer, 6 nebula chips, 0-360 angle)
- Slideshow / auto-cycle presets (sequence / shuffle / favourites, 2-60s dwell)
- Crossfade between presets (smoothstep ramp, 0.5-10s, progress bar + cancel)
- Reduced-motion mode (auto/reduce/full, gates hue cycle, auto-rotate, shake, orbs, splash)

## Roadmap (Cake's queue — never overlap with shipped list above)

Status legend: [ ] todo · [x] done · [/] in-progress

### Batch 1 — discoverability + interaction + visual depth  (SHIPPED)
- [x] **R1.01** Preset categories + filter chips  — 2514538
- [x] **R1.02** Kaleidoscope / radial symmetry mode  — 4699716
- [x] **R1.03** Click-to-drop force-field center  — 2dc8c73
- [x] **R1.04** Camera presets — save/restore named camera views  — b3418a5
- [x] **R1.05** Hue Cycle / animated theme drift  — c63ab97

### Batch 2 — gallery + telemetry + audio expansion  (SHIPPED)
- [x] **R2.06** Session stats panel (presets/gifs/screenshots/time, persisted)  — 848240e
- [x] **R2.01** Snapshot gallery (last 8 screenshots in overlay strip)  — 2a829de
- [x] **R2.03** Camera shake on beat (subtle audio-driven kick)  — 88520e3
- [x] **R2.05** Live preset code viewer (read-only, copy, syntax-coloured)  — b6418b3
- [x] **R2.04** Built-in demo audio loops (pulse/bass/arp/ambient, no mic needed)  — 4f85470
  (+ dee8108 lint-gate cleanup for the demo audio feature)

Note: R2.02 (Echo / trail FBO that survives EffectComposer) was deferred
out of this batch — it's a render-pipeline refactor that doesn't fit a
single slice. Will revisit as its own dedicated batch.

### Batch 3 — persistence + show reel + accessibility  (SHIPPED)
- [x] **R3.01** Scene bookmarks panel (full-scene save/restore, B/Shift+B shortcuts)  — 800f2f3
- [x] **R3.02** Background gradient picker (alpha canvas + CSS layer, 6 nebulas)  — d709811
- [x] **R3.03** Auto-cycle presets — slideshow mode (sequence/shuffle/favs, 2-60s)  — bd78841
- [x] **R3.04** Multi-preset blend (crossfade with smoothstep ease, 0.5-10s)  — 22e4091
- [x] **R3.05** Reduced-motion accessibility mode (OS-aware + 3-mode override)  — 9e4239f

### Batch 4 — next 5 (refilled)
- [ ] R4.01 3D depth-of-field post-FX (Bokeh) toggle
- [ ] R4.02 Particle "wind" — global directional drift vector + UI sliders
- [ ] R4.03 Color theme editor (build a custom theme with picker, save to localStorage)
- [ ] R4.04 Trigonometric noise particle deformer (global "shake" applied after the preset fn)
- [ ] R4.05 Touch gestures: pinch zoom maps to particle count, two-finger swipe = next preset

### Future queue (refill when batch closes)
- [ ] R4.06 Keyboard remap UI (rebind shortcuts, persist)
- [ ] R4.07 Mini-map overlay showing camera angle vs particle bounds
- [ ] R4.08 Onscreen MIDI controller mapping (Web MIDI) to live sliders
- [ ] R4.09 Echo / trail FBO that survives EffectComposer (R2.02 deferred — render pipeline refactor)
- [ ] R4.10 Editable preset code viewer (graduate the R2.05 viewer to a contenteditable + re-compile)
- [ ] R4.11 Snapshot grid view (modal showing all 8 snapshots in a grid w/ full-res preview)
- [ ] R4.12 Audio waveform overlay (oscilloscope strip showing the actual signal)
- [ ] R4.13 Camera path animator (interpolate between saved views over N seconds)
- [ ] R4.14 OpenGraph snapshot endpoint (server-rendered card for share URLs)
- [ ] R4.15 Preset thumbnail rendering during carousel idle (offscreen cache)
- [ ] R4.16 Slideshow that respects category filter chips (currently walks the whole library)
- [ ] R4.17 Bookmark export/import as JSON (share entire collections)
- [ ] R4.18 Random scene generator that fully randomises bookmark fields (smash → save)
- [ ] R4.19 Cross-fade timing chips (0.5s / 2s / 5s / 10s presets in the Crossfade panel)
- [ ] R4.20 Audio-reactive background gradient (cycle hue of the bg with beat)

## TICK LOG
- 2026-06-19 23:41 PT — Bootstrap + Batch 1 (5/5).
  Commits: b66f8e7 (bootstrap), 2514538 (R1.01 categories), 4699716 (R1.02 kaleidoscope),
  c63ab97 (R1.05 hue cycle), b3418a5 (R1.04 camera views), 2dc8c73 (R1.03 place-field).
  Gates: lint baseline preserved (23 errors, 3 warnings — all pre-existing).
  Build: 283ms green. Unit tests: 4/4 pass (cameraViews, hueCycle, kaleidoscope, presetCategories).
- 2026-06-20 03:57 PT — Batch 2 (5/5).
  Commits: 848280e (R2.06 session stats), 2a829de (R2.01 snapshot gallery),
  88520e3 (R2.03 camera shake on beat), b6418b3 (R2.05 live code viewer),
  4f85470 (R2.04 demo audio loops), dee8108 (lint-gate cleanup for 4f85470).
  Gates: lint baseline preserved (23 errors, 3 warnings — all pre-existing).
  Build: 299ms green. Unit tests: 9/9 pass (cameraShake, cameraViews, codeTokens,
  demoAudioLoops, hueCycle, kaleidoscope, presetCategories, sessionStats,
  snapshotGallery).
  Note: R2.02 deferred — render pipeline refactor needs its own batch.
- 2026-06-20 07:26 PT — Batch 3 (5/5).
  Commits: 800f2f3 (R3.01 scene bookmarks), d709811 (R3.02 bg gradient),
  bd78841 (R3.03 slideshow), 22e4091 (R3.04 crossfade), 9e4239f (R3.05 reduced motion).
  Gates: lint baseline preserved (23 errors, 3 warnings — all pre-existing).
  R3.04 transiently raised the count to 24 (missing useEffect import in LeftSidebar);
  R3.05's import fix restored baseline by the time the batch was gated.
  Build: 302ms green. Unit tests: 14/14 pass (bgGradient, cameraShake, cameraViews,
  codeTokens, crossfade, demoAudioLoops, hueCycle, kaleidoscope, presetCategories,
  reducedMotion, sceneBookmarks, sessionStats, slideshow, snapshotGallery).
