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
]
