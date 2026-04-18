export const presets = [
  {
    id: 'spiral-galaxy',
    name: 'Spiral Galaxy',
    description: 'A rotating spiral galaxy with colorful arms',
    emoji: '🌌',
    code: `addControl('arms', 'Spiral Arms', 2, 8, 4);
addControl('spread', 'Spread', 0.1, 3, 1);
setInfo('Spiral Galaxy', 'A rotating spiral galaxy with colorful arms');

const t = i / count;
const arm = i % Math.floor(controls.arms);
const armAngle = (arm / controls.arms) * Math.PI * 2;
const dist = t * 8;
const angle = armAngle + dist * 0.5 + time * 0.3;
const sp = (Math.sin(i * 127.1) * 0.5) * controls.spread * t;
const sp2 = (Math.cos(i * 311.7) * 0.5) * controls.spread * t;
target.set(
  Math.cos(angle) * dist + sp,
  (Math.sin(i * 43.7) * 0.5) * 0.3 * t,
  Math.sin(angle) * dist + sp2
);
color.setHSL(0.55 + t * 0.2, 0.85, 0.35 + t * 0.45);`,
  },
  {
    id: 'dna-helix',
    name: 'DNA Helix',
    description: 'Double helix structure rotating in space',
    emoji: '🧬',
    code: `addControl('twist', 'Twist Rate', 1, 8, 3);
addControl('radius', 'Radius', 0.5, 4, 1.5);
setInfo('DNA Helix', 'Double helix structure rotating in space');

const t = i / count;
const strand = i % 2;
const y = (t - 0.5) * 16;
const angle = t * Math.PI * 2 * controls.twist + time * 0.5 + strand * Math.PI;
const r = controls.radius;
target.set(Math.cos(angle) * r, y, Math.sin(angle) * r);
color.setHSL(strand * 0.55 + 0.0, 0.9, 0.5 + Math.sin(t * 20) * 0.15);`,
  },
  {
    id: 'fireworks',
    name: 'Fireworks',
    description: 'Exploding firework bursts in the sky',
    emoji: '🎆',
    code: `addControl('bursts', 'Burst Count', 2, 12, 6);
addControl('size', 'Burst Size', 1, 6, 3);
setInfo('Fireworks', 'Exploding firework bursts');

const burstCount = Math.floor(controls.bursts);
const burst = i % burstCount;
const bx = Math.sin(burst * 2.4) * 4;
const by = Math.cos(burst * 1.7) * 2 + 2;
const bz = Math.sin(burst * 3.1) * 4;
const t = i / count;
const phase = (time * 0.7 + burst * 0.8) % 3.0;
const expand = Math.sin(phase * Math.PI / 3.0) * controls.size;
const theta = Math.sin(i * 127.1 + burst) * Math.PI;
const phi = Math.cos(i * 311.7 + burst) * Math.PI * 2;
target.set(
  bx + Math.sin(theta) * Math.cos(phi) * expand,
  by + Math.cos(theta) * expand - phase * 0.5,
  bz + Math.sin(theta) * Math.sin(phi) * expand
);
const hue = (burst / burstCount + time * 0.1) % 1.0;
color.setHSL(hue, 1.0, 0.4 + (1.0 - phase / 3.0) * 0.5);`,
  },
  {
    id: 'heartbeat',
    name: 'Heartbeat',
    description: 'A pulsing heart shape',
    emoji: '❤️',
    code: `addControl('pulse', 'Pulse Rate', 0.5, 4, 2);
addControl('scale', 'Scale', 1, 5, 2.5);
setInfo('Heartbeat', 'A pulsing heart shape');

const t = i / count;
const a = t * Math.PI * 2;
const r = Math.sin(a) * Math.sqrt(Math.abs(Math.cos(a)));
const heartX = r * Math.cos(a);
const heartY = r * Math.sin(a) + Math.abs(r) * 0.5;
const z = (Math.sin(i * 73.1) * 0.5) * 0.3;
const pulse = 1.0 + Math.sin(time * controls.pulse * Math.PI) * 0.15;
const s = controls.scale * pulse;
target.set(heartX * s, heartY * s, z * s);
const glow = 0.5 + Math.sin(time * controls.pulse * Math.PI) * 0.3;
color.setHSL(0.0, 0.9, 0.3 + glow * 0.4);`,
  },
  {
    id: 'torus-knot',
    name: 'Torus Knot',
    description: 'A trefoil knot wrapped around a torus',
    emoji: '🔗',
    code: `addControl('p', 'P', 1, 7, 2);
addControl('q', 'Q', 1, 7, 3);
addControl('tubeR', 'Tube Radius', 0.1, 1.5, 0.4);
setInfo('Torus Knot', 'A beautiful mathematical knot');

const t = (i / count) * Math.PI * 2;
const p = Math.floor(controls.p);
const q = Math.floor(controls.q);
const r = 3;
const angle = t + time * 0.3;
const cx = (r + Math.cos(q * angle)) * Math.cos(p * angle);
const cy = (r + Math.cos(q * angle)) * Math.sin(p * angle);
const cz = Math.sin(q * angle) * 2;
const spread = Math.sin(i * 127.1) * controls.tubeR;
const spread2 = Math.cos(i * 311.7) * controls.tubeR;
target.set(cx + spread, cz + spread2, cy + spread);
color.setHSL((t / (Math.PI * 2) + time * 0.05) % 1.0, 0.8, 0.5);`,
  },
  {
    id: 'butterfly',
    name: 'Butterfly',
    description: 'A butterfly curve with flapping motion',
    emoji: '🦋',
    code: `addControl('flap', 'Flap Speed', 0.5, 4, 1.5);
addControl('detail', 'Detail', 2, 12, 6);
setInfo('Butterfly', 'A butterfly curve with flapping wings');

const t = (i / count) * Math.PI * 12;
const exp_t = Math.exp(Math.cos(t));
const cos2t = Math.cos(2 * t);
const sin5 = Math.pow(Math.sin(t / 12), 5);
const r = (exp_t - 2 * cos2t - sin5) * 1.2;
const flap = Math.sin(time * controls.flap) * 0.3;
const x = Math.sin(t) * r;
const y = Math.cos(t) * r + flap * Math.abs(Math.sin(t));
const z = (Math.sin(i * 73.1) * 0.5) * 0.4;
target.set(x, y, z);
const hue = (t / (Math.PI * 12) + 0.8) % 1.0;
color.setHSL(hue, 0.9, 0.45 + Math.sin(time + t) * 0.15);`,
  },
  {
    id: 'vortex',
    name: 'Vortex',
    description: 'A swirling vortex pulling particles inward',
    emoji: '🌀',
    code: `addControl('spin', 'Spin Speed', 0.5, 5, 2);
addControl('height', 'Height', 2, 12, 6);
setInfo('Vortex', 'A swirling tornado vortex');

const t = i / count;
const y = (t - 0.5) * controls.height;
const radius = (1.0 - Math.abs(t - 0.5) * 2) * 3 + 0.2;
const angle = t * 20 + time * controls.spin + Math.sin(i * 127.1) * 0.5;
const spread = Math.sin(i * 311.7) * 0.3 * radius;
target.set(
  Math.cos(angle) * radius + spread,
  y,
  Math.sin(angle) * radius + Math.cos(i * 73.1) * 0.3 * radius
);
color.setHSL(0.55 + t * 0.1, 0.7 + t * 0.3, 0.3 + (1.0 - t) * 0.5);`,
  },
  {
    id: 'cube-wave',
    name: 'Cube Wave',
    description: 'A grid of particles forming waves',
    emoji: '🌊',
    code: `addControl('amplitude', 'Amplitude', 0.5, 4, 1.5);
addControl('frequency', 'Frequency', 1, 8, 3);
setInfo('Cube Wave', 'A grid of particles forming waves');

const gridSize = Math.ceil(Math.sqrt(count));
const gx = (i % gridSize) / gridSize - 0.5;
const gz = Math.floor(i / gridSize) / gridSize - 0.5;
const dist = Math.sqrt(gx * gx + gz * gz);
const y = Math.sin(dist * controls.frequency * 10 - time * 2) * controls.amplitude * 0.5;
target.set(gx * 12, y, gz * 12);
const h = 0.35 + (y / controls.amplitude) * 0.15;
color.setHSL(h, 0.8, 0.4 + y * 0.2);`,
  },
  {
    id: 'aurora',
    name: 'Aurora',
    description: 'Northern lights rippling across the sky',
    emoji: '🌈',
    code: `addControl('waves', 'Waves', 1, 6, 3);
addControl('height', 'Height', 1, 6, 2);
setInfo('Aurora', 'Northern lights rippling across the sky');

const t = i / count;
const x = (t - 0.5) * 16;
const waveY = Math.sin(x * 0.5 + time) * controls.height
  + Math.sin(x * 0.3 + time * 0.7) * controls.height * 0.5;
const z = Math.sin(i * 127.1) * 2;
const yOff = Math.cos(i * 311.7) * 0.5;
target.set(x, waveY + yOff + 2, z);
const hue = 0.3 + Math.sin(x * 0.1 + time * 0.2) * 0.15;
color.setHSL(hue, 0.8, 0.35 + Math.sin(t * 50 + time) * 0.15);`,
  },
  {
    id: 'sphere-pulse',
    name: 'Sphere Pulse',
    description: 'A sphere that breathes and pulses',
    emoji: '🔮',
    code: `addControl('pulseRate', 'Pulse Rate', 0.5, 4, 1.5);
addControl('radius', 'Radius', 1, 6, 3);
setInfo('Sphere Pulse', 'A breathing, pulsing sphere');

const t = i / count;
const phi = Math.acos(1 - 2 * t);
const theta = Math.PI * (1 + Math.sqrt(5)) * i;
const pulse = 1.0 + Math.sin(time * controls.pulseRate + phi * 2) * 0.2;
const r = controls.radius * pulse;
target.set(
  Math.sin(phi) * Math.cos(theta) * r,
  Math.sin(phi) * Math.sin(theta) * r,
  Math.cos(phi) * r
);
const lum = 0.35 + Math.sin(time * controls.pulseRate + t * 10) * 0.2;
color.setHSL(0.45 + t * 0.2, 0.9, lum);`,
  },
  // === NEW PRESETS ===
  {
    id: 'tornado',
    name: 'Tornado',
    description: 'A spiraling funnel shape',
    emoji: '🌪️',
    code: `addControl('spin', 'Spin Speed', 0.5, 6, 3);
addControl('width', 'Funnel Width', 0.5, 4, 2);
setInfo('Tornado', 'A spiraling funnel shape');

const t = i / count;
const y = (t - 0.2) * 12;
const funnelR = (0.2 + t * t) * controls.width;
const angle = t * 30 + time * controls.spin + Math.sin(i * 127.1) * 0.3;
const wobble = Math.sin(time * 2 + y * 0.5) * 0.3;
target.set(
  Math.cos(angle) * funnelR + wobble,
  y,
  Math.sin(angle) * funnelR + Math.cos(time * 1.5 + y * 0.5) * 0.3
);
color.setHSL(0.55 + t * 0.05, 0.5 + t * 0.4, 0.25 + t * 0.45);`,
  },
  {
    id: 'lightning',
    name: 'Lightning',
    description: 'Branching lightning bolt shape',
    emoji: '⚡',
    code: `addControl('branches', 'Branches', 2, 8, 4);
addControl('jitter', 'Jitter', 0.5, 4, 2);
setInfo('Lightning', 'Branching lightning bolt');

const branchCount = Math.floor(controls.branches);
const branch = i % branchCount;
const t = (i / count);
const bAngle = (branch / branchCount) * Math.PI * 2;
const y = (t - 0.5) * 14;
const seed1 = Math.sin(i * 127.1 + branch * 17.3);
const seed2 = Math.cos(i * 311.7 + branch * 23.7);
const flicker = Math.sin(time * 8 + branch * 3) * 0.5 + 0.5;
const jit = controls.jitter * seed1 * (1 - Math.abs(t - 0.5) * 1.5) * flicker;
const jit2 = controls.jitter * seed2 * (1 - Math.abs(t - 0.5) * 1.5) * flicker;
target.set(
  Math.cos(bAngle) * 0.5 + jit,
  y,
  Math.sin(bAngle) * 0.5 + jit2
);
const brightness = 0.4 + flicker * 0.5;
color.setHSL(0.17 + seed1 * 0.05, 0.9, brightness);`,
  },
  {
    id: 'sound-wave',
    name: 'Sound Wave',
    description: '3D waveform visualization',
    emoji: '🎵',
    code: `addControl('freq', 'Frequency', 1, 10, 4);
addControl('amp', 'Amplitude', 0.5, 4, 2);
setInfo('Sound Wave', '3D waveform visualization');

const gridW = Math.ceil(Math.sqrt(count));
const gx = (i % gridW) / gridW;
const gz = Math.floor(i / gridW) / gridW;
const x = (gx - 0.5) * 14;
const z = (gz - 0.5) * 14;
const d = Math.sqrt(x * x + z * z);
const wave = Math.sin(d * controls.freq - time * 3) * controls.amp * Math.exp(-d * 0.1);
const wave2 = Math.cos(d * controls.freq * 0.7 - time * 2) * controls.amp * 0.3;
target.set(x, wave + wave2, z);
const h = 0.6 + wave * 0.05;
color.setHSL(h, 0.85, 0.35 + Math.abs(wave) * 0.15);`,
  },
  {
    id: 'neural-network',
    name: 'Neural Network',
    description: 'Nodes and connections pulsing',
    emoji: '🕸️',
    code: `addControl('layers', 'Layers', 2, 8, 5);
addControl('pulse', 'Pulse', 0.5, 4, 1.5);
setInfo('Neural Network', 'Nodes and connections pulsing');

const layerCount = Math.floor(controls.layers);
const layer = i % layerCount;
const nodeInLayer = Math.floor(i / layerCount);
const nodesPerLayer = Math.ceil(count / layerCount);
const nt = nodeInLayer / nodesPerLayer;
const layerX = (layer / (layerCount - 1) - 0.5) * 10;
const angle = nt * Math.PI * 2;
const layerR = 2 + Math.sin(layer * 1.5) * 1;
const y = Math.sin(angle) * layerR;
const z = Math.cos(angle) * layerR;
const pulseV = Math.sin(time * controls.pulse + layer * 0.8 + nt * 6) * 0.3;
target.set(layerX + pulseV, y + pulseV * 0.5, z);
const signal = 0.5 + Math.sin(time * controls.pulse * 2 + layer * 1.2) * 0.4;
color.setHSL(0.55 + layer * 0.06, 0.8, 0.25 + signal * 0.4);`,
  },
  {
    id: 'fibonacci-spiral',
    name: 'Fibonacci Spiral',
    description: 'Golden ratio spiral with sunflower seed pattern',
    emoji: '🌻',
    code: `addControl('spread', 'Spread', 0.5, 5, 2);
addControl('twist', 'Twist', 0, 2, 0.5);
setInfo('Fibonacci Spiral', 'Golden ratio sunflower pattern');

const golden = 2.399963229728653;
const t = i / count;
const r = Math.sqrt(t) * 6 * controls.spread;
const theta = i * golden + time * controls.twist;
const y = Math.sin(r * 0.5 + time) * 0.5;
target.set(
  Math.cos(theta) * r,
  y,
  Math.sin(theta) * r
);
const h = (t * 0.3 + 0.1 + time * 0.02) % 1.0;
color.setHSL(h, 0.85, 0.35 + t * 0.35);`,
  },
  // === GALLERY PRESETS (fire, snow, nebula, sparkle) ===
  {
    id: 'fire',
    name: 'Fire',
    description: 'Roaring flames rising into the air',
    emoji: '🔥',
    code: `addControl('intensity', 'Intensity', 0.5, 4, 2);
addControl('width', 'Width', 1, 6, 3);
setInfo('Fire', 'Roaring flames rising into the air');

const t = i / count;
const seed1 = Math.sin(i * 127.1) * 0.5;
const seed2 = Math.cos(i * 311.7) * 0.5;
const seed3 = Math.sin(i * 73.1) * 0.5;
const life = (t * 4 + time * 1.5) % 4;
const height = life * controls.intensity;
const spread = (1 - life / 4) * controls.width * 0.5;
const flicker = Math.sin(time * 8 + i * 0.1) * 0.3;
target.set(
  seed1 * spread + flicker * spread * 0.3,
  height - 2,
  seed2 * spread + seed3 * 0.2
);
const fade = Math.max(0, 1 - life / 4);
const h = 0.05 - life * 0.015;
color.setHSL(Math.max(0, h), 1.0, 0.25 + fade * 0.45);`,
  },
  {
    id: 'snow',
    name: 'Snow',
    description: 'Gentle snowflakes drifting down',
    emoji: '❄️',
    code: `addControl('wind', 'Wind', -2, 2, 0.5);
addControl('density', 'Density', 1, 4, 2);
setInfo('Snow', 'Gentle snowflakes drifting down');

const t = i / count;
const seed1 = Math.sin(i * 127.1) * 0.5;
const seed2 = Math.cos(i * 311.7) * 0.5;
const seed3 = Math.sin(i * 73.1) * 0.5;
const fall = ((t * 20 + time * 0.5 + seed3 * 3) % 14) - 4;
const drift = Math.sin(time * 0.7 + i * 0.01) * 0.5 * controls.wind;
const sway = Math.sin(time * 1.2 + seed1 * 10) * 0.3;
const area = controls.density * 4;
target.set(
  seed1 * area * 2 + drift + sway,
  4 - fall,
  seed2 * area * 2
);
const brightness = 0.7 + seed3 * 0.15;
color.setHSL(0.58, 0.08, brightness);`,
  },
  {
    id: 'nebula',
    name: 'Nebula',
    description: 'A swirling cosmic nebula cloud',
    emoji: '🌫️',
    code: `addControl('turbulence', 'Turbulence', 0.5, 4, 1.5);
addControl('scale', 'Scale', 1, 8, 4);
setInfo('Nebula', 'A swirling cosmic nebula cloud');

const t = i / count;
const seed1 = Math.sin(i * 127.1) * 0.5;
const seed2 = Math.cos(i * 311.7) * 0.5;
const seed3 = Math.sin(i * 73.1) * 0.5;
const seed4 = Math.cos(i * 43.7) * 0.5;
const s = controls.scale;
const turb = controls.turbulence;
const baseX = seed1 * s;
const baseY = seed2 * s * 0.6;
const baseZ = seed3 * s;
const swirl = Math.sin(baseX * 0.5 + time * 0.2) * turb;
const drift = Math.cos(baseZ * 0.5 + time * 0.15) * turb;
const pulse = Math.sin(time * 0.3 + t * 6) * 0.2;
target.set(
  baseX + swirl + Math.sin(time * 0.1 + seed4 * 4) * 0.5,
  baseY + drift * 0.5 + pulse,
  baseZ + drift + Math.cos(time * 0.15 + seed1 * 3) * 0.4
);
const h = (0.7 + seed1 * 0.2 + Math.sin(time * 0.1) * 0.05) % 1.0;
color.setHSL(h, 0.6 + seed2 * 0.3, 0.2 + Math.abs(seed3) * 0.35);`,
  },
  {
    id: 'sparkle',
    name: 'Sparkle',
    description: 'Twinkling glitter particles in all directions',
    emoji: '✨',
    code: `addControl('spread', 'Spread', 1, 8, 4);
addControl('twinkle', 'Twinkle Speed', 1, 10, 5);
setInfo('Sparkle', 'Twinkling glitter particles');

const t = i / count;
const phi = Math.acos(1 - 2 * t);
const theta = Math.PI * (1 + Math.sqrt(5)) * i;
const r = controls.spread * (0.3 + Math.abs(Math.sin(i * 127.1)) * 0.7);
target.set(
  Math.sin(phi) * Math.cos(theta) * r,
  Math.sin(phi) * Math.sin(theta) * r,
  Math.cos(phi) * r
);
const twinkle = Math.sin(time * controls.twinkle + i * 1.7) * 0.5 + 0.5;
const hue = (i * 0.618033988 + time * 0.02) % 1.0;
color.setHSL(hue, 0.7 + twinkle * 0.3, 0.15 + twinkle * 0.55);`,
  },
  {
    id: 'black-hole',
    name: 'Black Hole',
    description: 'Accretion disk swirling around a gravitational singularity',
    emoji: '🕳️',
    code: `addControl('diskRadius', 'Disk Radius', 2, 10, 6);
addControl('warpSpeed', 'Warp Speed', 0.5, 5, 2);
addControl('thickness', 'Disk Thickness', 0.1, 1.5, 0.4);
setInfo('Black Hole', 'Accretion disk around a singularity');

const t = i / count;
const golden = 2.399963229728653;
const theta = i * golden + time * controls.warpSpeed * (0.3 + (1.0 - t) * 2.0);
const minR = 1.2;
const maxR = controls.diskRadius;
const r = minR + Math.sqrt(t) * (maxR - minR);
const invR = 1.0 / Math.max(r, 0.5);
const warp = Math.sin(theta * 3 + time * 1.5) * 0.15 * invR;
const diskY = (Math.sin(i * 127.1) * 0.5) * controls.thickness * (r / maxR);
const tilt = 0.35;
const x = Math.cos(theta) * r;
const flatZ = Math.sin(theta) * r;
const y = diskY + flatZ * Math.sin(tilt) + warp;
const z = flatZ * Math.cos(tilt);
target.set(x, y, z);
const temp = 1.0 - (r - minR) / (maxR - minR);
const hue = 0.05 + temp * 0.12;
const lum = 0.15 + temp * 0.55 + Math.sin(time * 3 + i * 0.5) * 0.05 * temp;
color.setHSL(hue, 0.8 + temp * 0.2, Math.min(lum, 0.85));`,
  },
  // === PHYSICS PRESETS ===
  {
    id: 'rain',
    name: 'Rain',
    description: 'Raindrops falling with gravity and bouncing off the ground',
    emoji: '💧',
    physics: { gravity: true, gravityStrength: 1.0 },
    code: `setInfo('Rain', 'Raindrops falling from the sky');
addControl('wind', 'Wind', -2, 2, 0.3);

const t = i / count;
const x = (Math.sin(i * 127.1) * 0.5) * 16 - 8;
const z = (Math.cos(i * 311.7) * 0.5) * 16 - 8;
const y = ((t * 20 + time * 2) % 16) - 2;
const windOff = Math.sin(time * 0.5) * controls.wind;
target.set(x + windOff, y, z);
color.setHSL(0.58, 0.6, 0.4 + t * 0.3);`,
  },
  {
    id: 'atom',
    name: 'Atom',
    description: 'Electrons orbiting a nucleus with orbital mechanics',
    emoji: '⚛️',
    physics: { forceField: 'attractor', forceFieldStrength: 0.3 },
    code: `setInfo('Atom', 'Electrons orbiting a nucleus');
addControl('orbitSpeed', 'Orbit Speed', 0.5, 5, 2);
addControl('shells', 'Shells', 1, 5, 3);

const shellCount = Math.floor(controls.shells);
const shell = i % shellCount;
const r = 1.5 + shell * 1.8;
const particlesInShell = Math.ceil(count / shellCount);
const idx = Math.floor(i / shellCount);
const nt = idx / particlesInShell;
const inclination = (shell * 0.4) + Math.sin(i * 73.1) * 0.2;
const angle = nt * Math.PI * 2 + time * controls.orbitSpeed * (1 + shell * 0.3);
const ci = Math.cos(inclination);
const si = Math.sin(inclination);
const x = Math.cos(angle) * r;
const y = Math.sin(angle) * r * si;
const z = Math.sin(angle) * r * ci;
target.set(x, y, z);
const hue = 0.55 + shell * 0.12;
color.setHSL(hue, 0.9, 0.5 + Math.sin(angle + time) * 0.15);`,
  },
  {
    id: 'billiards',
    name: 'Billiards',
    description: 'Particles bouncing on a flat plane like billiard balls',
    emoji: '🎱',
    physics: { collisions: true },
    code: `setInfo('Billiards', 'Particles bouncing off each other on a flat plane');
addControl('energy', 'Energy', 0.5, 4, 1.5);

const t = i / count;
const angle = Math.sin(i * 127.1) * Math.PI * 2;
const dist = Math.sqrt(t) * 6;
const spd = controls.energy;
const x = Math.cos(angle + time * 0.3 * spd) * dist;
const z = Math.sin(angle + time * 0.3 * spd) * dist;
target.set(x, 0.1, z);
const hue = (i * 0.618033988) % 1.0;
color.setHSL(hue, 0.85, 0.45);`,
  },
  {
    id: 'aurora-borealis',
    name: 'Aurora Borealis',
    description: 'Shimmering northern lights dancing across the sky',
    emoji: '🌌',
    code: `addControl('waveHeight', 'Wave Height', 1, 6, 3);
addControl('shimmer', 'Shimmer', 0.1, 3, 1.2);
addControl('spread', 'Spread', 4, 16, 10);
setInfo('Aurora Borealis', 'Shimmering northern lights dancing across the sky');

const t = i / count;
const x = (t - 0.5) * controls.spread * 2;
const wave1 = Math.sin(x * 0.5 + time * 0.8) * controls.waveHeight;
const wave2 = Math.cos(x * 0.3 - time * 0.5) * controls.waveHeight * 0.5;
const noise = Math.sin(i * 73.1 + time * controls.shimmer) * 0.4;
const verticalT = (Math.sin(i * 41.3) * 0.5 + 0.5);
const y = wave1 + wave2 + verticalT * 4 - 2 + noise;
const z = Math.sin(x * 0.7 + time * 0.3) * 2 + (Math.cos(i * 13.7) * 0.5) * 1.5;
target.set(x, y, z);
const hue = 0.33 + Math.sin(x * 0.2 + time * 0.4) * 0.15 + verticalT * 0.1;
const light = 0.35 + verticalT * 0.4 + Math.sin(i * 17.3 + time * 2) * 0.1;
color.setHSL(hue, 0.85, light);`,
  },
  {
    id: 'solar-flare',
    name: 'Solar Flare',
    description: 'A raging sun with erupting plasma arcs and corona',
    emoji: '☀️',
    code: `addControl('flareIntensity', 'Flare Intensity', 0.5, 4, 2);
addControl('coronaSize', 'Corona Size', 1, 5, 2.5);
addControl('turbulence', 'Turbulence', 0.1, 3, 1.2);
setInfo('Solar Flare', 'A raging sun with erupting plasma arcs and corona');

const t = i / count;
const isFlare = (i % 10) >= 7;

if (!isFlare) {
  const phi = Math.acos(1 - 2 * ((i * 0.6180339887) % 1));
  const theta = i * 2.399963229;
  const pulse = 1 + Math.sin(time * 1.5 + i * 0.1) * 0.05 * controls.turbulence;
  const r = 2.2 * pulse;
  const bump = Math.sin(phi * 8 + time * 0.7) * Math.cos(theta * 6 - time * 0.5) * 0.15 * controls.turbulence;
  const rr = r + bump;
  target.set(
    Math.sin(phi) * Math.cos(theta) * rr,
    Math.cos(phi) * rr,
    Math.sin(phi) * Math.sin(theta) * rr
  );
  const heat = 0.5 + Math.sin(phi * 5 + theta * 3 + time) * 0.5;
  const hue = 0.08 + heat * 0.07;
  color.setHSL(hue, 1.0, 0.45 + heat * 0.25);
} else {
  const flareIdx = Math.floor(i / 10);
  const flarePhase = (time * 0.4 + flareIdx * 0.618) % 1.0;
  const arcT = (i * 0.1) % 1.0;
  const a1 = flareIdx * 1.7;
  const a2 = flareIdx * 2.3 + 1.1;
  const p1x = Math.cos(a1) * Math.sin(a2) * 2.2;
  const p1y = Math.cos(a2) * 2.2;
  const p1z = Math.sin(a1) * Math.sin(a2) * 2.2;
  const p2x = -p1x + Math.sin(flareIdx * 3.7) * 1.5;
  const p2y = -p1y + Math.cos(flareIdx * 1.9) * 1.5;
  const p2z = -p1z + Math.sin(flareIdx * 5.1) * 1.5;
  const lerp = arcT;
  const mx = (p1x + p2x) * 0.5;
  const my = (p1y + p2y) * 0.5 + controls.flareIntensity * 2.5 * flarePhase;
  const mz = (p1z + p2z) * 0.5;
  const bx = (1 - lerp) * (1 - lerp) * p1x + 2 * (1 - lerp) * lerp * mx + lerp * lerp * p2x;
  const by = (1 - lerp) * (1 - lerp) * p1y + 2 * (1 - lerp) * lerp * my + lerp * lerp * p2y;
  const bz = (1 - lerp) * (1 - lerp) * p1z + 2 * (1 - lerp) * lerp * mz + lerp * lerp * p2z;
  const wisp = Math.sin(i * 31.7 + time * 3) * 0.15 * controls.coronaSize;
  target.set(bx + wisp, by + wisp * 0.7, bz + wisp);
  const tipHeat = Math.sin(lerp * Math.PI);
  const hue = 0.02 + tipHeat * 0.08;
  const light = 0.45 + tipHeat * 0.45 * (1 - flarePhase);
  color.setHSL(hue, 0.95 - tipHeat * 0.3, light);
}`,
  },
]
