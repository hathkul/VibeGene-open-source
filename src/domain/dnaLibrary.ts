import { parseAlignmentTraceFiles } from './alignmentTraceImport'
import { defaultConstructProperties } from './constructProperties'
import { defaultDnaEnds } from './dnaEnds'
import { flipFeature, flipPrimer, flipRecord } from './flipRecord'
import { adjustMemberFeaturesForReplacement } from './libraryMemberFeatures'
import { projectFileStem } from './projectSaveSemantics'
import { createId, normalizeDna, nowIso, reverseComplement, sanitizeDna } from './sequence'
import { emptyChromatogramForSequence, traceRecordFromSequence } from './sequenceTraceFactory'
import { alignTraceToTemplate } from './traceAlignment'
import { realignTraceFileRecords, realignTraceFileRecordsAsync, type AlignPendingTraces } from './traceFileWorkflow'
import type { ChromatogramData, LibraryMemberRead, TraceFileRecord, TraceTemplateAlignment } from './traceTypes'
import type { DnaDocumentData, Primer, SequenceFeature, SequenceRecord } from './types'

const DNA_BASES = ['A', 'C', 'G', 'T'] as const

/** Default construct name when a multi-member library is created without an explicit name. */
export const DEFAULT_DNA_LIBRARY_NAME = 'Untitled library'

export function isDnaLibraryRecord(record: Pick<SequenceRecord, 'molecule' | 'dna'>): boolean {
  return record.molecule === 'dna' && record.dna?.documentRole === 'library'
}

export function isDefaultDnaLibraryName(name: string): boolean {
  return name.trim() === DEFAULT_DNA_LIBRARY_NAME
}

/**
 * If a DNA library still has the stub construct name, adopt the stem of the
 * chosen save file name so Description / title match the Database file.
 * Leaves a user-edited construct name unchanged.
 */
export function applySaveFileNameToStubLibraryName<
  T extends Pick<SequenceRecord, 'name' | 'molecule' | 'dna'>,
>(record: T, preferredFileName: string | null | undefined): T {
  if (!isDnaLibraryRecord(record) || !isDefaultDnaLibraryName(record.name)) return record
  const raw = preferredFileName?.trim()
  if (!raw) return record
  const stem = projectFileStem(raw)
  if (!stem || isDefaultDnaLibraryName(stem)) return record
  return { ...record, name: stem }
}

export function withDnaLibraryRole(dna: DnaDocumentData | undefined): DnaDocumentData {
  return {
    ...(dna ?? {}),
    documentRole: 'library',
  }
}

/** Remove library document role and per-member attachment packs. */
export function stripDnaLibraryFields(dna: DnaDocumentData | undefined): DnaDocumentData | undefined {
  if (!dna) return undefined
  const next: DnaDocumentData = { ...dna }
  delete next.documentRole
  delete next.libraryReferenceMemberId
  delete next.libraryConsensusEnabled
  delete next.libraryMemberFeatures
  delete next.libraryMemberPrimers
  delete next.libraryMemberHistory
  delete next.libraryMemberReads
  return Object.keys(next).length ? next : undefined
}

function cloneFeatures(features: readonly SequenceFeature[] | undefined): SequenceFeature[] {
  return (features ?? []).map((feature) => ({
    ...feature,
    locations: feature.locations.map((location) => ({ ...location })),
  }))
}

function clonePrimers(primers: readonly Primer[] | undefined): Primer[] {
  return (primers ?? []).map((primer) => ({
    ...primer,
    bindings: primer.bindings?.map((binding) => ({
      ...binding,
      components: binding.components.map((component) => ({ ...component })),
    })),
  }))
}

/** Pick the longest successfully parsed member as the initial consensus seed. */
export function pickLibraryConsensusSeed(members: readonly TraceFileRecord[]): TraceFileRecord | null {
  const valid = members.filter((member) => !member.parseError && member.sequence.length > 0)
  if (!valid.length) return null
  return valid.toSorted(
    (a, b) => b.sequence.length - a.sequence.length || a.fileName.localeCompare(b.fileName),
  )[0]!
}

function alignMemberToConsensus(
  member: TraceFileRecord,
  consensus: string,
  topology: 'linear' | 'circular' = 'linear',
): TraceFileRecord {
  if (member.parseError || !member.sequence.length) {
    return { ...member, alignment: null }
  }
  try {
    const alignment = alignTraceToTemplate(member.sequence, consensus, { topology })
    if (!alignment) {
      return { ...member, alignment: null, parseError: 'No alignment to consensus found' }
    }
    return { ...member, alignment, parseError: undefined }
  } catch {
    return { ...member, alignment: null, parseError: 'Alignment failed (sequence may be too long)' }
  }
}

/**
 * Majority-vote consensus from members already aligned to `reference`.
 * Only match columns contribute; ties keep the current reference base (or N).
 */
export function buildMajorityConsensusFromAlignments(
  reference: string,
  members: readonly TraceFileRecord[],
): string {
  if (!reference.length) return ''
  const votes: Array<Record<string, number>> = Array.from({ length: reference.length }, () => ({}))
  for (const member of members) {
    if (!member.enabled || member.parseError || !member.alignment) continue
    const { alignment } = member
    for (const column of alignment.columns) {
      if (column.kind !== 'match') continue
      const raw = member.sequence[column.traceIndex]
      if (!raw) continue
      let base = raw.toUpperCase()
      if (alignment.orientation === 'reverse') {
        base = reverseComplement(base)
      }
      if (!DNA_BASES.includes(base as (typeof DNA_BASES)[number]) && base !== 'N') continue
      const bucket = votes[column.templateIndex]
      if (!bucket) continue
      bucket[base] = (bucket[base] ?? 0) + 1
    }
  }

  let consensus = ''
  for (let index = 0; index < reference.length; index += 1) {
    const bucket = votes[index] ?? {}
    let bestBase = reference[index]?.toUpperCase() || 'N'
    let bestCount = -1
    for (const base of Object.keys(bucket)) {
      const count = bucket[base] ?? 0
      if (count > bestCount || (count === bestCount && base < bestBase)) {
        bestBase = base
        bestCount = count
      }
    }
    consensus += bestBase
  }
  return consensus
}

export function rebuildDnaLibraryConsensus(
  currentConsensus: string,
  members: readonly TraceFileRecord[],
  topology: 'linear' | 'circular' = 'linear',
): { consensus: string; members: TraceFileRecord[] } {
  // Re-seed from remaining members. Majority vote alone cannot grow or escape a
  // poisoned/truncated consensus — alignments only cover the current reference.
  const enabled = members.filter(
    (member) => member.enabled && !member.parseError && member.sequence.length > 0,
  )
  const seed = pickLibraryConsensusSeed(enabled)
  if (!seed) {
    const cleared = members.map((member) =>
      member.enabled
        ? { ...member, alignment: null, parseError: member.parseError ?? 'No sequence found' }
        : member,
    )
    return { consensus: currentConsensus, members: cleared }
  }

  const seeded = seed.sequence.toUpperCase()
  const alignedToSeed = members.map((member) => {
    if (!member.enabled) return { ...member, alignment: null }
    return alignMemberToConsensus(member, seeded, topology)
  })
  const polished = buildMajorityConsensusFromAlignments(seeded, alignedToSeed)
  const consensus = polished || seeded
  // The first pass already produced final coordinates when voting did not
  // change the seed. Only a changed reference can require another alignment.
  const nextMembers = consensus === seeded
    ? alignedToSeed
    : alignedToSeed.map((member) => member.enabled
      ? realignTraceFileRecords([member], consensus, { force: true, topology })[0]!
      : member)
  return { consensus, members: nextMembers }
}

/** Worker-backed rebuild for the interactive library action. */
export async function rebuildDnaLibraryConsensusAsync(
  currentConsensus: string,
  members: readonly TraceFileRecord[],
  topology: 'linear' | 'circular' = 'linear',
  signal?: AbortSignal,
  onProgress?: (phase: 'seed' | 'polished', completed: number, total: number) => void,
  alignPending?: AlignPendingTraces,
): Promise<{ consensus: string; members: TraceFileRecord[] }> {
  // Keep cancellation consistent even when there is no usable seed and the
  // synchronous fallback would otherwise return before consulting the signal.
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  const enabled = members.filter(
    (member) => member.enabled && !member.parseError && member.sequence.length > 0,
  )
  const seed = pickLibraryConsensusSeed(enabled)
  if (!seed) return rebuildDnaLibraryConsensus(currentConsensus, members, topology)

  const seeded = seed.sequence.toUpperCase()
  const alignedEnabled = await realignTraceFileRecordsAsync(enabled, seeded, {
    force: true,
    topology,
    signal,
    alignPending,
    onProgress: (completed, total) => onProgress?.('seed', completed, total),
  })
  let alignedIndex = 0
  const alignedToSeed = members.map((member) =>
    member.enabled && !member.parseError && member.sequence.length
      ? alignedEnabled[alignedIndex++]!
      : { ...member, alignment: null },
  )
  const polished = buildMajorityConsensusFromAlignments(seeded, alignedToSeed)
  const consensus = polished || seeded
  if (consensus === seeded) return { consensus, members: alignedToSeed }

  const changedEnabled = await realignTraceFileRecordsAsync(alignedEnabled, consensus, {
    force: true,
    topology,
    signal,
    alignPending,
    onProgress: (completed, total) => onProgress?.('polished', completed, total),
  })
  let changedIndex = 0
  return {
    consensus,
    members: alignedToSeed.map((member) =>
      member.enabled && !member.parseError && member.sequence.length
        ? changedEnabled[changedIndex++]!
        : member),
  }
}

/** Reverse-complement chromatogram peak traces and base calls (A↔T, G↔C, reverse order). */
export function reverseComplementChromatogram(chromatogram: ChromatogramData): ChromatogramData {
  const sampleCount = Math.max(
    chromatogram.aTrace.length,
    chromatogram.tTrace.length,
    chromatogram.gTrace.length,
    chromatogram.cTrace.length,
  )
  const reverseSamples = (values: number[]) => (values.length ? values.slice().reverse() : values.slice())
  const baseCalls = chromatogram.baseCalls.length
    ? reverseComplement(chromatogram.baseCalls.join('')).split('')
    : []
  const basePos = chromatogram.basePos.length && sampleCount > 0
    ? chromatogram.basePos.map((pos) => sampleCount - 1 - pos).reverse()
    : chromatogram.basePos.slice()
  return {
    aTrace: reverseSamples(chromatogram.tTrace),
    tTrace: reverseSamples(chromatogram.aTrace),
    gTrace: reverseSamples(chromatogram.cTrace),
    cTrace: reverseSamples(chromatogram.gTrace),
    basePos,
    baseCalls,
    ...(chromatogram.qualNums?.length ? { qualNums: chromatogram.qualNums.slice().reverse() } : {}),
  }
}

function reverseComplementLibraryRead(read: LibraryMemberRead): LibraryMemberRead {
  const sequence = reverseComplement(normalizeDna(read.sequence))
  return {
    ...read,
    sequence,
    chromatogram: reverseComplementChromatogram(read.chromatogram),
    alignment: null,
    parseError: sequence.length ? read.parseError : (read.parseError ?? 'No sequence found'),
  }
}

function reverseComplementLibraryMember(member: TraceFileRecord): TraceFileRecord {
  const length = member.sequence.length
  const sequence = reverseComplement(normalizeDna(member.sequence))
  const features = member.features?.map((feature: SequenceFeature) => flipFeature(feature, length))
  const primers = member.primers?.map((primer) => flipPrimer(primer, length))
  const reads = member.reads?.map(reverseComplementLibraryRead)
  return {
    ...member,
    sequence,
    chromatogram: reverseComplementChromatogram(member.chromatogram),
    features,
    primers,
    reads,
    alignment: null,
    parseError: sequence.length ? undefined : (member.parseError ?? 'No sequence found'),
  }
}

function realignNestedReadsToMember(
  member: TraceFileRecord,
  topology: 'linear' | 'circular',
): TraceFileRecord {
  if (!member.reads?.length) return member
  return {
    ...member,
    reads: member.reads.map((read) => {
      if (!read.enabled || read.parseError || !normalizeDna(read.sequence).length) {
        return { ...read, alignment: null }
      }
      try {
        const alignment = alignTraceToTemplate(read.sequence, member.sequence, { topology })
        return {
          ...read,
          alignment,
          parseError: alignment ? undefined : 'No alignment to member sequence',
        }
      } catch {
        return { ...read, alignment: null, parseError: 'Alignment failed' }
      }
    }),
  }
}

/**
 * Reverse-complement one library member (sequence, features, primers, reads) and
 * realign it to the current consensus. Nested reads are realigned to the flipped member.
 */
export function flipLibraryMember(
  member: TraceFileRecord,
  consensusSequence: string,
  topology: 'linear' | 'circular' = 'linear',
): TraceFileRecord {
  const flipped = reverseComplementLibraryMember(member)
  const withReads = realignNestedReadsToMember(flipped, topology)
  return alignMemberToConsensus(withReads, consensusSequence, topology)
}

/**
 * Reverse-complement the library consensus and every member (including nested reads),
 * then realign members to the flipped consensus. Use when the library was seeded
 * on the reverse strand.
 */
export function flipDnaLibrary(
  record: SequenceRecord,
  members: readonly TraceFileRecord[],
  topology: 'linear' | 'circular' = 'linear',
): { record: SequenceRecord; members: TraceFileRecord[] } {
  if (!isDnaLibraryRecord(record)) {
    throw new Error('Not a DNA library.')
  }
  const flippedRecord = flipRecord(record)
  const flippedMembers = members.map(reverseComplementLibraryMember)
  const realigned = realignTraceFileRecords(flippedMembers, flippedRecord.sequence, {
    force: true,
    topology,
  })
  const withReadAlignments = realigned.map((member) => realignNestedReadsToMember(member, topology))
  return { record: flippedRecord, members: withReadAlignments }
}

/** Worker-backed whole-library flip for the interactive action. */
export async function flipDnaLibraryAsync(
  record: SequenceRecord,
  members: readonly TraceFileRecord[],
  topology: 'linear' | 'circular' = 'linear',
  signal?: AbortSignal,
  onProgress?: (completed: number, total: number) => void,
  alignPending?: AlignPendingTraces,
): Promise<{ record: SequenceRecord; members: TraceFileRecord[] }> {
  if (!isDnaLibraryRecord(record)) throw new Error('Not a DNA library.')
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  const flippedRecord = flipRecord(record)
  const flippedMembers = members.map(reverseComplementLibraryMember)
  const realigned = await realignTraceFileRecordsAsync(flippedMembers, flippedRecord.sequence, {
    force: true,
    topology,
    signal,
    onProgress,
    alignPending,
  })
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  return {
    record: flippedRecord,
    members: realigned.map((member) => realignNestedReadsToMember(member, topology)),
  }
}

export type CreateDnaLibraryOptions = {
  name?: string
  topology?: 'linear' | 'circular'
  alignPending?: AlignPendingTraces
  /**
   * Prefer this member as the initial consensus sequence seed.
   * When omitted, the longest valid member is used.
   */
  seedMemberId?: string
}

/**
 * Build a DNA library document from peer members (typically AB1 / .seq traces).
 * Initial consensus = chosen seed (or longest member); all members are aligned to it.
 */
export function createDnaLibraryFromMembers(
  members: TraceFileRecord[],
  options: CreateDnaLibraryOptions = {},
): { record: SequenceRecord; members: TraceFileRecord[] } {
  const topology = options.topology ?? 'linear'
  const seed = libraryConsensusSeed(members, options)
  const consensus = seed.sequence.toUpperCase()
  const alignedMembers = members.map((member) => alignMemberToConsensus(member, consensus, topology))
  return buildDnaLibraryFromAlignedMembers(consensus, alignedMembers, options, topology)
}

function libraryConsensusSeed(members: TraceFileRecord[], options: CreateDnaLibraryOptions) {
  const preferredSeed = options.seedMemberId
    ? members.find(
        (member) =>
          member.id === options.seedMemberId
          && !member.parseError
          && member.sequence.length > 0,
      )
    : null
  const seed = preferredSeed ?? pickLibraryConsensusSeed(members)
  if (!seed) {
    throw new Error('No valid sequences found to create a library.')
  }
  return seed
}

/** Align members through the worker pool before assembling the library document. */
export async function createDnaLibraryFromMembersAsync(
  members: TraceFileRecord[],
  options: CreateDnaLibraryOptions = {},
  onProgress?: (completed: number, total: number) => void,
): Promise<{ record: SequenceRecord; members: TraceFileRecord[] }> {
  const topology = options.topology ?? 'linear'
  const seed = libraryConsensusSeed(members, options)
  const consensus = seed.sequence.toUpperCase()
  const alignable = members.filter((member) => !member.parseError && member.sequence.length > 0)
  const aligned = await realignTraceFileRecordsAsync(alignable, consensus, {
    force: true,
    topology,
    onProgress,
    alignPending: options.alignPending,
  })
  let alignedIndex = 0
  const alignedMembers = members.map((member) => {
    if (member.parseError || !member.sequence.length) return { ...member, alignment: null }
    const result = aligned[alignedIndex++]!
    return result.parseError === 'No alignment to reference found'
      ? { ...result, parseError: 'No alignment to consensus found' }
      : result
  })
  return buildDnaLibraryFromAlignedMembers(consensus, alignedMembers, options, topology)
}

function buildDnaLibraryFromAlignedMembers(
  consensus: string,
  alignedMembers: TraceFileRecord[],
  options: CreateDnaLibraryOptions,
  topology: 'linear' | 'circular',
): { record: SequenceRecord; members: TraceFileRecord[] } {
  const timestamp = nowIso()
  const baseName = (options.name?.trim() || DEFAULT_DNA_LIBRARY_NAME).replace(/\.dna$/i, '')

  const record: SequenceRecord = {
    id: createId('seq'),
    name: baseName,
    description: '',
    molecule: 'dna',
    topology,
    sequence: consensus,
    features: [],
    primers: [],
    dna: withDnaLibraryRole({}),
    operations: [
      {
        id: createId('op'),
        type: 'newDnaLibrary',
        summary: `New DNA library (${alignedMembers.length} member${alignedMembers.length === 1 ? '' : 's'}, ${consensus.length} bp consensus)`,
        createdAt: timestamp,
      },
    ],
    dnaEnds: topology === 'linear' ? defaultDnaEnds() : undefined,
    construct: { ...defaultConstructProperties, syntheticDna: true },
    createdAt: timestamp,
    updatedAt: timestamp,
  }

  return { record, members: alignedMembers }
}

export async function createDnaLibraryFromFiles(
  files: FileList | File[],
  options: CreateDnaLibraryOptions = {},
): Promise<{ record: SequenceRecord; members: TraceFileRecord[] }> {
  const parsed = await parseAlignmentTraceFiles(files)
  const valid = parsed.filter((member) => !member.parseError && member.sequence.length > 0)
  if (!valid.length) {
    const firstError = parsed.find((member) => member.parseError)?.parseError
    throw new Error(firstError ?? 'No supported trace or sequence files found.')
  }
  const topology = options.topology ?? 'linear'
  const preferredSeed = options.seedMemberId
    ? valid.find((member) => member.id === options.seedMemberId)
    : null
  const seed = preferredSeed ?? pickLibraryConsensusSeed(valid)!
  const consensus = seed.sequence.toUpperCase()
  const alignedMembers = await realignTraceFileRecordsAsync(valid, consensus, { topology, alignPending: options.alignPending })
  return buildDnaLibraryFromAlignedMembers(consensus, alignedMembers, options, topology)
}

/**
 * Turn the open DNA construct into a library: current sequence becomes consensus
 * and the first member; `additionalMembers` must include at least one valid peer.
 */
export function convertConstructToLibrary(
  record: SequenceRecord,
  additionalMembers: readonly TraceFileRecord[],
): { record: SequenceRecord; members: TraceFileRecord[] } {
  if (record.molecule !== 'dna') {
    throw new Error('Only DNA constructs can be converted to a library.')
  }
  if (isDnaLibraryRecord(record)) {
    throw new Error('This file is already a DNA library.')
  }
  const consensus = normalizeDna(record.sequence)
  if (!consensus) {
    throw new Error('Construct has no sequence to convert.')
  }
  const extras = additionalMembers.filter((member) => !member.parseError && member.sequence.length > 0)
  if (!extras.length) {
    throw new Error('Add at least one valid sequence or trace file.')
  }

  const topology = record.topology
  const seed: TraceFileRecord = {
    ...traceRecordFromSequence(consensus, record.name.trim() || 'Construct'),
    features: cloneFeatures(record.features),
    primers: clonePrimers(record.primers),
  }
  const alignedMembers = realignTraceFileRecords([seed, ...extras], consensus, {
    force: true,
    topology,
  })

  const timestamp = nowIso()
  const nextRecord: SequenceRecord = {
    ...record,
    sequence: consensus,
    features: cloneFeatures(record.features),
    primers: clonePrimers(record.primers),
    dna: withDnaLibraryRole(stripDnaLibraryFields(record.dna) ?? {}),
    operations: [
      ...record.operations,
      {
        id: createId('op'),
        type: 'convertToLibrary',
        summary: `Converted to DNA library (${alignedMembers.length} members, ${consensus.length.toLocaleString()} bp consensus)`,
        createdAt: timestamp,
      },
    ],
    updatedAt: timestamp,
    traceFiles: undefined,
  }
  return { record: nextRecord, members: alignedMembers }
}

/**
 * Demote a DNA library to a normal construct when zero or one members remain.
 * With one member, that member’s sequence is promoted into the construct.
 */
export function collapseDnaLibraryToConstruct(
  record: SequenceRecord,
  members: readonly TraceFileRecord[],
): { record: SequenceRecord; members: TraceFileRecord[] } {
  if (!isDnaLibraryRecord(record)) {
    return { record, members: [...members] }
  }

  const sole = members.length === 1 ? members[0]! : null
  const consensusSeq = normalizeDna(record.sequence)
  let sequence = consensusSeq
  let features = cloneFeatures(record.features)
  let primers = clonePrimers(record.primers)

  if (sole && !sole.parseError && sole.sequence.length > 0) {
    sequence = normalizeDna(sole.sequence)
    const sameAsConsensus = sequence === consensusSeq
    if (sole.features?.length) features = cloneFeatures(sole.features)
    else if (!sameAsConsensus) features = cloneFeatures(record.features)
    if (sole.primers?.length) primers = clonePrimers(sole.primers)
    else if (!sameAsConsensus) primers = clonePrimers(record.primers)
  }

  const timestamp = nowIso()
  const nextRecord: SequenceRecord = {
    ...record,
    sequence,
    features,
    primers,
    dna: stripDnaLibraryFields(record.dna),
    operations: [
      ...record.operations,
      {
        id: createId('op'),
        type: 'convertToConstruct',
        summary: sole
          ? `Converted library back to DNA construct (one member left: ${sole.fileName})`
          : 'Converted library back to DNA construct (no members left)',
        createdAt: timestamp,
      },
    ],
    updatedAt: timestamp,
    traceFiles: undefined,
  }
  return { record: nextRecord, members: [] }
}

/** Sync chromatogram.baseCalls with the member sequence string after an edit. */
export function syncTraceSequenceAndBaseCalls(
  trace: TraceFileRecord,
  nextSequence: string,
  options?: { markEdited?: boolean },
): TraceFileRecord {
  const sequence = sanitizeDna(nextSequence)
  const hasPeaks = trace.chromatogram.aTrace.length > 0
  const markEdited = options?.markEdited !== false && (hasPeaks || Boolean(trace.sequenceEdited))

  return {
    ...trace,
    sequence,
    chromatogram: hasPeaks
      ? {
          ...trace.chromatogram,
          // Peak arrays stay; display may drift at the edit site until re-basecalled.
          baseCalls: sequence.split(''),
        }
      : emptyChromatogramForSequence(sequence),
    sequenceEdited: markEdited || trace.sequenceEdited ? true : undefined,
    alignment: null,
    parseError: sequence.length ? undefined : 'No sequence found',
  }
}

/**
 * Resolve the half-open native member index range covered by template [start, end).
 * For a caret (start === end), returns an empty range at the insertion point.
 */
export function memberNativeRangeForTemplateSpan(
  alignment: TraceTemplateAlignment,
  templateStart: number,
  templateEnd: number,
): { start: number; end: number } | null {
  const matchIndices: number[] = []
  for (const column of alignment.columns) {
    if (column.kind !== 'match') continue
    if (column.templateIndex < templateStart || column.templateIndex >= templateEnd) continue
    if (column.traceIndex < 0) continue
    matchIndices.push(column.traceIndex)
  }

  if (templateStart === templateEnd) {
    // Caret: insert before the base aligned to templateStart, or after the previous match.
    let insertAt: number | null = null
    for (const column of alignment.columns) {
      if (column.kind !== 'match') continue
      if (column.templateIndex === templateStart) {
        insertAt = column.traceIndex
        break
      }
      if (column.templateIndex === templateStart - 1) {
        insertAt = alignment.orientation === 'reverse' ? column.traceIndex : column.traceIndex + 1
      }
    }
    if (insertAt === null) {
      // Before first aligned base or after last.
      if (templateStart <= alignment.templateStart) {
        insertAt = alignment.orientation === 'reverse' ? alignment.traceEnd : alignment.traceStart
      } else if (templateStart >= alignment.templateEnd) {
        insertAt = alignment.orientation === 'reverse' ? alignment.traceStart : alignment.traceEnd
      } else {
        return null
      }
    }
    return { start: insertAt, end: insertAt }
  }

  if (!matchIndices.length) return null
  const start = Math.min(...matchIndices)
  const end = Math.max(...matchIndices) + 1
  return { start, end }
}

/**
 * Edit a library member at a template-coordinate selection.
 * `insertDisplayOriented` is what the user typed in the alignment view (template strand sense).
 */
export function applyMemberSequenceEditAtTemplateRange(
  trace: TraceFileRecord,
  templateStart: number,
  templateEnd: number,
  insertDisplayOriented: string,
  consensusTopology: 'linear' | 'circular' = 'linear',
  consensusSequence?: string,
): TraceFileRecord {
  if (!trace.alignment) {
    throw new Error('Member is not aligned; cannot map edits from the consensus.')
  }
  const nativeRange = memberNativeRangeForTemplateSpan(trace.alignment, templateStart, templateEnd)
  if (!nativeRange) {
    throw new Error('Selection does not overlap this member’s alignment.')
  }

  const sanitizedInsert = sanitizeDna(insertDisplayOriented).toUpperCase()
  const nativeInsert =
    trace.alignment.orientation === 'reverse' ? reverseComplement(sanitizedInsert) : sanitizedInsert

  return applyMemberSequenceEditAtNativeRange(
    trace,
    nativeRange.start,
    nativeRange.end,
    nativeInsert,
    { consensusSequence, consensusTopology, markEdited: true, alreadySanitized: true },
  )
}

/**
 * Edit a library member at native (browse-mode) coordinates.
 * Insert is applied as-typed on the member strand (no reverse-complement).
 */
export function applyMemberSequenceEditAtNativeRange(
  trace: TraceFileRecord,
  nativeStart: number,
  nativeEnd: number,
  insert: string,
  options?: {
    consensusSequence?: string
    consensusTopology?: 'linear' | 'circular'
    markEdited?: boolean
    alreadySanitized?: boolean
  },
): TraceFileRecord {
  const start = Math.max(0, Math.min(nativeStart, trace.sequence.length))
  const end = Math.max(start, Math.min(nativeEnd, trace.sequence.length))
  const nativeInsert = options?.alreadySanitized ? insert : sanitizeDna(insert).toUpperCase()
  const nextSequence = trace.sequence.slice(0, start) + nativeInsert + trace.sequence.slice(end)
  const features = adjustMemberFeaturesForReplacement(
    trace.features,
    start,
    end,
    nativeInsert.length,
  )
  const edited = {
    ...syncTraceSequenceAndBaseCalls(trace, nextSequence, { markEdited: options?.markEdited }),
    features,
  }

  if (options?.consensusSequence) {
    return alignMemberToConsensus(
      edited,
      options.consensusSequence,
      options.consensusTopology ?? 'linear',
    )
  }
  return edited
}

/**
 * Crop consensus to [templateStart, templateEnd) and trim each member to the
 * aligned native span covering that region, then realign to the new consensus.
 */
export function cropDnaLibraryToTemplateRange(
  consensus: string,
  members: readonly TraceFileRecord[],
  templateStart: number,
  templateEnd: number,
  topology: 'linear' | 'circular' = 'linear',
): { consensus: string; members: TraceFileRecord[] } {
  const start = Math.max(0, Math.min(templateStart, consensus.length))
  const end = Math.max(start, Math.min(templateEnd, consensus.length))
  if (end <= start) {
    throw new Error('Select a consensus range to crop the library.')
  }
  if (start === 0 && end === consensus.length) {
    throw new Error('Selection already covers the whole consensus.')
  }

  const nextConsensus = consensus.slice(start, end).toUpperCase()
  const nextMembers = members.map((member) => {
    if (member.parseError && !member.sequence) return member
    if (!member.alignment) {
      return alignMemberToConsensus(
        syncTraceSequenceAndBaseCalls(member, member.sequence),
        nextConsensus,
        topology,
      )
    }
    const nativeRange = memberNativeRangeForTemplateSpan(member.alignment, start, end)
    if (!nativeRange || nativeRange.start >= nativeRange.end) {
      const emptied = syncTraceSequenceAndBaseCalls(member, '')
      return {
        ...emptied,
        features: undefined,
        alignment: null,
        parseError: 'No overlap with cropped consensus region',
      }
    }
    const croppedSequence = member.sequence.slice(nativeRange.start, nativeRange.end)
    const features = adjustMemberFeaturesForReplacement(
      member.features,
      nativeRange.end,
      member.sequence.length,
      0,
    )
    const shifted = adjustMemberFeaturesForReplacement(features, 0, nativeRange.start, 0)
    const cropped = {
      ...syncTraceSequenceAndBaseCalls(member, croppedSequence),
      features: shifted,
    }
    return alignMemberToConsensus(cropped, nextConsensus, topology)
  })

  return { consensus: nextConsensus, members: nextMembers }
}

/** Library-member files: chromatograms (.ab1) and plain sequence dumps (.seq/.txt). */
export function isDnaLibrarySourceFileName(fileName: string): boolean {
  const lower = fileName.toLowerCase()
  return /\.(ab1|seq|txt)$/i.test(lower)
}

export function dnaLibrarySourceFiles(files: readonly File[]): File[] {
  return files.filter((file) => isDnaLibrarySourceFileName(file.name))
}

/**
 * When opening (alignments off), a multi-file drop of only AB1/.seq/.txt should become a library.
 */
export function shouldCreateDnaLibraryFromOpenDrop(files: readonly File[]): boolean {
  if (files.length < 2) return false
  return files.every((file) => isDnaLibrarySourceFileName(file.name))
}
