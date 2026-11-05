const SIDE_MARGIN_PX = 200
const MIN_TRACK_PX = 1000
const NARROW_MARGIN_FRACTION = 0.2

/**
 * Zoomed linear track geometry. Prefer 200px margins; narrow viewports use
 * 20% margins and a 1000px track so scrolling preserves room around the map.
 */
export function computeZoomTrackLayout(viewportWidth: number) {
  const vw = Math.max(320, Math.round(viewportWidth))
  const trackIfFixedMargin = vw - 2 * SIDE_MARGIN_PX
  if (trackIfFixedMargin >= MIN_TRACK_PX) {
    return {
      mapWidth: vw,
      trackLeft: SIDE_MARGIN_PX,
      trackRight: vw - SIDE_MARGIN_PX,
      sidePadding: SIDE_MARGIN_PX,
    }
  }
  const sidePadding = Math.max(1, Math.round(vw * NARROW_MARGIN_FRACTION))
  const trackSpan = MIN_TRACK_PX
  const mapWidth = trackSpan + sidePadding * 2
  return {
    mapWidth,
    trackLeft: sidePadding,
    trackRight: sidePadding + trackSpan,
    sidePadding,
  }
}
