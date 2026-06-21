// useReducedMotion — resolves the user's override + the OS pref into
// a single boolean. Components subscribe to both store fields so the
// hook re-renders if either flips.
import { useStore } from '../store'
import { resolveReducedMotion } from './reducedMotion'

export function useReducedMotion() {
  const mode = useStore(s => s.reducedMotionMode)
  const os   = useStore(s => s.osPrefersReducedMotion)
  return resolveReducedMotion(mode, os)
}
