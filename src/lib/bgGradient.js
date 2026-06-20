// bgGradient: verify the angle clamp & CSS string builder.
// Pure helper extracted from the store reducer so we can unit-test
// the clamp/round contract without spinning up zustand.

export function clampAngle(v) {
  if (!Number.isFinite(v)) return 0
  return Math.max(0, Math.min(360, v | 0))
}

export function buildGradientCss(angle, a, b) {
  const ang = clampAngle(angle)
  return `linear-gradient(${ang}deg, ${a} 0%, ${b} 100%)`
}
