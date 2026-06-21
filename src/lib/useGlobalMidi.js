// Always-on Web MIDI listener — opens a MIDIAccess session once at
// mount (if the saved bindings map is non-empty) and dispatches CC →
// store actions globally. This lets users close the MIDI panel and
// still drive sliders from the hardware between sessions.
//
// We deliberately do NOT request access when there are no bindings —
// avoids the browser's permission prompt popping up on first load
// for users who don't own a MIDI controller.

import { useEffect } from 'react'
import { useStore } from '../store'
import { decodeMidiMessage, applyCC, loadMidiMap } from './midiMap'

export function useGlobalMidi() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.requestMIDIAccess) return
    const initial = loadMidiMap()
    if (Object.keys(initial).length === 0) return  // nothing to listen for
    let access = null
    let cancelled = false
    navigator.requestMIDIAccess({ sysex: false }).then(a => {
      if (cancelled) return
      access = a
      const onMessage = (event) => {
        const msg = decodeMidiMessage(event.data)
        if (!msg || msg.type !== 0xB0) return
        applyCC(loadMidiMap(), msg.data1, msg.data2, useStore.getState())
      }
      access.inputs.forEach(input => { input.onmidimessage = onMessage })
      access.onstatechange = () => {
        if (!access) return
        access.inputs.forEach(input => { input.onmidimessage = onMessage })
      }
    }).catch(() => { /* user denied — silent, panel will retry */ })
    return () => {
      cancelled = true
      if (access) access.inputs.forEach(input => { input.onmidimessage = null })
    }
  }, [])
}
