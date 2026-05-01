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
  {
    id: 'quantum-tunnel',
    name: 'Quantum Tunnel',
    description: 'Wormhole with relativistic light streaks warping through spacetime',
    emoji: '🕳️',
    code: `addControl('tunnelLength', 'Tunnel Depth', 6, 24, 14);
addControl('warp', 'Warp Intensity', 0.3, 3, 1.2);
addControl('streakSpeed', 'Streak Speed', 0.5, 5, 2);
setInfo('Quantum Tunnel', 'Wormhole with relativistic light streaks');

const t = i / count;
const ringIdx = Math.floor(t * 60);
const ringT = ringIdx / 60;

// Particle travels down the tunnel, wraps around
const travel = (ringT + time * controls.streakSpeed * 0.1) % 1.0;
const z = (travel - 0.5) * controls.tunnelLength;

// Tunnel radius pinches at center (wormhole throat)
const pinch = 0.6 + Math.abs(travel - 0.5) * 1.4;
const baseRadius = pinch * (1 + Math.sin(travel * Math.PI * 4 + time) * 0.15 * controls.warp);

// Spiral angle with relativistic twist near the throat
const twist = controls.warp * (1 - Math.abs(travel - 0.5) * 2) * 3;
const angle = (i * 0.3761) + travel * Math.PI * 6 + time * 1.2 + twist;

// Streak: stretch particles along direction of travel near the throat
const streakFactor = Math.pow(1 - Math.abs(travel - 0.5) * 2, 2);
const streakJitter = (Math.sin(i * 91.3) * 0.5) * streakFactor * 0.8;

target.set(
  Math.cos(angle) * baseRadius,
  Math.sin(angle) * baseRadius,
  z + streakJitter
);

// Color: blueshift entering, redshift exiting (Doppler effect)
const doppler = travel < 0.5 ? 0.6 - travel * 0.4 : travel * 0.15;
const brightness = 0.4 + streakFactor * 0.5 + Math.sin(i * 7.1 + time * 3) * 0.1;
const saturation = 0.7 + streakFactor * 0.3;
color.setHSL(doppler, saturation, brightness);`,
  },
  // ── v4 ITERs 1-5: new presets ──
  {
    id: 'double-pendulum',
    name: 'Double Pendulum',
    emoji: '⚡',
    description: 'Chaotic trails from a swarm of double pendulums.',
    controls: [
      { id: 'chaos', label: 'Chaos', value: 1.5, min: 0.3, max: 3 },
      { id: 'length', label: 'Arm Length', value: 2, min: 0.5, max: 4 },
    ],
    code: `// Many double-pendulum trails
const pendulum = Math.floor(i / 40);
const trail = i % 40;
const seedA = Math.sin(pendulum * 12.9) * 43758.5453;
const seedB = Math.sin(pendulum * 78.2) * 12345.6789;
const phaseA = (seedA - Math.floor(seedA)) * Math.PI * 2;
const phaseB = (seedB - Math.floor(seedB)) * Math.PI * 2;
const tt = time - trail * 0.04;
const L1 = controls.length, L2 = controls.length * 0.7;
const a = phaseA + tt * controls.chaos;
const b = phaseB + tt * (controls.chaos * 1.73); // irrational ratio → chaos
const x = L1 * Math.sin(a) + L2 * Math.sin(a + b);
const y = L1 * Math.cos(a) + L2 * Math.cos(a + b) - 3;
const fade = 1 - trail / 40;
target.set(x, y, Math.sin(a * 2 + b) * 0.5);
color.setHSL((pendulum * 0.08) % 1, 0.9, 0.3 + fade * 0.5);`,
  },
  {
    id: 'lightning-storm',
    name: 'Lightning Storm',
    emoji: '⛈',
    description: 'Branching lightning bolts strike in random bursts.',
    controls: [
      { id: 'frequency', label: 'Strike Rate', value: 1.5, min: 0.3, max: 4 },
      { id: 'branches', label: 'Branching', value: 0.6, min: 0, max: 1.2 },
    ],
    code: `// Lightning bolts with fractal branches
const bolt = Math.floor(i / 120);
const p = (i % 120) / 120;
const strike = Math.floor(time * controls.frequency + bolt * 0.8);
const boltSeed = Math.sin(strike * 73.14 + bolt * 17.3) * 43758.5453;
const originX = ((boltSeed - Math.floor(boltSeed)) - 0.5) * 12;
const boltAge = (time * controls.frequency + bolt * 0.8) % 1;
const brightness = Math.pow(1 - boltAge, 3);
// Fractal jitter (Perlin-ish via layered sines)
const jitter = Math.sin(p * 47 + strike * 31) * 0.6 * controls.branches * (1 - p * 0.5)
             + Math.sin(p * 113 + strike * 71) * 0.3 * controls.branches;
// Branch offset
const branchPhase = Math.sin(i * 0.37 + bolt) * controls.branches * 0.4;
target.set(
  originX + jitter + branchPhase,
  6 - p * 14,
  Math.sin(p * 23 + strike) * 0.4 * controls.branches
);
const hot = brightness * (0.9 + Math.sin(i * 0.7) * 0.1);
color.setRGB(hot * 0.9 + 0.1, hot * 0.95 + 0.05, hot * 1.2);`,
  },
  {
    id: 'cherry-blossoms',
    name: 'Cherry Blossoms',
    emoji: '🌸',
    description: 'Pink petals tumble in a gentle breeze.',
    controls: [
      { id: 'wind', label: 'Wind', value: 0.4, min: 0, max: 1.5 },
      { id: 'density', label: 'Density', value: 1, min: 0.5, max: 2 },
    ],
    code: `// Falling petals with rotation and wind
const seedA = Math.sin(i * 12.9898) * 43758.5453;
const seedB = Math.sin(i * 78.233) * 12345.6789;
const rx = seedA - Math.floor(seedA);
const rz = seedB - Math.floor(seedB);
const fallSpeed = 0.5 + rx * 0.8;
const cycle = (rx * 10 + time * fallSpeed * 0.3 * controls.density) % 1;
const y = 8 - cycle * 16;
const spin = time * (rx - 0.5) * 3;
const windX = Math.sin(time * 0.5 + y * 0.3) * controls.wind * 2;
const swayX = Math.sin(time * 1.2 + i * 0.1) * 0.4;
target.set(
  (rx - 0.5) * 14 + windX + swayX + Math.cos(spin) * 0.15,
  y,
  (rz - 0.5) * 8 + Math.sin(spin) * 0.15
);
const tint = 0.92 + Math.sin(i * 0.3) * 0.04; // light pink
const sat = 0.55 + Math.sin(i * 0.7) * 0.1;
const light = 0.7 + Math.sin(i + time) * 0.1;
color.setHSL(tint, sat, light);`,
  },
  {
    id: 'crystal-lattice',
    name: 'Crystal Lattice',
    emoji: '🔷',
    description: 'Pulsing 3D crystalline grid with breathing rhythm.',
    controls: [
      { id: 'pulse', label: 'Pulse', value: 1, min: 0, max: 3 },
      { id: 'density', label: 'Density', value: 10, min: 5, max: 20 },
    ],
    code: `// 3D grid with per-cell pulse
const side = Math.ceil(Math.pow(count, 1/3));
const x = i % side;
const y = Math.floor(i / side) % side;
const z = Math.floor(i / (side * side));
const spacing = 14 / side;
const cx = (x - side/2) * spacing;
const cy = (y - side/2) * spacing;
const cz = (z - side/2) * spacing;
const dist = Math.sqrt(cx*cx + cy*cy + cz*cz);
const wave = Math.sin(dist * 0.8 - time * 2) * 0.3 * controls.pulse;
const scale = 1 + wave;
target.set(cx * scale, cy * scale, cz * scale);
const bri = 0.4 + (wave + 0.3) * 0.7;
const hue = 0.55 + Math.sin(dist * 0.3 + time * 0.5) * 0.1;
color.setHSL(hue, 0.9, Math.max(0.1, bri));`,
  },
  {
    id: 'swarm',
    name: 'Swarm',
    emoji: '🐝',
    description: 'Boids-inspired swarm that flocks around attractors.',
    controls: [
      { id: 'cohesion', label: 'Cohesion', value: 1, min: 0, max: 2 },
      { id: 'speed', label: 'Speed', value: 1, min: 0.3, max: 2.5 },
    ],
    code: `// Pseudo-boid: particles orbit 3 moving attractors
const att = i % 3;
const atX = Math.sin(time * 0.5 + att * 2.094) * 4;
const atY = Math.cos(time * 0.4 + att * 2.094) * 3;
const atZ = Math.sin(time * 0.3 + att * 4.189) * 3;
const seed = Math.sin(i * 19.7) * 43758.5453;
const r = 0.5 + (seed - Math.floor(seed)) * 2.5 / controls.cohesion;
const phase = i * 0.6 + time * controls.speed;
const dx = r * Math.sin(phase) * Math.cos(phase * 0.5 + i * 0.1);
const dy = r * Math.sin(phase * 0.7 + i * 0.2);
const dz = r * Math.cos(phase) * Math.sin(phase * 0.5 + i * 0.1);
target.set(atX + dx, atY + dy, atZ + dz);
const hue = att === 0 ? 0.55 : att === 1 ? 0.85 : 0.12;
color.setHSL(hue, 0.9, 0.55);`,
  },
  {
    id: 'lightning-fractal',
    name: 'Lightning Fractal',
    description: 'Branching fractal lightning bolts with flickering electric charge',
    emoji: '⚡',
    code: `addControl('bolts', 'Bolt Count', 3, 12, 6);
addControl('jitter', 'Jaggedness', 0.1, 1.5, 0.6);
addControl('flicker', 'Flicker Speed', 1, 10, 4);
addControl('branchProb', 'Branching', 0, 1, 0.5);
setInfo('Lightning Fractal', 'Branching fractal lightning with flickering charge');

const boltCount = Math.floor(controls.bolts);
const bolt = i % boltCount;
const t = Math.floor(i / boltCount) / Math.max(1, Math.floor(count / boltCount));

// Each bolt has its own seed for position and timing
const boltSeed = bolt * 13.37;
const originX = Math.sin(boltSeed) * 5;
const originZ = Math.cos(boltSeed * 1.7) * 5;

// Strike timing: each bolt fires on its own rhythm
const strikePhase = (time * controls.flicker * 0.3 + boltSeed) % 1.0;
const alive = strikePhase < 0.25 ? 1.0 : Math.max(0, 1 - (strikePhase - 0.25) * 4);

// Vertical descent from sky to ground
const y = 6 - t * 12;

// Fractal jaggedness using layered noise
const n1 = Math.sin(t * 17.3 + boltSeed) * Math.cos(t * 23.1 + boltSeed * 2);
const n2 = Math.sin(t * 53.7 + boltSeed * 3) * 0.5;
const n3 = Math.sin(t * 113.1 + boltSeed * 5) * 0.25;
const jag = (n1 + n2 + n3) * controls.jitter;

// Branching: some particles fork off the main path
const forkSeed = Math.sin(i * 91.7 + boltSeed) * 0.5 + 0.5;
const isBranch = forkSeed < controls.branchProb && t > 0.2 && t < 0.9;
const branchAngle = forkSeed * Math.PI * 4;
const branchLen = (1 - t) * 1.5 * (forkSeed - 0.4);
const bx = isBranch ? Math.cos(branchAngle) * branchLen : 0;
const bz = isBranch ? Math.sin(branchAngle) * branchLen : 0;

target.set(
  originX + jag + bx,
  y,
  originZ + jag * 0.7 + bz
);

// Color: white-hot core fading to electric blue/violet, modulated by strike phase
const heat = alive * (0.7 + Math.sin(time * controls.flicker * 6 + boltSeed) * 0.3);
const hue = 0.62 + (1 - heat) * 0.08; // blue to violet
const light = 0.15 + heat * 0.75;
const sat = 0.4 + (1 - heat) * 0.6;
color.setHSL(hue, sat, light);`,
  },
  {
    id: 'galaxy-collision',
    name: 'Galaxy Collision',
    description: 'Two spiral galaxies merge in a tidal dance, throwing off stellar streams',
    emoji: '💫',
    code: `addControl('separation', 'Separation', 2, 10, 5);
addControl('mergeSpeed', 'Merge Speed', 0.05, 1, 0.25);
addControl('armTwist', 'Arm Twist', 1, 6, 3);
addControl('tidalStretch', 'Tidal Stretch', 0, 2, 1);
setInfo('Galaxy Collision', 'Two spiral galaxies merging with tidal streams');

const t = i / count;
const galaxy = i % 2; // 0 = galaxy A, 1 = galaxy B
const inGalaxyT = Math.floor(i / 2) / Math.floor(count / 2);

// Merge progress oscillates 0 → 1 → 0 so collision keeps replaying
const mergeCycle = (Math.sin(time * controls.mergeSpeed) + 1) * 0.5;
const sep = controls.separation * (1 - mergeCycle * 0.92);

// Galaxy centers approach along the X axis, then pass through
const centerX = (galaxy === 0 ? -1 : 1) * sep;
const centerZ = (galaxy === 0 ? 1 : -1) * sep * 0.25 * (1 - mergeCycle);

// Spiral arm structure inside each galaxy
const armCount = 3;
const arm = Math.floor(inGalaxyT * armCount * 13) % armCount;
const armOffset = (arm / armCount) * Math.PI * 2 + (galaxy === 0 ? 0 : Math.PI);
const diskRadius = Math.sqrt(inGalaxyT) * 3.5;
const rotationDir = galaxy === 0 ? 1 : -1;
const armAngle = armOffset + diskRadius * controls.armTwist * 0.4 + time * 0.3 * rotationDir;

// Tidal stretch: outer particles get pulled toward the other galaxy during close approach
const pullStrength = mergeCycle * controls.tidalStretch * (diskRadius / 3.5);
const pullX = (galaxy === 0 ? 1 : -1) * pullStrength * 1.2;

// Random scatter for thickness
const seed1 = Math.sin(i * 127.1) * 0.5;
const seed2 = Math.cos(i * 311.7) * 0.5;
const diskY = seed1 * 0.25 * (1 - inGalaxyT * 0.5);
const armSpread = seed2 * 0.3 * inGalaxyT;

const localX = Math.cos(armAngle) * diskRadius + armSpread + pullX;
const localZ = Math.sin(armAngle) * diskRadius + armSpread;

target.set(
  centerX + localX,
  diskY + Math.sin(time * 0.5 + i * 0.01) * 0.15 * mergeCycle,
  centerZ + localZ
);

// Color: galaxies have distinct hues, brightness spikes at collision peak
const baseHue = galaxy === 0 ? 0.6 : 0.05; // cool blue vs warm gold
const heatBoost = mergeCycle * pullStrength * 0.15;
const coreLight = (1 - inGalaxyT) * 0.35;
const burst = Math.pow(mergeCycle, 4) * 0.25;
const lum = 0.3 + coreLight + burst + Math.sin(time + i * 0.1) * 0.05;
color.setHSL((baseHue + heatBoost) % 1, 0.85, Math.min(0.85, lum));`,
  },
]
