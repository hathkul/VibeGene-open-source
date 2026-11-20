import type {
  HistoryFeature,
  HistoryInputSummary,
  HistoryNode,
  HistoryRegeneratedSite,
  MoleculeType,
  SequenceRecord,
  StrandColors,
} from './types'
import { createId } from './sequence'
import { exportSnapGeneHistoryColorsXml } from './snapgeneStrandColors'
import { parseSnapGeneHistoryNodeTraces } from './snapgeneTraces'

function xmlEscape(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function historyNodeType(molecule: MoleculeType) {
  if (molecule === 'rna') return 'RNA'
  if (molecule === 'protein') return 'Protein'
  return 'DNA'
}

function historyFeaturesFromRecord(record: SequenceRecord): HistoryFeature[] {
  return record.features.map((feature) => ({
    name: feature.name,
    type: feature.type,
    color: feature.color,
    strand: feature.locations[0]?.strand ?? 'forward',
    segments: feature.locations.map((location) => ({ start: location.start, end: location.end })),
  }))
}

function exportHistoryFeaturesXml(features: HistoryFeature[]): string {
  if (!features.length) return ''
  const body = features
    .map((feature) => {
      const directionality = feature.strand === 'reverse' ? 2 : 1
      const segments = feature.segments
        .map((segment) => `<Segment range="${segment.start + 1}-${segment.end}" color="${xmlEscape(feature.color)}" type="standard"/>`)
        .join('')
      return `<Feature name="${xmlEscape(feature.name)}" type="${xmlEscape(feature.type)}" directionality="${directionality}">${segments}</Feature>`
    })
    .join('')
  return `<Features>${body}</Features>`
}

function exportInputSummaryXml(summary: HistoryInputSummary): string {
  const attrs = [
    `manipulation="${xmlEscape(summary.manipulation)}"`,
    summary.val1 !== undefined ? `val1="${xmlEscape(summary.val1)}"` : '',
    summary.val2 !== undefined ? `val2="${xmlEscape(summary.val2)}"` : '',
    summary.name1 !== undefined ? `name1="${xmlEscape(summary.name1)}"` : '',
    summary.name2 !== undefined ? `name2="${xmlEscape(summary.name2)}"` : '',
    summary.siteCount1 !== undefined ? `siteCount1="${xmlEscape(summary.siteCount1)}"` : '',
    summary.siteCount2 !== undefined ? `siteCount2="${xmlEscape(summary.siteCount2)}"` : '',
  ].filter(Boolean)
  return `<InputSummary ${attrs.join(' ')}/>`
}

function exportRegeneratedSiteXml(site: HistoryRegeneratedSite): string {
  const attrs = [
    `name="${xmlEscape(site.name)}"`,
    `pos="${site.pos}"`,
    `siteCount="${site.siteCount}"`,
  ]
  if (site.blunt) attrs.push('blunt="1"')
  return `<RegeneratedSite ${attrs.join(' ')}/>`
}

function exportHistoryNodeEndAttrs(node: HistoryNode): string[] {
  const attrs: string[] = []
  if (node.upstreamStickiness !== undefined) attrs.push(`upstreamStickiness="${node.upstreamStickiness}"`)
  if (node.downstreamStickiness !== undefined) attrs.push(`downstreamStickiness="${node.downstreamStickiness}"`)
  if (node.upstreamModification) attrs.push(`upstreamModification="${xmlEscape(node.upstreamModification)}"`)
  if (node.downstreamModification) attrs.push(`downstreamModification="${xmlEscape(node.downstreamModification)}"`)
  return attrs
}

function exportHistoryNodeOpenAttrs(node: HistoryNode, molecule: MoleculeType): string {
  const attrs = [
    `name="${xmlEscape(node.name)}"`,
    `type="${historyNodeType(molecule)}"`,
    `seqLen="${node.seqLen}"`,
    `strandedness="double"`,
    `ID="${xmlEscape(String(node.id))}"`,
    `circular="${node.circular ? '1' : '0'}"`,
    ...exportHistoryNodeEndAttrs(node),
  ]
  if (node.resurrectable) attrs.push('resurrectable="1"')
  attrs.push(`operation="${xmlEscape(node.operation)}"`)
  return attrs.join(' ')
}

function exportHistoryNodeInner(node: HistoryNode, molecule: MoleculeType): string {
  const inner: string[] = []
  if (node.polymerase) inner.push(`<Parameter name="polymerase" val="${xmlEscape(node.polymerase)}"/>`)
  for (const oligo of node.oligos) {
    const description = oligo.description ? ` description="${xmlEscape(oligo.description)}"` : ''
    inner.push(`<Oligo name="${xmlEscape(oligo.name)}" sequence="${xmlEscape(oligo.sequence)}"${description}/>`)
  }
  if (node.sgRnaCloning) {
    inner.push(`<Parameter name="vibegeneSgRnaCloning" val="${xmlEscape(JSON.stringify(node.sgRnaCloning))}"/>`)
  }
  if (node.inputSummaries.some((summary) => summary.assemblyPart)) {
    const parts = node.inputSummaries.map((summary) => summary.assemblyPart ?? null)
    inner.push(`<Parameter name="vibegeneAssemblyParts" val="${xmlEscape(JSON.stringify({ version: 1, parts }))}"/>`)
  }
  if (node.historyColors && (node.historyColors.topStrand.length > 0 || node.historyColors.bottomStrand.length > 0)) {
    inner.push(exportSnapGeneHistoryColorsXml(node.historyColors))
  }
  if (node.regeneratedSites.length > 0) {
    inner.push(...node.regeneratedSites.map(exportRegeneratedSiteXml))
  }
  if (node.inputSummaries.length > 0) {
    inner.push(...node.inputSummaries.map(exportInputSummaryXml))
  } else if (node.children.length > 0) {
    inner.push('<InputSummary/>')
  }
  if (node.features.length > 0) {
    inner.push(exportHistoryFeaturesXml(node.features))
  }
  for (const child of node.children) {
    inner.push(`<Node ${exportHistoryNodeOpenAttrs(child, molecule)}>${exportHistoryNodeInner(child, molecule)}</Node>`)
  }
  return inner.join('')
}

function exportHistoryNodeXml(node: HistoryNode, molecule: MoleculeType): string {
  return `<Node ${exportHistoryNodeOpenAttrs(node, molecule)}>${exportHistoryNodeInner(node, molecule)}</Node>`
}

export function exportSnapGeneHistoryTreeXml(root: HistoryNode, molecule: MoleculeType): string {
  return `<HistoryTree>${exportHistoryNodeXml(root, molecule)}</HistoryTree>`
}

function historyTreeTextFingerprint(text: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}:${text.length}`
}

export function snapGeneHistoryTreeFingerprint(record: SequenceRecord): string | undefined {
  // Fingerprint the editable history model itself, not current-document fields that
  // prepareExportHistory overlays on the root. Renaming or annotating the current
  // construct must not discard opaque source history XML.
  const root = record.history
  return root
    ? historyTreeTextFingerprint(exportSnapGeneHistoryTreeXml(root, record.molecule))
    : undefined
}

function cloneHistoryNode(node: HistoryNode, patch: Partial<HistoryNode> = {}): HistoryNode {
  const historyColors = patch.historyColors
    ? {
        ...patch.historyColors,
        topStrand: [...patch.historyColors.topStrand],
        bottomStrand: [...patch.historyColors.bottomStrand],
      }
    : node.historyColors
      ? {
          ...node.historyColors,
          topStrand: [...node.historyColors.topStrand],
          bottomStrand: [...node.historyColors.bottomStrand],
        }
      : undefined
  return {
    ...node,
    ...patch,
    oligos: [...node.oligos],
    regeneratedSites: [...node.regeneratedSites],
    inputSummaries: [...node.inputSummaries],
    features: patch.features ?? node.features.map((feature) => ({
      ...feature,
      segments: feature.segments.map((segment) => ({ ...segment })),
    })),
    historyColors,
    children: node.children.map((child) => cloneHistoryNode(child)),
  }
}

/** Shallow node copy that reuses child references (O(1) in tree depth). */
function wrapHistoryNode(node: HistoryNode, patch: Partial<HistoryNode> = {}): HistoryNode {
  const historyColors = patch.historyColors
    ? {
        ...patch.historyColors,
        topStrand: [...patch.historyColors.topStrand],
        bottomStrand: [...patch.historyColors.bottomStrand],
      }
    : node.historyColors
  return {
    ...node,
    ...patch,
    oligos: patch.oligos ?? node.oligos,
    regeneratedSites: patch.regeneratedSites ?? node.regeneratedSites,
    inputSummaries: patch.inputSummaries ?? node.inputSummaries,
    features: patch.features ?? node.features,
    historyColors,
    children: patch.children ?? node.children,
  }
}

function maxHistoryNodeId(node: HistoryNode): number {
  const self = Number(node.id)
  const base = Number.isFinite(self) ? self : 0
  return node.children.reduce((max, child) => Math.max(max, maxHistoryNodeId(child)), base)
}

function bootstrapHistoryNode(record: SequenceRecord, options?: { operation?: string; resurrectable?: boolean }): HistoryNode {
  return {
    id: '1',
    name: record.name,
    seqLen: record.sequence.length,
    circular: record.topology === 'circular',
    operation: options?.operation ?? 'invalid',
    resurrectable: options?.resurrectable ?? false,
    hideHistory: false,
    oligos: [],
    regeneratedSites: [],
    inputSummaries: [],
    features: historyFeaturesFromRecord(record),
    historyColors: withProductStrandColors(record.strandColors),
    children: [],
  }
}

function historyFileName(name: string) {
  return name.toLowerCase().endsWith('.dna') ? name : `${name}.dna`
}

/**
 * Embed a parent construct in a child history tree.
 *
 * Always refresh features / primers / sequence from the live record. Reusing
 * `record.history` alone is wrong for SnapGene imports: the history-root XML
 * often omits Features/Primers even though the document blocks have them.
 */
export function snapshotParentalHistoryNode(record: SequenceRecord): HistoryNode {
  const name = historyFileName(record.name)
  const features = historyFeaturesFromRecord(record)
  const primers = record.primers.length ? record.primers : record.history?.primers
  if (record.history) {
    // A new product owns its own history tree, so carry forward traces stored
    // in the source's opaque native ancestor packets before detaching it.
    const nativePackets = new Map(record.snapGeneNativeHistory?.nodePackets.map(packet => [packet.nodeId, packet.payload]))
    const hydrate = (node: HistoryNode): HistoryNode => {
      const payload = nativePackets.get(node.id)
      const traces = node.traceFiles ?? (payload ? parseSnapGeneHistoryNodeTraces(payload) : [])
      return { ...node, traceFiles: traces.length ? traces : undefined, children: node.children.map(hydrate) }
    }
    return wrapHistoryNode(hydrate(record.history), {
      resurrectable: true,
      editSession: undefined,
      name,
      seqLen: record.sequence.length,
      circular: record.topology === 'circular',
      features,
      sequence: record.sequence,
      primers,
      traceFiles: record.traceFiles?.map(trace => ({ ...trace })),
      historyColors: withProductStrandColors(record.strandColors) ?? record.history.historyColors,
    })
  }
  return {
    id: createId('history'),
    name,
    seqLen: record.sequence.length,
    circular: record.topology === 'circular',
    operation: 'invalid',
    resurrectable: true,
    hideHistory: false,
    oligos: [],
    regeneratedSites: [],
    inputSummaries: [],
    features,
    historyColors: withProductStrandColors(record.strandColors),
    sequence: record.sequence,
    primers: record.primers,
    traceFiles: record.traceFiles?.map(trace => ({ ...trace })),
    children: [],
  }
}

function withProductStrandColors(colors: StrandColors | undefined): StrandColors | undefined {
  if (!colors || (colors.topStrand.length === 0 && colors.bottomStrand.length === 0)) return undefined
  return { ...colors, type: colors.type ?? 'Product' }
}

function selectionInputSummary(selection: { start: number; end: number }, sequenceLength: number): HistoryInputSummary {
  if (selection.end === selection.start) {
    const pos = String(selection.start + 1)
    return { manipulation: 'select', val1: pos, val2: pos }
  }
  if (selection.end > selection.start) {
    return {
      manipulation: 'select',
      val1: String(selection.start + 1),
      val2: String(selection.end),
    }
  }
  if (sequenceLength <= 0) {
    return { manipulation: 'select', val1: '1', val2: '1' }
  }
  return {
    manipulation: 'select',
    val1: String(selection.start + 1),
    val2: String(selection.end),
  }
}

export function recordColorEditInHistory(
  history: HistoryNode | undefined,
  record: SequenceRecord,
  selection: { start: number; end: number },
): HistoryNode {
  const previous = history
    ? wrapHistoryNode(history, { resurrectable: true, editSession: undefined })
    : bootstrapHistoryNode(record, { operation: 'invalid', resurrectable: true })

  const nextId = maxHistoryNodeId(previous) + 1
  return {
    id: String(nextId),
    name: record.name,
    seqLen: record.sequence.length,
    circular: record.topology === 'circular',
    operation: 'replace',
    resurrectable: false,
    hideHistory: false,
    oligos: [],
    regeneratedSites: [],
    inputSummaries: [selectionInputSummary(selection, record.sequence.length)],
    features: historyFeaturesFromRecord(record),
    historyColors: withProductStrandColors(record.strandColors),
    children: [previous],
  }
}

export function recordDnaEndsEditInHistory(
  history: HistoryNode | undefined,
  before: SequenceRecord,
  after: SequenceRecord,
): HistoryNode {
  const previous = history
    ? wrapHistoryNode(history, {
        resurrectable: true,
        editSession: undefined,
        name: before.name,
        seqLen: before.sequence.length,
        circular: before.topology === 'circular',
        features: historyFeaturesFromRecord(before),
        historyColors: withProductStrandColors(before.strandColors),
        sequence: before.sequence,
      })
    : {
        ...bootstrapHistoryNode(before, { operation: 'invalid', resurrectable: true }),
        sequence: before.sequence,
      }

  const nextId = String(maxHistoryNodeId(previous) + 1)
  return {
    id: nextId,
    name: after.name,
    seqLen: after.sequence.length,
    circular: after.topology === 'circular',
    operation: 'editDNAEnds',
    resurrectable: false,
    hideHistory: false,
    oligos: [],
    regeneratedSites: [],
    inputSummaries: [{ manipulation: 'edit' }],
    features: historyFeaturesFromRecord(after),
    historyColors: withProductStrandColors(after.strandColors),
    sequence: after.sequence,
    children: [previous],
  }
}

export type SequenceEditReplacement = {
  start: number
  end: number
  insertedLength: number
}

export type SequenceEditKind = 'insert' | 'remove' | 'replace'

export function classifySequenceEdit(replacement: SequenceEditReplacement): SequenceEditKind {
  const deletedLength = Math.max(0, replacement.end - replacement.start)
  if (deletedLength === 0 && replacement.insertedLength > 0) return 'insert'
  if (deletedLength > 0 && replacement.insertedLength === 0) return 'remove'
  return 'replace'
}

/** Net replacement transforming `before` into `after` (shared prefix/suffix trimmed). */
export function netSequenceReplacement(before: string, after: string): SequenceEditReplacement {
  let start = 0
  const minLen = Math.min(before.length, after.length)
  while (start < minLen && before[start] === after[start]) start += 1
  let endBefore = before.length
  let endAfter = after.length
  while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) {
    endBefore -= 1
    endAfter -= 1
  }
  return { start, end: endBefore, insertedLength: endAfter - start }
}

function sequenceEditInputSummaries(
  kind: SequenceEditKind,
  replacement: SequenceEditReplacement,
): HistoryInputSummary[] {
  const { start, end } = replacement
  switch (kind) {
    case 'insert':
      return [{ manipulation: 'insertAt', val1: String(start) }]
    case 'remove':
      return [{ manipulation: 'remove', val1: String(start), val2: String(end) }]
    case 'replace':
      return [
        {
          manipulation: 'replace',
          // HistoryTreePane renders replace ranges as `${val2}–${val1}` (1-based).
          val1: String(end),
          val2: String(start + 1),
        },
      ]
  }
}

function sequenceEditSummary(kind: SequenceEditKind, replacement: SequenceEditReplacement): string {
  const deletedLength = Math.max(0, replacement.end - replacement.start)
  switch (kind) {
    case 'insert':
      return `Inserted ${replacement.insertedLength} bp at ${replacement.start + 1}`
    case 'remove':
      return deletedLength === 1
        ? `Deleted 1 bp at ${replacement.start + 1}`
        : `Deleted ${deletedLength} bp (${replacement.start + 1}..${replacement.end})`
    case 'replace':
      return `Replaced ${deletedLength} bp with ${replacement.insertedLength} bp at ${replacement.start + 1}`
  }
}

function isOpenSequenceEditSession(node: HistoryNode | undefined): node is HistoryNode {
  return Boolean(node?.editSession && node.children.length === 1 && typeof node.children[0]?.sequence === 'string')
}

function sequenceEditRootFromSnapshot(
  snapshot: HistoryNode,
  after: SequenceRecord,
  replacement: SequenceEditReplacement,
  id: string,
): HistoryNode {
  const kind = classifySequenceEdit(replacement)
  return {
    id,
    name: after.name,
    seqLen: after.sequence.length,
    circular: after.topology === 'circular',
    operation: kind,
    resurrectable: false,
    hideHistory: false,
    editSession: true,
    oligos: [],
    regeneratedSites: [],
    inputSummaries: sequenceEditInputSummaries(kind, replacement),
    features: historyFeaturesFromRecord(after),
    historyColors: withProductStrandColors(after.strandColors),
    children: [snapshot],
  }
}

/**
 * Record a manual sequence edit in history.
 *
 * Consecutive DNA edits coalesce into a single session: one pre-edit snapshot
 * child plus a root that tracks the current state. This avoids deep-cloning the
 * ancestry tree on every keystroke.
 */
export function recordSequenceEditInHistory(
  history: HistoryNode | undefined,
  before: SequenceRecord,
  after: SequenceRecord,
  _replacement: SequenceEditReplacement,
): HistoryNode {
  void _replacement
  if (isOpenSequenceEditSession(history)) {
    const snapshot = history.children[0]!
    const snapshotSequence = snapshot.sequence!
    if (after.sequence === snapshotSequence) {
      // Edits cancelled out — drop the session and restore the pre-edit root.
      return wrapHistoryNode(snapshot, {
        resurrectable: false,
        editSession: undefined,
        name: after.name,
        seqLen: after.sequence.length,
        circular: after.topology === 'circular',
        features: historyFeaturesFromRecord(after),
        historyColors: withProductStrandColors(after.strandColors),
      })
    }
    const net = netSequenceReplacement(snapshotSequence, after.sequence)
    return sequenceEditRootFromSnapshot(snapshot, after, net, history.id)
  }

  const snapshot = history
    ? wrapHistoryNode(history, {
        resurrectable: true,
        editSession: undefined,
        name: before.name,
        seqLen: before.sequence.length,
        circular: before.topology === 'circular',
        features: historyFeaturesFromRecord(before),
        historyColors: withProductStrandColors(before.strandColors),
        sequence: before.sequence,
      })
    : {
        ...bootstrapHistoryNode(before, { operation: 'invalid', resurrectable: true }),
        sequence: before.sequence,
      }

  const net = netSequenceReplacement(before.sequence, after.sequence)
  const nextId = String(maxHistoryNodeId(snapshot) + 1)
  return sequenceEditRootFromSnapshot(snapshot, after, net, nextId)
}

export function sequenceEditOperationMeta(replacement: SequenceEditReplacement): {
  type: SequenceEditKind
  summary: string
} {
  const kind = classifySequenceEdit(replacement)
  return { type: kind, summary: sequenceEditSummary(kind, replacement) }
}

/** Replace the latest sequence-edit operation in-place when coalescing; otherwise prepend. */
export function upsertSequenceEditOperation(
  record: SequenceRecord,
  type: string,
  summary: string,
): SequenceRecord {
  const head = record.operations[0]
  if (head && (head.type === 'insert' || head.type === 'remove' || head.type === 'replace')) {
    return {
      ...record,
      operations: [{ ...head, type, summary, createdAt: record.updatedAt }, ...record.operations.slice(1)],
    }
  }
  return {
    ...record,
    operations: [{ id: createId('op'), type, summary, createdAt: record.updatedAt }, ...record.operations],
  }
}

/** Drop a coalesced sequence-edit operation when the edit session cancelled out. */
export function clearSequenceEditOperation(record: SequenceRecord): SequenceRecord {
  const head = record.operations[0]
  if (head && (head.type === 'insert' || head.type === 'remove' || head.type === 'replace')) {
    return { ...record, operations: record.operations.slice(1) }
  }
  return record
}

export function prepareExportHistory(record: SequenceRecord): HistoryNode | undefined {
  const root = record.history
    ? cloneHistoryNode(record.history, {
        name: record.name,
        seqLen: record.sequence.length,
        circular: record.topology === 'circular',
        features: historyFeaturesFromRecord(record),
        historyColors: withProductStrandColors(record.strandColors),
      })
    : record.strandColors && (record.strandColors.topStrand.length > 0 || record.strandColors.bottomStrand.length > 0)
      ? bootstrapHistoryNode(record, { operation: 'invalid' })
      : record.operations.some((operation) => operation.type !== 'import')
        ? bootstrapHistoryNode(record, { operation: 'invalid' })
        : undefined

  return root
}

/**
 * SnapGene links HistoryTree nodes to binary 0x0b snapshot packets with uint32 IDs.
 * Vibegene-created histories use string IDs, so assign export-only numeric IDs while
 * leaving already-valid native IDs untouched (and therefore compatible with opaque
 * packets retained from an imported SnapGene document).
 */
export function normalizeSnapGeneHistoryNodeIds(root: HistoryNode): HistoryNode {
  const cloned = cloneHistoryNode(root)
  const reserved = new Set<number>()
  const collect = (node: HistoryNode) => {
    const id = Number(node.id)
    if (/^\d+$/.test(node.id) && Number.isSafeInteger(id) && id > 0 && id <= 0xffffffff) {
      reserved.add(id)
    }
    node.children.forEach(collect)
  }
  collect(cloned)

  const seen = new Set<number>()
  let nextId = 1
  const allocate = () => {
    while (reserved.has(nextId) || seen.has(nextId)) nextId += 1
    const id = nextId
    seen.add(id)
    nextId += 1
    return id
  }
  const normalize = (node: HistoryNode) => {
    const parsed = Number(node.id)
    const valid = /^\d+$/.test(node.id)
      && Number.isSafeInteger(parsed)
      && parsed > 0
      && parsed <= 0xffffffff
      && !seen.has(parsed)
    const id = valid ? parsed : allocate()
    seen.add(id)
    node.id = String(id)
    node.children.forEach(normalize)
  }
  normalize(cloned)
  return cloned
}
