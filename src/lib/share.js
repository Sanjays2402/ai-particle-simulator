// Build the v2 share payload from current store state, base64-encode
// it into a #share= fragment, and return the full URL.
//
// Single source of truth so handleShare, handleTweet, and future
// "copy as Markdown" / "Open Graph image" code paths can't drift.
export function buildShareUrl(state) {
  const s = state
  const data = {
    v: 2,
    code: s.particleFnSource,
    preset: s.currentPreset,
    count: s.particleCount,
    speed: s.speed,
    glow: s.glowIntensity,
    style: s.visualStyle,
    theme: s.theme,
    trails: s.trails,
    autoRotate: s.autoRotate,
    autoRotateSpeed: s.autoRotateSpeed,
    audioMode: s.audioMode,
    mouseAttract: s.mouseAttract,
    palette: s.paletteEnabled
      ? { a: s.paletteA, b: s.paletteB, mix: s.paletteMix }
      : undefined,
    fx: {
      ca: s.chromaticAberration,  caI: s.chromaticIntensity,
      vg: s.vignette,             vgI: s.vignetteIntensity,
      fg: s.filmGrain,            fgI: s.filmGrainIntensity,
    },
    kaleido: s.kaleidoscopeEnabled
      ? { segs: s.kaleidoscopeSegments }
      : undefined,
  }
  const hash = btoa(encodeURIComponent(JSON.stringify(data)))
  return `${window.location.origin}${window.location.pathname}#share=${hash}`
}
