import { useEffect, useState } from 'react'

// Reactive viewport-width breakpoint helper. Defaults to desktop on the
// server-render path (window undefined) so SSR / dev never sees mobile.
export function useIsMobile(breakpoint = 720) {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth < breakpoint
  })
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < breakpoint)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [breakpoint])
  return isMobile
}
