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
- Named attractors carry type-specific colour cues throughout the UI (R14.05): each type has a distinct accent — attractor=indigo, repulsor=red, vortex=violet, turbulence=amber. Live in `ATTRACTOR_TYPE_STYLES` + `attractorTypeStyle(type)` in namedAttractors.js (full CSS-ready bundle: border at 0.45/0.30/0.18 alpha, bg at 0.14/0.06/0.03, fg=accent hex, glow). NamedAttractorRow row border + #index badge wear the type accent; type chip grid uses each type's own colour as its active state. MidiPanel per-attractor group header pulls the LIVE attractor + paints its border + small coloured dot + monospace type-name suffix; stale groups (deleted attractor still has bindings) fall back to the previous violet "missing" tone.
- Wind override import: live PREVIEW panel before committing (R14.15), parallels the keymap import preview from R13.04. Stages the parsed envelope + filename, shows a diff list (one row per slot, ordered by WIND_PRESETS_DEFAULT) with live vs incoming `intensity/azimuth°` chips + add/overwrite/skip action badges (emerald/amber/muted); mode toggle (Merge/Replace) recomputes the diff in-place; impact line is mode-aware; Apply gated on willWrite > 0 in merge mode.
- Crossfade override import: live PREVIEW panel before committing (R14.16), direct parallel to R14.15. Same staging pattern, same action badges; live cell shows the shipped default in italics when no live override exists so users see what their incoming value will displace; pink-violet panel matches the existing Crossfade chip colours.
- MIDI user bundle EXPORT / IMPORT as portable JSON file (R14.17). New module `midiUserBundleIO.js` (kind=`ai-particle-simulator/midi-user-bundle`, v1, 16 KB cap); per-bundle Download (indigo) button tucked between the apply chip + trash on each "Your Bundles" chip row; "+ Import bundle" button (Upload icon, indigo) paired with "+ Save current as bundle" below the bar so a fresh install can pick up a friend's bundle without first having to save one of their own. id/vendor/createdAt are stripped on round-trip so two machines exporting + re-importing can't collide on numbered ids; importer mints fresh. Cap-gated to prevent silent FIFO drops.
- MIDI user bundle RENAME in place (R14.18). Double-click the bundle chip's name to enter edit mode; Enter saves, Escape cancels, blur saves with blank-fallback-to-cancel. Auto-sizes input width to draft length (min 90px), shares the maxLength=32 cap with the save form. New `renameUserPreset(list, id, newName)` helper in midiPresets.js with ref-equal-on-no-op contract (blank-after-trim / missing-id / identical-name / non-array all return the same list ref); auto-generated description templates are rewritten in-place to match the new name's date, hand-edited custom descriptions are preserved.
- Spectrum peak-hold fade-out tail (R15.07) — per-bar ring buffer keeps the last ~200ms (12 frames @ 60Hz) of peak heights and replays them at a falling alpha so transients leave a cinematic afterimage instead of vanishing in one frame. Lives on the same `pk` toggle as the peak lines; trail samples below the live bar (filter argument) or at the floor are skipped so we don't paint inside the bar or at y=0. Alpha lerps PEAK_TRAIL_ALPHA_MIN (0.04, oldest) → MAX (0.55, newest).
- Lightbox WASD/hjkl pan: hold-to-repeat (R15.13). The R12.19 single-tap step now repeats at a deterministic 60ms beat after a 180ms initial delay so holding W produces a smooth upward sweep instead of one nudge. Diagonals (W+A etc.) normalise to unit length so corner sweeps don't run √2× faster than axis-aligned moves. New `aggregateHeldPan(heldKeysSet, keyClassifier=classifyPanKey)` helper in pinchZoom.js (null-on-cancel/empty/all-unknown, opposing pairs like W+S cancel to null, classifier is injectable for future remap). Cleanup tears down both timers + clears the held set on unmount / blur / scale-back-to-idle.
- MIDI export/import ALL user bundles in one multi-bundle JSON file (R15.14). Sibling envelope to R14.17 (kind=`ai-particle-simulator/midi-user-bundles` plural, 64 KB cap) carries an array of bundles. "Export all (N)" + "Import all" buttons (cyan) appear in the Your Bundles row next to "Save current" / "Import bundle". Importer runs every incoming bundle through the same pickIOFields sanitiser as the single-bundle path (corrupt rows dropped without rejecting the whole file). Replace-by-name strategy on import: case-insensitive + trimmed name match removes the existing entry first so re-importing doesn't stack duplicates. summarizeImportImpactMulti() projects {willAdd, willReplace, willDrop} so the confirm prompt warns about FIFO drops at MAX_USER_PRESETS=8 before any data loss. Bare-array shorthand accepted for hand-rolled files.
- Per-attractor MIDI: route CC to ENABLED toggle (R15.16). Adds `enabled` as a 6th routing field per attractor (was 5: strength/radius/x/y/z). Schmitt-trigger semantics with dead-band [HYSTERESIS_OFF=0.45, HYSTERESIS_ON=0.55] prevent on/off chatter when a continuous knob jitters near 0.5: ON when v01 rises above 0.55 from below, OFF when v01 falls below 0.45 from above, hold previous state inside the band. NaN / non-finite input never flips state. Pure `applyEnabledHysteresis(wasEnabled, v01)` helper in midiMap.js drives the setter; the resolved action reads the LIVE attractor's enabled flag at apply-time and only writes when the hysteresis decision actually differs (no churn on dead-band sweeps). Panel renders the row with an "on/off" range label + tooltip explaining the threshold behaviour.
- Named attractor drag-row up/down reorder (R15.20). Parallels R10.03 camera-path reorder. New `moveAttractorByIndex` / `moveAttractorUp` / `moveAttractorDown` helpers in namedAttractors.js (ref-equal-on-no-op contract: missing-id / already-at-boundary / out-of-range / null-list all return the input ref unchanged so the store skips a redundant save). Up/down chevron buttons (Unicode ▲▼ glyphs to avoid pulling lucide-react into LeftSidebar for one icon) render between the On/Off toggle and the remove ×, stay in the layout at boundaries so the button column width doesn't jump. The reorder propagates THROUGH the MidiPanel grouping (R13.18 + R15.16) because per-attractor MIDI rows are emitted in list order — dragging a row reorders its MIDI section header without any extra wiring.
- Carousel: bulk "Rebuild all" button wipes every cached thumbnail in one click (R16.06). 56px button next to the filter pill, only renders when `summarizeBulkRebuild(presets).withThumb > 0`. Window.confirm before clearing (irreversible-ish even if the prerenderer rebuilds). Counter line shows "32/46" (cached/total) so the click feels informed; switches to "Building" + slow-spinning ↻ with green/emerald accent while the prerenderer drips in fresh thumbs (clears on first particle:thumbnail-ready OR 12s hard timeout). New pure helpers in presetThumbnails.js: `clearAllThumbnails(presets, storage)` returns count of REMOVED entries (tolerates malformed presets, missing storage, per-entry storage errors); `summarizeBulkRebuild(presets, storage)` returns {withThumb, withoutThumb, total}.
- Spectrum peak-hold trail fade-out curve preset chip (R16.17). Graduates R15.07's single-fade-curve to three taste-shapeable presets: linear (default, matches R15.07), exp (head-leading: tail fades fast, fresh samples bloom), log (tail-leading: oldest samples linger). New `PEAK_TRAIL_CURVES` roster + pure `applyTrailCurve(t, curve)` helper (endpoint convergence preserves MIN/MAX anchors, NaN/null/±Infinity safe). `readPeakTrail` extended with opts.curve passthrough; default 'linear' preserves backwards-compat. Sky-blue UI chip in WaveformOverlay header next to `pk`, renders only when peakHolds is ON, cycles linear→exp→log on click. Persisted to localStorage `spectrum-peak-curve-v1`.
- Named attractor jump-to-position (R16.18). Graduates the R15.20 single-step chevron reorder. Click the monospace #N badge on any attractor row to open an inline numeric input; type a 1-based position and press Enter (or blur) to jump in one operation instead of clicking ▲/▼ N times. New pure helpers in namedAttractors.js: `moveAttractorTo1BasedPosition(list, id, pos1Based)` (wraps moveAttractorByIndex with generous clamp [1, length] so 99-in-a-5-list jumps to end, same ref-equal-on-no-op contract), `parsePositionInput(raw)` (sanitises string→positive int or null; handles trim/round/empty/non-numeric/≤0). New store action `moveNamedAttractorToPosition`. Min/max attrs hint the input's valid range to browser spinners.
- MIDI user bundle per-bundle COLOR tag (R16.19). Pick from 8-swatch palette (pink default, violet/indigo/cyan/emerald/amber/rose/slate) to visually sort chips beyond just name. New `USER_PRESET_COLORS` + `USER_PRESET_COLOR_STYLES` + `userPresetColorStyle(c)` (CSS-ready bundle mirroring attractorTypeStyle's shape) + `isValidUserPresetColor` / `sanitizeUserPresetColor` defensive helpers in midiPresets.js. `setUserPresetColor(list, id, color)` mirrors rename's ref-equal-on-no-op contract. load/save/buildUserPresetFromMap all thread `color` through the v1 envelope; legacy bundles missing the field upgrade silently to default on load. UI: tiny round swatch button in the chip header opens an 8-circle palette popover below the chip; active colour gets thicker white border + glow + 1.08× scale. Chip's background/text/border now follow the bundle's accent (replaces the hard-coded pink).
- Lightbox WASD pan acceleration curve (R16.20). Graduates the R15.13 hold-to-repeat with a hold-time multiplier: stays at 1× for the first 1s (precision near centre), then linearly ramps to 3× over the next 1.5s (a 2.5s sustained sweep covers ~6× the ground of a single tap). New pure helpers in pinchZoom.js: `panAccelMultiplier(elapsedMs, opts)` (returns 1× below threshold, lerps to PAN_ACCEL_MAX=3 over PAN_ACCEL_RAMP_MS=1500, caps at MAX past it; NaN/null/±Infinity defensive), `scaleDirByHold(dir, elapsedMs, opts)` (returns input ref unchanged when multiplier===1 — zero allocation on hot 60ms tick). SnapshotGallery seeds `holdStartTsRef` when chord begins, reads elapsed each tick, scales aggregated direction before applyKeyboardPan. Resets on keyup-to-empty / blur so next press starts fresh.
- Lightbox pan acceleration curve preset chip (R17.20). Graduates the R16.20 single-shape ramp with four chip-cycled curves: linear (default, R16.20 baseline), exp (t² — slow start, sprint finish), log (sqrt(t) — fast help early, then settle), off (acceleration disabled entirely). New pure helpers in pinchZoom.js: `PAN_ACCEL_CURVES` roster + `nextPanAccelCurve(current)` with unknown-string fallback to first entry; `panAccelMultiplier` extended with `opts.curve` passthrough; `scaleDirByHold` threads `opts.curve` so existing callsites only change at the threading layer. Endpoint convergence preserved across every curve so swapping curves never overshoots MAX or dips below 1×; monotonicity preserved on input so a sweep can never retreat mid-hold. Persisted via `setLightboxPanCurve` (key `lightbox-pan-curve-v1`); parallels `spectrumPeakCurve` (R16.17) for UX consistency. SnapshotGallery `panCurveRef` mirrors the store value so the hold-keys interval re-reads the live curve every 60ms tick — flipping mid-sweep reshapes in real time.
- Per-attractor MIDI: route CC to RADIUS via inverse log curve (R17.15). Adds a sibling `attr:<id>:radiusLog` slot next to the linear `attr:<id>:radius` so users can pick the knob feel that matches their hardware. Curve `2^v - 1` (2^0=1, 2^1=2, divisor implicit) maps v01 ∈ [0,1] to [0,1] with midpoint ≈0.414: a knob's bottom half covers radii 4..8 (fine control at the low end where small radius changes have the biggest visible effect on a scene) and the top half flows up through 8..16. Both rows live side-by-side in the MidiPanel per-attractor section so binding-by-feel is one click. New pure helpers `logCurveShape(v01)` + `logCurveRadius(v01)` in midiMap.js with full defensive contract (NaN/±Infinity/negative/>1 all clamp safely; non-finite falls to MIN = the calm default). `ATTRACTOR_FIELD_RADIUS_LOG` + `ATTRACTOR_FIELDS` grows from 6 to 7 entries, slotted directly after RADIUS so the panel groups the pair adjacent. `labelForAttractorField` returns 'Radius·log'; `resolveActionForId` handles the new field with `set(v01, s) => s.updateNamedAttractor(id, { radius: logCurveRadius(v01) })`. MidiPanel row tooltip explains the curve semantic; range label shows "4..16 log" (vs "4..16" linear) so users can tell which routing they're looking at.
- Named attractor bulk-delete via shift-click multi-select (R17.17). Graduates the single-× delete with a multi-select bar that surfaces above the list as soon as one row is selected; offers Select all / Clear / Delete N (gradient red, window.confirm gate). Shift-click on any row toggles its membership in the selection set; selected rows wear a red border + glow + on-row checkbox indicator. Selection auto-reconciles via a `useMemo(validSelectedIds)` derived value (no setState-in-effect) so ids that vanish externally drop from the bar's counts silently. New pure helper `removeAttractors(list, idSet)` in namedAttractors.js accepts Set | Array | iterable (incl. generators), normalises to Set internally for O(1) hits, returns input REF unchanged when nothing in idSet existed (ref-equal-on-no-op skips redundant save), drops corrupt null rows as a side-effect (parallels removeView contract). Store action `removeNamedAttractors(ids)` wraps with the same skip contract.
- Camera path drag-and-drop reorder (R17.07). Graduates the chevron up/down buttons (R10.03) with a direct drag gesture for users who'd rather GRAB the row and DROP it where they want. The chevrons stay (precision moves + keyboard-only users). Pure wire layer on top of `moveView(views, fromIdx, toIdx)` from R10.03 so no new lib helpers / no new unit tests — the ref-equal-on-no-op skip + happy paths + defensive cases were already pinned in cameraViews.test.mjs. `useState(null)` for `draggingIdx` (NOT a ref — each row reads it during render to compute its `isBeingDragged` styling, and react-hooks/refs disallows reading refs during render). `dragOverIdx` state drives the indigo drop-target highlight; the dragLeave handler clears only when leaving the SAME row currently highlighted so sibling enter events don't flicker the indicator across row boundaries.
- Custom theme pack drag-and-drop import (R17.06). Graduates the click-to-import button with a file-drop zone covering the entire CustomThemesRow block. Drop a .json theme pack anywhere on the row and the same R10.10 preview panel surfaces — no auto-apply, every import still flows through the Merge/Replace dry-run summary. Implementation: `dragDepth` counter tracks nested dragenter/leave so the highlight only clears when the ACTUAL drag leaves the container (browsers fire enter+leave on every child element a drag crosses; naive boolean would flicker at every chip). Filters by `dataTransfer.types.includes('Files')` so stray text-drags don't trigger the overlay. Only the FIRST file in a multi-file drop is read; non-.json files toast an error. Drop handler shares `parseAndPreview(file)` with the file-picker path so a future format change only touches one place. Visual feedback: dashed indigo outline (outlineOffset:4 keeps layout stable), 5% bg tint, "Drop .json to preview theme pack" banner pinned to top with pointerEvents:none so drag events keep hitting the parent.
- Per-attractor MIDI: route a CC to TYPE — knob cycles 4 force-field types (R18.16). Graduates the ENABLED routing R15.16 with band-hysteresis selection: [0..1] split into N equal-width bands (4 with current ATTRACTOR_TYPES), with a symmetric TYPE_BAND_HYSTERESIS=0.015 dead-band at each boundary that holds the previous type when the boundary is between the live type and its immediate neighbour (non-adjacent jumps skip the hold). Pure helper `pickAttractorTypeForCC(prevType, v01, types?, hysteresis?)` in midiMap.js; full defensive contract pinned (NaN/±Infinity holds previous, empty/invalid types returns previous, single-type list always wins, custom hysteresis arg). ATTRACTOR_FIELDS extended to 8 entries with `attr:<id>:type` slot; resolveActionForId reads LIVE attractor type at apply-time for dead-band decisions and writes only on transition. MidiPanel TYPE row gets a "cycle 4" range hint + boundary-semantics tooltip. ~90 fresh asserts: band selection, endpoint anchors, clamp behaviour, dead-band hold (lower + upper neighbour, both sweep directions), non-adjacent skip, full-sweep round-trip invariant (≤3 transitions across 0→1, every type visited).
- MIDI user bundle drag-and-drop import (R18.09). Graduates the click-Import-bundle / Import-all buttons with direct drag-and-drop on the entire Controller Presets bar (parallels R17.06 theme-pack drag-import). Auto-detects single-bundle (kind=`midi-user-bundle`) vs multi-bundle (kind=`midi-user-bundles`) by trying parseImportMulti first then falling through to parseImport (single). Bare-array top-level shorthand still works via parseImportMulti. Pure wire layer — no new IO module, no envelope changes; the panel passes a single `onDropFile` handler to a presentational PresetBar that does the dragDepth-counter highlight + filter-by-Files-mimetype + drop-zone banner. Multi-imports gate through the same window.confirm impact summary as the file-picker path; single-imports respect the bundle cap (rejects when at MAX_USER_PRESETS with a toast instead of silent FIFO drop). Non-.json files toast an error.
- Theme pack drag-and-drop multiple .json files at once (R18.18). Graduates R17.06's first-file-only convention. Drops every .json file in a single gesture, reads them in parallel via Promise.all, combines valid items into a single preview panel. Failed parses surface as per-file error counts in a toast but don't block valid ones — partial success is preserved. Sorted by filename for stable preview/commit ordering across machines. New helper `parseAndPreviewMulti(files, skipped)` runs alongside `parseAndPreview` so the file-picker path is untouched. Cross-file duplicate names aren't deduped here — the existing mergeThemesImport step handles collisions when the user clicks Apply. Preview header shows "12 themes · 3 files" with a tooltip listing every contributing filename; filename slot widens to 160px. Drop banner gains "(multi-file ok)" hint.
- Named attractor drag-and-drop reorder via #N badge handle (R18.19). Parallels R17.07's camera-path drag-and-drop. Grab any attractor row (the #N badge wears cursor:grab so affordance matches camera-path) and drop on another row to move it. Chevron up/down (R15.20) + jump-to-position click-to-edit (R16.18) stay alongside — three layered controls cover precise single-step, arbitrary numeric jump, and direct visual drag. Pure wire layer on top of moveAttractorByIndex (already pinned in tests). draggable attribute gated on `!editing && !editingPos` so a user double-clicking the name or typing a jump-position doesn't have their text-selection drag converted to a row drag mid-keystroke. Drop-target row gets indigo tint + indigo border + 3px violet left stripe; dragged row drops to 0.55 opacity + muted-violet stripe. dragOverIdx clears only on leaving the SAME row currently highlighted (sibling-enter-before-leave guard, same as R17.07).
- Per-attractor MIDI: route a CC to TYPE — knob cycles 4 force-field types (R18.16). Graduates the ENABLED routing R15.16 with band-hysteresis selection: [0..1] split into N equal-width bands (4 with current ATTRACTOR_TYPES), with a symmetric TYPE_BAND_HYSTERESIS=0.015 dead-band at each boundary that holds the previous type when the boundary is between the live type and its immediate neighbour (non-adjacent jumps skip the hold). Pure helper `pickAttractorTypeForCC(prevType, v01, types?, hysteresis?)` in midiMap.js; full defensive contract pinned (NaN/±Infinity holds previous, empty/invalid types returns previous, single-type list always wins, custom hysteresis arg). ATTRACTOR_FIELDS extended to 8 entries with `attr:<id>:type` slot; resolveActionForId reads LIVE attractor type at apply-time for dead-band decisions and writes only on transition. MidiPanel TYPE row gets a "cycle 4" range hint + boundary-semantics tooltip. ~90 fresh asserts: band selection, endpoint anchors, clamp behaviour, dead-band hold (lower + upper neighbour, both sweep directions), non-adjacent skip, full-sweep round-trip invariant (≤3 transitions across 0→1, every type visited).
- MIDI user bundle drag-and-drop import (R18.09). Graduates the click-Import-bundle / Import-all buttons with direct drag-and-drop on the entire Controller Presets bar (parallels R17.06 theme-pack drag-import). Auto-detects single-bundle (kind=`midi-user-bundle`) vs multi-bundle (kind=`midi-user-bundles`) by trying parseImportMulti first then falling through to parseImport (single). Bare-array top-level shorthand still works via parseImportMulti. Pure wire layer — no new IO module, no envelope changes; the panel passes a single `onDropFile` handler to a presentational PresetBar that does the dragDepth-counter highlight + filter-by-Files-mimetype + drop-zone banner. Multi-imports gate through the same window.confirm impact summary as the file-picker path; single-imports respect the bundle cap (rejects when at MAX_USER_PRESETS with a toast instead of silent FIFO drop). Non-.json files toast an error.
- Theme pack drag-and-drop multiple .json files at once (R18.18). Graduates R17.06's first-file-only convention. Drops every .json file in a single gesture, reads them in parallel via Promise.all, combines valid items into a single preview panel. Failed parses surface as per-file error counts in a toast but don't block valid ones — partial success is preserved. Sorted by filename for stable preview/commit ordering across machines. New helper `parseAndPreviewMulti(files, skipped)` runs alongside `parseAndPreview` so the file-picker path is untouched. Cross-file duplicate names aren't deduped here — the existing mergeThemesImport step handles collisions when the user clicks Apply. Preview header shows "12 themes · 3 files" with a tooltip listing every contributing filename; filename slot widens to 160px. Drop banner gains "(multi-file ok)" hint.
- Named attractor drag-and-drop reorder via #N badge handle (R18.19). Parallels R17.07's camera-path drag-and-drop. Grab any attractor row (the #N badge wears cursor:grab so affordance matches camera-path) and drop on another row to move it. Chevron up/down (R15.20) + jump-to-position click-to-edit (R16.18) stay alongside — three layered controls cover precise single-step, arbitrary numeric jump, and direct visual drag. Pure wire layer on top of moveAttractorByIndex (already pinned in tests). draggable attribute gated on `!editing && !editingPos` so a user double-clicking the name or typing a jump-position doesn't have their text-selection drag converted to a row drag mid-keystroke. Drop-target row gets indigo tint + indigo border + 3px violet left stripe; dragged row drops to 0.55 opacity + muted-violet stripe. dragOverIdx clears only on leaving the SAME row currently highlighted (sibling-enter-before-leave guard, same as R17.07).
- Snapshot grid long-press multi-select for bulk delete (R18.06). Long-press (≥450ms) any tile in grid view to enter selection mode; a delete bar surfaces above the grid with Select all / Clear / Delete N (parallels R17.17 attractor multi-select). Tap-at-rest opens lightbox (unchanged); tap-in-select-mode toggles selection. Move guard (LONG_PRESS_SLOP_PX=8) bails out if the user starts to scroll/swipe — long-press only fires on a genuine hold. After firing, the synthetic click is swallowed. validSelectedIds reconciled at render-time via useMemo so externally-removed snapshots drop out of counts without setState-in-effect. Selection clears on gallery close / view-change (grid-only by design). New pure helper `removeSnapshots(items, idSet)` mirrors removeAttractors contract — Set | Array | iterable inputs, ref-equal-on-no-op skip, corrupt-row cleanup. Visual: selected tiles get red border + glow + filled red checkmark; unselected-in-select-mode get an empty ring; hover actions hidden in select mode so a careful tap doesn't fight the toggle. touchAction:'manipulation' + WebkitTouchCallout:'none' prevents iOS native long-press action sheet from intercepting.
- Spectrum peak trail per-curve tunable parameters (R19.12). Graduates R16.17's fixed-shape curves (t^2 for exp, sqrt(t) for log) with one knob per shape: `exp.exponent` (1..6, default 2 — t^exponent; higher = sharper head bloom; 1.0 degenerates to linear) and `log.base` (2..8, default 4 — log(1+(base-1)*t)/log(base); higher = tail lingers more aggressively). Endpoint anchoring INVARIANT across every (curve, params) combination (0 at t=0, 1 at t=1) so swapping shapes or tweaking params never disturbs the trail's overall MIN/MAX brightness — only the distribution between. New pure helpers in waveform.js: `PEAK_TRAIL_CURVE_PARAMS` schema with min/max/step/default/label/hint per entry; `defaultPeakTrailCurveParams()` returns non-aliased fresh defaults; `sanitizeCurveParamValue(curve, key, raw)` clamps + non-finite-fallback-to-default; `sanitizeCurveParams(raw)` merges partial map with defaults; `setCurveParam(params, curve, key, raw)` ref-equal-on-no-op contract; `isCurveParamsAtDefaults(params)` projector. `applyTrailCurve(t, curve, params)` extended with params arg threaded through both branches. `readPeakTrail(state, barIndex, current, opts)` accepts opts.curveParams passthrough. UI: CurveChipWithLongPress wraps the R16.17 chip with pointer-event-based long-press (≥400ms hold opens the param editor popover); small sky-blue dot next to chip label when curve has non-default params; popover renders one slider per param with reset button (atomic reset across all curves, mirrors the chip overrides IO patterns). Store: spectrumPeakCurveParams persisted to `spectrum-peak-curve-params-v1`; sanitizeCurveParams runs on every read so corrupt persisted values resolve to defaults; setSpectrumPeakCurveParam + resetSpectrumPeakCurveParams actions.
- Per-attractor MIDI: TYPE row shows live band on tooltip (R19.16). Graduates R18.16's invisible band-hysteresis with a scannable cue: each TYPE row with a bound CC + at least one message seen on that CC wears a tiny coloured tag showing "N/4 typename" (band index + type label) + a `·hold` amber suffix when the live value sits inside the dead-band so the user knows the type is HELD (not about to flip from jitter). New pure projector `describeTypeBand(v01, types?, hysteresis?)` in midiMap.js: returns `{ index, label, total, holdingPrev, distanceToEdge01 }` using the SAME band-width + hysteresis math as pickAttractorTypeForCC so the tag never lies about the picker's actual decision. holdingPrev is true only when v01 is inside the symmetric hysteresis window around a TRUE boundary (extremes 0/1 never hold since there's no neighbouring boundary). MidiPanel wires per-CC lastCCByNumber state cache (functional setState with same-value-skip + bound-CC-only filter so chatty controllers pumping unbound CCs don't trigger 60Hz re-renders). Badge wears the type's accent colour via attractorTypeStyle (parallels R14.05 indigo/red/violet/amber palette).
- Spectrum peak-hold trail per-bar frequency-coloured tint PALETTE chip rail (R21.21). Graduates R20.13's single warm→cool ramp with 5 curated palettes selectable via a new chip in the WaveformOverlay header. Chip only renders when the existing tint chip is ON (the palette is meaningless when the trail inherits the bar's hue); warmCool stays first in cycle so an existing tint user's click target unchanged. Palettes: warmCool (R20.13 default, bass red-orange / treble blue-violet), rainbow (full 0→360 sweep), cool (260→180 indigo→teal for twilight presets), warm (0→50 red→amber for fire/embers), mono (215→195 narrow grey band, brightness-only map). New lib helpers in waveform.js: `PEAK_TRAIL_PALETTES` roster + `PEAK_TRAIL_PALETTE_NAMES` chip-cycle order + `isValidTrailPalette(name)` defensive-against-prototype-pollution + `nextTrailPalette(current)` wraparound + `peakTrailHueForBarIndexPalette(barIndex, totalBars, paletteName)` palette-aware hue projector with identical defensive contract as R20.13. INVARIANT pinned in tests: palette-aware call with 'warmCool' equals legacy peakTrailHueForBarIndex for every bar, so users with tint ON who never touch the chip see zero behavioural change. Store: spectrumPeakTrailPalette persisted to `spectrum-peak-trail-palette-v1`, default 'warmCool', corrupt values resolve via isValidTrailPalette. UI: tiny palette chip at left:188 in WaveformOverlay header wears the active palette's 3-stop linear-gradient as its own background so the chip visually previews the palette it controls.
- Per-attractor MIDI clamp-proximity meter on STRENGTH / RADIUS / RADIUS·log / X / Y / Z rows (R21.22). Graduates R20.16's TYPE-row proximity meter to continuous fields. ENABLED rows skip (1-bit toggle — meter redundant); TYPE rows skip (R20.16 already drew the band-boundary meter). Semantic differs by field shape: TYPE = proximity to nearest FLIP BOUNDARY inside a band; continuous = proximity to nearest CLAMP EDGE of the slider. For continuous fields the safe zone is the middle of the sweep — knob at v01=0.5 reads MAX SAFE (max headroom both ways), knob at v01=0 or v01=1 reads MIN SAFE (the knob is at the rail — twisting further does nothing). New pure helpers in midiMap.js: `clampProximity01(v01)` symmetric inverted-V projector (returns 1 at centre, 0 at clamps; non-finite resolves to 1 = max-safe first-paint default) + `describeClampProximity(v01)` structured projector matching describeTypeBand's null-on-bad-input contract returning `{ kind: 'clamp', v01, proximityToBoundary01, atLow, atHigh }`. atLow / atHigh booleans fire only at the rails (v ≤ 0.001 / v ≥ 0.999) so the UI can colour the meter red specifically when knob is dead-against a clamp. UI: monospace tag between the existing typeBand tag and the CC badge, shows v01 as "87%" + a 26×4 horizontal bar; three-tier intent matches R20.16 (red at rail, amber close to clamp prox<0.25, green when safe prox≥0.25); 80ms width + 120ms colour transitions. Reuses R19.16 lastCCByNumber state cache as-is.
- Smash bias overrides EXPORT / IMPORT as portable JSON file (R21.23). Graduates R20.07's per-chip bias editor with a portable share path. Parallels wind chip overrides IO (R12.17) + crossfade chip overrides IO (R13.14) — same envelope shape, same merge-vs-replace prompt, same MAX-bytes guard. New lib module `src/lib/biasOverridesIO.js`: kind=`ai-particle-simulator/bias-overrides`, v=1, MAX_IMPORT_BYTES=16 KB; exportableBiasIds() pulls from SCENE_BIASES so adding chips later auto-extends the IO; sanitizeBiasOverridesMap drops unknown chip ids + empty per-chip overrides; buildExportPayload / serialize / makeFilename ('particle-bias-YYYY-MM-DD.json'); parseImport handles full envelope + bare-items shorthand, rejects wrong-kind / unsupported-version / missing-items / all-invalid / invalid-JSON / non-string / top-level non-object / oversized; mergeImport with merge/replace semantics; summarizeImportImpact dry-run preview with conflicts + resultIds. UI: Export + Import buttons join the existing "Edit bias JSON" link above the chip rail in RightSidebar.jsx. Export disabled when no chip has overrides; replace-mode import also resets any chip the import didn't touch so a clean swap genuinely wipes prior state.
- Carousel thumb detail panel: Rebuild + Clear action buttons (R21.24). Graduates R20.19's rich-detail panel with two action buttons scoped to the open tile. Before R21.24: Rebuild required closing the panel + hovering the tile to surface the hover-only "rebuild" button — workflow-breaking when the user is reading the metadata to decide whether to rebuild. Clear (per-tile) didn't exist at all; only path was the bulk "Rebuild all" which wiped everything. Two buttons share a 50/50 grid row at the bottom of the panel above the existing "Esc to close" hint: Rebuild (indigo) re-uses the same rebuildThumb path the hover button uses (setBusyId + setTimeout + recaptureThumbnail + particle:thumbnail-ready event); Clear (red) calls clearThumbnail (which cascades to clearThumbMetadata via the existing R19.13 contract) + updates the in-memory thumbs + meta maps via setState with the entry spread out so placeholder emoji tile returns immediately. Both actions auto-close the panel afterwards. Pure wire layer — no lib changes; clearThumbnail's cascade was already pinned in tests.
- MIDI bundle hotkey-conflict warning toast when re-binding across bundles (R21.25). Graduates R20.11's silent "1-binding-per-hotkey" invariant with a pre-flight conflict detector so the user gets explicit feedback when their new hotkey assignment is about to STRIP the binding off another bundle. New pure helper in midiPresets.js: `detectHotkeyConflict(list, targetId, hotkey)` returns the OTHER bundle the user is about to displace, or null when hotkey is unbound / belongs to target bundle itself (self-rebind no-op) / is invalid / nothing to steal (null/empty hotkey). Shape mirrors findUserPresetByHotkey so the UI can pull .name / .color / .id off the result for the toast. MidiPanel's setUserBundleHotkey now runs the detector BEFORE setUserPresetHotkey lands, then surfaces a toast wearing the TARGET bundle's accent colour: `Hotkey "shift+1" stolen from "Drum Kit" → "Synth Pad"`. Self-rebinds and clears skip the toast — nothing was stolen.
- Per-preset thumb metadata badge on hover (R19.13). Hover any preset tile in the carousel to see a tiny metadata badge in the bottom-left corner: "120×80 · render · 3h" (dimensions, source, age). Source-tagged colour (live=green, render=indigo) shows at a glance which capture path minted the thumb. Tooltip carries full ISO-localised timestamp + source explanation. New lib helpers in presetThumbnails.js: `thumbMetadataKey(id)` parallel storage-key shape (preset-thumb-meta-<id>); `recordThumbMetadata(id, opts, storage)` writes JSON-encoded {capturedAt, width, height, source}; `readThumbMetadata(id, storage)` reads + sanitises (returns null on missing/corrupt/missing-capturedAt); `clearThumbMetadata(id, storage)` matches clearThumbnail's contract; `summarizeThumbAge(metadata, now=Date.now())` returns compact "now"/"12s"/"4m"/"3h"/"2d"/"3w"/"2y" (future timestamps clamp to "now" so we never report negative ages). captureThumbnailToStorage + capturePresetThumbnail (live path) both record metadata; clearThumbnail + clearAllThumbnails cascade-wipe metadata so stale badges don't outlive their thumbs.
- MIDI user bundle drag-and-drop accepts multiple .json files at once (R19.20). Graduates R18.09's first-file-only convention with the multi-file gesture R18.18 brought to theme packs. Drop N .json files at once and the panel COMBINES them into one impact summary before the confirm fires. Per-file failures (corrupt JSON, wrong-kind envelope, non-.json extension) are counted + toasted but don't block valid bundles in the same drop — partial success preserved. New pure helper `combineDroppedBundles(reads)` in midiUserBundleIO.js takes per-file FileReader results { raw, error?, name? } and returns { bundles, parseFails, totalFilesRead } using the same parseImportMulti → parseImport precedence as the single-file drop; pure / no DOM so the combine logic is regression-pinned without polyfilling FileReader. PresetBar drop handler accepts onDropFiles alongside onDropFile (multi-file is preferred when present, single-file is the fallback for older callsites). Drop banner gains "(multi-file ok)" hint.
- Named attractor drag-reorder accepts drops on row gaps for insert-here (R19.19). Graduates R18.19's drop-on-row gesture with drop-on-GAP zones so users can insert an attractor EXACTLY into a target slot (insert semantics) instead of only swapping with a specific row's position. Thin gap zones appear between every pair of rows (and above the first / below the last). At rest: 6px tall + transparent (invisible spacer doesn't disturb the resting layout); during drag: stays 6px until hovered then expands to 22px with indigo dashed strip + soft gradient. Trailing gap below the last row only renders during an active drag. New pure helper `dropIndexForGap(from, gapIdx, listLength)` in namedAttractors.js encapsulates the splice-bookkeeping math (from < gapIdx: insert at gapIdx - 1 due to remove-then-insert shift; from >= gapIdx: insert at gapIdx; no-op when gap above/below self). Defensive: non-finite/negative/out-of-range inputs return null. NamedAttractorRow wraps in a fragment with leading gap div; the trailing-gap div lives at the block level.
- Spectrum peak-hold trail per-bar frequency-coloured tint (R20.13). Optional warm→cool hue ramp for the trail layer keyed to barIndex (low bars red-orange / bass; high bars blue-violet / treble) so the trail reads as a distinct frequency map on top of the bar fills (which keep their existing 250°→170° local ramp). Off by default — preserves the R15.07/R16.17/R19.12 trail-inherits-bar-hue look. UI: new `tint` chip in the WaveformOverlay header (alongside the curve chip), gradient background previews the warm→cool ramp visually. New pure lib helpers in waveform.js: `TRAIL_HUE_START=20`, `TRAIL_HUE_END=260`, `TRAIL_HUE_DEFAULT=210` constants + `peakTrailHueForBarIndex(barIndex, totalBars)` projector with full defensive contract (NaN/Infinity on either arg → DEFAULT; totalBars≤0 → DEFAULT; totalBars===1 → midpoint; out-of-range clamps to [0,totalBars-1]; float barIndex floors to int). Store: `spectrumPeakTrailTint` boolean persisted to `spectrum-peak-trail-tint-v1` (default false). WaveformOverlay's trail painter uses `peakTrailTint ? peakTrailHueForBarIndex(i, bars.length) : hueWrapped` — single-line guard, zero perf cost when off.
- Per-attractor MIDI TYPE row: proximity bar meter (R20.16). Graduates R19.16's invisible distanceToEdge01 projector with a scannable meter: a tiny 26×4 horizontal bar fills left→right showing how close the live CC value sits to the nearest TYPE flip boundary. Three-tier colour intent: red (prox<0.001, in dead-band), amber (0.001..0.40, in shoulder), type accent (≥0.40, safe). Meter sits inside the existing band tag (next to "2/4 vortex" + ·hold suffix) so the cue stays grouped with the band label. New `proximityToBoundary01` field on describeTypeBand: pure projector using the SAME band-width + hysteresis math as pickAttractorTypeForCC, edge-band semantics (v=0 / v=1 clamp to 1 — not real flip boundaries), single-type roster always reads 1 (no boundaries). Linear ramp from 0 (dead-band edge) to 1 (mid-band). 80ms width transition + 120ms colour transition for smooth visual updates.
- Smash bias chips support per-chip JSON overrides — edit + persist + reset (R20.07). Graduates R12.04's three hard-coded bias chips with a JSON editor: users tweak any chip's counts/speed/glow/attract/chances/forceTypes and the edits persist per-chip across sessions via parallel storage keys (`smash-bias-overrides-<id>`). Chip identity (id/label/hint) stays immutable so the UI is unchanged — only the generator's behaviour shifts. New lib in randomScene.js: `SCENE_BIAS_RANGE_FIELDS` (4) + `SCENE_BIAS_CHANCE_FIELDS` (10) + `SCENE_BIAS_OVERRIDE_FIELDS` (union + forceTypes); `sanitizeBiasOverride(raw)` defensive projector (non-array ranges / wrong-length / negative / min>max / NaN / ±Infinity all drop the field silently; chances clamp to [0,1]; forceTypes empty/unknown drop, null member valid; unknown top-level keys silently dropped); `loadBiasOverride` / `saveBiasOverride` / `resetBiasOverride` / `hasBiasOverride` storage-aware (empty save WIPES entry — clean reset path); `resolveSceneBias(id, opts)` merges shipped default with persisted override, returns SAME REFERENCE on no-op. generateRandomScene plumbed through resolveSceneBias so overrides flow automatically; new opts.biasOverride lets tests inject without touching storage. UI: cyan dot in chip corner shows when override is active, right-click opens the JSON editor, "Edit bias JSON" link below the chip rail for discoverability. Editor popover: 10-row textarea seeded with live override OR shipped defaults (sans identity triple), Apply runs through sanitizer + rejects when sanitisation drops every key (no silent wipe), Reset clears the override.
- Carousel per-preset thumb metadata badge opens rich detail panel on click (R20.19). Graduates R19.13's hover-only badge into a clickable affordance: clicking surfaces a 240-320px detail panel above the tile with the full ISO time + relative age, source classifier with hint, exact resolution, optional particle count (when present), render time (ms or s), and approximate byte size — all in a tight monospace 2-col grid. Badge keeps its hover-only fade-in but is now a button with an active state (highlighted indigo when its detail is open). Click toggles open/close; Esc closes; outside-click closes; bulk-clear closes. New lib helpers in presetThumbnails.js: `formatByteSize(bytes)` (B/KB/MB with 1-decimal under 10, rounded above; defensive non-finite→null); `formatThumbDetails(metadata, now)` (pure projector returning `[{ key, label, value, hint? }, ...]` ready for paint-only React render). recordThumbMetadata + readThumbMetadata extended with three OPTIONAL rich fields: `particleCount`, `captureMs`, `byteSize` — each independently validated so a corrupt single field can't reject the whole entry; missing fields skip their UI row (no "unknown" rendering). Source row carries a hint string explaining the capture path (live vs render).
- MIDI bundle hotkey-conflict warning toast when re-binding across bundles (R21.25). Graduates R20.11's silent "1-binding-per-hotkey" invariant with a pre-flight conflict detector so the user gets explicit feedback when their new hotkey assignment is about to STRIP the binding off another bundle. New pure helper in midiPresets.js: `detectHotkeyConflict(list, targetId, hotkey)` returns the OTHER bundle the user is about to displace, or null when hotkey is unbound / belongs to target bundle itself (self-rebind no-op) / is invalid / nothing to steal (null/empty hotkey). Shape mirrors findUserPresetByHotkey so the UI can pull .name / .color / .id off the result for the toast. MidiPanel's setUserBundleHotkey now runs the detector BEFORE setUserPresetHotkey lands, then surfaces a toast wearing the TARGET bundle's accent colour: `Hotkey "shift+1" stolen from "Drum Kit" → "Synth Pad"`. Self-rebinds and clears skip the toast — nothing was stolen.
- Bias overrides drag-and-drop import to the chip rail (R22.28). Parallels R17.06 (themes) + R18.09 (MIDI bundles). Drop a .json bias-overrides file anywhere on the chip rail / Export-Import row and the existing R21.23 import path takes over (same window.confirm merge-vs-replace prompt, same toast feedback). Refactored R21.23's file-picker body into shared `parseAndApplyBiasImport(fileOrText)` so both entry points walk the same parse + confirm + merge + persist sequence (no behavioural drift between click-Import and drop). biasDragDepth nested counter handles dragenter/leave flicker across child elements. Filters by `dataTransfer.types.includes('Files')`. First-file-only convention (bias overrides are 3 chips; multi-file would invite per-chip resolution ambiguity). .json extension filter with toast on rejection. Pinned banner "Drop .json to import bias overrides" pointerEvents:none so drag events keep hitting parent.
- MIDI hotkey-conflict toast includes UNDO action chip (R22.30). Graduates R21.25's read-only warning toast with a one-click rollback. New optional `action` arg on showToast(msg, icon, action?) — `{ label, onClick }` pair renders as a small uppercase mono button at the right edge; clicking fires onClick + dismisses immediately. try/catch around onClick so a throwing handler doesn't pin the toast. setUserBundleHotkey packs an undoAction that re-binds the displaced hotkey to the OLD bundle by calling the same setter — the lib's 1-binding-per-hotkey invariant handles the symmetric strip from the NEW bundle (no new lib code). Uses setUserPresets(prev => ...) functional form so a concurrent edit between toast-show and Undo-click rolls back against LIVE state, not a stale snapshot. Restore toast wears the RESTORED bundle's accent colour. Self-rebinds and clears skip the toast (nothing was stolen).
- Camera path touch drag-and-drop reorder via long-press (R22.12). Graduates R17.07's HTML5 native DnD (desktop-only — touch devices don't fire dragstart on touch). Touch users get long-press-to-grab-then-drag: 350ms hold arms the drag mode (10ms haptic vibration on Android), subsequent touchmove hit-tests against per-row getBoundingClientRect via the new pure `resolveTouchTargetIdx(y, ranges)` helper, touchend runs moveView (re-uses R17.07 primitive). Slop guard (LONG_PRESS_SLOP_PX=8) cancels the timer if the user scrolled away — a scroll gesture stays a scroll. e.preventDefault during drag locks page scroll. touchAction:'manipulation' removes the 300ms iOS tap delay without disabling scroll. Multi-touch (pinch-zoom) bails so we don't fight browser gestures. New pure helper `resolveTouchTargetIdx`: half-open [top, bottom) intervals so adjacent rows don't both claim the shared boundary pixel; overflow above first row → snap to first idx; overflow below last → last idx; corrupt range items skip silently so a transient layout glitch mid-drag doesn't lose the gesture; non-finite y / empty ranges / all-corrupt → null.
- Per-attractor MIDI clamp meter user-tunable warn threshold (R22.27). Graduates R21.22's hard-coded `prox < 0.25 = amber` cutoff. Long-press (≥400ms) any clamp meter to open a popover with a slider [5%..45%] + reset button. Persisted to localStorage `midi-clamp-warn-threshold-v1`, applies to every meter globally. New lib helpers in midiMap.js: `classifyClampProximity(prox, atRail, warnThreshold?)` returns 'danger'/'warn'/'safe' tier — atRail trumps every threshold (structural), non-finite prox → 'safe' (max-safe first-paint), atRail strict===true comparison (truthy non-true → safe path). `sanitizeClampWarnThreshold(raw)` clamps to [MIN, MAX] (0.05..0.45), non-finite/null/string → DEFAULT. `isClampWarnThresholdAtDefault(raw)` projector for the cyan "edited" pip indicator. Constants invariants pinned: MIN < DEFAULT < MAX < 0.5 (MAX < 0.5 so green tier always covers middle half of slider), MIN > 0 (warn tier must cover SOMETHING), DEFAULT === 0.25 (preserves R21.22 baseline). MidiPanel meter colour switched from inline conditionals to `classifyClampProximity` calls — same visual output at default threshold, now responsive to user sensitivity. New `ClampThresholdPopover` leaf with transparent fixed-position backdrop click-outside + Escape dismiss + reset-disabled-at-default + accent-coloured slider. Cyan "edited" pip appears between % readout and bar when threshold is non-default so users can tell which meters read on the custom scale.
- Thumb detail panel includes editable per-tile user note (R22.29). Graduates R20.19's read-only metadata panel with a free-form text input — label thumbnails "good demo shot" / "wrong colors" / "use for OG card" etc. Persists alongside metadata in the same envelope key (no schema rev needed; note field is optional and forwards/backwards compat). New `THUMB_NOTE_MAX_LEN = 240` cap (fits 2 display lines, ~12KB total for 46 presets at max). `recordThumbMetadata` + `readThumbMetadata` extended: trim + length-cap + drop-if-empty (no `note: ''` junk); read-side defensive against non-string persisted values. New `setThumbNote(presetId, note, storage?)` atomic note-only update: reads existing JSON envelope, merges just the note key, writes back. Preserves capturedAt + every other field so note edit never resets thumb age / rich-detail fields. Empty/null/whitespace REMOVES the note key (clean schema). Returns false on no-pre-existing-meta / bad-id / no-storage / write-fail. Ref-equal-on-no-op contract (same-value re-set is no-op). Defensive against corrupt persisted JSON (bails with false rather than overwriting). `formatThumbDetails` emits `{ kind: 'note', ... }` row tag so UI can paint differently. New `ThumbNoteEditor` leaf in PresetCarousel: read-only italic amber single-line preview ("good demo shot") or dashed "+ Add note" empty state; click to edit. Edit mode 3-row autofocused textarea + Save/Cancel/Clear buttons. Enter saves, Shift+Enter newline, Esc cancels, blur saves silently (R14.18 least-surprise pattern). Char counter goes amber within 20 of cap, red at cap. Saved note auto-syncs to parent's in-memory meta map.
- Bias overrides drag-and-drop accepts multiple .json files at once (R23.33). Graduates R22.28's first-file-only convention with the multi-file gesture R19.20 brought to MIDI bundles + R18.18 brought to theme packs. Drop N .json bias-overrides files at once and the chip rail combines them into one impact summary before the confirm fires. New pure helper `combineDroppedBiasFiles(reads)` in biasOverridesIO.js: takes per-file FileReader results { raw, error?, name? }, runs each through parseImport, per-file failures counted but never abort (partial success preserved), cross-file conflicts resolve last-file-wins (caller sorts alphabetically). Returns { items, parseFails, totalFilesRead, perFile } where perFile is one { name, ok, chipCount } | { name, ok:false, error } per attempted file so the UI surfaces per-file feedback. chipCount reflects post-sanitize count (unknown chip ids dropped). UI: onBiasDrop filters to .json files first, sorts alphabetically for deterministic conflict resolution across machines, reads in parallel via Promise.all, then feeds into combineDroppedBiasFiles. New applyCombinedBiasItems shares the confirm + merge + persist sequence with the single-file path; toast wording mentions file count when > 1, parse-fail count when > 0. Drop banner gains "(multi-file ok)" hint.
- Carousel: filter by thumbnail note text — substring search input (R23.34). Graduates R22.29 (per-tile editable note) with a note-search affordance: filter the carousel by note text so a user who tagged 30 thumbs "good demo shot" can surface just those tiles in one click. New lib helpers in presetThumbnails.js: `normalizeNoteQuery(raw)` (trim + lowercase; non-string / nullish / whitespace → empty); `noteMatchesQuery(note, raw)` (substring + case-insensitive; empty query matches every non-empty note for composeable list filters; non-string note → no match defensive); `presetsMatchingNote(presets, raw, storage?)` projects a preset list to the subset whose stored note matches (empty/null query returns input array BY REFERENCE — no-op semantics so the carousel renders the full list without a special-case; non-array presets / missing storage → []; order preserved; malformed entries / note-less tiles skipped); `summarizeNoteFilter(presets, raw, storage?)` count-only projection returning { matching, totalWithNotes } so UI can render "12 of 24 tagged" without allocating the output array. UI: note-filter chip + collapsible input next to the bulk-rebuild button, only renders when at least one tile in the FULL preset list has a saved note (gated via globalTaggedSummary). Click chip opens an inline input (autofocus). Live match-count badge "12/24" updates as the user types. Esc clears AND closes (panic-out); Enter dismisses input keeping query; × clears just query; ✕ closes input keeping filter applied. Note filter intersects with existing tri-state category filter (All / Favs / Recent) — stack "Favs + 'demo'" works. Empty-results banner when query is active but no tiles match — friendly inline message instead of empty carousel.
- MIDI hotkey-conflict UNDO chains — 2nd Undo within 1s flips back (R23.35). Graduates R22.30's single-shot Undo with a 1-second toggle window so a user can flip-flop a hotkey assignment without going back to the MIDI panel. Each restore-toast in the chain carries its own Undo chip; clicking within the window re-runs the original assignment and surfaces yet another restore-toast with another fresh window. Lib: `UNDO_CHAIN_MS = 1000` constant; `isWithinUndoWindow(issuedAt, now, window?)` pure projector with ≤ comparison (click at exact edge counts in-window so rapid clicks don't lose to the boundary); defensive contract — non-finite issued/now → false (corrupt timestamps must NOT silently allow expired action), negative delta → false (system clock jumped back), non-finite/negative window arg → false (no implicit fallback when caller supplies bad input), zero window → only exactly-at-issue click. UI: `showHotkeyTransferToast(winner, loser, hotkey, prevList)` internal recursive helper renders one step of the chain. Captures `issuedAt = Date.now()` inside the closure so each step has its own fresh window. On Undo: gates via isWithinUndoWindow → inside window flips via functional setState (concurrent edits compose safely via lib's 1-hotkey-1-bundle invariant) → recursively calls itself with FLIPPED roles. Past the window: chip surfaces an explicit "Undo expired — too late to flip back (1s window)" amber toast instead of silently no-opping. `setUserBundleHotkey` is now a thin wrapper: detect conflict → run setter → kick off the toast chain.
- Camera path touch long-press drag also works on chevron buttons (R23.31). Graduates R22.12's row-only touch-drag (only the row body fired the long-press timer) to the up/down chevrons + restore + delete buttons. Two complaints surfaced on touch: 16x12px chevron buttons are hard to reach with a thumb (the row's ample touch target was the only viable long-press handle); when the user DID land a long-press on the chevron, releasing fired a synthetic click → the chevron's onClick moved the view one step beyond the drag's intent. UI: `touchDragHandlers(idx, { stopProp = true })` factory returns all four touch handlers as a spread-ready object. stopProp=true on chevron/button handlers prevents the touch from bubbling to the row's handlers (each surface owns its lifecycle; the row keeps its own bindings unchanged so row-body touches still arm the timer the original way). `suppressNextClickRef.current = true` on touchend AFTER drag mode fired, cleared by the next click via `consumeClickIfSuppressed()`. Chevron / restore / delete onClick all wrap their actions in the guard. Chevron + restore-button get touchAction:'manipulation'. Chevron tooltip mentions "long-press to drag on touch" so touch users discover the alternative without trial-and-error. Pure wire-layer change — no new lib helpers / no new tests; R22.12's resolveTouchTargetIdx + moveView were already pinned.
- Per-attractor MIDI clamp meter PER-FIELD threshold overrides (R23.32). Graduates R22.27's single global warn-threshold with per-FIELD overrides so power users can tune each continuous knob field independently. STRENGTH wants STRICT (rail = silent attractor — structural failure); X/Y/Z want LOOSE (rail = attractor at canvas edge — often intentional); RADIUS sits between. New lib in midiMap.js: `CLAMP_THRESHOLD_FIELDS` roster (6 continuous fields — enabled + type excluded since they render bespoke meters); `sanitizeClampWarnOverrides(raw)` defensive — non-object/array → empty map, unknown fields dropped, per-field values clamped via sanitizeClampWarnThreshold, non-finite dropped (not coerced); `resolveClampWarnThreshold(field, global, overrides)` pure read-side resolver walking per-field → global → DEFAULT with lookup-time re-sanitization; `setClampWarnFieldOverride(overrides, field, value)` setter with ref-equal-on-no-op contract — pass null/undefined to clear, invalid field → input ref, non-finite value → input ref, sanitises range; `clearAllClampWarnOverrides(overrides)` wipe-all with empty no-op; `hasClampWarnFieldOverride(field, global, overrides)` UI predicate returning true only when per-field DIFFERS from global. UI: clampWarnOverrides state persisted to `midi-clamp-warn-overrides-v1` (empty map → key removed); meter row calls resolveClampWarnThreshold(a.field, ...) instead of global directly so tier classification + tooltip + edited-pip flow through per-field-aware path; ClampThresholdPopover rewritten with scope header + GLOBAL slider (cyan, R22.27 baseline) + PER-FIELD slider (indigo, R23.32) — both independently editable, global slider opacity dims when per-field active; new "Use global" button clears per-field override; "Reset global" relabelled for clarity; popover state changed from `attractorId` to `{ attractorId, field }` so per-field controls know whose override to edit.
- Bias overrides drag-and-drop import preview panel (R24.36). Graduates R23.33's `window.confirm` prompt with a staged preview panel parallel to wind (R14.15) + crossfade (R14.16) import previews. Same staging pattern, same per-row action badges (add / skip / overwrite), same Merge/Replace toggle that recomputes the diff in-place. New pure projector `buildBiasImportPreviewRows(items, existing, mode)` in biasOverridesIO.js returns one structured row per chip: `{ id, label, incoming, live, isExisting, wouldWrite, action, fieldCount }`. Rows sorted by SCENE_BIASES order so the preview reads in the same order as the chip rail (calm → surprise → wild) regardless of input key order in the file. Unknown chip ids dropped before rendering. Pure / no DOM so the projector is regression-pinned in tests; React lives in RightSidebar.jsx (new `BiasOverridesImportPreview` component, ~210 lines). Drop → `applyCombinedBiasItems` stages instead of confirm+commit; single-file picker also stages (consistent UX for both entry points). Apply commits via `commitBiasImport`; Cancel clears the staged state. "Drop on replace" count surfaced so users know they're not just adding/overwriting but also wiping unspecified chips. parseFails count for multi-file drops with corrupt files.
- Carousel note filter regex mode toggle (R24.37). Graduates R23.34's substring-only matcher with an optional regex mode for power users — anchors (^demo$), wildcards (h.llo), character classes ([a-z]+), alternation (demo|test), quantifiers all supported. Substring stays the default. New mode-aware helpers in presetThumbnails.js: `NOTE_FILTER_MODE_SUBSTRING`/`NOTE_FILTER_MODE_REGEX` constants + `NOTE_FILTER_MODES` roster + `isValidNoteFilterMode(mode)` defensive predicate; `compileNoteRegex(rawQuery)` safe compile (case-insensitive 'i' flag always, returns null on invalid pattern / non-string / >256 chars ReDoS guard); `noteMatchesQueryWithMode(note, q, mode)` mode-aware matcher; `isValidQueryForMode(q, mode)` usability predicate driving the UI invalid-pattern signal; `presetsMatchingNoteWithMode(presets, q, mode, storage)` + `summarizeNoteFilterWithMode(presets, q, mode, storage)` projection + count. Invalid regex returns [] in regex mode (NOT a substring fallback — silent regex failure is intentional UX, the chip turns red so the user knows their pattern is broken). UI: mode toggle pip (".*" indigo chip) inside the input row; chip border + colour shifts red when query is non-empty + invalid; placeholder updates per mode ("Search notes..." vs "Regex: ^demo$, h.llo, [a-z]+..."); match-count badge shows "bad" instead of a number on invalid regex; empty-results banner has two messages (valid query no matches vs invalid regex). Persisted to localStorage `preset-note-filter-mode-v1`, sanitised on load.
- MIDI hotkey UNDO chain visual chain-counter badge (R24.38). Graduates R23.35's undo-chain with a visible chain counter so the user knows how many flips deep they are. Every restore toast in the chain wears a tiny pip to the LEFT of the Undo button: step 1 (initial warning) no badge; step 2 (1st undo restore) "x2"; step 3 (2nd undo flip-back) "x3"; and so on. Badge wears the WINNER bundle's accent colour so the visual ties to whichever bundle just took the hotkey. Tooltip explains the math: "Undo chain step 3 — you've flipped this hotkey 2 times. Click Undo within 1s to flip back." Toast.jsx — `showToast()` grows a 4th positional arg `badge` shaped `{ text, color?, title? }`; renders a tiny mono pip to the left of the Undo button. midiPresets.js — new pure helper `formatHotkeyChainBadge(chainStep, windowMs)`: step 1 / non-finite / < 1 → null (suppresses badge); step 2+ → `{ text: "xN", title: "..." }`; fractional step floors to int; invalid windowMs falls back to UNDO_CHAIN_MS default. MidiPanel.jsx — `showHotkeyTransferToast()` grows a chainStep param (default 1); recursive call site increments it when scheduling the next step. Single source of truth for the badge format means a future refactor can't accidentally change "x2" to "(2)" or "2x" silently.
- Per-(attractor, field) clamp warn threshold overrides (R24.40). Graduates R23.32's per-field-only overrides with a 3rd tier so power users can tune ONE specific attractor's STRENGTH meter strict while leaving every OTHER attractor's STRENGTH meter on the per-field-global value. Real-world use case: a critical "bass-thump" attractor where rail = silent attractor coexists with a decorative attractor where rail = visible at canvas edge (often intentional). Resolution chain (4-tier): per-(attractor, field) → per-field → global → shipped default. New lib helpers in midiMap.js: `sanitizeClampWarnAttractorOverrides(raw)` defensive structural cleaner; `resolveClampWarnThresholdFor(attractorId, field, global, fieldOver, attractorOver)` 4-tier resolver (skips tier 1 when attractorId is null/undefined/empty for back-compat); `setClampWarnAttractorFieldOverride(overrides, attractorId, field, value)` setter with ref-equal-on-no-op + last-cell-prune; `clearAllClampWarnAttractorOverrides` / `clearClampWarnAttractorOverrides(overrides, attractorId)` wipe paths; `hasClampWarnAttractorFieldOverride` UI predicate; `pruneClampWarnAttractorOverrides(overrides, liveAttractorIds)` GC orphans (accepts Set | Array | iterable). UI: persisted to `midi-clamp-warn-attractor-overrides-v1`; useEffect prunes orphans on attractor-list changes (no-op fast-path); meter resolver swapped to the 4-tier version; edited-pip flags ANY tier with an override; ClampThresholdPopover extended with a third slider row (violet, #a78bfa accent) for the per-attractor override; surface border colour now distinguishes which tier is driving the meter (violet/indigo/cyan); inactive sliders dim to 0.55 opacity; new "Clear attr." button + flexWrap for narrow popovers; priority footer reads "this attractor > this field > global" with colour-coded chips.
- Camera path touch DnD: drag by the #N play-order badge (R24.39). Graduates R23.31's "long-press the chevron buttons" with the #N play-order badge as a third drag affordance on touch. Parallels the R18.19 named-attractor #N badge drag handle so the two reorderable lists behave consistently. Pure wire-layer change — no new lib helpers / no new tests; `resolveTouchTargetIdx` + `moveView` + the `touchDragHandlers` factory were already pinned by R22.12 + R23.31. When `views.length > 1` the badge gets `touchDragHandlers(idx)` + `cursor: grab` + `touchAction: 'manipulation'` (kills iOS 300ms tap delay) + `userSelect / WebkitTouchCallout: none` (so long-press doesn't trigger native callout) + slight padding to extend the touch target without changing visible width. Single-view lists skip the binding entirely. Synthetic-click suppression flows through unchanged (the badge has no onClick of its own; drag's synthetic click hits the parent row button which already handles suppression via consumeClickIfSuppressed).

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

### Batch 14 — attractor type cues + wind/crossfade preview + MIDI bundle IO + rename  (SHIPPED)
- [x] **R14.05** Named attractor type-specific color cues in the UI — ad78605
- [x] **R14.15** Wind override import preview panel (parallels keymap R13.04) — 2c41ba3
- [x] **R14.16** Crossfade override import preview panel (parallels R14.15) — f0d615f
- [x] **R14.17** MIDI user bundle export/import as a single JSON file — ada7e2e
- [x] **R14.18** MIDI user bundle rename in-place (double-click name) — 35b0968

Note: R14.01 (Echo / trail FBO) and R14.02 (Named attractor 3D drag
handle) deferred yet again — both need their own dedicated render-
pipeline / r3f-gizmo batches. R14.03 (server-rendered OG endpoint)
still deferred — static Vite app, no backend runtime available.
R14.04 (multi-error gutter overlay in preset editor) deferred to a
future batch — graduates from R13.06 and needs careful design of
gutter overlay rendering vs. the existing single-error line marker.
Substituted R14.05 + R14.15 + R14.16 + R14.17 + R14.18 from the
future queue to keep the batch at 5 great slices instead of padding.

### Batch 15 — peak trail + lightbox hold + multi-bundle IO + enabled hysteresis + attractor reorder  (SHIPPED)
- [x] **R15.07** Spectrum peak-holds fade-out tail (last ~200ms at falling alpha) — 865792f
- [x] **R15.13** Lightbox WASD/hjkl pan auto-repeats while the key is held — 1a0bf1d
- [x] **R15.14** MIDI user bundle: export ALL bundles in a single multi-bundle JSON file — 9d8158b
- [x] **R15.16** Per-attractor MIDI: route CC to ENABLED toggle (Schmitt-trigger hysteresis) — e05ccbe
- [x] **R15.20** Named attractor: drag row up/down to reorder (parallels camera path R10.03) — bdc10db

Note: R15.01 (Echo / trail FBO), R15.02 (3D drag handle), R15.03 (server-rendered OG endpoint), R15.04 (multi-error gutter overlay), R15.05 (custom audio-reactive curve editor) all deferred — first three are dedicated infrastructure batches (render-pipeline / r3f-gizmo / backend runtime), R15.04 + R15.05 are each their own focused batch. Substituted R15.07, R15.13, R15.14, R15.16, R15.20 from the future queue to keep the batch at 5 great slices instead of padding.

### Batch 16 — bulk thumb rebuild + spectrum trail curves + attractor jump-to-position + MIDI colour tag + lightbox accel  (SHIPPED)
- [x] **R16.06** Carousel "Rebuild all stale thumbs" bulk action — 6f67a38
- [x] **R16.17** Spectrum peak trail per-bar fade-out curve preset (linear/exp/log) — d6b552f
- [x] **R16.18** Named attractor bulk-reorder via numeric position input — 4a59e9d
- [x] **R16.19** MIDI user bundle per-bundle COLOR tag — 9686614
- [x] **R16.20** Lightbox WASD pan acceleration curve (held >1s ramps 1× → 3×) — d37ffa4

Note: R16.01 (Echo / trail FBO), R16.02 (3D drag handle), R16.03
(server-rendered OG endpoint), R16.04 (multi-error gutter overlay),
R16.05 (custom audio-reactive curve editor) all deferred yet again
— first three are dedicated infrastructure batches (render-pipeline
/ r3f-gizmo / backend runtime), R16.04 + R16.05 each need their own
focused batch. Substituted R16.06, R16.17, R16.18, R16.19, R16.20
from the future queue to keep the batch at 5 great slices instead
of padding.

### Batch 17 — pan accel chip + log-curve radius + bulk-delete + drag reorder + theme drag-import  (SHIPPED)
- [x] **R17.20** Lightbox pan acceleration curve preset chip (linear/exp/log/off) — 21f15f1
- [x] **R17.15** Per-attractor MIDI: route CC to RADIUS via inverse curve — fb8d794
- [x] **R17.17** Named attractor bulk-delete via shift-click selection — a927c8d
- [x] **R17.07** Camera path drag-and-drop reorder (graduates R10.03) — 62bacfa
- [x] **R17.06** Theme pack drag-and-drop import to sidebar — afc5a6f

Note: R17.01 (Echo / trail FBO) and R17.02 (Named attractor 3D drag
handle) deferred yet again — both need their own dedicated render-
pipeline / r3f-gizmo batches. R17.03 (server-rendered OG endpoint)
still deferred — no backend runtime. R17.04 (multi-error gutter
overlay) and R17.05 (custom audio-reactive curve editor) each need
their own focused batch. Substituted R17.06, R17.07, R17.15, R17.17,
R17.20 from the future queue.

### Batch 18 — TYPE routing + 3 drag-drop + grid long-press  (SHIPPED)
- [x] **R18.16** Per-attractor MIDI: route CC to TYPE (cycles 4 force-field types with band hysteresis)  — 658695f
- [x] **R18.09** MIDI user bundle drag-and-drop import (auto-detects single vs multi envelope)  — 4c5059e
- [x] **R18.18** Theme pack drag-and-drop accepts multiple .json files at once  — 4a0fcec
- [x] **R18.19** Named attractor drag-and-drop reorder via #N badge handle  — 8980f4d
- [x] **R18.06** Snapshot grid long-press multi-select for bulk delete  — 2b48af4

Note: R18.01 (Echo / trail FBO) and R18.02 (Named attractor 3D drag
handle) deferred yet again — both need their own dedicated render-
pipeline / r3f-gizmo batches. R18.03 (server-rendered OG endpoint)
still deferred — no backend runtime. R18.04 (multi-error gutter
overlay) and R18.05 (custom audio-reactive curve editor) each need
their own focused batch. Substituted R18.06, R18.09, R18.16, R18.18,
R18.19 from the future queue to keep the batch at 5 great slices.

### Batch 19 — peak trail params + MIDI TYPE tooltip + thumb metadata + multi-file drop + gap-drop  (SHIPPED)
- [x] **R19.12** Spectrum peak trail per-curve tunable parameters (exp exponent, log base)  — f66dff3
- [x] **R19.16** Per-attractor MIDI: TYPE row shows live band on tooltip  — c55527e
  (+ f4717f5 lint-gate cleanup: lastCCByNumber useRef → useState)
- [x] **R19.13** Carousel: per-preset thumb metadata badge on hover  — 6d4bd68
- [x] **R19.20** MIDI user bundle drag-and-drop accepts multiple .json files at once  — 22f05d6
- [x] **R19.19** Named attractor drag-reorder accepts drops on row gaps for insert-here  — 9ecc15f

Note: R19.01 (Echo / trail FBO) / R19.02 (3D drag handle) / R19.03
(server-rendered OG endpoint) / R19.04 (multi-error gutter overlay)
/ R19.05 (custom audio-reactive curve editor) all deferred — first
three are dedicated infrastructure batches (render-pipeline /
r3f-gizmo / backend runtime), R19.04 + R19.05 each need their own
focused batch. Substituted R19.12, R19.13, R19.16, R19.19, R19.20
from the future queue to keep the batch at 5 great slices.

### Batch 20 — peak trail tint + TYPE proximity + bias overrides + thumb detail + bundle hotkey  (SHIPPED)
- [x] **R20.13** Spectrum peak trail per-bar colour tint based on frequency (low warm, high cool)  — 70c5bf9
- [x] **R20.16** Per-attractor MIDI TYPE row proximity bar meter (graduates R19.16's distanceToEdge01)  — 9e6b16f
- [x] **R20.07** Smash bias user-editable per-chip JSON overrides (graduates R12.04)  — ffe722a
- [x] **R20.19** Carousel thumb metadata badge opens rich detail panel on click (graduates R19.13)  — 3b1692e
- [x] **R20.11** MIDI user bundle per-bundle keyboard shortcut binding (graduates R14.18)  — af6e896
  (+ 2c6f8a6 lint-gate cleanup: bindings/setBindings naming + dedup eslint-disable directives)

Note: R20.01 (Echo / trail FBO) / R20.02 (3D drag handle) / R20.03
(server-rendered OG endpoint) / R20.04 (multi-error gutter overlay)
/ R20.05 (custom audio-reactive curve editor) all deferred AGAIN —
first three are dedicated infrastructure batches (render-pipeline /
r3f-gizmo / backend runtime), R20.04 + R20.05 each need their own
focused batch. Substituted R20.07, R20.11, R20.13, R20.16, R20.19
from the future queue to keep the batch at 5 great slices.

### Batch 21 — peak trail palettes + clamp proximity + bias IO + thumb actions + hotkey conflict  (SHIPPED)
- [x] **R21.21** Spectrum peak trail tint: alternate hue palettes — chip rail (warmCool / rainbow / cool / warm / mono)  — 6fd34d8
- [x] **R21.22** Per-attractor MIDI proximity meter on STRENGTH / RADIUS / RADIUS·log / X / Y / Z rows  — 177d613
- [x] **R21.23** Smash bias overrides export/import as JSON (parallels wind/crossfade IO)  — e296768
- [x] **R21.24** Thumb detail panel: Rebuild + Clear action buttons  — 9c57856
- [x] **R21.25** MIDI bundle hotkey-conflict warning toast (graduates R20.11)  — 1348474

Note: R21.01 (Echo / trail FBO) / R21.02 (3D drag handle) / R21.03
(server-rendered OG endpoint) / R21.04 (multi-error gutter overlay) /
R21.05 (custom audio-reactive curve editor) all deferred AGAIN — first
three are dedicated infrastructure batches (render-pipeline /
r3f-gizmo / backend runtime), R21.04 + R21.05 each need their own
focused batch. Substituted R21.21, R21.22, R21.23, R21.24, R21.25
from the future queue.

### Batch 22 — bias drag-drop + hotkey UNDO + camera touch DnD + clamp threshold + thumb note  (SHIPPED)
- [x] **R22.28** Bias overrides drag-and-drop import (parallels R17.06 + R18.09)  — f277293
- [x] **R22.30** MIDI bundle hotkey conflict toast UNDO action chip (graduates R21.25)  — cfed5ef
- [x] **R22.12** Camera path drag-reorder ALSO works on touch (long-press; graduates R17.07)  — f412fe1
- [x] **R22.27** Per-attractor MIDI clamp meter long-press-to-tweak warning threshold (graduates R21.22)  — 5a9598d
- [x] **R22.29** Thumb detail panel per-tile custom note field (graduates R20.19)  — faac257

Note: R22.01-R22.05 (Echo / trail FBO, 3D drag handle, server-rendered
OG endpoint, multi-error gutter overlay, custom audio-reactive curve
editor) all deferred yet again — first three are dedicated
infrastructure batches (render-pipeline / r3f-gizmo / backend runtime),
R22.04 + R22.05 each need their own focused batch. Substituted R22.12,
R22.27, R22.28, R22.29, R22.30 from the future queue to keep the batch
at 5 great slices instead of padding.

### Batch 23 — bias multi-file + note filter + UNDO chain + touch chevrons + per-field clamp  (SHIPPED)
- [x] **R23.33** Bias overrides drag-drop accepts multiple .json files at once — 51e7c3c
- [x] **R23.34** Thumb note: filter the carousel by note text — 192be7f
- [x] **R23.35** Hotkey conflict UNDO: 2nd Undo within 1s re-undoes (toggle) — 4ea6be7
- [x] **R23.31** Camera path touch drag: long-press also fires on the chevron buttons — b3cabb7
- [x] **R23.32** Per-attractor MIDI clamp meter: PER-FIELD threshold overrides — 1d21e99

Note: R23.01-R23.05 (Echo / trail FBO, 3D drag handle, server-rendered
OG endpoint, multi-error gutter overlay, custom audio-reactive curve
editor) deferred yet again — first three are dedicated infrastructure
batches (render-pipeline / r3f-gizmo / backend runtime), R23.04 +
R23.05 each need their own focused batch. Substituted R23.31, R23.32,
R23.33, R23.34, R23.35 from the future queue (all graduations of
Batch 22 features) to keep the batch at 5 great slices instead of
padding.

### Batch 24 — bias preview + note regex + UNDO chain badge + per-attractor clamp + camera badge drag  (SHIPPED)
- [x] **R24.36** Bias multi-file drop: live preview panel (parallels R14.15 wind / R14.16 crossfade) — 8462246
- [x] **R24.37** Carousel note filter: regex mode toggle for power users — 7b9a40b
- [x] **R24.38** MIDI hotkey UNDO chain: visual chain-counter badge on the toast — e36b2f6
- [x] **R24.40** Per-attractor MIDI clamp: per-(attractor, field) overrides (graduates R23.32) — 092992b
- [x] **R24.39** Camera path touch DnD: row also drags by the #N play-order badge (parallels R18.19) — 97481ad

Note: R24.01-R24.05 (Echo / trail FBO, 3D drag handle, server-rendered
OG endpoint, multi-error gutter overlay, custom audio-reactive curve
editor) deferred yet again — first three are dedicated infrastructure
batches (render-pipeline / r3f-gizmo / backend runtime), R24.04 +
R24.05 each need their own focused batch. Substituted R24.36, R24.37,
R24.38, R24.39, R24.40 from the future queue (all graduations of
Batch 22/23 features) to keep the batch at 5 great slices instead of
padding.

### Batch 25 — next 5 (refilled)
- [ ] R25.01 Echo / trail FBO that survives EffectComposer [carried — render pipeline refactor, dedicated batch]
- [ ] R25.02 Named attractor 3D drag handle (r3f gizmo) [carried — dedicated batch]
- [ ] R25.03 OpenGraph snapshot endpoint (server-rendered share card) [carried — needs backend]
- [ ] R25.04 Preset editor: gutter overlay highlighting all error lines (multi-error mode) [carried]
- [ ] R25.05 Audio-reactive bg curve chips → custom curve editor for power users (visual spline / 3-knot bezier) [carried]

### Future queue (refill when batch closes)
- [ ] R25.06 Bookmark bundle export: drag a saved-view dot from the minimap onto the export button to selectively bundle just that view [was R24.06]
- [ ] R25.08 Minimap: hover a saved-view dot for ~1s shows a thumbnail preview (canvas2D sample of the scene from that camera) [was R24.08]
- [ ] R25.09 Wind chip overrides: per-chip live "what slot is this CC bound to" badge if the chip's seconds is bound to a CC (cross-reference between MIDI map + wind chips) [was R24.09]
- [ ] R25.10 Crossfade chip overrides: same MIDI cross-reference badge as R25.09 [was R24.10]
- [ ] R25.14 Snapshot grid: bulk download all selected as a zip (graduates R18.06 selection mode) [was R24.14]
- [ ] R25.15 Theme pack drag-drop: progress indicator when N > 10 files [was R24.15]
- [ ] R25.17 MIDI bundle drag-drop: per-file progress indicator for very large drops [was R24.17]
- [ ] R25.18 Spectrum peak trail params: persist per-bar OVERRIDES (graduates R19.12 to per-bar granularity) [was R24.18]
- [ ] R25.20 Named attractor gap-drop: also work for the MidiPanel per-attractor binding groups [was R24.20]
- [ ] R25.26 Spectrum peak trail palette: USER-AUTHORED palettes [was R24.26]
- [ ] R25.41 Bias import preview: per-FIELD diff inside each chip row (currently R24.36 shows fieldCount only) — graduates R24.36
- [ ] R25.42 Carousel note filter regex: history dropdown of recent successful patterns — graduates R24.37
- [ ] R25.43 MIDI UNDO chain badge: also colour-codes the chain step direction (alternating A→B / B→A indicator) — graduates R24.38
- [ ] R25.44 Camera path touch DnD: badge wears a haptic-feedback pulse on long-press start (Android vibrate API) — graduates R24.39
- [ ] R25.45 Per-attractor MIDI clamp: bulk-clear button in the popover that wipes EVERY per-(attractor, field) override for the current attractor — graduates R24.40

### Future queue carried from Batch 24 (refill on next batch)

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
- 2026-06-21 19:24 PT — Batch 14 (5/5).
  Commits: ad78605 (R14.05 named attractor type-specific colour cues
  across LeftSidebar + MidiPanel — ATTRACTOR_TYPE_STYLES +
  attractorTypeStyle helper bundle, NamedAttractorRow border/badge/
  chips per type, MidiPanel group header dot + monospace type suffix
  + stale-fallback), 2c41ba3 (R14.15 wind override import preview
  panel — WindOverrideIO refactored to stage parse + render
  WindOverridesImportPreview using summarizeImportImpact already
  exported, add/overwrite/skip badges, mode-aware impact line),
  f0d615f (R14.16 crossfade override import preview panel — direct
  parallel of R14.15 with pink-violet palette + italics shipped-
  default in live cell when no override exists), ada7e2e (R14.17
  MIDI user bundle export/import as a single JSON file — new
  midiUserBundleIO.js module + 8 lib functions + per-bundle
  Download chip + "+ Import bundle" button, isAtBundleCap helper
  prevents silent FIFO drops), 35b0968 (R14.18 MIDI user bundle
  rename in-place via double-click — new renameUserPreset helper
  with ref-equal-on-no-op contract, new UserBundleChip leaf with
  editing state machine + Enter/Escape/blur handlers).
  R14.01 (Echo / trail FBO) and R14.02 (3D drag handle) deferred
  yet again — both need their own dedicated render-pipeline /
  r3f-gizmo batches. R14.03 (server-rendered OG endpoint) still
  deferred — no backend runtime. R14.04 (multi-error gutter
  overlay) deferred — graduates from R13.06 and needs careful
  gutter overlay design. Substituted R14.15, R14.16, R14.17,
  R14.18 from the future queue to keep the batch at 5 great
  slices instead of padding.
  Gates: lint 23 errors / 3 warnings — exactly matches baseline
  (zero new errors in any of the 6 modified .js/.jsx files +
  1 new .js file + 1 new .test.mjs file; transient
  react-hooks/set-state-in-effect from a defensive useEffect in
  UserBundleChip caught during the gate and resolved by dropping
  the effect — the onDoubleClick handler already re-initializes
  draftName so the sync was redundant). Build: 965 ms green
  (1.69 MB bundle, gzip 506 KB — +2 KB for midiUserBundleIO +
  2 lucide icons + UserBundleChip leaf). Unit tests: 39/39 files
  pass (added midiUserBundleIO with envelope/bare-bundle/sanitize/
  serialize/slugify/parseImport/cap-helper coverage; extended
  midiPresets with renameUserPreset success/blank-reject/missing-
  id/non-array-defensive/truncation/custom-desc-preserved/multi-
  entry-targeted/save-load-roundtrip; extended namedAttractors
  with R14.05 type styles — 4 distinct accents, full bundle
  completeness for every type, fallback for unknown/null/undefined,
  opacity hierarchy walk · ~140 fresh asserts this batch).
- 2026-06-21 22:26 PT — Batch 15 (5/5).
  Commits: 865792f (R15.07 spectrum peak-hold fade trail — per-bar
  Float32Array ring buffer + tickPeakHolds shifts + readPeakTrail
  with current-bar filter + alpha lerp + resetPeakHolds zeroes
  trail), 1a0bf1d (R15.13 lightbox WASD/hjkl pan auto-repeat —
  60ms repeat after 180ms delay + new aggregateHeldPan helper in
  pinchZoom.js with diagonal-normalise + opposing-pair-cancel +
  injectable classifier + blur/unmount cleanup), 9d8158b (R15.14
  multi-bundle MIDI export/import — new EXPORT_KIND_MULTI envelope
  with 64 KB cap + buildExportPayloadMulti/serializeMulti/
  makeFilenameMulti/parseImportMulti + summarizeImportImpactMulti
  for FIFO-drop projection + UI "Export all (N)" / "Import all"
  cyan buttons), e05ccbe (R15.16 per-attractor MIDI enabled with
  Schmitt-trigger hysteresis — ATTRACTOR_FIELDS grew from 5 to 6,
  HYSTERESIS_ON=0.55 / HYSTERESIS_OFF=0.45, applyEnabledHysteresis
  pure helper holds previous state in dead-band + never flips on
  NaN, resolveActionForId reads LIVE attractor enabled flag at
  apply-time + writes only on decision change), bdc10db (R15.20
  named attractor drag-row up/down reorder — moveAttractorByIndex/
  Up/Down helpers in namedAttractors.js with ref-equal-on-no-op
  contract + store actions + LeftSidebar chevron column with
  Unicode ▲▼ glyphs, parallels camera-path R10.03 visually +
  semantically), 6cf966a (lint-gate cleanup for R15.13 — captured
  heldKeysRef.current into a local for the effect cleanup function
  to silence react-hooks/exhaustive-deps warning).
  R15.01 (Echo / trail FBO), R15.02 (3D drag handle), R15.03
  (server-rendered OG endpoint), R15.04 (multi-error gutter
  overlay), R15.05 (custom audio-reactive curve editor) all
  deferred — first three are dedicated infrastructure batches
  (render-pipeline / r3f-gizmo / backend runtime), R15.04 + R15.05
  each need their own focused batch. Substituted R15.07 + R15.13 +
  R15.14 + R15.16 + R15.20 from the future queue to keep the
  batch at 5 great slices instead of padding.
  Gates: lint 23 errors / 3 warnings — exactly matches baseline
  (zero new errors in any of the 9 modified .js/.jsx files +
  1 new module path + 4 modified .test.mjs files; one transient
  react-hooks/exhaustive-deps warning caught at the gate from
  reading heldKeysRef.current in SnapshotGallery cleanup,
  resolved with a local-capture refactor as 6cf966a).
  Build: 912 ms green (1.72 MB bundle, gzip 511 KB — +5 KB for
  PEAK_TRAIL ring buffer + multi-bundle IO + Schmitt-trigger
  helper + 4 reorder helpers + Unicode chevron column + cyan
  Export-all/Import-all chips). Unit tests: 39/39 files pass
  (extended waveform with ~80 R15.07 asserts covering trail
  allocation/shift semantics/readPeakTrail oldest→newest order/
  alpha bounds/current-bar filter/defensive null cases/reset
  zeroes trail; extended pinchZoom with ~25 R15.13 asserts
  covering aggregateHeldPan single/diagonal-normalise/cancel-
  pair/garbage/custom-classifier; extended midiUserBundleIO with
  ~50 R15.14 asserts covering multi envelope/serialize/parse/
  bare-array/per-bundle-sanitize/all rejection cases/summarize-
  impact FIFO projection; extended midiMap with ~60 R15.16
  asserts covering applyEnabledHysteresis full Schmitt-trigger
  contract incl. boundary correctness + dead-band hold sweep +
  NaN safety + full-cycle exactly-2-flips invariant + enabled
  routing through resolveActionForId; extended namedAttractors
  with ~35 R15.20 asserts covering moveAttractorByIndex/Up/Down
  ref-equal-on-no-op contract + boundary + missing-id + null/
  empty defensive · ~250 fresh asserts this batch). Per-attractor
  MIDI row count scales from 5N to 6N with the new enabled field.
- 2026-06-22 01:41 PT — Batch 16 (5/5).
  Commits: 6f67a38 (R16.06 carousel bulk Rebuild-all button +
  clearAllThumbnails + summarizeBulkRebuild helpers + UI counter
  state machine), d6b552f (R16.17 spectrum peak trail fade-out
  curve chip linear/exp/log — PEAK_TRAIL_CURVES + applyTrailCurve
  pure shaper + nextTrailCurve cycle helper + readPeakTrail opts.
  curve passthrough + spectrumPeakCurve store field with sky-blue
  WaveformOverlay chip), 4a59e9d (R16.18 named attractor jump-to-
  position via inline numeric input on the #N badge —
  moveAttractorTo1BasedPosition helper with generous [1, length]
  clamp + ref-equal-on-no-op contract + parsePositionInput parser
  + moveNamedAttractorToPosition store action), 9686614 (R16.19
  MIDI user bundle per-bundle COLOR tag — 8-swatch palette
  pink/violet/indigo/cyan/emerald/amber/rose/slate +
  setUserPresetColor / userPresetColorStyle / isValidUserPresetColor
  / sanitizeUserPresetColor helpers + load/save/build threaded
  with color field + UserBundleChip swatch button with popover
  picker + chip background/text/border now follow bundle accent),
  d37ffa4 (R16.20 lightbox WASD pan acceleration curve held >1s
  ramps 1× → 3× — panAccelMultiplier with full defensive contract
  + scaleDirByHold ref-equal-on-no-mult helper + holdStartTsRef
  in SnapshotGallery + reset on keyup-to-empty/blur),
  72c186f (lint-gate cleanup — removed unused eslint-disable
  for no-alert in PresetCarousel + dropped redundant draftPos
  sync effect in NamedAttractorRow that hit react-hooks/set-state
  -in-effect, mirroring R14.18's UserBundleChip pattern).
  R16.01 (Echo / trail FBO) and R16.02 (3D drag handle) deferred
  yet again — both need their own dedicated render-pipeline /
  r3f-gizmo batches. R16.03 (server-rendered OG endpoint) still
  deferred — no backend runtime. R16.04 (multi-error gutter
  overlay) and R16.05 (custom audio-reactive curve editor) each
  need their own focused batch. Substituted R16.06, R16.17,
  R16.18, R16.19, R16.20 from the future queue.
  Gates: lint 23 errors / 3 warnings — exactly matches baseline
  (zero new errors / warnings in any of the 7 modified .js/.jsx
  files + 3 new .test.mjs sections; the 72c186f cleanup commit
  caught + resolved 1 new error and 1 new warning that surfaced
  at the gate). Build: 980 ms green (1.73 MB bundle, gzip 513 KB
  — +2 KB for bulk thumb helpers + peak trail curves + jump-to-
  position parser + 8-colour palette styles + pan accel helpers).
  Unit tests: 39/39 files pass (extended presetThumbnails with
  ~25 R16.06 asserts covering clearAllThumbnails count semantics
  + no-op + mixed-malformed + defensive, summarizeBulkRebuild
  no-cache/partial-cache/malformed/no-storage/all-zero; extended
  waveform with ~40 R16.17 asserts covering PEAK_TRAIL_CURVES
  roster + applyTrailCurve endpoint convergence + 7-point
  interior shape invariant (exp<linear<log) + full defensive
  contract + nextTrailCurve wraparound + curve-aware readPeakTrail
  mid-trail brightness comparison; extended namedAttractors with
  ~60 R16.18 asserts covering moveAttractorTo1BasedPosition happy
  paths + both clamp directions + ref-equal-on-no-op + missing-id
  + non-finite + float-rounding + parsePositionInput edges;
  extended midiPresets with ~70 R16.19 asserts covering palette
  roster + isValidUserPresetColor / sanitizeUserPresetColor /
  userPresetColorStyle bundle completeness + setUserPresetColor
  full ref-equal contract + load/save round-trip including
  missing-colour legacy + corrupt-colour upgrade; extended
  pinchZoom with ~50 R16.20 asserts pinning defaults snapshot
  + every boundary (0/999/AT-1000/1001/midway/end/past-end/60s/
  1e9) + monotonicity invariant + full defensive contract
  including ±Infinity handling + scaleDirByHold ref-equality on
  hot path · ~245 fresh asserts this batch).
- 2026-06-22 05:42 PT — Batch 17 (5/5).
  Commits: 21f15f1 (R17.20 lightbox pan accel curve chip
  linear/exp/log/off — PAN_ACCEL_CURVES + nextPanAccelCurve +
  panAccelMultiplier extended with opts.curve passthrough +
  scaleDirByHold threads curve, persisted via setLightboxPanCurve
  with key `lightbox-pan-curve-v1` parallels R16.17 spectrumPeakCurve),
  fb8d794 (R17.15 per-attractor MIDI radius·log routing — sibling
  `attr:<id>:radiusLog` slot next to linear radius, 2^v-1 curve
  with midpoint ≈0.414, ATTRACTOR_FIELDS grew from 6 to 7 entries
  slotted directly after RADIUS, logCurveShape + logCurveRadius
  pure helpers with full defensive contract), a927c8d (R17.17
  named attractor bulk-delete via shift-click multi-select —
  validSelectedIds derived via useMemo to dodge react-hooks/
  set-state-in-effect, removeAttractors helper accepts Set|Array|
  iterable with ref-equal-on-no-op contract + corrupt-row cleanup
  side-effect, removeNamedAttractors store action), 62bacfa
  (R17.07 camera path drag-and-drop reorder — pure wire layer on
  R10.03 moveView primitive, draggingIdx kept in STATE not REF so
  render-time reads pass react-hooks/refs, drag-target highlight
  with sibling-enter-before-leave guard), afc5a6f (R17.06 custom
  theme pack drag-and-drop import — file-drop zone covering whole
  CustomThemesRow, dragDepth counter handles nested enter/leave
  flicker, shared parseAndPreview path with file picker so future
  format change touches one place, +.json file-extension validation
  + multi-file first-only convention, also rolled in the two
  lint-gate cleanups: validSelectedIds rewrite + draggingIdx
  state migration that surfaced during the end-of-batch gate).
  R17.01 / R17.02 / R17.03 / R17.04 / R17.05 all deferred —
  first three are dedicated infrastructure batches (render-pipeline
  / r3f-gizmo / backend runtime), R17.04 + R17.05 each need their
  own focused batch. Substituted R17.06, R17.07, R17.15, R17.17,
  R17.20 from the future queue.
  Gates: lint 23 errors / 3 warnings — exactly matches baseline
  (zero new errors / warnings in any of the 7 modified .js/.jsx
  files + 3 modified .test.mjs files; the lint-gate cleanups
  rolled into afc5a6f caught + resolved 2 new errors that
  surfaced at the gate — RightSidebar.jsx draggingIdxRef.current
  read-during-render, LeftSidebar.jsx setSelectedIds-in-effect —
  same pattern as 72c186f + 6cf966a from prior batches). Build:
  1.26 s green (1.73 MB bundle, gzip 515 KB — +0 KB vs Batch 16,
  R17.06/07/17 are pure wire layers + R17.15/20 added tiny helpers).
  Unit tests: 39/39 files pass (extended pinchZoom with ~30 R17.20
  asserts pinning PAN_ACCEL_CURVES roster order + nextPanAccelCurve
  wraparound + curve-specific endpoint convergence + slow-vs-fast
  property exp<linear<log at mid-ramp + monotonicity invariant +
  defensive fallback + scaleDirByHold off-curve ref-equal contract;
  extended midiMap with ~50 R17.15 asserts pinning logCurveShape
  endpoint anchors + midpoint ≈0.414 + monotonicity + full
  defensive contract for non-finite/out-of-range + attractorActionId
  mint + resolveActionForId log-curve setter + 7-field invariant
  + radiusLog adjacent to linear radius layout invariant; extended
  namedAttractors with ~30 R17.17 asserts pinning Set/Array/iterable
  input forms + single/multi/full-wipe behaviour + order preservation
  + ref-equal-on-no-op 8 different no-op shapes + corrupt-row cleanup
  + input list never mutated + empty-array return on non-array list
  · ~110 fresh asserts this batch). ATTRACTOR_FIELDS now at 7 (was 6).
- 2026-06-22 09:19 PT — Batch 18 (5/5).
  Commits: 658695f (R18.16 per-attractor MIDI route CC to TYPE —
  pickAttractorTypeForCC band-hysteresis with TYPE_BAND_HYSTERESIS=
  0.015 + resolveActionForId TYPE setter + label / range / tooltip
  in MidiPanel; ATTRACTOR_FIELDS grew from 7 to 8), 4c5059e (R18.09
  MIDI user bundle drag-and-drop import — auto-detects single vs
  multi envelope by trying parseImportMulti first then falling
  through to parseImport; PresetBar drop zone with dragDepth
  counter + filter-by-Files-mimetype + drop banner; no new IO
  module), 4a0fcec (R18.18 theme pack drag-drop multiple files —
  Promise.all parallel parse, partial-success semantics, filename-
  sorted preview, "12 themes · 3 files" header + tooltip listing
  sources, "(multi-file ok)" hint on drop banner; parseAndPreviewMulti
  alongside parseAndPreview so file-picker path is untouched),
  8980f4d (R18.19 named attractor drag-and-drop reorder — STATE not
  ref draggingIdx + dragOverIdx wired through NamedAttractorRow;
  draggable={!!onDragStart && !editing && !editingPos} so text
  edits aren't interrupted; #N badge wears cursor:grab; chevrons
  R15.20 + jump-to-position R16.18 stay), 2b48af4 (R18.06 snapshot
  grid long-press multi-select — LONG_PRESS_MS=450 + SLOP_PX=8
  pointer-event detection, swallow-synthetic-click guard, multi-
  select bar above grid, selection clears on close/view-change,
  new removeSnapshots lib helper mirroring removeAttractors
  contract).
  R18.01 (Echo / trail FBO) / R18.02 (3D drag handle) / R18.03
  (server-rendered OG endpoint) / R18.04 (multi-error gutter
  overlay) / R18.05 (custom audio-reactive curve editor) all
  deferred — first three are dedicated infrastructure batches
  (render-pipeline / r3f-gizmo / backend runtime), R18.04 + R18.05
  each need their own focused batch. Substituted R18.06, R18.09,
  R18.16, R18.18, R18.19 from the future queue to keep the batch
  at 5 great slices instead of padding.
  Gates: lint 23 errors / 3 warnings — exactly matches baseline
  (zero new errors / warnings in any of the 6 modified .js/.jsx
  files + 2 modified .test.mjs files; no lint-gate cleanup commits
  needed this batch). Build: 1.03 s green (1.74 MB bundle, gzip
  518 KB — +3 KB vs Batch 17 for the new band-picker helper +
  drop-zone wires + removeSnapshots + long-press state machine).
  Unit tests: 39/39 files pass (extended midiMap with ~90 R18.16
  asserts pinning band selection / endpoint anchors / clamp /
  dead-band hold both directions / non-adjacent skip / full-sweep
  ≤3-transitions invariant / defensive contract / empty types /
  single-type / custom hysteresis / load-save round-trip;
  extended snapshotGallery with ~25 R18.06 asserts pinning Set /
  Array / iterable input forms + ref-equal-on-no-op contract for
  8 no-op shapes + drop-all behaviour + mixed-valid-invalid +
  corrupt-rows cleanup · ~115 fresh asserts this batch).
  ATTRACTOR_FIELDS now at 8 (was 7).
- 2026-06-22 12:53 PT — Batch 19 (5/5).
  Commits: f66dff3 (R19.12 spectrum peak trail per-curve tunable
  params — PEAK_TRAIL_CURVE_PARAMS roster + defaultPeakTrailCurveParams
  / sanitizeCurveParamValue / sanitizeCurveParams / setCurveParam /
  isCurveParamsAtDefaults helpers + applyTrailCurve params arg
  threaded through both branches + readPeakTrail opts.curveParams
  passthrough; default exp.exponent=2 preserves R16.17 t^2 visual;
  default log.base=4 replaces sqrt with log(1+(base-1)*t)/log(base);
  endpoint anchoring 0→0, 1→1 INVARIANT across every shape; store
  persisted to `spectrum-peak-curve-params-v1` with sanitize-on-read
  + reset-to-defaults action; UI CurveChipWithLongPress wraps the
  R16.17 chip with ≥400ms long-press → params popover + sky-blue dot
  cue when curve has non-default params),
  c55527e (R19.16 per-attractor MIDI TYPE row live band tooltip —
  describeTypeBand projector returns {index, label, total, holdingPrev,
  distanceToEdge01} using same band-math as pickAttractorTypeForCC so
  the tag never lies about the picker's decision; holdingPrev only
  near TRUE boundaries; MidiPanel lastCCByNumber state cache with
  functional setState + same-value-skip + bound-CC-only filter so
  unbound CCs don't trigger 60Hz re-renders; badge wears type's
  accent colour via attractorTypeStyle),
  6d4bd68 (R19.13 carousel per-preset thumb metadata badge on hover —
  recordThumbMetadata / readThumbMetadata / clearThumbMetadata /
  summarizeThumbAge helpers; parallel storage key preset-thumb-meta-
  <id>; captureThumbnailToStorage + capturePresetThumbnail (live
  path) both record metadata; clearThumbnail + clearAllThumbnails
  cascade-wipe; PresetCarousel hover badge "120×80 · render · 3h"
  source-coloured (live=green, render=indigo); compact summarizeThumbAge
  formatter (now/Ns/Nm/Nh/Nd/Nw/Ny, future timestamps clamp to "now"
  so no negative ages),
  22f05d6 (R19.20 MIDI bundle drag-drop multi-file — combineDroppedBundles
  pure helper takes per-file FileReader reads + returns {bundles,
  parseFails, totalFilesRead} with same parseImportMulti → parseImport
  precedence; per-bundle sanitisation through both paths; partial-
  success preserved; PresetBar accepts onDropFiles alongside onDropFile;
  drop banner adds "(multi-file ok)" hint),
  9ecc15f (R19.19 named attractor drag-reorder gap-drop semantics —
  dropIndexForGap helper encapsulates splice-bookkeeping math + no-op
  cases (gap above/below self return null); LeftSidebar renders thin
  6px gap zones between rows that expand to 22px with indigo dashed
  strip on hover-during-drag; trailing gap below last row only
  renders during active drag; gapOverIdx state mutually exclusive
  with dragOverIdx so visual indicators don't double up;
  NamedAttractorRow wraps in fragment with leading gap div).
  Plus f4717f5 (lint-gate cleanup: lastCCByNumber useRef → useState
  to satisfy react-hooks/refs; identical behaviour but render-time
  read now passes the lint rule).
  R19.01-R19.05 all deferred — first three are dedicated infrastructure
  batches (render-pipeline / r3f-gizmo / backend runtime), R19.04
  + R19.05 each need their own focused batch. Substituted R19.12,
  R19.13, R19.16, R19.19, R19.20 from the future queue.
  Gates: lint 23 errors / 3 warnings — exactly matches baseline
  (one new error surfaced mid-batch on lastCCByNumberRef render-time
  read; rolled into f4717f5 cleanup commit). Build: 911 ms green
  (1.76 MB bundle, gzip 521 KB — +0 KB vs Batch 18; new lib helpers
  + popover + gap-drop wires + metadata side-store are tiny).
  Unit tests: 39/39 files pass (extended waveform with ~90 R19.12
  asserts pinning PEAK_TRAIL_CURVE_PARAMS roster + per-curve metadata
  + default snapshot non-aliasing + sanitizeCurveParamValue clamp +
  fallback + sanitizeCurveParams partial / corrupt / unknown-drop +
  setCurveParam ref-equal-on-no-op + clamp + bad-curve/key + null-
  rebuild + isCurveParamsAtDefaults + applyTrailCurve endpoint
  invariance across 6 exponents + 5 bases + exponent=1 degenerates
  to linear + higher-exponent more-head-biased + higher-base more-
  tail-biased + monotonicity on t + corrupt-params-fallback +
  readPeakTrail honours curveParams + partial-params falls back;
  extended midiMap with ~30 R19.16 asserts pinning describeTypeBand
  basic band selection + endpoint behaviour + clamp + dead-band
  detection both sides + extreme-never-holds + distanceToEdge01
  mid-band + near-boundary + defensive null returns + single-type
  roster + custom hysteresis + label/index invariant across full
  sweep; extended presetThumbnails with ~55 R19.13 asserts pinning
  thumbMetadataKey shape + recordThumbMetadata happy-path + defensive
  (empty/null/non-string id, no-storage, missing-dimensions, unknown-
  source, negative/NaN) + readThumbMetadata roundtrip + corrupt-JSON
  + array-top-level + missing-capturedAt + defensive + partial-but-
  valid + clearThumbMetadata + cascade-from-clearThumbnail +
  cascade-from-clearAllThumbnails + summarizeThumbAge boundary
  table (1s/5s/60s/1m/1h/24h/1d/7d/1w/52w/1y) + future-clamps-to-
  now + defensive; extended midiUserBundleIO with ~30 R19.20
  asserts pinning combineDroppedBundles single-bundle + multi-bundle
  + bare-array + mixed-shapes-flattened + partial-success-counted +
  empty-raw-explicit-error + per-bundle-sanitisation + defensive +
  non-object-entries-skipped; extended namedAttractors with ~30
  R19.19 asserts pinning dropIndexForGap mapping for down-move-with-
  shift + up-move-no-shift + move-to-end + move-to-top + no-op
  detection (gap above/below self) + boundary no-ops + adjacent
  moves + defensive (NaN/negative/out-of-range/zero-length) +
  single-item-always-noop + full sweep invariant against
  moveAttractorByIndex · ~235 fresh asserts this batch).
- 2026-06-22 16:30 PT — Batch 20 (5/5).
  Commits: 70c5bf9 (R20.13 spectrum peak trail per-bar frequency tint —
  TRAIL_HUE_START=20 / TRAIL_HUE_END=260 / TRAIL_HUE_DEFAULT=210 +
  peakTrailHueForBarIndex projector with full defensive contract;
  store spectrumPeakTrailTint boolean persisted to
  `spectrum-peak-trail-tint-v1`; WaveformOverlay tint chip with
  gradient-background preview; trail painter single-line branch),
  9e6b16f (R20.16 per-attractor MIDI TYPE row proximity bar meter —
  proximityToBoundary01 field on describeTypeBand with edge-band
  semantics + single-type roster handling + 3-tier safe/warn/danger
  colour intent; 26×4 fill bar inside the band tag with 80ms width
  + 120ms colour transitions),
  ffe722a (R20.07 smash bias per-chip JSON overrides — SCENE_BIAS_
  RANGE_FIELDS=4 + SCENE_BIAS_CHANCE_FIELDS=10 schema rosters;
  sanitizeBiasOverride defensive against every shape; load/save/
  reset/has helpers with empty-save-wipes-entry semantic;
  resolveSceneBias ref-equal-on-no-op; generateRandomScene plumbed
  through; UI cyan-dot edited-indicator + right-click-to-edit +
  10-row textarea popover with sanitize-on-apply error surface),
  3b1692e (R20.19 carousel thumb metadata badge → rich detail panel
  on click — formatByteSize + formatThumbDetails projector; record/
  read extended with optional particleCount + captureMs + byteSize;
  badge becomes button with active state; 240-320px detail panel
  above tile with 2-col monospace grid; Esc + outside-click + bulk-
  clear close handlers),
  af6e896 (R20.11 per-bundle MIDI keyboard shortcut — VALID_HOTKEY_
  KEYS roster (26+10+12+4+9+12 = 73 keys); hotkeyFromEvent +
  sanitizeHotkey canonical-form projectors; setUserPresetHotkey
  1-binding-per-hotkey invariant + ref-equal-on-no-op contract;
  findUserPresetByHotkey canonical lookup; load/save thread
  sanitizeHotkey both directions with silent-drop-on-corrupt
  semantic; UserBundleChip hotkey badge with capture-mode amber
  outline; global keydown listener in MidiPanel applies via
  applyPresetToMap('replace') with text-input-skip guard),
  2c6f8a6 (lint-gate cleanup: MidiPanel keydown listener
  bindings/setBindings naming fix + sanitizeHotkey import dedup;
  RightSidebar dedup of two unused-vars eslint-disable directives
  by switching to explicit Object.keys filter).
  R20.01-R20.05 all deferred AGAIN — first three are dedicated
  infrastructure batches (render-pipeline / r3f-gizmo / backend
  runtime), R20.04 + R20.05 each need their own focused batch.
  Substituted R20.07, R20.11, R20.13, R20.16, R20.19 from the
  future queue.
  Gates: lint 23 errors / 3 warnings — exactly matches baseline
  (4 new errors + 3 new warnings surfaced mid-batch and were all
  resolved in the 2c6f8a6 cleanup commit; final gate is clean).
  Build: 1.08 s green (1.77 MB bundle, gzip 525 KB — +4 KB vs
  Batch 19 for the four new pure helpers + the UI wires).
  Unit tests: 39/39 files pass (extended waveform with ~22 R20.13
  asserts pinning TRAIL_HUE_START/END/DEFAULT constants + endpoint
  anchors + mid-bar midpoint lerp + monotonicity across 32 bars +
  defensive contract (NaN/±Infinity/negative/non-finite on both
  args) + out-of-range clamp behaviour + float-floors-to-int +
  determinism; extended midiMap with ~30 R20.16 asserts pinning
  proximity dead-centre=1.0 + on-boundary=0.0 + in-dead-band=0.0 +
  halfway=0.5 + monotonicity rising/falling sweep across band 1
  with peak≥0.99 + edge-band v=0/v=1 clamp to 1 + single-type
  always=1 + [0,1] range invariant across 100 samples + custom
  hysteresis flow-through; extended randomScene with ~75 R20.07
  asserts pinning schema rosters (4 range / 10 chance) + sanitize
  defensive against non-array/wrong-length/negative/min>max/NaN/
  Infinity/out-of-range chances/empty-forceTypes/unknown-member +
  unknown-keys-dropped + null/undefined/string/number-defensive +
  load/save round-trip + empty-save-wipes-entry + reset wrapper +
  unknown-bias-id + corrupt-JSON/schema returns empty + resolve
  ref-equal-on-no-op + override flow-through across 50 seeds with
  custom counts/speedRange enforced; extended presetThumbnails
  with ~40 R20.19 asserts pinning formatByteSize boundary table
  (0B/512B/1KB/2KB/10KB/1MB/5MB/50MB sub-10 decimal vs round) +
  defensive on null/NaN/negative/Infinity/string + formatThumb
  Details defensive null/empty + 3-base-row minimal + 6-row rich +
  ms vs s render-time switch + partial rich fields skip-when-missing
  + source-hint differs live vs render + roundtrip particleCount/
  captureMs/byteSize + defensive drop on negative/NaN/string rich
  values; extended midiPresets with ~60 R20.11 asserts pinning
  sanitizeHotkey canonical pass-through + modifier reorder (4-way)
  + case normalisation + whitespace tolerance + defensive empty/
  null/undefined/number/modifier-only/trailing-plus/unknown-key/
  unknown-modifier + hotkeyFromEvent shift+1/multi-mod/ArrowUp
  normalisation/space/F4/modifier-only-null/Unidentified-null/
  defensive null/missing-key/non-string-key + setUserPresetHotkey
  assignment-new-array/no-op-ref-equal/clear-via-null/clear-via-
  empty/conflict-strips-other/missing-id-skip/null-list/invalid-
  refuse + findUserPresetByHotkey happy/unbound-null/canonical-
  match-across-reorder/defensive + load/save round-trip including
  corrupt-hotkey-silent-drop · ~225 fresh asserts this batch).
- 2026-06-22 19:31 PT — Batch 21 (5/5).
  Commits: 6fd34d8 (R21.21 spectrum peak trail palette chip rail —
  PEAK_TRAIL_PALETTES roster of 5 (warmCool default + rainbow / cool /
  warm / mono) + PEAK_TRAIL_PALETTE_NAMES cycle order + isValidTrailPalette
  defensive-against-prototype-pollution + nextTrailPalette wraparound +
  peakTrailHueForBarIndexPalette palette-aware projector identical
  defensive contract to R20.13; store spectrumPeakTrailPalette persisted
  to `spectrum-peak-trail-palette-v1`, default 'warmCool' preserves
  R20.13 visual via INVARIANT pinned in tests; WaveformOverlay chip
  at left:188 wears active palette's 3-stop linear-gradient as its
  own background previewing the palette it controls),
  177d613 (R21.22 per-attractor MIDI clamp-proximity meter on STRENGTH
  / RADIUS / RADIUS·log / X / Y / Z rows — clampProximity01 symmetric
  inverted-V projector returning 1 at v=0.5 (max headroom), 0 at v=0/1
  (at rail), NaN/non-finite resolves to 1 (max-safe first-paint
  default); describeClampProximity structured projector matching
  describeTypeBand null-on-bad-input contract returning kind=clamp +
  v01 + proximityToBoundary01 + atLow/atHigh boundary flags; MidiPanel
  reuses R19.16 lastCCByNumber state cache; monospace tag between
  typeBand and CC badge with "87%" + 26x4 fill bar; three-tier intent
  matches R20.16 (red rail / amber close / green safe) with 80ms width
  + 120ms colour transitions),
  e296768 (R21.23 smash bias overrides export/import as portable JSON
  — new biasOverridesIO.js module parallels windOverridesIO + crossfade
  OverridesIO patterns; kind=`ai-particle-simulator/bias-overrides`,
  v=1, MAX_IMPORT_BYTES=16 KB; exportableBiasIds pulls from SCENE_BIASES
  so new chips auto-extend IO; sanitizeBiasOverridesMap drops unknown
  chip ids + empty-after-sanitize entries; buildExportPayload /
  serialize / makeFilename ('particle-bias-YYYY-MM-DD.json'); parseImport
  full envelope + bare-items shorthand, rejects wrong-kind / unsupported-
  version / missing-items / all-invalid / invalid-JSON / oversized;
  mergeImport with merge/replace semantics; summarizeImportImpact
  dry-run preview with conflicts + resultIds; UI Export + Import
  buttons join Edit-bias-JSON link above the chip rail in RightSidebar;
  Export disabled when no chip has overrides via hasAnyBiasOverride
  re-evaluated against overrideTick; replace-mode import also resets
  any chip the import didn't touch so a clean swap genuinely wipes
  prior state),
  9c57856 (R21.24 thumb detail panel Rebuild + Clear action buttons —
  graduates R20.19's rich-detail panel with two action buttons scoped
  to the open tile; Rebuild (indigo) re-uses the same rebuildThumb
  path the hover button uses + closes panel before rebuild lands so
  user sees new thumb arrive on the tile; Clear (red) calls
  clearThumbnail which cascades to clearThumbMetadata via R19.13
  contract + updates in-memory thumbs/meta maps via setState
  destructuring so placeholder emoji returns immediately; pure wire
  layer — no lib changes; clearThumbnail cascade already pinned in
  presetThumbnails.test.mjs),
  1348474 (R21.25 MIDI bundle hotkey-conflict warning toast —
  detectHotkeyConflict pure helper in midiPresets.js returns the OTHER
  bundle the user is about to displace or null on no-conflict
  (unbound / self-rebind / cleared / invalid); shape mirrors
  findUserPresetByHotkey so UI can pull .name/.color/.id for the
  toast; MidiPanel setUserBundleHotkey runs the detector BEFORE
  setUserPresetHotkey lands then surfaces a toast wearing the TARGET
  bundle's accent colour: 'Hotkey "shift+1" stolen from "X" → "Y"';
  self-rebinds and clears skip the toast).
  R21.01-R21.05 all deferred AGAIN — first three are dedicated
  infrastructure batches (render-pipeline / r3f-gizmo / backend
  runtime), R21.04 + R21.05 each need their own focused batch.
  Substituted R21.21, R21.22, R21.23, R21.24, R21.25 from the
  future queue.
  Gates: lint 23 errors / 3 warnings — exactly matches baseline
  (one new warning surfaced from an unused eslint-disable directive
  in RightSidebar R21.23 wiring + two new warnings from defensive-
  but-unused eslint-disable comments in PresetCarousel R21.24 setState
  destructuring; all three resolved inline before commit, no separate
  lint-gate cleanup commit needed). Build: 2.50 s green (1.78 MB
  bundle, gzip 528 KB — +3 KB vs Batch 20 for the new pure helpers
  + chip rail + meter + bias IO module + thumb-action-row JSX).
  Unit tests: 40/40 files pass (added biasOverridesIO with ~75
  asserts covering exportable ids cover shipped chips,
  sanitizeBiasOverridesMap drops unknown chips + empty-after-
  sanitize, corrupt per-chip values re-flow through sanitizeBias
  Override, envelope build / serialize / parse round-trip, bare-
  items shorthand, wrong-kind / unsupported-version / missing-
  items / all-invalid / invalid-JSON / oversized rejection, non-
  string + top-level non-object rejection, mergeImport merge vs
  replace semantics with conflicts, summarizeImportImpact mode-
  aware projections, empty edge cases, schema size invariants;
  extended waveform with ~50 R21.21 asserts covering palette
  roster + chip-cycle order + warmCool R20.13 anchor invariant +
  isValidTrailPalette accept/reject incl. proto-chain bypass +
  nextTrailPalette closed-loop wraparound + endpoint anchoring
  across every palette + mid-bar midpoint + totalBars=1 midpoint
  + R20.13 backwards-compat warmCool=legacy + unknown-fallback +
  cool descending monotonicity + rainbow ascending monotonicity +
  rainbow full 360 span + mono <=30deg spread + defensive contract;
  extended midiMap with ~50 R21.22 asserts covering clampProximity01
  endpoint behaviour + symmetry around 0.5 + quarter-point 0.5
  reading + out-of-range clamp + defensive NaN/Infinity → 1 fallback
  + [0,1] range invariant + inverted-V monotonicity + describeClamp
  Proximity structured shape + atLow/atHigh boundary at exact
  thresholds + out-of-range v01 clamped into returned object +
  defensive null-on-non-finite + projector match between structured
  + pure helpers + purity; extended midiPresets with ~30 R21.25
  asserts covering conflict detection happy path + unbound-hotkey
  null + self-rebind null + clearing null/empty null + invalid
  hotkey null + canonical-form comparison + permuted-mods conflict
  + defensive null/empty list/targetId + multi-bundle conflict
  deterministic first-match + purity + detect+set integration
  · ~205 fresh asserts this batch).

- 2026-06-22 22:53 PT — Batch 22 (5/5).
  Commits: f277293 (R22.28 bias overrides drag-and-drop import +
  shared parseAndApplyBiasImport), cfed5ef (R22.30 hotkey-conflict
  toast UNDO action chip + Toast.jsx 3rd-arg action API), f412fe1
  (R22.12 camera path touch drag-reorder via 350ms long-press +
  resolveTouchTargetIdx pure helper), 5a9598d (R22.27 per-attractor
  clamp meter user-tunable warn threshold + classifyClampProximity /
  sanitizeClampWarnThreshold / isClampWarnThresholdAtDefault lib
  helpers + ClampThresholdPopover leaf), faac257 (R22.29 thumb
  detail panel editable per-tile note field + THUMB_NOTE_MAX_LEN +
  setThumbNote atomic helper + ThumbNoteEditor leaf).
  R22.01-R22.05 deferred again — first three are dedicated
  infrastructure batches (render-pipeline / r3f-gizmo / backend
  runtime), R22.04 + R22.05 each need their own focused batch.
  Substituted R22.12, R22.27, R22.28, R22.29, R22.30 from the
  future queue to keep the batch at 5 great slices.
  Gates: lint 23 errors / 3 warnings — exactly matches baseline
  (zero new errors / warnings in any of the 7 modified .js/.jsx
  files + 3 modified .test.mjs files; no lint-gate cleanup commits
  needed this batch — every commit was lint-clean on first land).
  Build: 889 ms green (1.80 MB bundle, gzip 532 KB — +4 KB vs
  Batch 21 for the new lib helpers + ClampThresholdPopover +
  ThumbNoteEditor + touch DnD wiring + Toast action chip + bias
  drop-zone JSX).
  Unit tests: 40/40 files pass (~145 fresh asserts this batch):
  - extended cameraViews ~35 R22.12 asserts (resolveTouchTargetIdx
    happy paths + half-open boundary + overflow snap above + below
    + defensive (NaN/Infinity/null/string y + non-array/empty/
    nullish ranges) + single-row + partial-corrupt + all-corrupt
    + determinism + mutation guard)
  - extended midiMap ~60 R22.27 asserts (classifyClampProximity
    atRail-trumps-threshold + default 0.25 preserves R21.22 +
    lower-threshold shrinks warn / higher grows + defensive
    non-finite prox → safe + atRail strict-equals-true semantics +
    custom-threshold flow-through + sanitizeClampWarnThreshold
    happy + bounds + non-finite/null/string → DEFAULT + constants
    invariants MIN < DEFAULT < MAX < 0.5 / MIN > 0 / DEFAULT
    preserves R21.22 + isClampWarnThresholdAtDefault contract +
    integration with describeClampProximity through structured
    object)
  - extended presetThumbnails ~50 R22.29 asserts (note round-trip
    + trim + length-cap on both record + read + empty/whitespace/
    null/number/object → dropped + read-side defensive against
    non-string persisted note + setThumbNote happy path / update /
    clear via empty+null+ws + trim + cap + defensive bad-id/
    no-storage/no-pre-existing-meta + ref-equal on same-value /
    clear-when-clear + preserves every other field + defensive
    against corrupt JSON envelope + formatThumbDetails note row
    kind='note' tag + no-note → no-row + empty/whitespace note
    → no row + clearThumbMetadata cascade still wipes notes)

- 2026-06-23 02:29 PT — Batch 23 (5/5).
  Commits: 51e7c3c (R23.33 bias drag-drop multi-file + new lib
  combineDroppedBiasFiles + per-file partial-success contract +
  alphabetical sort for deterministic last-file-wins on cross-file
  conflict + applyCombinedBiasItems shares confirm/merge/persist
  with single-file path), 192be7f (R23.34 carousel note filter +
  new lib normalizeNoteQuery / noteMatchesQuery / presetsMatchingNote /
  summarizeNoteFilter — empty-query ref-equal no-op preserves carousel
  rendering invariant + collapsible amber search input + live match
  badge intersects with category filter + empty-results banner),
  4ea6be7 (R23.35 MIDI hotkey UNDO chain toggle + new lib
  UNDO_CHAIN_MS / isWithinUndoWindow — 1s window with ≤ endpoint +
  defensive negative-delta-as-clock-jump-back rejection +
  recursive showHotkeyTransferToast captures issuedAt per step +
  past-window surfaces explicit "too late" toast instead of silent
  no-op), b3cabb7 (R23.31 camera path chevron touch DnD wiring +
  touchDragHandlers factory with stopProp + suppressNextClickRef
  guard prevents drag's synthetic click from firing chevron's
  onClick + tooltip hint mentions long-press), 1d21e99 (R23.32
  per-field clamp warn threshold overrides + new lib
  CLAMP_THRESHOLD_FIELDS / sanitizeClampWarnOverrides /
  resolveClampWarnThreshold per-field→global→DEFAULT chain +
  setClampWarnFieldOverride ref-equal-on-no-op + clear via null +
  ClampThresholdPopover rewritten with scope header + GLOBAL slider
  (cyan) + PER-FIELD slider (indigo) + Use-global button).
  R23.01-R23.05 deferred again — first three are dedicated
  infrastructure batches (render-pipeline / r3f-gizmo / backend
  runtime), R23.04 + R23.05 each need their own focused batch.
  Substituted R23.31, R23.32, R23.33, R23.34, R23.35 from the
  future queue — every slice is a graduation of a Batch 22 feature,
  giving the batch a tight thematic spine (Batch 22 → Batch 23
  iteration loop without padding).
  Gates: lint 23 errors / 3 warnings — exactly matches baseline
  (one new lint error surfaced in R23.35 from React Compiler's
  impure-Date.now flag false-positive on the recursive closure
  structure; resolved with a targeted eslint-disable directive +
  inline comment explaining why; no lint-gate cleanup commit
  needed — folded into the same R23.35 commit).
  Build: 922 ms green (1.81 MB bundle, gzip 534 KB — +2 KB vs
  Batch 22 for the new lib helpers + ClampThresholdPopover rewrite
  + note filter UI + chevron touch wiring + bias multi-file
  combiner + UNDO chain helper).
  Unit tests: 40/40 files pass (~230 fresh asserts this batch):
  - extended biasOverridesIO ~70 R23.33 asserts (happy multi-file
    + cross-file last-file-wins + partial success + defensive
    (null/string/empty/non-object inputs) + reads with error field
    set + wrong-kind envelope partial taint + name-missing →
    'unnamed' placeholder + sanitize pass drops unknown chips +
    purity)
  - extended presetThumbnails ~60 R23.34 asserts (normalizeNoteQuery
    trim+lowercase + non-string fallback; noteMatchesQuery substring
    case-insensitive + empty-query semantics + defensive note types;
    presetsMatchingNote happy path + case mix + substring boundary +
    empty-query no-op preserves ref-equality + defensive presets /
    storage + malformed entries skipped + note-less skipped + order
    preserved; summarizeNoteFilter matching + totalWithNotes
    invariants; trim invariant between record/read/match paths)
  - extended midiPresets ~30 R23.35 asserts (UNDO_CHAIN_MS=1000
    constant; isWithinUndoWindow happy 0/1/500/999ms + edge
    invariant at exactly 1000ms + out-of-window 1001/2000/60000ms
    + negative delta clock-jump-back rejection + non-finite inputs
    NaN/Infinity/null/undefined/string + custom window arg with
    edge invariants + non-finite/negative window → false (no
    implicit fallback) + zero window only at exact issue time)
  - extended midiMap ~70 R23.32 asserts (CLAMP_THRESHOLD_FIELDS
    roster — 6 fields, enabled+type excluded; sanitizeClampWarnOverrides
    empty/nullish/array/known-fields-kept-independently/unknown-dropped/
    clamp-range/non-finite-dropped; resolveClampWarnThreshold per-field
    wins + fallback chain to global to DEFAULT + lookup-time
    re-sanitization + non-string/non-object/unknown-field paths;
    setClampWarnFieldOverride happy / ref-equal-no-op / clamping /
    clear via null+undefined / clear-when-absent-no-op / invalid
    field / non-finite value / non-object overrides / multiple
    independent fields; clearAllClampWarnOverrides empty-no-op /
    populated-wipe / nullish-input; hasClampWarnFieldOverride
    differs/equals/missing/non-finite/defensive/sanitization-
    invariance; integration round-trip with classifyClampProximity)

- 2026-06-23 06:00 PT — Batch 24 (5/5).
  Commits: 8462246 (R24.36 bias import preview panel),
  7b9a40b (R24.37 carousel note filter regex mode),
  e36b2f6 (R24.38 hotkey UNDO chain visual counter badge),
  092992b (R24.40 per-(attractor, field) clamp warn overrides),
  97481ad (R24.39 camera path #N badge touch drag).
  Gates: lint 23 errors / 3 warnings — exactly matches baseline
  (zero new errors in any of the modified .js/.jsx files).
  Build: 894 ms green (1.83 MB bundle, gzip 542 KB).
  Unit tests: 40/40 files pass.
  Fresh asserts this batch (~210 total):
  - biasOverridesIO ~30 R24.36 asserts (buildBiasImportPreviewRows:
    merge mode + empty existing all-add, merge + existing skip/new
    add, replace + existing overwrite, default mode = merge,
    fieldCount post-sanitize, live override surfaced on existing rows,
    rows sorted by SCENE_BIASES order regardless of input order,
    unknown chip ids dropped, defensive null/array/non-object → [],
    pure input not mutated)
  - presetThumbnails ~70 R24.37 asserts (NOTE_FILTER_MODE constants
    + isValidNoteFilterMode predicate incl. non-string defensive;
    compileNoteRegex valid pattern with case-insensitive flag,
    anchors + alternation, empty/whitespace/non-string → null,
    invalid patterns [unclosed bracket / malformed lookbehind /
    trailing backslash / leading quantifier] → null, length cap
    256 chars exactly at boundary + over; noteMatchesQueryWithMode
    substring delegation + regex anchors/wildcards/case-insensitive
    + invalid-pattern-no-substring-fallback + non-string note +
    empty-query-matches-all composable + default mode + unknown
    mode → substring fallback; isValidQueryForMode substring-always-
    usable + regex requires-compile + empty-usable + null-usable +
    default mode + unknown mode; presetsMatchingNoteWithMode
    substring-delegation + regex-only-leading-anchor + empty-query
    ref-equal-no-op + invalid-regex-empty + defensive null/default
    mode; summarizeNoteFilterWithMode regex+empty+match-count +
    invalid-regex-still-counts-tagged + substring-delegation)
  - midiPresets ~20 R24.38 asserts (formatHotkeyChainBadge step 1/0/-1
    null no-badge; step 2/3/10 text "xN" format + tooltip mentions
    step + flip-count plurals + window seconds; custom windowMs
    surfaces in tooltip; non-finite/non-numeric/null/undefined/string
    step → null; fractional step floors to int; invalid windowMs
    NaN/-100/0/Infinity falls back to UNDO_CHAIN_MS default)
  - midiMap ~60 R24.40 asserts (sanitizeClampWarnAttractorOverrides
    empty/null/undefined/non-object/array → empty; happy path
    keeps valid + sanitises per-field; unknown field keys dropped;
    out-of-range clamped; non-string attractor ids dropped;
    empty-after-sanitize inner dropped; non-object inner dropped;
    resolveClampWarnThresholdFor tier 1 wins over tier 2 wins over
    tier 3 wins over tier 4; null/undefined/empty/non-string
    attractorId skips tier 1; invalid tier 1 value falls through;
    out-of-range tier 1 clamps; non-object overrides falls through;
    setClampWarnAttractorFieldOverride set new cell + same-value
    ref-equal no-op + different value new ref + preserves other
    fields + cross-attractor independence + clear-cell preserves
    others + clear-last-cell drops attractor + clear-non-existent
    ref-equal + invalid field/empty id/non-string id/non-finite
    value all return input ref; clearAllClampWarnAttractorOverrides
    empty/null/non-object defensive + populated-wipe;
    clearClampWarnAttractorOverrides per-attractor wipe preserves
    others + non-existent ref-equal-no-op + defensive nulls;
    hasClampWarnAttractorFieldOverride no-override-false + matching-
    per-field-false + differs-true + against-global-true + wrong-
    attractor + wrong-field + non-finite-defensive; pruneClamp...
    happy path keeps live + drops orphans + ref-equal-no-op when
    no orphans + Set/iterable input + non-string members treated
    as missing + non-object input defensive)
