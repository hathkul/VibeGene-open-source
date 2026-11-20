import type { HistoryNode } from './types'

/** Present older flat VibeGene assembly histories without changing their saved data. */
export function gibsonHistoryForDisplay(node: HistoryNode): HistoryNode {
  const children = node.children.map(gibsonHistoryForDisplay)
  if (node.operation !== 'gibsonAssembly') return { ...node, children }
  return { ...node, children: children.map((child, index) => {
    const summary = node.inputSummaries[index]
    const part = summary?.assemblyPart
    if (!part || part.linearization.method === 'direct') return child
    if (!child.circular && child.seqLen === part.length &&
      ['amplifyFragment', 'restrictionDigest', 'flip'].includes(child.operation)) return child
    const preparation = part.linearization
    return {
      id: `vg-preparation:${node.id}:${index}`, name: `Fragment ${index + 1} (sequence unavailable)`,
      seqLen: part.length, circular: false, operation: preparation.method === 'pcr' ? 'amplifyFragment' : 'restrictionDigest',
      resurrectable: false, hideHistory: false,
      oligos: preparation.method === 'pcr' ? [preparation.forwardPrimer, preparation.reversePrimer] : [],
      polymerase: preparation.method === 'pcr' ? preparation.polymerase : undefined,
      regeneratedSites: [], inputSummaries: preparation.method === 'restriction' ? [summary] : [],
      features: [], children: [child],
    }
  }) }
}
