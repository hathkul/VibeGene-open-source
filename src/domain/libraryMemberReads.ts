import { createId, normalizeDna, reverseComplement, sanitizeDna } from './sequence'
import { emptyChromatogramForSequence } from './sequenceTraceFactory'
import { alignTraceToTemplate } from './traceAlignment'
import type {
  ChromatogramData,
  LibraryMemberRead,
  TraceFileRecord,
  TraceTemplateAlignment,
} from './traceTypes'
import type { LibraryMemberReadPack } from './dnaComparisonTypes'

const DNA_BASES = ['A', 'C', 'G', 'T'] as const

function cloneChromatogram(chromatogram: ChromatogramData): ChromatogramData {
  return {
    aTrace: chromatogram.aTrace.slice(),
    tTrace: chromatogram.tTrace.slice(),
    gTrace: chromatogram.gTrace.slice(),
    cTrace: chromatogram.cTrace.slice(),
    basePos: chromatogram.basePos.slice(),
    baseCalls: chromatogram.baseCalls.slice(),
    ...(chromatogram.qualNums ? { qualNums: chromatogram.qualNums.slice() } : {}),
  }
}

function cloneAlignment(alignment: TraceTemplateAlignment | null): TraceTemplateAlignment | null {
  if (!alignment) return null
  return { ...alignment, columns: alignment.columns.slice() }
}

export function cloneLibraryMemberRead(read: LibraryMemberRead): LibraryMemberRead {
  return {
    ...read,
    chromatogram: cloneChromatogram(read.chromatogram),
    alignment: cloneAlignment(read.alignment),
  }
}

export function libraryMemberReadCount(member: TraceFileRecord) {
  return member.reads?.length ?? 0
}

/** Flatten a member into reads (existing nested reads, or a single synthetic read from the member). */
export function flattenMemberToReads(member: TraceFileRecord): LibraryMemberRead[] {
  if (member.reads?.length) {
    return member.reads.map(cloneLibraryMemberRead)
  }
  const sequence = normalizeDna(member.sequence)
  if (!sequence.length && member.parseError) return []
  return [
    {
      id: member.id,
      fileName: member.fileName,
      fileLastModified: member.fileLastModified,
      sequence,
      chromatogram: cloneChromatogram(member.chromatogram),
      enabled: true,
      expanded: false,
      alignment: null,
      sequenceEdited: member.sequenceEdited,
      parseError: member.parseError,
    },
  ]
}

function queryIndexFromTrace(
  traceIndex: number,
  traceLength: number,
  orientation: TraceTemplateAlignment['orientation'],
) {
  return orientation === 'forward' ? traceIndex : traceLength - 1 - traceIndex
}

function displayBaseFromRead(
  readSequence: string,
  traceIndex: number,
  orientation: TraceTemplateAlignment['orientation'],
) {
  const raw = readSequence[traceIndex]?.toUpperCase()
  if (!raw) return null
  return orientation === 'reverse' ? reverseComplement(raw) : raw
}

function qualAt(read: Pick<LibraryMemberRead, 'chromatogram'>, traceIndex: number) {
  return read.chromatogram.qualNums?.[traceIndex]
}

/**
 * Merge an aligned read into a contig (template), extending flanks when the read overhangs
 * past the contig ends. Contig coordinates are display-oriented; reverse reads contribute RC bases.
 */
export function mergeAlignedReadIntoContig(
  contig: string,
  read: Pick<LibraryMemberRead, 'sequence' | 'chromatogram'>,
  alignment: TraceTemplateAlignment,
): string {
  const contigUpper = contig.toUpperCase()
  const readSeq = normalizeDna(read.sequence)
  if (!readSeq.length) return contigUpper

  const votes: Array<{ base: string; weight: number }> = Array.from({ length: contigUpper.length }, (_, index) => ({
    base: contigUpper[index]!.toUpperCase(),
    weight: 1,
  }))

  for (const column of alignment.columns) {
    if (column.kind !== 'match') continue
    const displayBase = displayBaseFromRead(readSeq, column.traceIndex, alignment.orientation)
    if (!displayBase || (!DNA_BASES.includes(displayBase as (typeof DNA_BASES)[number]) && displayBase !== 'N')) {
      continue
    }
    const templateIndex = column.templateIndex
    if (templateIndex < 0 || templateIndex >= votes.length) continue
    const weight = Math.max(1, qualAt(read, column.traceIndex) ?? 20)
    const current = votes[templateIndex]!
    if (weight > current.weight || (weight === current.weight && displayBase < current.base)) {
      votes[templateIndex] = { base: displayBase, weight }
    }
  }

  const core = votes.map((vote) => vote.base).join('')

  let minQuery = Number.POSITIVE_INFINITY
  let maxQuery = Number.NEGATIVE_INFINITY
  for (const column of alignment.columns) {
    if (column.kind === 'templateGap') continue
    const queryIndex = queryIndexFromTrace(column.traceIndex, readSeq.length, alignment.orientation)
    minQuery = Math.min(minQuery, queryIndex)
    maxQuery = Math.max(maxQuery, queryIndex)
  }
  if (!Number.isFinite(minQuery)) return core

  const oriented = alignment.orientation === 'reverse' ? reverseComplement(readSeq) : readSeq
  const leftExtend = minQuery > 0 ? oriented.slice(0, minQuery) : ''
  const rightExtend = maxQuery + 1 < oriented.length ? oriented.slice(maxQuery + 1) : ''

  // Only extend when the alignment reaches (near) a contig end — typical F/R Sanger case.
  const left = alignment.templateStart <= 5 ? leftExtend : ''
  const right = alignment.templateEnd >= contigUpper.length - 5 ? rightExtend : ''
  return sanitizeDna(`${left}${core}${right}`).toUpperCase()
}

function abortError() {
  return new DOMException('Aborted', 'AbortError')
}

function yieldForAssembly(signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError())
      return
    }
    const timer = globalThis.setTimeout(() => {
      if (signal?.aborted) {
        reject(abortError())
        return
      }
      resolve()
    }, 0)
    signal?.addEventListener(
      'abort',
      () => {
        globalThis.clearTimeout(timer)
        reject(abortError())
      },
      { once: true },
    )
  })
}

function enabledReadsForAssembly(reads: readonly LibraryMemberRead[]) {
  return reads
    .filter((read) => read.enabled && !read.parseError && normalizeDna(read.sequence).length > 0)
    .map(cloneLibraryMemberRead)
    .toSorted((a, b) => b.sequence.length - a.sequence.length || a.fileName.localeCompare(b.fileName))
}

function alignReadsToContig(
  reads: readonly LibraryMemberRead[],
  contig: string,
  topology: 'linear' | 'circular',
): LibraryMemberRead[] {
  return reads.map((read) => {
    const cloned = cloneLibraryMemberRead(read)
    if (!cloned.enabled || cloned.parseError || !normalizeDna(cloned.sequence).length) {
      return { ...cloned, alignment: null }
    }
    try {
      const alignment = alignTraceToTemplate(cloned.sequence, contig, { topology })
      return {
        ...cloned,
        alignment,
        parseError: alignment ? undefined : 'No alignment to member sequence',
      }
    } catch {
      return { ...cloned, alignment: null, parseError: 'Alignment failed' }
    }
  })
}

/** Assemble a contig from enabled reads; returns sequence + reads realigned to that contig. */
export function assembleSequenceFromReads(
  reads: readonly LibraryMemberRead[],
  options?: { topology?: 'linear' | 'circular' },
): { sequence: string; reads: LibraryMemberRead[] } {
  const topology = options?.topology ?? 'linear'
  const enabled = enabledReadsForAssembly(reads)

  if (!enabled.length) {
    return {
      sequence: '',
      reads: reads.map((read) => ({ ...cloneLibraryMemberRead(read), alignment: null })),
    }
  }

  let contig = normalizeDna(enabled[0]!.sequence).toUpperCase()
  for (const read of enabled.slice(1)) {
    const alignment = alignTraceToTemplate(read.sequence, contig, { topology })
    if (!alignment) continue
    contig = mergeAlignedReadIntoContig(contig, read, alignment)
  }

  return { sequence: contig, reads: alignReadsToContig(reads, contig, topology) }
}

/** Same as assembleSequenceFromReads, but yields between alignments so the UI can stay interactive. */
export async function assembleSequenceFromReadsAsync(
  reads: readonly LibraryMemberRead[],
  options?: { topology?: 'linear' | 'circular'; signal?: AbortSignal },
): Promise<{ sequence: string; reads: LibraryMemberRead[] }> {
  const topology = options?.topology ?? 'linear'
  const signal = options?.signal
  const enabled = enabledReadsForAssembly(reads)

  if (!enabled.length) {
    return {
      sequence: '',
      reads: reads.map((read) => ({ ...cloneLibraryMemberRead(read), alignment: null })),
    }
  }

  let contig = normalizeDna(enabled[0]!.sequence).toUpperCase()
  for (const read of enabled.slice(1)) {
    await yieldForAssembly(signal)
    const alignment = alignTraceToTemplate(read.sequence, contig, { topology })
    if (!alignment) continue
    contig = mergeAlignedReadIntoContig(contig, read, alignment)
  }

  const alignedReads: LibraryMemberRead[] = []
  for (const read of reads) {
    await yieldForAssembly(signal)
    alignedReads.push(...alignReadsToContig([read], contig, topology))
  }
  return { sequence: contig, reads: alignedReads }
}

export function suggestGroupedMemberName(fileNames: readonly string[]) {
  const cleaned = fileNames
    .map((name) => name.replace(/\.[^.]+$/, ''))
    .map((name) => name.replace(/([._\-\s]?(fwd|rev|forward|reverse|f|r|sense|antisense))$/i, ''))
  if (!cleaned.length) return 'Grouped member'
  const first = cleaned[0]!
  let prefix = first
  for (const name of cleaned.slice(1)) {
    let index = 0
    while (index < prefix.length && index < name.length && prefix[index] === name[index]) index += 1
    prefix = prefix.slice(0, index)
  }
  prefix = prefix.replace(/[._\-\s]+$/g, '')
  if (prefix.length >= 2) return prefix
  return `${first} (${fileNames.length} reads)`
}

function chromatogramForAssembledMember(reads: readonly LibraryMemberRead[]): ChromatogramData {
  const withPeaks = reads.find((read) => read.chromatogram.aTrace.length > 0 && read.enabled)
  if (withPeaks && reads.filter((read) => read.enabled).length === 1) {
    return cloneChromatogram(withPeaks.chromatogram)
  }
  // Multi-read assemblies do not have a single chromatogram.
  return emptyChromatogramForSequence('')
}

function memberFromAssembledReads(
  member: TraceFileRecord,
  assembled: { sequence: string; reads: LibraryMemberRead[] },
): TraceFileRecord {
  const peaks = chromatogramForAssembledMember(assembled.reads)
  return {
    ...member,
    sequence: assembled.sequence,
    chromatogram: peaks.aTrace.length
      ? peaks
      : emptyChromatogramForSequence(assembled.sequence),
    reads: assembled.reads,
    sequenceAssembled: true,
    sequenceEdited: undefined,
    parseError: assembled.sequence.length ? undefined : 'No sequence found',
    alignment: null,
  }
}

/** Rebuild member.sequence from its nested reads. */
export function reassembleLibraryMember(
  member: TraceFileRecord,
  options?: { topology?: 'linear' | 'circular' },
): TraceFileRecord {
  const reads = member.reads ?? []
  if (!reads.length) return member
  return memberFromAssembledReads(member, assembleSequenceFromReads(reads, options))
}

/** Async reassemble that yields between alignments so grouping stays interactive. */
export async function reassembleLibraryMemberAsync(
  member: TraceFileRecord,
  options?: { topology?: 'linear' | 'circular'; signal?: AbortSignal },
): Promise<TraceFileRecord> {
  const reads = member.reads ?? []
  if (!reads.length) return member
  const assembled = await assembleSequenceFromReadsAsync(reads, options)
  return memberFromAssembledReads(member, assembled)
}

/**
 * Nest selected members into one clone shell without assembling the contig.
 * Cheap enough to apply immediately while assembly runs in the background.
 */
export function nestLibraryMembersAsClone(
  members: readonly TraceFileRecord[],
  memberIds: readonly string[],
  options?: { name?: string; keepMemberId?: string },
): TraceFileRecord[] {
  const idSet = new Set(memberIds)
  const selected = members.filter((member) => idSet.has(member.id))
  if (selected.length < 2) {
    throw new Error('Select at least two members to group as one clone.')
  }

  const reads = selected
    .flatMap((member) => flattenMemberToReads(member))
    .map((read) => ({ ...read, alignment: null }))
  if (reads.filter((read) => normalizeDna(read.sequence).length > 0).length < 2) {
    throw new Error('Need at least two sequences among the selected members.')
  }

  const keepId = options?.keepMemberId && idSet.has(options.keepMemberId)
    ? options.keepMemberId
    : selected[0]!.id
  const keepMember = selected.find((member) => member.id === keepId) ?? selected[0]!
  const name = options?.name?.trim() || suggestGroupedMemberName(selected.map((member) => member.fileName))
  const longest = reads
    .filter((read) => read.enabled && normalizeDna(read.sequence).length > 0)
    .toSorted((a, b) => b.sequence.length - a.sequence.length)[0]
  const placeholderSequence = normalizeDna(keepMember.sequence) || longest?.sequence || ''

  const shell: TraceFileRecord = {
    ...keepMember,
    id: keepId,
    fileName: name,
    sequence: placeholderSequence,
    // Multi-read members have no single chromatogram; keep height compact until the user expands.
    chromatogram: reads.length > 1
      ? emptyChromatogramForSequence(placeholderSequence)
      : longest && normalizeDna(keepMember.sequence).length === 0
        ? cloneChromatogram(longest.chromatogram)
        : keepMember.chromatogram,
    reads,
    features: keepMember.features,
    showAnnotations: false,
    expanded: false,
    enabled: true,
    alignment: null,
    sequenceAssembled: false,
    sequenceEdited: undefined,
    parseError: placeholderSequence.length ? undefined : 'No sequence found',
  }

  const result: TraceFileRecord[] = []
  let inserted = false
  for (const member of members) {
    if (!idSet.has(member.id)) {
      result.push(member)
      continue
    }
    if (!inserted && member.id === keepId) {
      result.push(shell)
      inserted = true
    }
  }
  if (!inserted) result.unshift(shell)
  return result
}

/**
 * Group selected top-level members into one clone member with nested reads.
 * Selected members' nested reads are flattened. Features from the first selected member are kept.
 */
export function groupLibraryMembersAsClone(
  members: readonly TraceFileRecord[],
  memberIds: readonly string[],
  options?: { name?: string; topology?: 'linear' | 'circular'; keepMemberId?: string },
): TraceFileRecord[] {
  const nested = nestLibraryMembersAsClone(members, memberIds, options)
  const keepId = options?.keepMemberId && memberIds.includes(options.keepMemberId)
    ? options.keepMemberId
    : nested.find((member) => memberIds.includes(member.id) && (member.reads?.length ?? 0) > 0)?.id
  if (!keepId) return nested
  return nested.map((member) => (
    member.id === keepId
      ? reassembleLibraryMember(member, { topology: options?.topology })
      : member
  ))
}

/** Detach one nested read into its own top-level member; reassemble the parent if reads remain. */
export function detachLibraryMemberRead(
  members: readonly TraceFileRecord[],
  memberId: string,
  readId: string,
  options?: { topology?: 'linear' | 'circular' },
): TraceFileRecord[] {
  const index = members.findIndex((member) => member.id === memberId)
  if (index < 0) throw new Error('Member not found.')
  const member = members[index]!
  const reads = member.reads ?? []
  const read = reads.find((entry) => entry.id === readId)
  if (!read) throw new Error('Read not found on that member.')

  const remaining = reads.filter((entry) => entry.id !== readId)
  const detached: TraceFileRecord = {
    id: createId('trace'),
    fileName: read.fileName,
    fileLastModified: read.fileLastModified,
    sequence: read.sequence,
    chromatogram: cloneChromatogram(read.chromatogram),
    enabled: true,
    expanded: false,
    showAnnotations: false,
    alignment: null,
    sequenceEdited: read.sequenceEdited,
    parseError: read.parseError,
  }

  let nextParent: TraceFileRecord
  if (!remaining.length) {
    return [...members.slice(0, index), detached, ...members.slice(index + 1)]
  }
  if (remaining.length === 1) {
    const only = remaining[0]!
    nextParent = {
      ...member,
      fileName: only.fileName !== member.fileName ? member.fileName : only.fileName,
      sequence: only.sequence,
      chromatogram: cloneChromatogram(only.chromatogram),
      reads: undefined,
      sequenceAssembled: undefined,
      sequenceEdited: only.sequenceEdited,
      parseError: only.parseError,
      alignment: null,
    }
  } else {
    nextParent = reassembleLibraryMember(
      { ...member, reads: remaining },
      { topology: options?.topology },
    )
  }

  return [...members.slice(0, index), nextParent, detached, ...members.slice(index + 1)]
}

export type AssemblyConflictVote = {
  readId: string
  fileName: string
  base: string
  qual?: number
}

export type AssemblyConflict = {
  /** Index into member.sequence */
  memberIndex: number
  memberBase: string
  votes: AssemblyConflictVote[]
}

/**
 * Positions on the member contig where enabled reads disagree with each other
 * or with the current member base (after quality-aware assembly / edits).
 */
export function findAssemblyConflicts(member: TraceFileRecord): AssemblyConflict[] {
  const reads = (member.reads ?? []).filter(
    (read) => read.enabled && !read.parseError && read.alignment && normalizeDna(read.sequence).length > 0,
  )
  if (reads.length < 2) return []

  const memberSeq = normalizeDna(member.sequence).toUpperCase()
  const conflicts: AssemblyConflict[] = []

  for (let memberIndex = 0; memberIndex < memberSeq.length; memberIndex += 1) {
    const votes: AssemblyConflictVote[] = []
    for (const read of reads) {
      const alignment = read.alignment!
      for (const column of alignment.columns) {
        if (column.kind !== 'match' || column.templateIndex !== memberIndex) continue
        const displayBase = displayBaseFromRead(read.sequence, column.traceIndex, alignment.orientation)
        if (!displayBase || !DNA_BASES.includes(displayBase as (typeof DNA_BASES)[number])) continue
        votes.push({
          readId: read.id,
          fileName: read.fileName,
          base: displayBase,
          qual: qualAt(read, column.traceIndex),
        })
        break
      }
    }
    if (votes.length < 2) continue
    const distinct = new Set(votes.map((vote) => vote.base))
    const memberBase = memberSeq[memberIndex] ?? ''
    if (distinct.size > 1 || (memberBase && !distinct.has(memberBase))) {
      conflicts.push({ memberIndex, memberBase, votes })
    }
  }
  return conflicts
}

/** Consensus/template indices where the member has assembly conflicts. */
export function assemblyConflictTemplateIndices(member: TraceFileRecord): number[] {
  if (!member.alignment) return []
  const conflicts = findAssemblyConflicts(member)
  if (!conflicts.length) return []
  const memberToTemplate = new Map<number, number>()
  for (const column of member.alignment.columns) {
    if (column.kind !== 'match') continue
    memberToTemplate.set(column.traceIndex, column.templateIndex)
  }
  const indices: number[] = []
  for (const conflict of conflicts) {
    const templateIndex = memberToTemplate.get(conflict.memberIndex)
    if (templateIndex != null) indices.push(templateIndex)
  }
  return indices
}

/** Build a display trace for a nested read aligned onto the library consensus. */
export function nestedReadAsConsensusTrace(
  read: LibraryMemberRead,
  parent: TraceFileRecord,
  consensusSequence: string,
  topology: 'linear' | 'circular' = 'linear',
): TraceFileRecord {
  let alignment: TraceTemplateAlignment | null
  let parseError = read.parseError
  try {
    alignment = normalizeDna(read.sequence).length
      ? alignTraceToTemplate(read.sequence, consensusSequence, { topology })
      : null
    if (!alignment && !parseError) parseError = 'No alignment to consensus'
  } catch {
    alignment = null
    parseError = parseError ?? 'Alignment failed'
  }
  return {
    id: `${parent.id}::${read.id}`,
    fileName: read.fileName,
    fileLastModified: read.fileLastModified,
    sequence: read.sequence,
    chromatogram: cloneChromatogram(read.chromatogram),
    enabled: read.enabled,
    expanded: true,
    showAnnotations: false,
    alignment,
    sequenceEdited: read.sequenceEdited,
    parseError,
  }
}

/** Compact persistence payload for nested reads (sequences; peaks kept on in-memory/IDB traces). */
export type { LibraryMemberReadPack }

export function packLibraryMemberReads(members: readonly TraceFileRecord[]): LibraryMemberReadPack[] {
  return members
    .filter((member) => (member.reads?.length ?? 0) > 0)
    .map((member) => ({
      memberId: member.id,
      fileName: member.fileName,
      sequence: member.sequence,
      ...(member.sequenceAssembled ? { sequenceAssembled: true } : {}),
      reads: (member.reads ?? []).map((read) => ({
        id: read.id,
        fileName: read.fileName,
        ...(read.fileLastModified != null ? { fileLastModified: read.fileLastModified } : {}),
        sequence: read.sequence,
        enabled: read.enabled,
        ...(read.sequenceEdited ? { sequenceEdited: true } : {}),
        ...(read.parseError ? { parseError: read.parseError } : {}),
        ...(read.chromatogram.baseCalls.length ? { baseCalls: read.chromatogram.baseCalls.slice() } : {}),
        ...(read.chromatogram.qualNums?.length ? { qualNums: read.chromatogram.qualNums.slice() } : {}),
      })),
    }))
}

export function hydrateLibraryMemberReadsOntoTraces(
  packs: readonly LibraryMemberReadPack[] | undefined,
  members: TraceFileRecord[],
): TraceFileRecord[] {
  if (!packs?.length) return members
  const byId = new Map(packs.map((pack) => [pack.memberId, pack]))
  return members.map((member) => {
    const pack = byId.get(member.id)
    if (!pack?.reads.length) return member
    const reads: LibraryMemberRead[] = pack.reads.map((read) => {
      const sequence = normalizeDna(read.sequence)
      const baseCalls = read.baseCalls?.length ? read.baseCalls.slice() : sequence.split('')
      return {
        id: read.id,
        fileName: read.fileName,
        fileLastModified: read.fileLastModified,
        sequence,
        chromatogram: {
          aTrace: [],
          tTrace: [],
          gTrace: [],
          cTrace: [],
          basePos: [],
          baseCalls,
          ...(read.qualNums?.length ? { qualNums: read.qualNums.slice() } : {}),
        },
        enabled: read.enabled !== false,
        expanded: false,
        alignment: null,
        sequenceEdited: read.sequenceEdited,
        parseError: read.parseError,
      }
    })
    const assembled = assembleSequenceFromReads(reads)
    return {
      ...member,
      fileName: pack.fileName || member.fileName,
      sequence: pack.sequence || assembled.sequence || member.sequence,
      reads: assembled.reads,
      sequenceAssembled: pack.sequenceAssembled ?? true,
      chromatogram: emptyChromatogramForSequence(pack.sequence || assembled.sequence || member.sequence),
      alignment: null,
    }
  })
}
