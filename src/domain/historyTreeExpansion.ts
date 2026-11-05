import type { HistoryNode } from './types'

export const DEFAULT_VISIBLE_HISTORY_GENERATIONS = 5

/**
 * Build collapsed frontiers for the initial history view. The current construct
 * is depth 0, so a limit of five keeps five parent generations visible beneath it.
 * Deeper non-leaf nodes stay in the set so incremental expansion remains bounded.
 */
export function initialCollapsedHistoryIds(
  root: HistoryNode,
  visibleGenerations = DEFAULT_VISIBLE_HISTORY_GENERATIONS,
): Set<string> {
  const collapsed = new Set<string>()
  const limit = Number.isFinite(visibleGenerations)
    ? Math.max(0, Math.floor(visibleGenerations))
    : DEFAULT_VISIBLE_HISTORY_GENERATIONS
  const visit = (node: HistoryNode, depth: number) => {
    if (node.children.length && (node.hideHistory || depth >= limit)) {
      collapsed.add(node.id)
    }
    node.children.forEach((child) => visit(child, depth + 1))
  }
  visit(root, 0)
  return collapsed
}

/** Reveal a fixed number of generations below every currently visible collapsed frontier. */
export function expandNextHistoryGenerations(
  root: HistoryNode,
  collapsedIds: ReadonlySet<string>,
  generations: number,
): Set<string> {
  const next = new Set(collapsedIds)
  const depth = Number.isFinite(generations) ? Math.max(1, Math.floor(generations)) : 1

  const reveal = (node: HistoryNode, remaining: number) => {
    next.delete(node.id)
    for (const child of node.children) {
      if (!child.children.length) continue
      if (remaining > 1) reveal(child, remaining - 1)
      else next.add(child.id)
    }
  }
  const visitVisible = (node: HistoryNode) => {
    if (next.has(node.id)) {
      reveal(node, depth)
      return
    }
    node.children.forEach(visitVisible)
  }
  visitVisible(root)
  return next
}
