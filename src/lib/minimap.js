// Mini-map projection helpers.
//
// The minimap is a small XZ-plane overlay (top-down view) that shows
// where the camera sits relative to the particle "scene radius". It
// renders to a fixed-size canvas the consumer creates; this lib only
// owns the math: world-space → pixel-space projection, scene-radius
// estimation, and a thin sampler the React layer can call once per
// frame without allocations.
//
// All projection happens on the XZ plane (Y is up in the simulator);
// the world bounds we project span [-SCENE_HALF .. +SCENE_HALF] mapped
// to [0 .. size] in pixel space. Outside-the-bounds coords are clamped
// so the camera dot stays visible even if the user dollies way out.

export const DEFAULT_SCENE_HALF = 30          // world units shown per side
export const MIN_SCENE_HALF     = 4
export const MAX_SCENE_HALF     = 200

// Pick a scene-half value from a camera distance — picks a half that
// keeps the camera dot roughly inside the inner 60% of the minimap.
// `dist` is the camera's distance from the orbit target (sqrt of
// pos.x^2 + pos.y^2 + pos.z^2 when target is the origin).
export function pickSceneHalf(dist) {
  if (!Number.isFinite(dist) || dist <= 0) return DEFAULT_SCENE_HALF
  const target = dist / 0.6
  if (target < MIN_SCENE_HALF) return MIN_SCENE_HALF
  if (target > MAX_SCENE_HALF) return MAX_SCENE_HALF
  return target
}

// Project a world XZ coord into pixel space for a `size`x`size` canvas
// where the origin is the canvas center and +X goes right, +Z goes DOWN
// (so the top-down map matches "north is +Z forward" intuition). Returns
// [px, py] clamped to [0, size].
export function projectXZ(worldX, worldZ, sceneHalf, size) {
  const sh = (sceneHalf > 0 && Number.isFinite(sceneHalf)) ? sceneHalf : DEFAULT_SCENE_HALF
  const sz = (size > 0 && Number.isFinite(size)) ? size : 100
  // Map [-sh, +sh] → [0, sz]; clamp outside to the edges.
  const nx = (worldX + sh) / (2 * sh)
  const ny = (worldZ + sh) / (2 * sh)
  const px = Math.max(0, Math.min(sz, nx * sz))
  const py = Math.max(0, Math.min(sz, ny * sz))
  return [px, py]
}

// Compute a sampled view of the simulator's state suitable for one
// minimap render. Returns { camera, target, dist, sceneHalf }.
// `cameraApi` is the window.__particleCamera object (or any object
// with a .get() returning {pos, target}). Returns null when the API
// is missing so the renderer can fall back to a placeholder dot.
export function sampleScene(cameraApi) {
  if (!cameraApi || typeof cameraApi.get !== 'function') return null
  let snap
  try { snap = cameraApi.get() } catch { return null }
  if (!snap || !Array.isArray(snap.pos)) return null
  const [cx, cy, cz] = snap.pos
  const [tx, ty, tz] = Array.isArray(snap.target) ? snap.target : [0, 0, 0]
  const dx = cx - tx, dy = cy - ty, dz = cz - tz
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
  return {
    camera: [cx, cy, cz],
    target: [tx, ty, tz],
    dist,
    sceneHalf: pickSceneHalf(dist),
  }
}

// Camera "look direction" as a unit vector on the XZ plane. The
// renderer draws a short line from the camera dot toward this
// direction to show where the camera is pointing. Returns [0, 0] when
// camera and target coincide on the XZ plane.
export function lookDirXZ(camera, target) {
  if (!Array.isArray(camera) || !Array.isArray(target)) return [0, 0]
  const dx = target[0] - camera[0]
  const dz = target[2] - camera[2]
  const len = Math.sqrt(dx * dx + dz * dz)
  if (len < 1e-6) return [0, 0]
  return [dx / len, dz / len]
}

// Convert a click on the minimap into a target XZ world coord. Used
// by the consumer to let users click anywhere on the minimap to recenter
// the camera's orbit target. `px`, `py` are pixel coords measured from
// the top-left of the canvas. Returns [worldX, worldZ].
export function unprojectXZ(px, py, sceneHalf, size) {
  const sh = (sceneHalf > 0 && Number.isFinite(sceneHalf)) ? sceneHalf : DEFAULT_SCENE_HALF
  const sz = (size > 0 && Number.isFinite(size)) ? size : 100
  const nx = (px / sz) * 2 - 1   // -1..+1
  const ny = (py / sz) * 2 - 1
  return [nx * sh, ny * sh]
}

// Distance scale label for the minimap (e.g. "30u" / "120u"). Keeps
// it short for the small overlay footprint.
export function scaleLabelFor(sceneHalf) {
  const sh = (sceneHalf > 0 && Number.isFinite(sceneHalf)) ? sceneHalf : DEFAULT_SCENE_HALF
  return `${Math.round(sh)}u`
}

// --- Saved camera view markers (R9.05) -----------------------------
//
// Project a list of saved camera views into pixel-space points so the
// minimap renderer can paint each as a small dot. Each view has the
// shape { id, name, pos: [x,y,z], target: [x,y,z], createdAt } —
// matching the cameraViews lib.
//
// Returns an array of { id, name, px, py, inBounds } where inBounds
// is true when the view's XZ position lands inside [0, size]^2
// without clamping. The renderer uses inBounds to dim out-of-view
// markers (they still draw at the canvas edge so the user knows the
// view exists, just visually distinguished).
export function projectSavedViews(views, sceneHalf, size) {
  if (!Array.isArray(views) || views.length === 0) return []
  const sh = (sceneHalf > 0 && Number.isFinite(sceneHalf)) ? sceneHalf : DEFAULT_SCENE_HALF
  const sz = (size > 0 && Number.isFinite(size)) ? size : 100
  const out = []
  for (const v of views) {
    if (!v || !Array.isArray(v.pos) || v.pos.length < 3) continue
    const x = Number(v.pos[0]) || 0
    const z = Number(v.pos[2]) || 0
    // We need to know if the world-space coord was outside [-sh,+sh]
    // BEFORE projectXZ clamps it. That's the "inBounds" hint.
    const inBounds = Math.abs(x) <= sh && Math.abs(z) <= sh
    const [px, py] = projectXZ(x, z, sh, sz)
    out.push({
      id: (v.id !== undefined && v.id !== null) ? v.id : `${px},${py}`,
      name: typeof v.name === 'string' ? v.name : '',
      px,
      py,
      inBounds,
    })
  }
  return out
}

// Pick the saved-view marker nearest a click point, within a small
// hit-test radius (pixels). Returns the picked view's id (or its
// fallback string) or null if no marker lies within `radiusPx`.
// Used by the consumer to switch the minimap click action between
// "recenter orbit" (default) and "load this saved view" when a click
// lands close enough to a marker dot.
export function pickNearestMarker(markers, clickPx, clickPy, radiusPx = 8) {
  if (!Array.isArray(markers) || markers.length === 0) return null
  const r2 = radiusPx * radiusPx
  let bestId = null
  let bestDistSq = Infinity
  for (const m of markers) {
    if (!m) continue
    const dx = m.px - clickPx
    const dy = m.py - clickPy
    const d2 = dx * dx + dy * dy
    if (d2 <= r2 && d2 < bestDistSq) {
      bestDistSq = d2
      bestId = m.id
    }
  }
  return bestId
}

// --- Hover tooltip placement (R11.13) ----------------------------
// Given a marker's pixel position + the canvas size, decide where to
// anchor a small floating tooltip so it stays inside the minimap and
// doesn't cover the marker itself. Default placement is "above the
// marker, slightly to the right"; we mirror to the other side when
// the marker is close to an edge.
//
// Returns { left, top, side } in pixel coords relative to the canvas
// top-left. `side` is one of 'top'|'bottom'|'left'|'right' so the
// renderer can position a little arrow / caret if it wants.
export function tooltipPlacement(marker, canvasSize, tooltipW = 90, tooltipH = 22) {
  if (!marker) return null
  const sz = (canvasSize > 0 && Number.isFinite(canvasSize)) ? canvasSize : 132
  const gap = 6      // distance from marker to tooltip edge
  const margin = 4   // keep this far from canvas border
  // Default: tooltip ABOVE the marker, horizontally centered.
  let left = marker.px - tooltipW / 2
  let top  = marker.py - tooltipH - gap
  let side = 'top'
  // Flip to BELOW if it'd cross the top edge.
  if (top < margin) {
    top = marker.py + gap
    side = 'bottom'
  }
  // Constrain horizontally — slide into bounds when necessary.
  if (left < margin) left = margin
  if (left + tooltipW > sz - margin) left = sz - margin - tooltipW
  // If the tooltip still doesn't fit vertically (very small canvas),
  // place to the right instead.
  if (top + tooltipH > sz - margin && side === 'bottom') {
    top = Math.max(margin, marker.py - tooltipH / 2)
    if (marker.px + tooltipW + gap < sz - margin) {
      left = marker.px + gap
      side = 'right'
    } else if (marker.px - tooltipW - gap > margin) {
      left = marker.px - tooltipW - gap
      side = 'left'
    }
  }
  return { left, top, side }
}

// --- Frame all saved views (R42.N) -----------------------------------
//
// A one-tap "fit the camera so every saved view is in frame" — the
// classic "zoom to fit" / "view all" of a 3D editor, surfaced on the
// minimap since that's where the saved-view dots already live. When the
// camera is dollied in tight, saved-view dots scatter off the minimap's
// edge; this recenters the orbit on the cluster of saved positions and
// pulls the camera back just far enough to take them all in.
//
// The math is pure + DOM-free so it unit-tests without a camera: the
// component reads the live camera snapshot and hands the numbers here.

// A pleasant default 3/4 viewing angle (normalised) used when the current
// camera direction is degenerate (camera sitting on its own target).
export const FIT_DEFAULT_DIR = [0.55, 0.45, 0.7]
// Camera-fit tuning. dist = (radius / sin(halfFov)) * padding, clamped.
// sin(~25deg) ~ 0.42 → a roughly 50deg vertical FOV; padding leaves a bit
// of breathing room around the outermost view.
export const FIT_SIN_HALF_FOV = 0.42
export const FIT_PADDING = 1.18
export const FIT_MIN_DIST = 6
export const FIT_MAX_DIST = 400

// Compute the centroid + XZ-plane spread of a set of saved views. Returns
//   { center: [x,y,z], radius, count }
// or null when no view carries a usable position. `center` is the full-3D
// centroid (so the orbit can pivot on the cluster); `radius` is the max
// XZ-plane distance from the centroid to any view (the minimap is an XZ
// widget, so framing is about the top-down spread). Defensive: non-array
// → null; rows with a missing / non-finite pos are skipped.
export function framingForViews(views) {
  if (!Array.isArray(views) || views.length === 0) return null
  let sx = 0, sy = 0, sz = 0, n = 0
  const pts = []
  for (const v of views) {
    if (!v || !Array.isArray(v.pos) || v.pos.length < 3) continue
    const x = Number(v.pos[0]), y = Number(v.pos[1]), z = Number(v.pos[2])
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue
    pts.push([x, y, z])
    sx += x; sy += y; sz += z; n++
  }
  if (n === 0) return null
  const center = [sx / n, sy / n, sz / n]
  let radius = 0
  for (const p of pts) {
    const dx = p[0] - center[0]
    const dz = p[2] - center[2]
    const d = Math.hypot(dx, dz)
    if (d > radius) radius = d
  }
  return { center, radius, count: n }
}

// --- R44.N: frame only a SELECTED subset of views --------------------
//
// R42.N/R43.N "Fit all" frames every saved view. When the user has a
// multi-selection going (the R43.H command-palette panel), framing only
// the CHOSEN subset is the natural companion — "zoom to fit these three"
// rather than the whole set. This filters the views to the selected ids
// then reuses framingForViews, so the centroid + spread math (and every
// pinned test for it) is shared. `idSet` accepts a Set | Array | iterable
// (mirrors removeViews / the selection helpers). Returns the same
// { center, radius, count } shape as framingForViews, or null when the
// subset carries no usable position (empty selection, all-stale ids, all
// rows malformed). Pure.
export function framingForSelectedViews(views, idSet) {
  if (!Array.isArray(views) || views.length === 0) return null
  let ids
  if (idSet instanceof Set) ids = idSet
  else if (idSet && typeof idSet[Symbol.iterator] === 'function') ids = new Set(idSet)
  else return null
  if (ids.size === 0) return null
  const selected = views.filter(v => v && ids.has(v.id))
  if (selected.length === 0) return null
  return framingForViews(selected)
}

// --- R46.N: marker selection state for dimming non-selected dots ------
//
// When the user has a saved-view multi-selection going (mirrored from the
// command palette), the minimap's R45.N "Fit selected" button frames just
// that subset — but every green dot looks identical, so it's not obvious
// WHICH dots that button will frame. R46.N dims the NON-selected dots
// while a selection is live so the chosen subset stands out.
//
// This classifies a marker by its id against the selected-id set:
//   - 'none'       → no live selection (size 0 / non-iterable) → draw all
//                    dots at full strength (pre-R46.N behaviour)
//   - 'selected'   → this marker is in the selection → full strength
//   - 'unselected' → a selection exists but this marker isn't in it → dim
// Pure; accepts a Set | Array | iterable of ids (mirrors
// framingForSelectedViews). The renderer maps the result to an alpha
// multiplier so the visual stays in the component.
export function markerSelectionState(markerId, idSet) {
  let ids
  if (idSet instanceof Set) ids = idSet
  else if (idSet && typeof idSet[Symbol.iterator] === 'function') ids = new Set(idSet)
  else return 'none'
  if (ids.size === 0) return 'none'
  return ids.has(markerId) ? 'selected' : 'unselected'
}

// The alpha multiplier the renderer applies to a marker given its
// selection state — selected/none draw at full strength, unselected dots
// fade to MARKER_DIM_ALPHA so the live selection reads at a glance.
export const MARKER_DIM_ALPHA = 0.28
export function markerSelectionAlpha(state) {
  return state === 'unselected' ? MARKER_DIM_ALPHA : 1
}

// --- R47.N: dot-count glyph cluster for the "Fit N" button ------------
//
// R46.N dims the non-selected dots so the chosen subset stands out on the
// map. R47.N makes the "Fit N" BUTTON agree at a glance: instead of a bare
// number it shows a tiny cluster of dots — `lit` filled (selected) + `dim`
// hollow (the rest) — matching exactly the dimmed/lit dots on the minimap.
// So the button and the map read the same selection without counting.
//
// Returns { lit, dim, total, overflow }: lit = selected dots (capped at
// `maxDots`), dim = the rest (capped so lit+dim never exceeds maxDots),
// overflow = true when the real total exceeds what we can draw (caller
// appends a "+" so the cap is honest). Defensive: non-finite / negative
// counts clamp to 0; selected can't exceed total. Pure.
export const FIT_GLYPH_MAX_DOTS = 6
export function fitDotGlyphs(total, selectedCount, maxDots = FIT_GLYPH_MAX_DOTS) {
  const cap = (Number.isFinite(maxDots) && maxDots > 0) ? Math.floor(maxDots) : FIT_GLYPH_MAX_DOTS
  let t = Math.floor(Number(total))
  if (!Number.isFinite(t) || t < 0) t = 0
  let s = Math.floor(Number(selectedCount))
  if (!Number.isFinite(s) || s < 0) s = 0
  if (s > t) s = t
  const overflow = t > cap
  const lit = Math.min(s, cap)
  const dim = Math.min(t - s, cap - lit)
  return { lit, dim, total: t, overflow }
}

// Suggest a camera distance that frames a cluster of the given radius.
// Physically grounded: to fit a sphere of `radius` in a camera with
// half-FOV θ, the distance is radius / sin(θ); we add padding + clamp to
// a usable band so a single view (radius 0) still gives a sensible
// minimum pull-back and a sprawling set can't fling the camera to
// infinity. Defensive: non-finite / negative radius → FIT_MIN_DIST.
export function fitCameraDistance(radius, opts = {}) {
  const r = Number(radius)
  if (!Number.isFinite(r) || r < 0) return FIT_MIN_DIST
  const sinHalfFov = (Number.isFinite(opts.sinHalfFov) && opts.sinHalfFov > 0 && opts.sinHalfFov <= 1)
    ? opts.sinHalfFov : FIT_SIN_HALF_FOV
  const padding = (Number.isFinite(opts.padding) && opts.padding >= 1) ? opts.padding : FIT_PADDING
  const minDist = (Number.isFinite(opts.minDist) && opts.minDist > 0) ? opts.minDist : FIT_MIN_DIST
  const maxDist = (Number.isFinite(opts.maxDist) && opts.maxDist > minDist) ? opts.maxDist : FIT_MAX_DIST
  let d = (r / sinHalfFov) * padding
  if (!Number.isFinite(d) || d < minDist) d = minDist
  if (d > maxDist) d = maxDist
  return d
}

// The full "frame all views" camera move as a pure function: given the
// framing (from framingForViews) plus the CURRENT camera pos + target,
// return the new { pos, target, dist } that fits every view in frame.
// The camera keeps its current viewing DIRECTION (so a fit feels like a
// dolly, not a teleport) — we normalise (currentPos - currentTarget) and
// re-place the camera at that direction × the fit distance from the new
// centroid target. A degenerate direction (camera on its own target)
// falls back to FIT_DEFAULT_DIR so the result is never a NaN-laden eye.
// Returns null when there's nothing to frame.
export function frameViewsCameraMove(framing, currentPos, currentTarget, opts = {}) {
  if (!framing || !Array.isArray(framing.center)) return null
  const center = framing.center
  if (center.length < 3 || !center.every(Number.isFinite)) return null
  const dist = fitCameraDistance(framing.radius, opts)
  // Current viewing direction (camera back-vector), normalised.
  let dir = FIT_DEFAULT_DIR
  if (Array.isArray(currentPos) && Array.isArray(currentTarget)
      && currentPos.length >= 3 && currentTarget.length >= 3) {
    const dx = Number(currentPos[0]) - Number(currentTarget[0])
    const dy = Number(currentPos[1]) - Number(currentTarget[1])
    const dz = Number(currentPos[2]) - Number(currentTarget[2])
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz)
    if (Number.isFinite(len) && len > 1e-4) dir = [dx / len, dy / len, dz / len]
  }
  return {
    pos: [
      center[0] + dir[0] * dist,
      center[1] + dir[1] * dist,
      center[2] + dir[2] * dist,
    ],
    target: [center[0], center[1], center[2]],
    dist,
  }
}

// --- R43.N: animated "fit all" tween ----------------------------------
//
// R42.N's "Fit all" snaps the camera to the fitted framing instantly. A
// graceful pull-back reads better — so this provides the pure pieces to
// TWEEN from the current camera to the fitted one over a short duration:
// an ease curve + a per-frame interpolation of both the eye position and
// the orbit target. The component runs an rAF loop calling tweenCameraStep
// each frame and feeds the result to the (instant) camera API, turning the
// snap into a ~0.6s dolly. All pure + DOM-free so the easing + lerp are
// unit-tested without a clock.

// Default tween duration (ms) for the fit pull-back — long enough to read
// as a deliberate move, short enough not to feel sluggish.
export const FIT_TWEEN_MS = 600

// Cubic ease-in-out on [0,1]: slow start, quick middle, slow stop — the
// natural feel for a camera move. Clamped so out-of-range t can't
// overshoot. Pure.
export function easeInOutCubic(t) {
  const x = Number(t)
  if (!Number.isFinite(x) || x <= 0) return 0
  if (x >= 1) return 1
  return x < 0.5
    ? 4 * x * x * x
    : 1 - Math.pow(-2 * x + 2, 3) / 2
}

// Linear progress (0..1) for an elapsed time within a duration. Pure;
// non-finite / non-positive duration → 1 (treat as instantly complete so
// a degenerate config can't trap the tween mid-flight). Clamped to [0,1].
export function tweenProgress(elapsedMs, durationMs = FIT_TWEEN_MS) {
  const e = Number(elapsedMs)
  const d = Number(durationMs)
  if (!Number.isFinite(d) || d <= 0) return 1
  if (!Number.isFinite(e) || e <= 0) return 0
  const p = e / d
  return p >= 1 ? 1 : p
}

// Interpolate a single camera state (pos + target) from `start` to `end`
// at eased progress `t` (0..1). Both states are { pos:[x,y,z],
// target:[x,y,z] }. Returns a fresh { pos, target }. The easing is applied
// here (t is the RAW 0..1 progress; we ease it internally) so the caller
// just threads linear progress. Defensive: a missing / malformed start or
// end coordinate falls back to the other end's value (so a half-built
// state can't inject NaN); at t>=1 the result is exactly `end`. Pure.
export function tweenCameraStep(start, end, t) {
  if (!end || !Array.isArray(end.pos) || !Array.isArray(end.target)) return null
  const e = easeInOutCubic(t)
  const sPos = (start && Array.isArray(start.pos)) ? start.pos : end.pos
  const sTgt = (start && Array.isArray(start.target)) ? start.target : end.target
  const lerp = (a, b) => {
    const av = Number(a), bv = Number(b)
    const aa = Number.isFinite(av) ? av : bv
    const bb = Number.isFinite(bv) ? bv : av
    if (!Number.isFinite(aa) && !Number.isFinite(bb)) return 0
    return aa + (bb - aa) * e
  }
  return {
    pos: [
      lerp(sPos[0], end.pos[0]),
      lerp(sPos[1], end.pos[1]),
      lerp(sPos[2], end.pos[2]),
    ],
    target: [
      lerp(sTgt[0], end.target[0]),
      lerp(sTgt[1], end.target[1]),
      lerp(sTgt[2], end.target[2]),
    ],
  }
}
