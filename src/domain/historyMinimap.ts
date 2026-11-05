export type HistoryMinimapNavigationInput = {
  pointerX: number
  pointerY: number
  contentOffsetX: number
  contentOffsetY: number
  scale: number
  dragOffsetX: number
  dragOffsetY: number
  contentWidth: number
  contentHeight: number
  viewportWidth: number
  viewportHeight: number
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value))
}

/** Convert a minimap drag point into clamped history-pane scroll coordinates. */
export function historyMinimapScrollPosition(input: HistoryMinimapNavigationInput) {
  const scale = input.scale > 0 ? input.scale : 1
  const contentX = (input.pointerX - input.contentOffsetX) / scale
  const contentY = (input.pointerY - input.contentOffsetY) / scale
  return {
    left: clamp(
      contentX - input.dragOffsetX,
      0,
      Math.max(0, input.contentWidth - input.viewportWidth),
    ),
    top: clamp(
      contentY - input.dragOffsetY,
      0,
      Math.max(0, input.contentHeight - input.viewportHeight),
    ),
  }
}
