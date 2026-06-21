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
