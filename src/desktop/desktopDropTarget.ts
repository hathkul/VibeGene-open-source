/** Whether a Tauri OS file-drop position lands inside an element (CSS pixels). */
export function desktopDropHitsElement(
  element: Element | null,
  position?: { x: number; y: number },
): boolean {
  if (!element) return false
  if (!position) return true
  const rect = element.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  const x = position.x / dpr
  const y = position.y / dpr
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
}
