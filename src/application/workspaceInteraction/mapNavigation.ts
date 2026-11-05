/** Return the next browse key for a multi-entry library map, wrapping at either end. */
export function nextLibraryMapBrowseIndex(currentIndex: number, delta: number, keyCount: number): number | null {
  if (keyCount < 2) return null
  return (currentIndex + delta + keyCount) % keyCount
}
