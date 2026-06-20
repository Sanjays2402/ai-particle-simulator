// minimap: scene-half picker, XZ projection, sample helper,
// look-direction vector, unproject for click-to-target, scale label.
import {
  DEFAULT_SCENE_HALF, MIN_SCENE_HALF, MAX_SCENE_HALF,
  pickSceneHalf, projectXZ, sampleScene, lookDirXZ, unprojectXZ, scaleLabelFor,
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

console.log(`PASS: minimap — pickSceneHalf, projectXZ (clamped), sampleScene, lookDirXZ, unprojectXZ (round-trip), scaleLabelFor`)
