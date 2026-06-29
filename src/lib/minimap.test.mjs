// minimap: scene-half picker, XZ projection, sample helper,
// look-direction vector, unproject for click-to-target, scale label,
// saved-view marker projection + hit-testing.
import {
  DEFAULT_SCENE_HALF, MIN_SCENE_HALF, MAX_SCENE_HALF,
  pickSceneHalf, projectXZ, sampleScene, lookDirXZ, unprojectXZ, scaleLabelFor,
  projectSavedViews, pickNearestMarker, tooltipPlacement,
  // R52.N — numbered saved-view badge label
  savedViewMarkerLabel,
  // R53.N — cross-highlight a marker badge from a list-row hover
  markerBadgeEmphasis, MARKER_BADGE_EMPHASIS_SCALE, MARKER_BADGE_NORMAL_ALPHA, MARKER_BADGE_EMPHASIS_ALPHA,
  // R42.N — frame all saved views
  framingForViews, fitCameraDistance, frameViewsCameraMove,
  FIT_MIN_DIST, FIT_MAX_DIST, FIT_DEFAULT_DIR,
  // R43.N — animated fit tween
  FIT_TWEEN_MS, easeInOutCubic, tweenProgress, tweenCameraStep,
  // R44.N — frame a selected subset
  framingForSelectedViews,
  // R46.N — dim non-selected markers while a selection is live
  markerSelectionState, markerSelectionAlpha, MARKER_DIM_ALPHA,
  // R47.N — dot-count glyph cluster for the Fit N button
  fitDotGlyphs, FIT_GLYPH_MAX_DOTS,
} from './minimap.js'

function fail(m) { console.error(`FAIL: ${m}`); process.exit(1) }
function eq(a, b, m) { if (a !== b) fail(`${m} — got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`) }
function near(a, b, m, tol = 1e-6) { if (Math.abs(a - b) > tol) fail(`${m} — got ${a} expected ~${b}`) }
function ok(c, m) { if (!c) fail(m) }

// --- pickSceneHalf ---
{
  // dist 18 → target 30 → clamps to 30 (DEFAULT-ish).
  near(pickSceneHalf(18), 30, 'dist 18 → ~30')
  eq(pickSceneHalf(0), DEFAULT_SCENE_HALF, 'zero dist → default')
  eq(pickSceneHalf(-5), DEFAULT_SCENE_HALF, 'neg dist → default')
  eq(pickSceneHalf(NaN), DEFAULT_SCENE_HALF, 'NaN dist → default')
  eq(pickSceneHalf(1), MIN_SCENE_HALF, 'tiny dist clamps to MIN')
  eq(pickSceneHalf(99999), MAX_SCENE_HALF, 'huge dist clamps to MAX')
  // Returned value is always within [MIN, MAX].
  for (const d of [0.1, 5, 50, 500]) {
    const v = pickSceneHalf(d)
    ok(v >= MIN_SCENE_HALF && v <= MAX_SCENE_HALF, `pickSceneHalf(${d}) in range — got ${v}`)
  }
}

// --- projectXZ ---
{
  // Origin → center of canvas.
  const [cx, cy] = projectXZ(0, 0, 30, 100)
  eq(cx, 50, 'origin x → center')
  eq(cy, 50, 'origin y → center')
  // (+sh, +sh) → (sz, sz)
  const [px, py] = projectXZ(30, 30, 30, 100)
  eq(px, 100, '+sh x → sz')
  eq(py, 100, '+sh z → sz')
  // (-sh, -sh) → (0, 0)
  const [qx, qy] = projectXZ(-30, -30, 30, 100)
  eq(qx, 0, '-sh x → 0')
  eq(qy, 0, '-sh z → 0')
  // Outside bounds → clamped.
  const [ox, oy] = projectXZ(999, 999, 30, 100)
  eq(ox, 100, 'over-bound x clamped')
  eq(oy, 100, 'over-bound y clamped')
  const [ux, uy] = projectXZ(-999, -999, 30, 100)
  eq(ux, 0, 'under-bound x clamped')
  eq(uy, 0, 'under-bound y clamped')
  // Bad size → falls back to 100.
  const [fx, fy] = projectXZ(0, 0, 30, 0)
  eq(fx, 50, 'bad size → 100 default, origin centered')
  eq(fy, 50, 'bad size → 100 default, origin centered')
}

// --- sampleScene ---
{
  // Missing API → null.
  eq(sampleScene(null), null, 'null api → null')
  eq(sampleScene({}), null, 'api without .get → null')
  // Valid mock.
  const api = { get: () => ({ pos: [3, 4, 0], target: [0, 0, 0] }) }
  const s = sampleScene(api)
  eq(s.camera[0], 3, 'camera x')
  eq(s.target[0], 0, 'target x')
  near(s.dist, 5, '3-4-0 triangle dist')
  ok(s.sceneHalf >= MIN_SCENE_HALF, 'sceneHalf within range')
  // Missing target falls back to origin.
  const api2 = { get: () => ({ pos: [0, 0, 10] }) }
  const s2 = sampleScene(api2)
  eq(s2.target[0], 0, 'missing target defaults to origin')
  near(s2.dist, 10, 'dist with default target')
  // Throwing api → null.
  const apiThrow = { get: () => { throw new Error('nope') } }
  eq(sampleScene(apiThrow), null, 'throwing api → null')
}

// --- lookDirXZ ---
{
  // Camera at +x, target at origin → look toward -x.
  const [dx, dz] = lookDirXZ([10, 0, 0], [0, 0, 0])
  near(dx, -1, 'look -x dx')
  near(dz, 0,  'look -x dz')
  // Camera at +z, target at origin → look toward -z.
  const [ex, ez] = lookDirXZ([0, 0, 10], [0, 0, 0])
  near(ex, 0, 'look -z dx')
  near(ez, -1, 'look -z dz')
  // Same point → zero vector.
  const [zx, zz] = lookDirXZ([1, 2, 3], [1, 99, 3])
  eq(zx, 0, 'same xz → 0 dx')
  eq(zz, 0, 'same xz → 0 dz')
  // Bad inputs.
  eq(lookDirXZ(null, [0, 0, 0])[0], 0, 'null camera → 0')
  eq(lookDirXZ([0, 0, 0], null)[0], 0, 'null target → 0')
}

// --- unprojectXZ ---
{
  // Center → origin.
  const [wx, wz] = unprojectXZ(50, 50, 30, 100)
  eq(wx, 0, 'center px → 0 worldX')
  eq(wz, 0, 'center py → 0 worldZ')
  // Top-left → (-sh, -sh).
  const [tx, tz] = unprojectXZ(0, 0, 30, 100)
  eq(tx, -30, 'top-left → -sh')
  eq(tz, -30, 'top-left → -sh')
  // Bottom-right → (+sh, +sh).
  const [bx, bz] = unprojectXZ(100, 100, 30, 100)
  eq(bx, 30, 'bottom-right → +sh')
  eq(bz, 30, 'bottom-right → +sh')
  // project ∘ unproject is an identity inside the bounds.
  const sh = 25
  for (const [wxIn, wzIn] of [[0,0], [10, -7], [-20, 24], [3, 11]]) {
    const [pxx, pyy] = projectXZ(wxIn, wzIn, sh, 200)
    const [wxOut, wzOut] = unprojectXZ(pxx, pyy, sh, 200)
    near(wxOut, wxIn, `project∘unproject preserves x (${wxIn},${wzIn})`, 1e-6)
    near(wzOut, wzIn, `project∘unproject preserves z (${wxIn},${wzIn})`, 1e-6)
  }
}

// --- scaleLabelFor ---
eq(scaleLabelFor(30), '30u', 'label 30')
eq(scaleLabelFor(120), '120u', 'label 120')
eq(scaleLabelFor(0), `${DEFAULT_SCENE_HALF}u`, 'zero → default')
eq(scaleLabelFor(NaN), `${DEFAULT_SCENE_HALF}u`, 'NaN → default')

// --- projectSavedViews ---
{
  // Empty / missing → empty.
  eq(projectSavedViews(null, 30, 100).length, 0, 'null views → []')
  eq(projectSavedViews([], 30, 100).length, 0, 'empty → []')
  eq(projectSavedViews(undefined, 30, 100).length, 0, 'undefined → []')

  // Single view at origin → centered marker.
  const v1 = { id: 1, name: 'Front', pos: [0, 0, 0], target: [0, 0, 0] }
  const out1 = projectSavedViews([v1], 30, 100)
  eq(out1.length, 1, 'one view → one marker')
  eq(out1[0].id, 1, 'id preserved')
  eq(out1[0].name, 'Front', 'name preserved')
  eq(out1[0].px, 50, 'origin → center px')
  eq(out1[0].py, 50, 'origin → center py')
  ok(out1[0].inBounds, 'origin within bounds')

  // Multiple views with different positions.
  const views = [
    { id: 1, name: 'Front', pos: [0, 0, 0], target: [0, 0, 0] },
    { id: 2, name: 'Right', pos: [15, 5, 0], target: [0, 0, 0] },
    { id: 3, name: 'Behind', pos: [0, 0, -15], target: [0, 0, 0] },
  ]
  const out = projectSavedViews(views, 30, 100)
  eq(out.length, 3, 'three markers')
  eq(out[1].px, 75, '(15,*,0) → px 75 with sh=30')
  eq(out[2].py, 25, '(0,*,-15) → py 25 with sh=30')

  // Out-of-bounds: clamps to canvas edge AND flags inBounds=false.
  const farView = { id: 'far', name: 'Far', pos: [999, 0, 999], target: [0, 0, 0] }
  const outFar = projectSavedViews([farView], 30, 100)
  eq(outFar[0].px, 100, 'far view px clamped to edge')
  eq(outFar[0].py, 100, 'far view py clamped to edge')
  ok(!outFar[0].inBounds, 'far view marked out-of-bounds')

  // Malformed pos arrays are skipped, not crashed on.
  const dirty = [
    { id: 1, pos: null, target: [0, 0, 0] },
    { id: 2, pos: [1, 2], target: [0, 0, 0] },   // short array
    { id: 3, name: 'Good', pos: [5, 0, -5], target: [0, 0, 0] },
    null,
  ]
  const outDirty = projectSavedViews(dirty, 30, 100)
  eq(outDirty.length, 1, 'only the valid view projects')
  eq(outDirty[0].id, 3, 'survivor is the valid entry')

  // Missing id falls back to a synthesized string id (not undefined).
  const noId = [{ pos: [1, 0, 2], target: [0, 0, 0] }]
  const outNoId = projectSavedViews(noId, 30, 100)
  ok(outNoId[0].id, 'fallback id is truthy when missing')
  eq(typeof outNoId[0].id, 'string', 'fallback id is a string')

  // R52.N — markers carry a 1-based `order` matching list position among
  // the VALID rows (skipped malformed rows don't consume a number).
  const ordered = [
    { id: 'a', pos: [0, 0, 0], target: [0, 0, 0] },
    { id: 'bad', pos: [1, 0] },                       // malformed → skipped
    { id: 'b', pos: [5, 0, 5], target: [0, 0, 0] },
    null,                                              // skipped
    { id: 'c', pos: [-5, 0, -5], target: [0, 0, 0] },
  ]
  const om = projectSavedViews(ordered, 30, 100)
  eq(om.length, 3, 'R52.N: only valid rows projected')
  eq(om[0].order, 1, 'R52.N: first valid → order 1')
  eq(om[1].order, 2, 'R52.N: second valid → order 2 (gap-free)')
  eq(om[2].order, 3, 'R52.N: third valid → order 3')
  eq(om[1].id, 'b', 'R52.N: order tracks the surviving rows in list order')
}

// --- R52.N savedViewMarkerLabel ---
{
  eq(savedViewMarkerLabel(1), '1', 'badge: 1 → "1"')
  eq(savedViewMarkerLabel(12), '12', 'badge: 12 → "12"')
  eq(savedViewMarkerLabel(99), '99', 'badge: 99 → "99" (at cap)')
  eq(savedViewMarkerLabel(100), '99+', 'badge: 100 → "99+" (over cap)')
  eq(savedViewMarkerLabel(5, 4), '4+', 'badge: custom cap honoured')
  eq(savedViewMarkerLabel(4, 4), '4', 'badge: exactly at custom cap')
  eq(savedViewMarkerLabel(0), '', 'badge: 0 → "" (omitted)')
  eq(savedViewMarkerLabel(-3), '', 'badge: negative → ""')
  eq(savedViewMarkerLabel(NaN), '', 'badge: NaN → ""')
  eq(savedViewMarkerLabel('7'), '7', 'badge: numeric string coerces')
  eq(savedViewMarkerLabel(3.9), '3', 'badge: floored')
  eq(savedViewMarkerLabel(150, NaN), '99+', 'badge: junk cap → default cap')
}

// --- R53.N markerBadgeEmphasis (cross-highlight) ---
{
  // direct dot-hover lights the marker regardless of crossHighlightId
  const h = markerBadgeEmphasis('a', null, true)
  ok(h.emphatic === true, 'emphasis: dot-hover → emphatic')
  eq(h.scale, MARKER_BADGE_EMPHASIS_SCALE, 'emphasis: hover scale bumped')
  eq(h.alpha, MARKER_BADGE_EMPHASIS_ALPHA, 'emphasis: hover alpha full')
  // list-row cross-hover lights the MATCHING marker
  const cm = markerBadgeEmphasis('b', 'b', false)
  ok(cm.emphatic === true, 'emphasis: matching cross-id → emphatic')
  eq(cm.scale, MARKER_BADGE_EMPHASIS_SCALE, 'emphasis: cross-match scale bumped')
  // a non-matching marker draws normal
  const nm = markerBadgeEmphasis('c', 'b', false)
  ok(nm.emphatic === false, 'emphasis: non-matching → normal')
  eq(nm.scale, 1, 'emphasis: normal scale 1')
  eq(nm.alpha, MARKER_BADGE_NORMAL_ALPHA, 'emphasis: normal alpha')
  // no cross-highlight + no hover → normal
  const off = markerBadgeEmphasis('a', null, false)
  ok(off.emphatic === false, 'emphasis: no focus → normal')
  // undefined cross id is treated as "no focus" (never matches)
  ok(markerBadgeEmphasis('a', undefined, false).emphatic === false, 'emphasis: undefined cross-id → normal')
  // hover wins even when a DIFFERENT id is cross-highlighted
  ok(markerBadgeEmphasis('a', 'b', true).emphatic === true, 'emphasis: hover overrides mismatched cross-id')
  // emphasis scale reads larger than normal (sanity on the constants)
  ok(MARKER_BADGE_EMPHASIS_SCALE > 1, 'emphasis: scale const > 1')
  ok(MARKER_BADGE_EMPHASIS_ALPHA >= MARKER_BADGE_NORMAL_ALPHA, 'emphasis: emphatic alpha ≥ normal')
  // numeric ids cross-match too (RightSidebar uses string ids, but the
  // helper is id-type-agnostic — strict === so 1 and '1' don't collide)
  ok(markerBadgeEmphasis(1, 1, false).emphatic === true, 'emphasis: numeric id matches itself')
  ok(markerBadgeEmphasis(1, '1', false).emphatic === false, 'emphasis: strict === (no 1=="1" coercion)')
}

// --- pickNearestMarker ---
{
  const markers = [
    { id: 1, px: 10, py: 10, inBounds: true },
    { id: 2, px: 50, py: 50, inBounds: true },
    { id: 3, px: 90, py: 90, inBounds: true },
  ]
  // Exact hit.
  eq(pickNearestMarker(markers, 50, 50, 8), 2, 'exact hit on marker 2')
  // Within radius — marker 1's neighborhood.
  eq(pickNearestMarker(markers, 13, 13, 8), 1, 'within 8px → marker 1')
  // Outside radius → null.
  eq(pickNearestMarker(markers, 50, 70, 8), null, '20px away → no hit')
  // Picks the NEAREST when multiple are in range.
  const tight = [
    { id: 'a', px: 50, py: 50, inBounds: true },
    { id: 'b', px: 55, py: 50, inBounds: true },
  ]
  eq(pickNearestMarker(tight, 51, 50, 8), 'a', 'picks nearest within radius')
  eq(pickNearestMarker(tight, 54, 50, 8), 'b', 'picks nearest within radius (other side)')
  // Bad inputs.
  eq(pickNearestMarker(null, 0, 0, 8), null, 'null markers → null')
  eq(pickNearestMarker([], 0, 0, 8), null, 'empty → null')
}

// --- tooltipPlacement (R11.13) ---
{
  // Marker mid-canvas: default placement is ABOVE, horizontally centred.
  const mid = { px: 60, py: 60 }
  const pMid = tooltipPlacement(mid, 132, 90, 22)
  eq(pMid.side, 'top', 'mid marker: side above')
  eq(pMid.left, 15, 'mid marker: horizontally centered (60 - 45)')
  eq(pMid.top, 32,  'mid marker: above with 6px gap (60 - 22 - 6)')

  // Marker near the top: should FLIP below.
  const top = { px: 60, py: 5 }
  const pTop = tooltipPlacement(top, 132, 90, 22)
  eq(pTop.side, 'bottom', 'top marker: flips below')
  eq(pTop.top, 11, 'top marker: below with 6px gap (5 + 6)')

  // Marker near the LEFT edge: tooltip slides RIGHT into bounds.
  const left = { px: 4, py: 60 }
  const pLeft = tooltipPlacement(left, 132, 90, 22)
  eq(pLeft.left, 4, 'left marker: tooltip pinned to left margin')

  // Marker near the RIGHT edge: tooltip slides LEFT into bounds.
  const right = { px: 128, py: 60 }
  const pRight = tooltipPlacement(right, 132, 90, 22)
  eq(pRight.left, 132 - 4 - 90, 'right marker: tooltip pinned to right margin')

  // Marker in a tiny canvas with no vertical room above OR below
  // → places to the right of the marker.
  const tiny = { px: 20, py: 30 }
  const pTiny = tooltipPlacement(tiny, 50, 90, 22)
  // Default would be top: 30-22-6=2 (< margin 4) → flip to bottom: 30+6=36;
  // 36 + 22 = 58 > 50 - 4 = 46 → fallback path. tooltipW 90 + 6 = 96 >
  // 50 - 4 = 46, so right doesn't fit either; left also doesn't fit.
  // Acceptable: placement still returns a valid object with a placement
  // side. We just verify it doesn't crash and produces finite numbers.
  ok(Number.isFinite(pTiny.left), 'tiny canvas: left is finite')
  ok(Number.isFinite(pTiny.top),  'tiny canvas: top is finite')

  // Tooltip can fit on the RIGHT of a tightly-packed marker.
  const tightMarker = { px: 30, py: 60 }
  const pTight = tooltipPlacement(tightMarker, 132, 50, 22)
  ok(['top', 'bottom', 'left', 'right'].includes(pTight.side), 'placement returns a known side')

  // Null marker → null.
  eq(tooltipPlacement(null, 132), null, 'null marker → null')
}

// --- R42.N: frame all saved views ---
{
  // framingForViews — centroid + XZ radius.
  {
    const views = [
      { id: 1, pos: [10, 0, 0], target: [0, 0, 0] },
      { id: 2, pos: [-10, 0, 0], target: [0, 0, 0] },
      { id: 3, pos: [0, 6, 10], target: [0, 0, 0] },
      { id: 4, pos: [0, 0, -10], target: [0, 0, 0] },
    ]
    const f = framingForViews(views)
    eq(f.count, 4, 'framing counts all 4 views')
    near(f.center[0], 0, 'centroid x ~ 0')
    near(f.center[1], 1.5, 'centroid y = mean of ys (6/4)')
    near(f.center[2], 0, 'centroid z ~ 0')
    // radius is the max XZ distance from centroid (10 from the x/z extremes).
    near(f.radius, 10, 'radius = max XZ spread')
  }
  // single view → radius 0, centroid IS the view pos.
  {
    const f = framingForViews([{ id: 1, pos: [5, 5, 5] }])
    eq(f.count, 1, 'single view count 1')
    near(f.radius, 0, 'single view radius 0')
    eq(JSON.stringify(f.center), JSON.stringify([5, 5, 5]), 'single view centroid = pos')
  }
  // defensive: empty / non-array / all-corrupt → null.
  eq(framingForViews([]), null, 'empty → null')
  eq(framingForViews(null), null, 'non-array → null')
  eq(framingForViews([{ id: 1 }, { id: 2, pos: [1, 2] }]), null, 'no usable pos → null')
  // corrupt rows skipped, valid ones still framed.
  {
    const f = framingForViews([
      null,
      { id: 1, pos: [4, 0, 0] },
      { id: 2, pos: [NaN, 0, 0] },
      { id: 3, pos: [-4, 0, 0] },
    ])
    eq(f.count, 2, 'corrupt rows skipped — 2 valid')
    near(f.center[0], 0, 'centroid of the 2 valid views')
    near(f.radius, 4, 'radius from the 2 valid views')
  }

  // fitCameraDistance — physically grounded + clamped.
  {
    // larger radius → larger distance (monotone).
    ok(fitCameraDistance(20) > fitCameraDistance(10), 'distance grows with radius')
    // radius 0 → the minimum pull-back (a single view still frames sanely).
    eq(fitCameraDistance(0), FIT_MIN_DIST, 'radius 0 → FIT_MIN_DIST')
    // huge radius clamps to MAX.
    eq(fitCameraDistance(100000), FIT_MAX_DIST, 'huge radius clamps to MAX')
    // defensive: non-finite / negative → MIN.
    eq(fitCameraDistance(NaN), FIT_MIN_DIST, 'NaN radius → MIN')
    eq(fitCameraDistance(-5), FIT_MIN_DIST, 'negative radius → MIN')
    // always within band.
    for (const r of [0, 1, 8, 50, 999]) {
      const d = fitCameraDistance(r)
      ok(d >= FIT_MIN_DIST && d <= FIT_MAX_DIST, `fit dist for radius ${r} in band — got ${d}`)
    }
    // a custom opts band is honoured.
    eq(fitCameraDistance(0, { minDist: 12 }), 12, 'custom minDist honoured')
  }

  // frameViewsCameraMove — full camera move.
  {
    const framing = { center: [0, 0, 0], radius: 10, count: 3 }
    // current camera looking down +Z from (0,0,40), target origin.
    const move = frameViewsCameraMove(framing, [0, 0, 40], [0, 0, 0])
    ok(move != null, 'move computed')
    // target lands on the centroid.
    eq(JSON.stringify(move.target), JSON.stringify([0, 0, 0]), 'target = centroid')
    // camera keeps its +Z direction (dolly, not teleport): pos is on +Z axis.
    near(move.pos[0], 0, 'kept direction: pos x ~ 0')
    near(move.pos[1], 0, 'kept direction: pos y ~ 0')
    ok(move.pos[2] > 0, 'kept direction: pos still on +Z side')
    near(move.pos[2], move.dist, 'pos z == fit distance along +Z')
    // the eye sits exactly `dist` from the target.
    {
      const dx = move.pos[0] - move.target[0]
      const dy = move.pos[1] - move.target[1]
      const dz = move.pos[2] - move.target[2]
      near(Math.sqrt(dx * dx + dy * dy + dz * dz), move.dist, 'eye is dist from target')
    }
  }
  // offset centroid: target follows the cluster, not the origin.
  {
    const framing = { center: [100, 5, -20], radius: 4, count: 2 }
    const move = frameViewsCameraMove(framing, [100, 5, 0], [100, 5, -20])
    eq(JSON.stringify(move.target), JSON.stringify([100, 5, -20]), 'target follows offset centroid')
  }
  // degenerate current direction (camera on its own target) → default dir.
  {
    const framing = { center: [0, 0, 0], radius: 8, count: 2 }
    const move = frameViewsCameraMove(framing, [3, 3, 3], [3, 3, 3])
    ok(move != null, 'degenerate dir still yields a move')
    // pos = center + FIT_DEFAULT_DIR * dist (direction came from the fallback).
    near(move.pos[0], FIT_DEFAULT_DIR[0] * move.dist, 'fallback dir x')
    near(move.pos[1], FIT_DEFAULT_DIR[1] * move.dist, 'fallback dir y')
    near(move.pos[2], FIT_DEFAULT_DIR[2] * move.dist, 'fallback dir z')
  }
  // defensive: null framing / bad center → null.
  eq(frameViewsCameraMove(null, [0, 0, 0], [0, 0, 0]), null, 'null framing → null')
  eq(frameViewsCameraMove({ center: [0, 0] }, [0, 0, 0], [0, 0, 0]), null, 'short center → null')
  eq(frameViewsCameraMove({ center: [0, NaN, 0] }, [0, 0, 0], [0, 0, 0]), null, 'non-finite center → null')
}

console.log(`PASS: minimap — pickSceneHalf, projectXZ (clamped), sampleScene, lookDirXZ, unprojectXZ (round-trip), scaleLabelFor, projectSavedViews (empty/origin/multi/bounds/dirty), pickNearestMarker (hit/miss/nearest), tooltipPlacement (top/bottom flip + edge slide + tiny-canvas fallback), framingForViews + fitCameraDistance + frameViewsCameraMove (R42.N frame-all)`)

// --- R43.N: animated fit tween ---------------------------------------
{
  // easeInOutCubic — clamped 0..1, symmetric, monotone.
  near(easeInOutCubic(0), 0, 'ease(0) = 0')
  near(easeInOutCubic(1), 1, 'ease(1) = 1')
  near(easeInOutCubic(0.5), 0.5, 'ease(0.5) = 0.5 (symmetric midpoint)')
  eq(easeInOutCubic(-1), 0, 'ease clamps below 0')
  eq(easeInOutCubic(2), 1, 'ease clamps above 1')
  eq(easeInOutCubic(NaN), 0, 'ease NaN → 0')
  // slow start: ease(0.25) < 0.25 (eased-in below linear in first half).
  ok(easeInOutCubic(0.25) < 0.25, 'ease slow start (below linear)')
  ok(easeInOutCubic(0.75) > 0.75, 'ease slow stop (above linear)')
  // monotone increasing across the range.
  {
    let prev = -1
    for (let i = 0; i <= 10; i++) {
      const v = easeInOutCubic(i / 10)
      ok(v >= prev, `ease monotone non-decreasing at ${i / 10}`)
      prev = v
    }
  }

  // tweenProgress — linear 0..1 with clamps.
  near(tweenProgress(0, 600), 0, 'progress 0 at t=0')
  near(tweenProgress(300, 600), 0.5, 'progress 0.5 at half')
  near(tweenProgress(600, 600), 1, 'progress 1 at end')
  eq(tweenProgress(900, 600), 1, 'progress clamps past end')
  eq(tweenProgress(-5, 600), 0, 'progress clamps below 0')
  eq(tweenProgress(100, 0), 1, 'zero duration → instantly complete')
  eq(tweenProgress(100, NaN), 1, 'non-finite duration → complete')
  ok(Number.isFinite(FIT_TWEEN_MS) && FIT_TWEEN_MS > 0, 'FIT_TWEEN_MS is a positive duration')

  // tweenCameraStep — interpolates pos + target.
  {
    const start = { pos: [0, 0, 0], target: [0, 0, 0] }
    const end = { pos: [10, 20, 30], target: [1, 2, 3] }
    // t=0 → exactly start.
    {
      const s = tweenCameraStep(start, end, 0)
      near(s.pos[0], 0, 'tween t=0 pos.x = start')
      near(s.pos[1], 0, 'tween t=0 pos.y = start')
      near(s.pos[2], 0, 'tween t=0 pos.z = start')
      near(s.target[0], 0, 'tween t=0 target = start')
    }
    // t=1 → exactly end.
    {
      const s = tweenCameraStep(start, end, 1)
      near(s.pos[0], 10, 'tween t=1 pos.x = end')
      near(s.pos[2], 30, 'tween t=1 pos.z = end')
      near(s.target[2], 3, 'tween t=1 target.z = end')
    }
    // t=0.5 → eased midpoint = exactly halfway (ease(0.5)=0.5).
    {
      const s = tweenCameraStep(start, end, 0.5)
      near(s.pos[0], 5, 'tween t=0.5 pos.x = midpoint')
      near(s.pos[1], 10, 'tween t=0.5 pos.y = midpoint')
      near(s.target[0], 0.5, 'tween t=0.5 target.x = midpoint')
    }
    // early t stays close to start (slow-start easing).
    {
      const s = tweenCameraStep(start, end, 0.2)
      ok(s.pos[0] < 2, 'tween early progress near start (eased)')
    }
    // returns a FRESH object (not start/end).
    {
      const s = tweenCameraStep(start, end, 0.5)
      ok(s !== start && s !== end && s.pos !== end.pos, 'tween returns fresh state')
    }
  }
  // malformed end → null (component skips the tween, would snap).
  eq(tweenCameraStep({ pos: [0, 0, 0], target: [0, 0, 0] }, null, 0.5), null, 'null end → null')
  eq(tweenCameraStep(null, { pos: [1, 2, 3] }, 0.5), null, 'end missing target → null')
  // missing start falls back to end (so t<1 still yields end-ish, no NaN).
  {
    const end = { pos: [4, 5, 6], target: [0, 0, 0] }
    const s = tweenCameraStep(null, end, 0.5)
    ok(s && Number.isFinite(s.pos[0]), 'missing start → finite (falls back to end)')
    near(s.pos[0], 4, 'missing start → pos tracks end')
  }
  // a non-finite coord in start falls back to the end value (no NaN leak).
  {
    const start = { pos: [NaN, 0, 0], target: [0, 0, 0] }
    const end = { pos: [10, 10, 10], target: [0, 0, 0] }
    const s = tweenCameraStep(start, end, 0.5)
    ok(Number.isFinite(s.pos[0]), 'NaN start coord → finite result')
  }
}

console.log('PASS: minimap R43.N — easeInOutCubic + tweenProgress + tweenCameraStep (animated fit-all tween)')

// --- R44.N: framingForSelectedViews (frame a chosen subset) ---
{
  const views = [
    { id: 1, pos: [10, 0, 0] },
    { id: 2, pos: [-10, 0, 0] },
    { id: 3, pos: [0, 0, 10] },
    { id: 4, pos: [100, 0, 100] }, // far outlier
  ]
  // selecting the symmetric trio centres near origin.
  {
    const f = framingForSelectedViews(views, new Set([1, 2, 3]))
    ok(f !== null, 'selected: trio framed')
    eq(f.count, 3, 'selected: counts only the chosen')
    near(f.center[0], 0, 'selected: centroid x ~0')
    near(f.center[2], 10 / 3, 'selected: centroid z = mean of selected')
  }
  // selecting just the outlier frames it alone (radius 0, count 1).
  {
    const f = framingForSelectedViews(views, new Set([4]))
    eq(f.count, 1, 'selected: single view → count 1')
    near(f.radius, 0, 'selected: single view → radius 0')
    near(f.center[0], 100, 'selected: single centroid is the view itself')
  }
  // the subset framing differs from the all-views framing (proves it's
  // really scoping, not just deferring to framingForViews on everything).
  {
    const all = framingForViews(views)
    const sub = framingForSelectedViews(views, new Set([1, 2, 3]))
    ok(all.count === 4 && sub.count === 3, 'selected: subset count < all count')
    ok(Math.abs(all.center[0] - sub.center[0]) > 1, 'selected: subset centroid differs from all')
  }
  // accepts an Array selection (not just a Set).
  {
    const f = framingForSelectedViews(views, [1, 2])
    eq(f.count, 2, 'selected: array idSet accepted')
    near(f.center[0], 0, 'selected: array idSet centroid correct')
  }
  // empty selection → null.
  eq(framingForSelectedViews(views, new Set()), null, 'selected: empty set → null')
  eq(framingForSelectedViews(views, []), null, 'selected: empty array → null')
  // all-stale ids (none match) → null.
  eq(framingForSelectedViews(views, new Set([99, 98])), null, 'selected: all-stale ids → null')
  // non-iterable / missing idSet → null.
  eq(framingForSelectedViews(views, null), null, 'selected: null idSet → null')
  eq(framingForSelectedViews(views, 5), null, 'selected: non-iterable idSet → null')
  // non-array / empty views → null.
  eq(framingForSelectedViews(null, new Set([1])), null, 'selected: non-array views → null')
  eq(framingForSelectedViews([], new Set([1])), null, 'selected: empty views → null')
  // a selected-but-malformed row (no usable pos) is skipped → null when
  // it's the only selection.
  {
    const bad = [{ id: 1, pos: [NaN, 0, 0] }, { id: 2, pos: [5, 0, 5] }]
    const f = framingForSelectedViews(bad, new Set([1]))
    eq(f, null, 'selected: only-malformed selection → null')
    const f2 = framingForSelectedViews(bad, new Set([1, 2]))
    eq(f2.count, 1, 'selected: malformed row skipped, valid one framed')
  }
  // the framing feeds frameViewsCameraMove to produce a finite move.
  {
    const f = framingForSelectedViews(views, new Set([1, 2, 3]))
    const move = frameViewsCameraMove(f, [0, 0, 50], [0, 0, 0])
    ok(move && move.pos.every(Number.isFinite) && move.target.every(Number.isFinite),
      'selected: framing drives a finite camera move')
  }
}

console.log('PASS: minimap R44.N — framingForSelectedViews (frame a chosen subset of saved views)')

// --- R46.N: markerSelectionState + alpha — dim non-selected dots ---
{
  // no live selection (empty / non-iterable) → 'none' for any marker.
  eq(markerSelectionState(1, new Set()), 'none', 'sel: empty set → none')
  eq(markerSelectionState(1, null), 'none', 'sel: null idSet → none')
  eq(markerSelectionState(1, undefined), 'none', 'sel: undefined idSet → none')
  eq(markerSelectionState(1, 42), 'none', 'sel: non-iterable → none')
  // a live selection classifies in vs out.
  eq(markerSelectionState(2, new Set([2, 3])), 'selected', 'sel: id in set → selected')
  eq(markerSelectionState(9, new Set([2, 3])), 'unselected', 'sel: id not in set → unselected')
  // accepts an Array | iterable too (mirrors framingForSelectedViews).
  eq(markerSelectionState(3, [2, 3]), 'selected', 'sel: array idSet → selected')
  eq(markerSelectionState(5, [2, 3]), 'unselected', 'sel: array idSet → unselected')
  {
    function* gen() { yield 7; yield 8 }
    eq(markerSelectionState(7, gen()), 'selected', 'sel: generator idSet → selected')
  }
  // string ids work (id type-agnostic).
  eq(markerSelectionState('a', new Set(['a', 'b'])), 'selected', 'sel: string id in set → selected')
  eq(markerSelectionState('z', new Set(['a', 'b'])), 'unselected', 'sel: string id not in set → unselected')
  // alpha mapping: only 'unselected' dims; selected/none full strength.
  eq(markerSelectionAlpha('unselected'), MARKER_DIM_ALPHA, 'alpha: unselected → dim')
  eq(markerSelectionAlpha('selected'), 1, 'alpha: selected → full')
  eq(markerSelectionAlpha('none'), 1, 'alpha: none → full')
  eq(markerSelectionAlpha('junk'), 1, 'alpha: unknown state → full (safe)')
  ok(MARKER_DIM_ALPHA > 0 && MARKER_DIM_ALPHA < 1, 'alpha: dim is a partial fade (0,1)')
}

console.log('PASS: minimap R46.N — markerSelectionState + alpha (dim non-selected dots while a selection is live)')

// --- R47.N: fitDotGlyphs — dot-count cluster for the Fit N button ---
{
  // 3 of 5 selected → 3 lit, 2 dim, no overflow.
  let g = fitDotGlyphs(5, 3)
  eq(g.lit, 3, 'glyphs: 3 selected → 3 lit'); eq(g.dim, 2, 'glyphs: 2 unselected → 2 dim')
  eq(g.total, 5, 'glyphs: total preserved'); ok(!g.overflow, 'glyphs: 5 ≤ cap → no overflow')
  // All selected.
  g = fitDotGlyphs(4, 4); eq(g.lit, 4, 'glyphs: all selected lit'); eq(g.dim, 0, 'glyphs: none dim')
  // None selected (degenerate but bounded).
  g = fitDotGlyphs(3, 0); eq(g.lit, 0, 'glyphs: none lit'); eq(g.dim, 3, 'glyphs: all dim')
  // Overflow past the cap: lit+dim never exceeds cap, overflow flagged.
  g = fitDotGlyphs(20, 12); ok(g.lit + g.dim <= FIT_GLYPH_MAX_DOTS, 'glyphs: capped to max dots'); ok(g.overflow, 'glyphs: overflow flagged'); eq(g.total, 20, 'glyphs: real total kept')
  // selected > total clamps; negatives/junk clamp to 0.
  g = fitDotGlyphs(3, 9); eq(g.lit, 3, 'glyphs: sel>total clamps to total'); eq(g.dim, 0, 'glyphs: no dim left')
  g = fitDotGlyphs(-2, -1); eq(g.lit, 0, 'glyphs: negative → 0'); eq(g.dim, 0, 'glyphs: negative → 0')
  g = fitDotGlyphs(NaN, NaN); eq(g.lit, 0, 'glyphs: NaN → 0'); eq(g.total, 0, 'glyphs: NaN total → 0')
  // custom maxDots respected.
  g = fitDotGlyphs(10, 4, 4); ok(g.lit + g.dim <= 4, 'glyphs: custom cap honoured')
}
console.log('PASS: minimap R47.N — fitDotGlyphs (dot-count cluster matches lit/dim dots)')
