import { useEffect, useState } from 'react'

/** Touch-first phone / landscape-phone shell — keep in sync with App.tsx MOBILE_SHELL_MEDIA. */
export const MOBILE_SHELL_MEDIA =
  '(hover: none) and (pointer: coarse) and (max-width: 760px), (hover: none) and (pointer: coarse) and (max-height: 500px) and (max-width: 1100px)'

export function matchesMobileShellViewport(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(MOBILE_SHELL_MEDIA).matches
  )
}

export function useMobileShellViewport(): boolean {
  const [matches, setMatches] = useState(() => matchesMobileShellViewport())
  useEffect(() => {
    const media = window.matchMedia(MOBILE_SHELL_MEDIA)
    const sync = () => setMatches(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])
  return matches
}
