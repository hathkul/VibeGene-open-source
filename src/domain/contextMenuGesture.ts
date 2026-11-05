/**
 * Context-menu gesture detection shared by sequence interaction surfaces.
 *
 * Opening a context menu must not change the current selection. Windows and
 * Linux report the secondary press directly through `button`, while macOS
 * reports Ctrl+Click as an ordinary primary-button press with the Ctrl
 * modifier held. Treating either as a selection gesture would replace the
 * range the user just dragged with the single item under the pointer.
 */

export type PointerGestureLike = {
  button: number
  ctrlKey: boolean
}

/** True on macOS and iOS, where Ctrl+Click is the context-menu gesture. */
export function isMacLikePlatform(platform?: string, userAgent?: string): boolean {
  const platformText = platform ?? (typeof navigator === 'undefined' ? '' : navigator.platform)
  const userAgentText = userAgent ?? (typeof navigator === 'undefined' ? '' : navigator.userAgent)
  return /Mac|iPhone|iPad|iPod/i.test(platformText) || /Mac OS X/i.test(userAgentText)
}

/**
 * True when a pointer press opens a context menu instead of starting a
 * selection gesture. Only a primary press without the macOS context-menu
 * modifier may start a selection.
 */
export function isContextMenuGesture(
  gesture: PointerGestureLike,
  platform?: string,
  userAgent?: string,
): boolean {
  if (gesture.button !== 0) return true
  return gesture.ctrlKey && isMacLikePlatform(platform, userAgent)
}
