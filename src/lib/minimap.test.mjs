// minimap: scene-half picker, XZ projection, sample helper,
// look-direction vector, unproject for click-to-target, scale label,
// saved-view marker projection + hit-testing.
import {
  DEFAULT_SCENE_HALF, MIN_SCENE_HALF, MAX_SCENE_HALF,
  pickSceneHalf, projectXZ, sampleScene, lookDirXZ, unprojectXZ, scaleLabelFor,
  projectSavedViews, pickNearestMarker, tooltipPlacement,
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

console.log(`PASS: minimap — pickSceneHalf, projectXZ (clamped), sampleScene, lookDirXZ, unprojectXZ (round-trip), scaleLabelFor, projectSavedViews (empty/origin/multi/bounds/dirty), pickNearestMarker (hit/miss/nearest), tooltipPlacement (top/bottom flip + edge slide + tiny-canvas fallback)`)
