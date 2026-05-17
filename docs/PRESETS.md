# Authoring Presets

A preset is a tiny JavaScript snippet that runs **per particle, every
frame**. Keep it cheap.

## Anatomy

Each preset entry in `src/presets.js` looks like this:

```js
{
  id: 'spiral-galaxy',
  name: 'Spiral Galaxy',
  description: 'Stars orbiting a bright galactic core',
  emoji: '🌌',
  code: `... per-particle code ...`,
}
```

The `code` block is compiled once by `compileParticleFn()` and then
called for every particle on every frame.

## Variables in scope

Inside `code` you can use:

| Name | What |
|------|------|
| `i` | particle index (0..N-1) |
| `time` | seconds since scene loaded |
| `target` | `THREE.Vector3` — set this to the particle's new position |
| `color` | `THREE.Color` — set this to the particle's color |
| `THREE` | the whole `three` namespace |
| `controls.<id>` | live value of any control registered via `addControl(...)` |

You also have these helpers:

```js
addControl('id', 'Label', min, max, defaultValue)
setInfo('Title', 'Description shown on the HUD')
```

## Rules of the inner loop

This block runs **N times per frame** (N = particle count, up to
50 000). Allocations inside it are devastating to FPS.

**Do**
- Reuse the supplied `target` and `color` objects.
- Use `Math.sin(i * BIG_PRIME)` for stable per-particle randomness.
- Use layered sines for pseudo-noise — they're cheap and zero-alloc.

**Don't**
- Create new `THREE.Vector3` / `THREE.Color` / arrays inside the body.
- Call into `THREE.MathUtils.randFloatSpread` or any random functions
  that aren't deterministic in `i` (the result will flicker).
- Build strings or objects.

## Pattern: per-particle role

When you want each particle to do one of several things (jet vs disk,
sand grain vs glint, etc.), bake the role into a stable hash so it
doesn't flicker:

```js
const h1 = Math.sin(i * 127.1) * 0.5 + 0.5;
const isJet = h1 < 0.5;
```

## Pattern: looped life

For streams, rain, warp tunnels — wrap a phase modulated by `time`:

```js
const phase = (h1 + time * speed) % 1;
const x = phase * 16 - 8; // sweeps across, wraps
```

## Pattern: physics block

To enable built-in physics on top of the per-particle code, add a
`physics` field next to `code`:

```js
{
  id: 'rain',
  // ...
  physics: {
    gravity: true,
    gravityStrength: 1.4,
    collisions: false,
    forceField: 'attract', // or 'repel', 'vortex'
    forceFieldStrength: 0.6,
  },
}
```

## Tips

- Keep `controls` to three sliders or fewer; more clutters the HUD.
- Use `setInfo` to write a one-line description; it shows up in the
  right sidebar's "Now Playing" card.
- Test with the **Smash** button (Zap icon in the toolbar) — if your
  preset survives a random theme + style + camera, it'll survive
  whatever a user throws at it.
