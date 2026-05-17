# Changelog

All notable changes to AI Particle Simulator are documented in this
file. The format roughly follows [Keep a Changelog](https://keepachangelog.com).

## [Unreleased]

### Added — Presets
- **Plasma Storm** — curl-noise plasma with magnetic filaments
- **Wormhole** — funnel-shaped spacetime corridor
- **Magnetosphere** — dipole field lines with aurora glow
- **Supernova** — looping stellar explosion shockwave
- **Fluid Vortex** — smoke-like fluid with vortex stretching
- **Pulsar** — rotating neutron star with twin polar jets
- **Crystal Cave** — drifting crystalline shards
- **Hyperjump** — warp-drive star-streak tunnel
- **Sandstorm** — wind-driven sand with turbulent flow
- **Solar Wind** — charged particles bending around a field

### Added — UI / UX
- Keyboard help overlay (`?` key) with grouped shortcuts
- Quality preset chips (Low / Med / High / Ultra)
- Smash button (random preset + style + theme + camera)
- Debug HUD with rolling FPS, frame time, and heap (`` ` `` key)
- 4-step onboarding tour for first-run users
- Mouse paint mode — drag to drop persistent attractors
- Two new particle shape variants: **Glow**, **Dot**
- Five new themes: Sunset, Forest, Arctic, Retro, Vaporwave
- Gradient palette picker with 6 quick presets and live preview
- Post-FX: Chromatic aberration, Vignette, Film-grain noise toggles
- Mobile drawer layout (sidebars collapse to overlays under 720 px)
- Double-tap canvas to play/pause
- Opt-in mouse trail (16-dot fading ring)
- Favorites/Recent filter chip on the preset carousel
- Recents tracking (last 8 loaded presets, persisted)
- Reset Local Settings button in Settings modal
- Export / Import settings as JSON file
- `Shift+F` shortcut to favorite the current preset

### Added — Audio
- Per-band reactivity split (bass / mid / treble)
- Simple beat detector with refractory period
- 3-way `audioMode` picker (Level / Bass / Beat)

### Added — Export & Sharing
- WebM / MP4 video recording via MediaRecorder
- v2 URL share encoding (palette + post-FX + audio + camera)
- Settings persistence via localStorage

### Added — Reliability
- Top-level React error boundary with recovery UI

### Docs
- README feature list and keyboard table fully refreshed
- New `docs/PRESETS.md` preset-authoring guide
- This `CHANGELOG.md`

### Fixed
- Duplicate `id: 'black-hole'` preset entry — older tilted-disk
  variant renamed to `accretion-disk`
