/** Keys used by library Sequence browse (optional consensus + enabled members). */
export function libraryBrowseNavKeys(
  memberIds: readonly string[],
  options?: { includeConsensus?: boolean },
): Array<string | null> {
  const includeConsensus = options?.includeConsensus !== false
  return includeConsensus ? [null, ...memberIds] : [...memberIds]
}

/**
 * Pick the library block that owns the upper viewport anchor.
 * `null` means consensus (`data-library-key="consensus"`).
 */
export function libraryBrowseViewportKey(
  stack: HTMLElement,
  options?: { anchorRatio?: number; anchorMaxPx?: number },
): string | null {
  const hostRect = stack.getBoundingClientRect()
  if (hostRect.height <= 0) return null
  const anchorRatio = options?.anchorRatio ?? 0.22
  const anchorMaxPx = options?.anchorMaxPx ?? 96
  const anchorY = hostRect.top + Math.min(hostRect.height * anchorRatio, anchorMaxPx)

  let bestKey: string | null = null
  let bestScore = -Infinity

  for (const block of stack.querySelectorAll<HTMLElement>('[data-library-key]')) {
    const key = block.dataset.libraryKey
    if (!key) continue
    const rect = block.getBoundingClientRect()
    const visibleTop = Math.max(hostRect.top, rect.top)
    const visibleBottom = Math.min(hostRect.bottom, rect.bottom)
    const visibleHeight = visibleBottom - visibleTop
    if (visibleHeight <= 0) continue

    // Prefer the block that contains the anchor; otherwise the most visible one.
    let score = visibleHeight
    if (rect.top <= anchorY && rect.bottom >= anchorY) {
      score += hostRect.height * 10
    }
    if (score > bestScore) {
      bestScore = score
      bestKey = key === 'consensus' ? null : key
    }
  }

  return bestKey
}

/** Member blocks close enough to the scroll viewport to prepare their SequenceRows. */
export function libraryBrowseNearViewportKeys(
  stack: HTMLElement,
  overscanPx: number,
): string[] {
  const host = stack.getBoundingClientRect()
  if (host.height <= 0) return []
  const margin = Math.max(0, overscanPx)
  const keys: string[] = []
  for (const block of stack.querySelectorAll<HTMLElement>('[data-library-key]')) {
    const key = block.dataset.libraryKey
    if (!key || key === 'consensus') continue
    const rect = block.getBoundingClientRect()
    if (rect.bottom >= host.top - margin && rect.top <= host.bottom + margin) keys.push(key)
  }
  return keys
}

/** Approximate the unmounted rows so navigation can still scroll to distant members. */
export function estimateLibraryMemberPlaceholderHeight(sequenceLength: number): number {
  return Math.max(320, Math.ceil(Math.max(0, sequenceLength) / 80) * 160)
}

export function stepLibraryBrowseNavKey(
  keys: readonly (string | null)[],
  current: string | null,
  delta: number,
): string | null {
  if (keys.length === 0) return null
  const index = Math.max(0, keys.findIndex((key) => key === current))
  const nextIndex = (index + delta + keys.length) % keys.length
  return keys[nextIndex] ?? null
}
