// Slideshow driver: runs the dwell timer when slideshowEnabled flips
// on and forwards the next preset id (computed by pickNext) to the
// store's loadPreset. Renders nothing.
//
// The timer is also reset whenever the user manually loads a preset
// (via clicking, the carousel, R-key, etc.) — so the slideshow doesn't
// immediately yank away a scene the user just chose; they get the full
// dwell on their pick before the next rotation.
//
// Category scoping: when `slideshowRespectCategory` is true, the
// rotation is scoped to the currently-active preset category filter
// (the LeftSidebar chips). Favourites order intentionally ignores it.
import { useEffect, useRef } from 'react'
import { useStore } from '../store'
import { presets } from '../presets'
import { pickNext } from '../lib/slideshow'

export default function Slideshow() {
  const enabled    = useStore(s => s.slideshowEnabled)
  const dwellSec   = useStore(s => s.slideshowDwellSec)
  const order      = useStore(s => s.slideshowOrder)
  const currentId  = useStore(s => s.currentPreset)
  // Track favourites so the 'favourites' order keeps up with toggles
  // mid-slideshow without forcing the user to restart it.
  const favouriteIds = useStore(s => s.favoritedPresets)
  // Category filter scoping — respects the active LeftSidebar chips
  // when the user opts in. Off by default for backwards compatibility.
  const respectCategory = useStore(s => s.slideshowRespectCategory)
  const presetCategory  = useStore(s => s.presetCategory)

  // Keep refs alongside state so the timer callback always reads the
  // latest values without re-creating the interval on every change.
  const stateRef = useRef({ order, currentId, favouriteIds, respectCategory, presetCategory })
  useEffect(() => {
    stateRef.current = { order, currentId, favouriteIds, respectCategory, presetCategory }
  }, [order, currentId, favouriteIds, respectCategory, presetCategory])

  // The interval reset on currentId change is the "user manual load"
  // pause — when they pick a scene, they get the full dwell on it.
  useEffect(() => {
    if (!enabled) return
    const tick = () => {
      const { order: o, currentId: c, favouriteIds: f, respectCategory: r, presetCategory: cat } = stateRef.current
      const nextId = pickNext({
        presets, order: o, currentId: c, favouriteIds: f,
        categoryFilter: r ? cat : undefined,
      })
      if (!nextId) return
      useStore.getState().loadPreset(nextId)
    }
    const id = setInterval(tick, Math.max(2, dwellSec) * 1000)
    return () => clearInterval(id)
  }, [enabled, dwellSec, currentId])

  return null
}
