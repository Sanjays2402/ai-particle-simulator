// PresetThumbnailPrerenderer: walks the preset list and renders any
// missing carousel thumbnails into localStorage during idle frames.
// Mounts once at App level. Renders nothing visible.
//
// Why a driver vs an effect inside PresetCarousel:
//   - Keeps the carousel component focused on render + interaction.
//   - Lets us safely stop after the work is done — no re-runs on
//     thumbnail invalidation when the user reloads a preset (the
//     live capture path handles that).
//   - requestIdleCallback batches one thumbnail per idle slot so we
//     don't compete with the live scene's frame budget.

import { useEffect, useRef } from 'react'
import { presets } from '../presets'
import {
  listMissingThumbnails, captureThumbnailToStorage,
} from '../lib/presetThumbnails'

// Wait this long after mount before kicking off — gives the splash +
// initial preset load room to breathe so the user sees their scene
// before we start chewing into idle slots.
const STARTUP_DELAY_MS = 2500

// Hard ceiling per browser session — even if the storage fills up
// later, we cap how many thumbnails we'll render so the priming
// doesn't loop on a malformed entry.
const MAX_PER_SESSION = 64

export default function PresetThumbnailPrerenderer() {
  const cancelledRef = useRef(false)

  useEffect(() => {
    cancelledRef.current = false
    // Resolve requestIdleCallback or fall back to setTimeout. Safari
    // doesn't ship rIC; the fallback's 200ms cadence is still tiny
    // compared to the active scene's 16ms frame budget.
    const idle = typeof window.requestIdleCallback === 'function'
      ? (cb) => window.requestIdleCallback(cb, { timeout: 1000 })
      : (cb) => window.setTimeout(() => cb({ timeRemaining: () => 50 }), 200)
    const cancelIdle = typeof window.cancelIdleCallback === 'function'
      ? (id) => window.cancelIdleCallback(id)
      : (id) => window.clearTimeout(id)

    let pending = 0
    let handle = null
    const tick = () => {
      if (cancelledRef.current) return
      const missing = listMissingThumbnails(presets)
      if (missing.length === 0 || pending >= MAX_PER_SESSION) return
      const preset = missing[0]
      const ok = captureThumbnailToStorage(preset)
      if (ok) {
        pending++
        // Tell the carousel a new thumbnail just landed so it can
        // reload its in-memory cache and show it without a manual
        // preset load. The PresetCarousel useEffect listens for this.
        try { window.dispatchEvent(new CustomEvent('particle:thumbnail-ready', { detail: { id: preset.id } })) }
        catch { /* CustomEvent unsupported on ancient browsers */ }
      }
      // Schedule the next one. Even on failure we move on — the
      // missing-list filter will skip this preset next time IF the
      // capture wrote something; if not, we'll retry once and let
      // the MAX_PER_SESSION cap break the loop.
      handle = idle(tick)
    }

    const startTimer = window.setTimeout(() => {
      handle = idle(tick)
    }, STARTUP_DELAY_MS)

    return () => {
      cancelledRef.current = true
      window.clearTimeout(startTimer)
      if (handle != null) cancelIdle(handle)
    }
  }, [])

  return null
}
