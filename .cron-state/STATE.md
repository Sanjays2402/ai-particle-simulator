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
- Snapshot grid long-press multi-select for bulk delete (R18.06). Long-press (≥450ms) any tile in grid view to enter selection mode; a delete bar surfaces above the grid with Select all / Clear / Delete N (parallels R17.17 attractor multi-select). Tap-at-rest opens lightbox (unchanged); tap-in-select-mode toggles selection. Move guard (LONG_PRESS_SLOP_PX=8) bails out if the user starts to scroll/swipe — long-press only fires on a genuine hold. After firing, the synthetic click is swallowed. validSelectedIds reconciled at render-time via useMemo so externally-removed snapshots drop out of counts without setState-in-effect. Selection clears on gallery close / view-change (grid-only by design). New pure helper `removeSnapshots(items, idSet)` mirrors removeAttractors contract — Set | Array | iterable inputs, ref-equal-on-no-op skip, corrupt-row cleanup. Visual: selected tiles get red border + glow + filled red checkmark; unselected-in-select-mode get an empty ring; hover actions hidden in select mode so a careful tap doesn't fight the toggle. touchAction:'manipulation' + WebkitTouchCallout:'none' prevents iOS native long-press action sheet from intercepting.

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

### Batch 19 — next 5 (refilled)
- [ ] R19.01 Echo / trail FBO that survives EffectComposer [carried from R18.01 — render pipeline refactor, dedicated batch]
- [ ] R19.02 Named attractor 3D drag handle (r3f gizmo) [carried from R18.02 — dedicated batch]
- [ ] R19.03 OpenGraph snapshot endpoint (server-rendered share card) [carried from R18.03 — needs backend]
- [ ] R19.04 Preset editor: gutter overlay highlighting all error lines (multi-error mode) [carried from R18.04]
- [ ] R19.05 Audio-reactive bg curve chips → custom curve editor for power users (visual spline / 3-knot bezier) [carried from R18.05]

### Future queue (refill when batch closes)
- [ ] R19.06 Bookmark bundle export: drag a saved-view dot from the minimap onto the export button to selectively bundle just that view [was R18.07]
- [ ] R19.07 Smash bias: user-editable per-chip ranges (open the bias as JSON, tweak, re-save) [was R18.08]
- [ ] R19.08 Minimap: hover a saved-view dot for ~1s shows a thumbnail preview (canvas2D sample of the scene from that camera) [was R18.10]
- [ ] R19.09 Wind chip overrides: per-chip live "what slot is this CC bound to" badge if the chip's seconds is bound to a CC (cross-reference between MIDI map + wind chips) [was R18.11]
- [ ] R19.10 Crossfade chip overrides: same MIDI cross-reference badge as R19.09 [was R18.12]
- [ ] R19.11 MIDI user bundle: per-bundle keyboard shortcut binding (assign a hotkey to apply each bundle without opening the panel) [was R18.13]
- [ ] R19.12 Spectrum peak trail: per-curve tunable parameters (exp's exponent, log's base) — power users can taste-shape beyond the 3 shipped presets [was R18.14, graduates from R16.17]
- [ ] R19.13 Carousel: per-preset thumb metadata badge (cached date, dimensions, time since last view) on hover [was R18.15]
- [ ] R19.14 Camera path: drag-and-drop reorder ALSO works on touch (R17.07 is desktop-only — touch users need a long-press-to-drag gesture) [was R18.17]
- [ ] R19.15 Spectrum peak trail: per-bar colour tint based on frequency (low bars warm, high bars cool — graduates from R15.07 trail) [was R18.20]
- [ ] R19.16 MIDI per-attractor TYPE: tooltip on each row showing the current quarter the live CC value sits in (so users SEE the band picker working without watching the type chip on the row) [new — graduates R18.16]
- [ ] R19.17 Snapshot grid: bulk download all selected as a zip (graduates R18.06 selection mode) [new]
- [ ] R19.18 Theme pack drag-drop: progress indicator when N > 10 files (current parallel Promise.all is fast but visible delay on big drops) [new — graduates R18.18]
- [ ] R19.19 Named attractor drag-reorder: also accepts drops on the empty gap between rows for "insert here" semantics (current R18.19 only drops on rows) [new — graduates R18.19]
- [ ] R19.20 MIDI bundle drag-drop: multi-file drop (drop N bundle files at once, same parallel-parse + combined preview as R18.18 themes) [new — graduates R18.09]

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
