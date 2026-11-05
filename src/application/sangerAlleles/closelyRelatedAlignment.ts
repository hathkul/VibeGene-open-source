import type { TraceAlignmentColumn, TraceTemplateAlignment } from '../../domain/traceTypes'

// Allele products are derived from the same forward reference. Align their shared
// flanks directly, and limit dynamic programming to the changed middle. For large
// divergent middles, let the general-purpose aligner handle the sequence instead.
const MAX_MIDDLE_CELLS = 65_536
const basesMatch = (a: string, b: string) => a === b || a === 'N' || b === 'N'

export function alignCloselyRelatedAlleles(trace: string, template: string): TraceTemplateAlignment | null {
  if (!trace.length || !template.length) return null
  let prefix = 0
  while (prefix < trace.length && prefix < template.length && trace[prefix] === template[prefix]) prefix++
  let suffix = 0
  while (suffix < trace.length - prefix && suffix < template.length - prefix && trace[trace.length - 1 - suffix] === template[template.length - 1 - suffix]) suffix++
  const traceMiddle = trace.length - prefix - suffix
  const templateMiddle = template.length - prefix - suffix
  if (traceMiddle * templateMiddle > MAX_MIDDLE_CELLS) return null

  const columns: TraceAlignmentColumn[] = []
  for (let i = 0; i < prefix; i++) columns.push({ kind: 'match', traceIndex: i, templateIndex: i, match: true })

  if (!traceMiddle) {
    for (let j = 0; j < templateMiddle; j++) columns.push({ kind: 'templateGap', templateIndex: prefix + j, traceIndex: -1 })
  } else if (!templateMiddle) {
    for (let i = 0; i < traceMiddle; i++) columns.push({ kind: 'traceInsert', traceIndex: prefix + i })
  } else {
    // Global edit distance on the bounded changed region; exact flanks stay fixed.
    const width = templateMiddle + 1
    const costs = new Uint32Array((traceMiddle + 1) * width)
    for (let i = 0; i <= traceMiddle; i++) costs[i * width] = i
    for (let j = 0; j <= templateMiddle; j++) costs[j] = j
    for (let i = 1; i <= traceMiddle; i++) {
      for (let j = 1; j <= templateMiddle; j++) {
        const match = basesMatch(trace[prefix + i - 1]!, template[prefix + j - 1]!)
        costs[i * width + j] = Math.min(costs[(i - 1) * width + j - 1]! + (match ? 0 : 1), costs[(i - 1) * width + j]! + 1, costs[i * width + j - 1]! + 1)
      }
    }
    const middle: TraceAlignmentColumn[] = []
    let i = traceMiddle, j = templateMiddle
    while (i || j) {
      const current = costs[i * width + j]!
      const equal = i > 0 && j > 0 && basesMatch(trace[prefix + i - 1]!, template[prefix + j - 1]!)
      if (i && j && current === costs[(i - 1) * width + j - 1]! + (equal ? 0 : 1)) {
        middle.push({ kind: 'match', traceIndex: prefix + i - 1, templateIndex: prefix + j - 1, match: equal })
        i--; j--
      } else if (i && current === costs[(i - 1) * width + j]! + 1) {
        middle.push({ kind: 'traceInsert', traceIndex: prefix + --i })
      } else {
        middle.push({ kind: 'templateGap', templateIndex: prefix + --j, traceIndex: -1 })
      }
    }
    for (const column of middle.reverse()) columns.push(column)
  }
  for (let k = 0; k < suffix; k++) columns.push({ kind: 'match', traceIndex: trace.length - suffix + k, templateIndex: template.length - suffix + k, match: true })

  let mismatchCount = 0, gapCount = 0, score = 0
  let gapKind: TraceAlignmentColumn['kind'] | null = null
  for (const column of columns) {
    if (column.kind === 'match') {
      if (!column.match) mismatchCount++
      score += column.match ? 2 : -3
      gapKind = null
    } else {
      gapCount++
      score -= gapKind === column.kind ? 2 : 5
      gapKind = column.kind
    }
  }
  return { templateStart: 0, templateEnd: template.length, traceStart: 0, traceEnd: trace.length, mismatchCount, gapCount, orientation: 'forward', alignmentScore: score, columns }
}
