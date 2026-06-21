# ai-particle-simulator — autoship STATE

Owner-of-record (cron): Cake (cron) `51058514+Sanjays2402@users.noreply.github.com`
Branch: **main** — autoship works directly on `main`, gates ONCE per batch, never PR/tag/release.
Never reset or force-push; preserve any unpushed local commits that may sit ahead of origin.

## App snapshot (so future ticks don't re-read the world)

React 19 + Vite + Three.js + R3F + Drei + EffectComposer (bloom/CA/vignette/noise).
Zustand store (`src/store.js`) holds simulation, UI, AI, persistence.
Per-frame loop in `src/components/ParticleCanvas.jsx` (`Particles` mesh):
  walks every particle, calls compiled preset fn, applies physics, mouse-attract,
  paint attractors, audio scaling, theme hue shift, gradient palette tint.

Existing capabilities (do not re-ship):
- 46 presets, 11 themes + user-authored custom themes, 6 visual styles, 4 force-field types
- Audio reactivity (level / bass / beat) — mic OR built-in demo loops (4 kinds)
- Gravity + collisions + spatial-hash physics + global wind drift
- Post-FX: bloom + chromatic aberration + vignette + film-grain + depth-of-field (Bokeh)
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
- Scene bookmarks (B quick-save, up to 12, preset + palette + FX + force + camera shake + NAMED ATTRACTORS)
- Custom background gradient (alpha canvas + CSS layer, 6 nebula chips, 0-360 angle, optional audio-reactive hue)
- Slideshow / auto-cycle presets (sequence / shuffle / favourites, 2-60s dwell)
- Crossfade between presets (smoothstep ramp, 0.5-10s, progress bar + cancel, duration chips)
- Reduced-motion mode (auto/reduce/full, gates hue cycle, auto-rotate, shake, orbs, splash)
- Trig-noise particle deformer (global wiggle layered on top of any preset)
- Custom theme editor (name + accent + hue, 12-theme cap, localStorage, JSON pack export/import)
- Touch gestures (two-finger pinch = particle count, swipe = preset nav)
- Rebindable keyboard shortcuts (Settings → Keyboard panel, conflict detection, layout-independent codes)
- Mini-map overlay (top-down XZ widget, click to recenter orbit target, SAVED CAMERA VIEWS as clickable green dots)
- Web MIDI controller mapping (CC → 14 live store actions, Learn workflow, always-on hook, CONTROLLER PRESETS: nanoKONTROL2 / Launch Control XL / MPK Mini / Generic 8-knob with auto-detect by device name)
- Editable preset source viewer (textarea + live validate + Compile/Revert/Cancel, INLINE ERROR LINE MARKER with jump-to-line button)
- Live audio waveform / oscilloscope overlay (pinned top-right, peak-aware glow, time/freq mode switch, FREQ MODE LINEAR/LOG SCALE chip)
- Snapshot grid view + full-res lightbox (4-up grid, arrow-key navigation, persisted view pref)
- Camera path animator (smooth-tween between saved views, loop toggle, 0.5-30s/segment)
- Slideshow respects category filter chips (sequence + shuffle scoped, favourites bypass)
- Bookmark export/import as JSON (tagged envelope, merge/replace, 256KB cap)
- Wind preset chips (Calm / Breeze / Gale / Storm — one-tap weather configs)
- Crossfade duration chips (Snap / Fast / Cinematic / Drift — one-tap blend timings)
- Audio-reactive background gradient (CSS hue-rotate per active audio band)
- Smash & Save — one-tap fully random bookmark scene (47 fields rolled + saved)
- Custom theme JSON pack export/import (parallels bookmarks IO)
- Carousel thumbnail pre-rendering during idle frames (offscreen Canvas2D sampler, ~64/session cap)
- Keyboard remap JSON export/import (Settings → Keyboard, merge vs replace modes)
- Waveform overlay mode switch (oscilloscope vs 32-bar frequency spectrum, persisted)
- Mobile gesture hint overlay (first-run, auto-dismiss after both gestures shown)
- Custom theme survives reload (boot-time resolver — handles deleted themes too)
- Named attractors — multiple coexisting force-field objects (per-attractor type/strength/radius/place-on-canvas, up to 12, persisted, round-trip through scene bookmarks)
- MIDI controller preset bundles (nanoKONTROL2 / LCXL / MPK Mini / Generic-8, auto-detect by device name, one-tap apply)
- Preset editor inline error line marker + jump-to-line button
- Minimap renders saved camera views as clickable green dots
- Spectrum waveform: log-frequency scale mode + peak-hold lines that decay slowly (R10.19, hold + decay state machine, classic EQ visual, hsla tint per bar, persisted `pk` chip in overlay)
- Snapshot lightbox: pinch-zoom 1x-5x + drag-pan when zoomed + double-tap toggle (zoomed-in/idle, tap-centered), mobile touch + desktop wheel intent helper, header zoom badge + Reset, nav suppressed while zoomed
- Camera path: per-view up/down arrow reorder (also: monospace path-order index column on every saved view row, reorder helpers in cameraViews.js)
- Carousel: per-preset thumbnail rebuild button (hover-shown ↻ on top-left of each tile, spinning while busy, dim overlay during compile)
- Theme pack import: preview panel before commit (chips with colour + name, name-collision badges, live impact line per mode, Apply disabled when no-op)
- Bookmark export bundles saved camera views in a single v2 JSON envelope (combined "particle-scenes+views-…json"; import absorbs both via mergeImportViews + saveCameraViews and fires particle:camera-views-changed)
- Wind preset chips support long-press to overwrite a slot with current sliders (per-slot localStorage overrides, violet ↺ reset badge, resolveWindPresets mutates the live WIND_PRESETS in place)
- Crossfade duration chips support long-press to bind seconds to the slider value (pink ↺ reset badge, parallel override storage, disabled-while-blend-active gating)
- Snapshot lightbox keyboard zoom (+/=/-/_/0) + cursor-anchored mouse-wheel zoom on desktop (mirrors the pinch state machine — same anchor math, MIN/MAX bounds, snap-to-idle on cross-back)
- Minimap saved-view dots now show a small floating tooltip on hover with the view name (tooltipPlacement helper handles edge-flipping + horizontal slide-into-bounds + tiny-canvas fallback; hovered dot also paints brighter + larger)
- Audio-reactive bg gradient curve preset chips — Linear / Pulse / Ramp / Hold reshape the audio signal before the linear hue map (shapeReactiveSignal + REACTIVE_CURVES); pulse uses sqrt-boost from neutral, ramp is ease-in cubic, hold pins at neutral until past 0.5. Round-trips through scene bookmarks.
- Smash & Save bias chips — Mostly Calm / Surprise / Mostly Wild profiles parameterise every random range (counts/speed/glow/attract/chances/force-type weighting). Persisted across sessions, toast labels the bias chosen, calm bias produces avg ~9K particles vs wild ~33K.
- MIDI controller can route a CC to a specific named attractor's STRENGTH (e.g. `attr:attr-3:strength`); per-attractor rows appear in the MIDI panel below the built-in bindings; deleted attractor → silent no-op + "missing" label; saves through localStorage round-trip.
- Wind chip overrides export/import as portable JSON envelope (kind=`ai-particle-simulator/wind-overrides`, v1); 3-button row (Export / Import-merge / Import-replace) below the Wind sliders; parses bare-items shorthand too; size cap 32 KB.
- Snapshot lightbox: WASD pan when zoomed (+ hjkl for vim users); each press moves ~15% of stage scaled by current zoom; preventDefault only when zoomed so WASD stays free at idle; bound to existing clampTranslate so image can't float off stage.
- Crossfade chip overrides export/import as portable JSON envelope (kind=`ai-particle-simulator/crossfade-overrides`, v1); direct parallel to wind IO — same 3-button row below the chip grid, same merge-vs-replace modes, same 32 KB cap, bare-items shorthand, sanitize-on-load clamping.
- Minimap: shift+click a green saved-view dot to delete it inline (skips the trip to RightSidebar → CameraViews → trash); fires particle:camera-views-changed so RightSidebar re-syncs without refresh; new removeView helper in cameraViews.js with ref-equal-on-no-op contract; tooltip updated to advertise the gesture.
- MIDI per-attractor routing now supports STRENGTH + RADIUS + X + Y + Z (was strength-only); each field gets its own row grouped under the attractor's name in the MIDI panel; x/y/z setter reads the LIVE position triple at apply-time so concurrent axis sweeps don't undo each other; parseAttractorActionId now validates the field too so stale action ids become silent no-ops.
- Keymap import: live diff PREVIEW panel before committing (replaces the old window.confirm flow); shows which bindings will change with fromCode → toCode chips; replace mode flags resets with an amber RESET tag; merge/replace toggle recomputes the diff in-place; Apply gated on willChange > 0; new summarizeImportImpact() helper in keymapIO.js with stable ACTIONS-order diffs.
- MIDI user-authored controller preset bundle EDITOR: save the current binding map as a named bundle (vendor='Custom'), see your bundles in a second row of the chip bar (pink-keyed to distinguish from shipped), apply with the same merge/replace gesture, delete inline; capped at 8 with FIFO-drop-oldest; load/save round-trip sanitizes corrupt rows; "+ Save current as bundle" button with inline name input.

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

### Batch 4 — post-FX + physics + theming + mobile  (SHIPPED)
- [x] **R4.01** Depth-of-field (Bokeh) post-FX toggle  — 63c2eb7
- [x] **R4.02** Particle wind — global directional drift  — c54ae58
- [x] **R4.03** Custom theme editor — name + accent + hue, localStorage  — 34fad36
- [x] **R4.04** Trig-noise particle deformer — global wiggle  — f77aa66
- [x] **R4.05** Touch gestures — pinch=count, swipe=preset  — 19decc5

### Batch 5 — power-user controls + observability  (SHIPPED)
- [x] **R5.01** Keyboard remap UI (rebind shortcuts, conflict flags, persist)  — 3f2a893
- [x] **R5.02** Mini-map overlay showing camera vs particle bounds  — a6f1d8e
- [x] **R5.03** Web MIDI controller mapping (CC → live sliders)  — 483708f
- [x] **R5.04** Editable preset code viewer (graduated from R2.05 read-only)  — df1aa6c
- [x] **R5.05** Audio waveform overlay (oscilloscope strip on the real signal)  — d27a408

### Batch 6 — gallery polish + camera cinema + scoped slideshow + IO + wind chips  (SHIPPED)
- [x] **R6.01** Snapshot grid view + full-res lightbox  — 4150c37
- [x] **R6.02** Camera path animator — smooth tween between saved views  — 7c33991
- [x] **R6.03** Slideshow respects category filter chips  — 33cfcae
- [x] **R6.04** Bookmark export/import as JSON  — fc47f64
- [x] **R6.05** Wind preset chips (Calm/Breeze/Gale/Storm)  — ae16d39

### Batch 7 — crossfade chips + reactive bg + smash-save + theme IO + thumb prerender  (SHIPPED)
- [x] **R7.04** Cross-fade timing chips (Snap/Fast/Cinematic/Drift) — d723782
- [x] **R7.05** Audio-reactive background gradient (CSS hue-rotate per band) — 570da2c
- [x] **R7.03** Smash & Save — fully randomised bookmark scene — b9386cc
- [x] **R7.08** Custom theme JSON pack export/import — 12b635d
- [x] **R7.02** Preset thumbnail pre-renderer (idle Canvas2D sampler) — 84c910e

Note: R7.01 (server-rendered OG snapshot endpoint) deferred — this is a
static Vite app, no server runtime available. Will revisit if/when a
backend lands (Cloudflare Worker, Vercel function, etc.).

### Batch 8 — keymap IO + waveform spectrum + mobile hint + custom theme boot + named attractors  (SHIPPED)
- [x] **R8.05** Keymap quick-export (round-trip keymap as JSON via Settings)  — 2da8c81
- [x] **R8.07** Waveform mode switch (time-domain vs frequency-spectrum bars)  — 1ade1b4
- [x] **R8.04** Mobile-only gesture hint overlay shown on first run  — 30e5839
- [x] **R8.03** Custom theme set as default-on-load (auto-applied if active when reloading)  — 086bf76
- [x] **R8.02** Particle attractors as named objects (multiple types coexist, drag-to-replace via click-canvas)  — 1a7139b

Note: R8.01 (Echo / trail FBO that survives EffectComposer) deferred
again — render pipeline refactor still needs its own dedicated batch.

### Batch 9 — MIDI presets + editor error line + minimap dots + bookmark attractors + log spectrum  (SHIPPED)
- [x] **R9.03** MIDI controller preset bundles (nanoKONTROL2 / LCXL / MPK Mini / Generic-8) — 06ef6ea
- [x] **R9.04** Preset editor inline error line marker + jump-to-line button — 39ef5e4
- [x] **R9.05** Minimap renders saved camera views as clickable dots — 67a0611
- [x] **R9.17** Named attractors round-trip through scene bookmarks (substituted from future queue) — 7677f1e
- [x] **R9.19** Spectrum waveform log-frequency scale mode (substituted from future queue) — c4e23b0

Note: R9.01 (Echo / trail FBO that survives EffectComposer) deferred
yet again — render pipeline refactor needs its own dedicated batch.
R9.02 (Named attractor 3D drag handle) also deferred — proper 3-axis
drag-handle is its own batch (needs r3f gizmo integration). Substituted
R9.17 and R9.19 from the future queue to keep the batch at 5 great
slices instead of padding.

### Batch 10 — camera-path reorder + lightbox pinch-zoom + per-preset thumb rebuild + spectrum peak-holds + theme pack preview  (SHIPPED)
- [x] **R10.03** Camera path waypoint reorder (up/down arrows on each saved view, monospace index column)  — fe7688d
- [x] **R10.04** Snapshot lightbox: pinch-zoom 1x-5x + drag-pan + double-tap toggle (mobile)  — 1770bf3
- [x] **R10.11** Per-preset thumbnail rebuild button in the carousel  — 0a39b5c
- [x] **R10.19** Spectrum waveform: peak-hold lines that decay slowly (classic EQ look)  — d035cc0
- [x] **R10.10** Theme pack browser — preview a JSON pack's themes before importing  — 0f50192

Note: R10.01 (Echo / trail FBO that survives EffectComposer) and R10.02
(Named attractor 3D drag handle) deferred again — both need their own
dedicated render-pipeline / r3f-gizmo batches. Substituted R10.11,
R10.19, R10.10 from the future queue to keep the batch at 5 great
slices instead of padding.

### Batch 11 — combined bookmarks IO + wind/crossfade long-press + lightbox keyboard zoom + minimap tooltips  (SHIPPED)
- [x] **R11.03** Bookmark export includes the live camera-view list (one combined file)  — 7ef133b
- [x] **R11.04** Wind preset chips become custom-named (long-press a slot to save sliders)  — 5318503
- [x] **R11.05** Crossfade chips: long-press a slot to bind its seconds to the current slider value  — 0008aa6
- [x] **R11.15** Snapshot lightbox: keyboard zoom-in/out via +/-/0 when on desktop (mirrors pinch behaviour)  — 8196251
- [x] **R11.13** Minimap: per-view labels on hover (small floating tooltip with view name)  — e2e9781

Note: R11.01 (Echo / trail FBO that survives EffectComposer) and R11.02
(Named attractor 3D drag handle) deferred again — both need their own
dedicated render-pipeline / r3f-gizmo batches. Substituted R11.15 and
R11.13 from the future queue to keep the batch at 5 great slices
instead of padding.

### Batch 12 — bg curve chips + smash bias + attractor MIDI + wind IO + lightbox WASD  (SHIPPED)
- [x] **R12.03** Audio reactive bg: animation curve preset chips (Pulse / Ramp / Hold) — af12643
- [x] **R12.04** Smash & Save: bias chips ("Mostly Calm", "Mostly Wild", "Surprise") — e2a382b
- [x] **R12.05** Named attractor → MIDI: route a CC to a specific attractor's strength — 9c41d20
- [x] **R12.17** Wind chip overrides: export/import the override map as JSON — e32c54e
- [x] **R12.19** Lightbox: pan with WASD when zoomed (desktop alternative to drag) — fc830d0

Note: R12.01 (Echo / trail FBO that survives EffectComposer) and R12.02
(Named attractor 3D drag handle) deferred again — both need their own
dedicated render-pipeline / r3f-gizmo batches. Substituted R12.17 and
R12.19 from the future queue to keep the batch at 5 great slices
instead of padding.

### Batch 13 — crossfade IO + minimap delete + per-attractor MIDI axes + keymap diff preview + user bundle editor  (SHIPPED)
- [x] **R13.14** Crossfade chip overrides: export/import the override map as JSON — 909743a
- [x] **R13.15** Minimap: shift+click a green dot to delete the saved view inline — 3621083
- [x] **R13.18** Per-attractor MIDI: route a CC to RADIUS or X/Y/Z (currently strength-only) — f10372c
- [x] **R13.04** Keymap import: live diff preview before committing — b5e7778
- [x] **R13.05** MIDI controller preset bundle EDITOR (save current mapping as user's own bundle) — ea06bf9

Note: R13.01 (Echo / trail FBO that survives EffectComposer) and R13.02
(Named attractor 3D drag handle) deferred again — both need their own
dedicated render-pipeline / r3f-gizmo batches. R13.03 (server-rendered
OG snapshot endpoint) still deferred — static Vite app, no backend
runtime available. Substituted R13.14, R13.15, R13.18 from the future
queue to keep the batch at 5 great slices instead of padding.

### Batch 14 — next 5 (refilled)
- [ ] R14.01 Echo / trail FBO that survives EffectComposer (carried over — render pipeline refactor, dedicated batch)
- [ ] R14.02 Named attractor 3D drag handle (carried over — needs r3f gizmo handles, dedicated batch)
- [ ] R14.03 OpenGraph snapshot endpoint (server-rendered card for share URLs) — needs backend [carried over]
- [ ] R14.04 Preset editor: gutter overlay highlighting all error lines (multi-error mode) [was R13.06]
- [ ] R14.05 Named attractor type-specific color cues in the UI (vortex purple, repulsor red, etc.) [was R13.07]

### Future queue (refill when batch closes)
- [ ] R14.06 Carousel: bulk "rebuild all stale thumbs" action in the filter button menu [was R13.08]
- [ ] R14.07 Spectrum peak-holds: per-bar fade-out tail (last 200ms still painted at low alpha) for an even more cinematic look [was R13.09]
- [ ] R14.08 Theme pack preview: drag a JSON onto the sidebar to preview without the file picker [was R13.10]
- [ ] R14.09 Camera path: drag-and-drop reorder (graduates from arrow-button slice R10.03) [was R13.11]
- [ ] R14.10 Snapshot grid: long-press a tile to multi-select for bulk delete [was R13.12]
- [ ] R14.11 Bookmark bundle export: drag a saved-view dot from the minimap onto the export button to selectively bundle just that view [was R13.13]
- [ ] R14.12 Audio-reactive bg curve chips → add a custom curve editor for power users (visual spline / 3-knot bezier) [was R13.16]
- [ ] R14.13 Smash bias: user-editable per-chip ranges (open the bias as JSON, tweak, re-save) [was R13.17]
- [ ] R14.14 Lightbox WASD pan: hold to repeat (auto-repeat on key-held for smoother sweeps) [was R13.19]
- [ ] R14.15 Wind override import: preview panel (diff against current overrides) before committing [was R13.20]
- [ ] R14.16 Crossfade override import: preview panel (diff against current overrides) — parallel to keymap R13.04 + wind R13.20
- [ ] R14.17 MIDI user bundle: export/import a single bundle as a JSON file (share between machines)
- [ ] R14.18 MIDI user bundle: rename in-place (currently delete + re-save is the only path)
- [ ] R14.19 Minimap: hover a saved-view dot for ~1s shows a thumbnail preview (canvas2D sample of the scene from that camera)
- [ ] R14.20 Per-attractor MIDI: route CC to ENABLED toggle (button-style with hysteresis around 0.5)

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
- 2026-06-20 11:24 PT — Batch 4 (5/5).
  Commits: 63c2eb7 (R4.01 DoF/Bokeh), c54ae58 (R4.02 wind), 34fad36 (R4.03 custom themes),
  f77aa66 (R4.04 noise deformer), 19decc5 (R4.05 touch gestures).
  Gates: lint baseline preserved (23 errors, 3 warnings — all pre-existing).
  Build: 7m 15s green (this volume is slow, not the code).
  Unit tests: 19/19 pass (added depthOfField, wind, customThemes, noiseDeformer,
  touchGestures · 119 fresh asserts this batch).
- 2026-06-20 15:38 PT — Batch 5 (5/5).
  Commits: 3f2a893 (R5.01 keymap), a6f1d8e (R5.02 minimap), 483708f (R5.03 MIDI),
  df1aa6c (R5.04 editable viewer), d27a408 (R5.05 waveform overlay).
  Gates: lint baseline preserved (23 errors, 3 warnings — all pre-existing).
  Build: 835 ms green. Unit tests: 24/24 pass (added keymap, minimap, midiMap,
  presetEditor, waveform · 150+ fresh asserts this batch).
- 2026-06-20 18:25 PT — Batch 6 (5/5).
  Commits: 4150c37 (R6.01 snapshot grid + lightbox), 7c33991 (R6.02 camera path),
  33cfcae (R6.03 slideshow category scoping), fc47f64 (R6.04 bookmark export/import),
  ae16d39 (R6.05 wind weather chips).
  Gates: lint baseline preserved (23 errors, 3 warnings — all pre-existing).
  Build: 856 ms green. Unit tests: 27/27 pass (added snapshotGrid, cameraPath,
  bookmarksIO · 115 fresh asserts this batch; slideshow gained categoryFilter
  coverage; wind gained 19 asserts for the 4 preset chips + matchesWindPreset).
- 2026-06-20 21:33 PT — Batch 7 (5/5).
  Commits: d723782 (R7.04 crossfade duration chips), 570da2c (R7.05 audio-reactive
  bg gradient), b9386cc (R7.03 Smash & Save), 12b635d (R7.08 custom theme pack
  export/import), 84c910e (R7.02 carousel thumbnail prerenderer).
  R7.01 deferred — needs server runtime this static app doesn't have.
  Gates: lint 22 errors / 3 warnings — one BETTER than baseline (zero new errors
  in any of the 11 modified files). Build: 844 ms green. Unit tests: 30/30 files
  pass (added bgGradient audio asserts, crossfade chips, randomScene,
  customThemesIO, presetThumbnails · ~150 fresh asserts this batch).
  SCENE_FIELDS up to 47 (bgGradientAudioReactive + bgGradientAudioStrength
  round-trip through bookmarks too).
- 2026-06-21 00:10 PT — Batch 8 (5/5).
  Commits: 2da8c81 (R8.05 keymap export/import), 1ade1b4 (R8.07 waveform spectrum
  mode), 30e5839 (R8.04 mobile gesture hint), 086bf76 (R8.03 custom theme boot
  resolver), 1a7139b (R8.02 named attractors).
  R8.01 deferred again — render pipeline refactor still needs its own dedicated
  batch. Substituted R8.07 from the future queue. R8.02 ships click-canvas-to-
  place; 3D drag-handle reposition moved to new R9.02.
  Gates: lint 23 errors / 3 warnings — exactly matches baseline (zero new
  errors in any modified file). Build: 1.01 s green (1.6 MB bundle, gzip 488 KB).
  Unit tests: 34/34 files pass (added keymapIO, mobileGestureHint, activeThemeBoot,
  namedAttractors; waveform extended with spectrum mode · 100+ fresh asserts
  this batch).
- 2026-06-21 03:37 PT — Batch 9 (5/5).
  Commits: 06ef6ea (R9.03 MIDI controller preset bundles),
  39ef5e4 (R9.04 preset editor inline error line + jump-to-line),
  67a0611 (R9.05 minimap saved-view dots), 7677f1e (R9.17 namedAttractors
  round-trip through scene bookmarks — substituted from future queue),
  c4e23b0 (R9.19 spectrum log-frequency scale — substituted from future queue).
  R9.01 and R9.02 deferred again — render pipeline refactor and 3D drag-handle
  each need their own dedicated batch. Working directly on main from this batch
  onward (no more feature/autoship branch).
  Gates: lint 23 errors / 3 warnings — exactly matches baseline (zero new
  errors in any of the 7 modified .js/.jsx files). Build: 1.21 s green (1.63 MB
  bundle, gzip 491 KB). Unit tests: 35/35 files pass (added midiPresets; extended
  presetEditor with parseSyntaxErrorLocation/lineRangeInSource, minimap with
  projectSavedViews/pickNearestMarker, sceneBookmarks with namedAttractors
  round-trip, waveform with projectSpectrumToLogBars · ~90 fresh asserts this
  batch). SCENE_FIELDS up to 48 (namedAttractors round-trips through bookmarks).
- 2026-06-21 06:31 PT — Batch 10 (5/5).
  Commits: fe7688d (R10.03 camera path waypoint reorder),
  1770bf3 (R10.04 snapshot lightbox pinch-zoom + drag-pan + double-tap),
  0a39b5c (R10.11 per-preset thumbnail rebuild button),
  d035cc0 (R10.19 spectrum peak-hold lines), 0f50192 (R10.10 theme pack
  preview panel — substituted from future queue).
  R10.01 and R10.02 deferred again — render pipeline refactor and 3D
  drag-handle each need their own dedicated batch. Substituted R10.11,
  R10.19, R10.10 from the future queue.
  Gates: lint 23 errors / 3 warnings — exactly matches baseline (zero new
  errors in any of the 8 modified .js/.jsx files; new `react-hooks/refs`
  fix on Lightbox and `react-hooks/set-state-in-effect` fix via
  queueMicrotask). Build: 1.03 s green (1.65 MB bundle, gzip 495 KB).
  Unit tests: 36/36 files pass (added pinchZoom; extended cameraViews
  with moveView/moveViewUp/moveViewDown reorder, presetThumbnails with
  clearThumbnail/recaptureThumbnail, waveform with peak-hold state
  machine, customThemesIO with summarizeImportImpact dry-run · ~150
  fresh asserts this batch).
- 2026-06-21 09:31 PT — Batch 11 (5/5).
  Commits: 7ef133b (R11.03 combined bookmark + camera-views export),
  5318503 (R11.04 wind chip long-press overrides + WindChip leaf +
  useLongPress hook), 0008aa6 (R11.05 crossfade chip long-press
  overrides + CrossfadeChip leaf), 8196251 (R11.15 lightbox keyboard
  +/=/-/_/0 zoom + cursor-anchored wheel zoom), e2e9781 (R11.13
  minimap per-view hover tooltips with edge-aware placement).
  R11.01 and R11.02 deferred again — render pipeline refactor and 3D
  drag-handle each need their own dedicated batch. Substituted R11.15
  and R11.13 from the future queue to keep the batch at 5 great slices.
  Gates: lint 23 errors / 3 warnings — exactly matches baseline (zero
  new errors in any of the 9 modified .js/.jsx files; Minimap.jsx
  caught a react-hooks/refs error during the gate and was refactored
  to capture hoverName at hover-time instead of reading viewsRef
  during render). Build: 21.05 s green (cold) / 1.15 s warm (1.66 MB
  bundle, gzip 497 KB). Unit tests: 36/36 files pass (added asserts
  for: bookmarksIO v2 envelope + mergeImportViews, wind overrides
  resolver + sanitize/capture/set/clear/isCustom, crossfade overrides
  parallel, pinchZoom applyZoomBy/applyKeyboardZoomIn/Out/Reset/
  applyWheelZoom/classifyZoomKey, minimap tooltipPlacement edge
  cases · ~120 fresh asserts this batch). Combined bookmark file
  is now v2 with optional `views` array; v1 imports still accepted.
- 2026-06-21 12:48 PT — Batch 12 (5/5).
  Commits: af12643 (R12.03 bg gradient curve chips Linear/Pulse/Ramp/Hold
  + shapeReactiveSignal + REACTIVE_CURVES roster), e2a382b (R12.04 Smash
  & Save bias chips Mostly Calm/Surprise/Mostly Wild + SCENE_BIASES +
  localStorage-persisted selection), 9c41d20 (R12.05 named attractor →
  MIDI routing — `attr:<id>:strength` action namespace + resolveAction
  ForId + attractorActions + UI section in MidiPanel), e32c54e (R12.17
  wind chip overrides export/import — new windOverridesIO.js module
  + UI buttons under Wind sliders), fc830d0 (R12.19 lightbox WASD pan
  when zoomed + hjkl vim aliases — classifyPanKey + applyKeyboardPan
  helpers wired into SnapshotGallery onKey).
  R12.01 (Echo / trail FBO) and R12.02 (3D drag handle) deferred again
  — both need their own dedicated render-pipeline / r3f-gizmo batches.
  Substituted R12.17 and R12.19 from the future queue to keep the batch
  at 5 great slices instead of padding.
  Gates: lint 23 errors / 3 warnings — exactly matches baseline (zero
  new errors in any of the 9 modified .js/.jsx files + 1 new .js file +
  1 new .test.mjs file; the new windOverridesIO.js + curve-chip JSX
  + WindOverrideIO leaf + attractor MIDI rows all linted clean).
  Build: 2.35 s green (1.67 MB bundle, gzip 500 KB — +3 KB for the
  three new ranges + curve constants + IO module). Unit tests: 37/37
  files pass (added windOverridesIO; extended bgGradient with REACTIVE
  _CURVES + shapeReactiveSignal + 3-curve assertion coverage, random
  Scene with SCENE_BIASES + per-bias range correctness + chance gating
  + backwards-compat, midiMap with attractorActionId/parse/resolve/
  actionLabel/attractorActions, pinchZoom with classifyPanKey/apply
  KeyboardPan/PAN_STEP_FRACTION · ~260 fresh asserts this batch).
  SCENE_FIELDS up to 49 (bgGradientAudioCurve round-trips through
  bookmarks).
- 2026-06-21 16:23 PT — Batch 13 (5/5).
  Commits: 909743a (R13.14 crossfade chip overrides IO — new
  crossfadeOverridesIO.js module + CrossfadeOverrideIO leaf under
  the chip grid, parallels wind IO), 3621083 (R13.15 minimap
  shift+click delete — new removeView helper in cameraViews.js
  with ref-equal-on-no-op contract; shift+click in Minimap onClick
  + showToast feedback + dispatches particle:camera-views-changed;
  RightSidebar's existing trash button switched to the helper too
  as a drive-by), f10372c (R13.18 per-attractor MIDI for RADIUS +
  X + Y + Z — ATTRACTOR_FIELDS expanded from [strength] to 5
  entries; resolveActionForId / attractorActions / parse
  AttractorActionId / labelForAttractorField all extended; x/y/z
  setter reads LIVE position at apply-time so concurrent axis
  sweeps don't undo each other; MidiPanel groups per-attractor
  rows visually with attractor name as header), b5e7778 (R13.04
  keymap import live diff preview — new summarizeImportImpact()
  in keymapIO.js returns ordered diffs + reset list; window.confirm
  gone, replaced by KeymapImportPreview panel with merge/replace
  toggle + fromCode→toCode chip diff list + RESET tag for amber
  collateral resets + Apply gated on willChange>0), ea06bf9
  (R13.05 MIDI user bundle editor — new loadUserPresets /
  saveUserPresets / buildUserPresetFromMap / addUserPreset /
  removeUserPreset / nextUserPresetId / isUserPresetId in
  midiPresets.js with v1 envelope, cap 8, FIFO drop, sanitize-on-
  load; getMidiPreset / buildMidiMapFromPreset / applyPresetToMap
  / presetBindingCount all extended with optional userPresets
  arg; PresetBar gets "Your Bundles" second row + "+ Save current
  as bundle" button + inline name form).
  R13.01 (Echo / trail FBO) and R13.02 (3D drag handle) deferred
  yet again — both need their own dedicated render-pipeline /
  r3f-gizmo batches. R13.03 (server-rendered OG endpoint) still
  deferred — no backend runtime. Substituted R13.14, R13.15,
  R13.18 from the future queue to keep the batch at 5 great
  slices instead of padding.
  Gates: lint 23 errors / 3 warnings — exactly matches baseline
  (zero new errors in any of the 9 modified .js/.jsx files +
  2 new .js files + 2 new .test.mjs files; transient unused
  import error in MidiPanel caught during the gate and removed
  before commit by dropping isUserPresetId from the import
  destructure). Build: 1.21 s green (1.69 MB bundle, gzip
  504 KB — +4 KB for crossfadeOverridesIO + midiPresets editor
  + keymap diff preview + per-attractor MIDI 5-field expansion).
  Unit tests: 38/38 files pass (added crossfadeOverridesIO;
  extended cameraViews with removeView + boundary/no-mutation /
  ref-equal asserts, keymapIO with summarizeImportImpact
  merge/replace/reset/ordering coverage, midiMap with the new
  4 ATTRACTOR_FIELDS routings + concurrent-axis preserve
  regression, midiPresets with the full user-bundle CRUD +
  round-trip + corrupt-row sanitization + extended preset
  lookup w/ userPresets arg · ~110 fresh asserts this batch).
