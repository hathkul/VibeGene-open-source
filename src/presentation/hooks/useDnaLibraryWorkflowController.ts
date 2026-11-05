import { useTraceAlignment } from './traceAlignmentContext'
import { useRef } from 'react'
import { addOperation, applySequenceReplacementAnnotations, createId, nowIso } from '../../domain/sequence'
import {
  applyMemberSequenceEditAtTemplateRange,
  convertConstructToLibrary,
  createDnaLibraryFromFiles,
  cropDnaLibraryToTemplateRange,
  DEFAULT_DNA_LIBRARY_NAME,
  flipDnaLibraryAsync,
  flipLibraryMember,
  isDnaLibraryRecord,
  rebuildDnaLibraryConsensusAsync,
} from '../../domain/dnaLibrary'
import { detachLibraryMemberRead, nestLibraryMembersAsClone, reassembleLibraryMember, reassembleLibraryMemberAsync } from '../../domain/libraryMemberReads'
import { constructRecordFromLibraryMember, libraryMemberSequenceEntryFromRecord } from '../../domain/libraryMemberRecord'
import { traceRecordFromSequence } from '../../domain/sequenceTraceFactory'
import { realignTraceFileRecords, realignTraceFileRecordsAsync, appendAlignedTraceFiles, appendAlignedTracesFromSequences } from '../../domain/traceFileWorkflow'
import type { SequenceRecord } from '../../domain/types'
import type { TraceFileRecord } from '../../domain/traceTypes'
import type { ProposedLibraryCombineGroup } from '../../domain/libraryMemberCombine'
import type { LibraryMemberTabSortMode } from '../../domain/libraryMemberTab'
import type { SelectionRange } from '../sequence'
import { startLibraryMemberReorderPointerDrag } from '../../domain/libraryMemberReorderDrag'
import {
  libraryMemberWorkspaceDocumentOrigin,
  type WorkspaceDocumentOrigin,
} from '../../domain/workspaceDocumentOrigin'

type Progress = { update: (completed: number, total: number, label?: string) => void; finish: () => void }

export type DnaLibraryWorkflowOptions = {
  record: SequenceRecord
  traceFiles: TraceFileRecord[]
  recordRef: { current: SequenceRecord }
  traceFilesRef: { current: TraceFileRecord[] }
  selectedRange: SelectionRange | null
  cutStrandSelection: unknown
  membersAddBusy: boolean
  setMembersAddBusy: (busy: boolean) => void
  setStatus: (status: string) => void
  setSelectedLibraryMemberIds: (ids: string[]) => void
  setMemberTabAnchorId: (id: string | null) => void
  setSelectedAlignmentTraceId: (id: string | null) => void
  setSelectedFeatureId: (id: string | null) => void
  setSelectedPrimerId: (id: string | null) => void
  setCutStrandSelection: (value: null) => void
  setCutSelectionEnzymes: (value: null) => void
  setCutSelectionAnchor: (value: null) => void
  setSelectionFocus: (focus: 'dna' | 'feature' | 'primer' | 'bond') => void
  setSelectedRange: (range: SelectionRange | null) => void
  setSequenceRange: (range: SelectionRange, options?: { collapsed?: boolean }) => void
  setTracesNeedRealign: (value: boolean) => void
  lastAlignedSequenceRef: { current: string | null }
  onTraceFilesChange: (next: TraceFileRecord[] | ((current: TraceFileRecord[]) => TraceFileRecord[])) => void
  updateRecord: (updater: (current: SequenceRecord) => SequenceRecord, options?: { recordHistory?: boolean }) => void
  pushDocumentHistorySnapshot: () => void
  commitLibraryMembersOrCollapse: (next: TraceFileRecord[], options?: { alreadyPushedHistory?: boolean; statusIfMembers?: string }) => boolean
  requestAlignmentSequenceScroll: (templateIndex: number) => void
  createLibraryInNewWindow: (files: File[]) => Promise<SequenceRecord>
  nativeRuntime: boolean
  documentOrigin: WorkspaceDocumentOrigin
  openRecordInNewTab: (record: SequenceRecord, options?: {
    initiallyUnsaved?: boolean
    documentOrigin?: WorkspaceDocumentOrigin
    folderId?: string | null | undefined
  }) => void
  loadProjects: (ids: string[]) => Promise<SequenceRecord[]>
  parseMemberFiles: (files: File[]) => Promise<TraceFileRecord[]>
  beginProgress: (label: string, total: number) => Progress
  applyConsensusReplacement: (consensus: string, previousLength: number) => void
  libraryMemberTabRows: Array<{ member: TraceFileRecord }>
  memberTabSortMode: LibraryMemberTabSortMode
  setMemberTabSortMode: (mode: LibraryMemberTabSortMode) => void
  memberReorderDragActiveRef: { current: boolean }
  setMemberReorderDropBeforeId: (id: string | null | undefined) => void
  setMemberReorderSourceId: (id: string | null) => void
  canConvertToLibrary: boolean
  setDatabaseLibraryMemberPick: (value: null) => void
  setDatabaseOpen: (open: boolean) => void
  setActiveTab: (tab: 'Members' | 'Sequence' | 'Features' | 'Primers' | 'Enzymes' | 'History' | 'Properties') => void
  setCombineLibraryReadsOpen: (open: boolean) => void
}

/** Owns DNA-library member lifecycle, consensus rebuild and orientation workflows. */
export function useDnaLibraryWorkflowController(options: DnaLibraryWorkflowOptions) {
  const alignPending = useTraceAlignment()
  const assembleAbortByIdRef = useRef<Map<string, AbortController>>(new Map())
  const consensusGenerationRef = useRef(0)
  const consensusAbortRef = useRef<AbortController | null>(null)
  const flipGenerationRef = useRef(0)
  const flipAbortRef = useRef<AbortController | null>(null)

  async function addLibraryMembersFromFiles(files: FileList | File[]) {
    if (options.membersAddBusy || !isDnaLibraryRecord(options.record)) return
    options.setMembersAddBusy(true)
    options.setStatus('Adding library members…')
    try {
      const result = await appendAlignedTraceFiles(files, options.record.sequence, options.traceFiles, { topology: options.record.topology, alignPending })
      if (!result.addedCount) return void options.setStatus('No supported trace or sequence files found.')
      options.onTraceFilesChange(result.traces)
      if (result.scrollToTraceId) {
        options.setSelectedAlignmentTraceId(result.scrollToTraceId)
        options.setSelectedLibraryMemberIds([result.scrollToTraceId])
        options.setMemberTabAnchorId(result.scrollToTraceId)
      }
      if (result.scrollTemplateIndex !== undefined) options.requestAlignmentSequenceScroll(result.scrollTemplateIndex)
      options.setStatus(`Added ${result.addedCount} member${result.addedCount === 1 ? '' : 's'}.`)
    } catch (error) {
      options.setStatus(error instanceof Error ? error.message : 'Could not add library members.')
    } finally {
      options.setMembersAddBusy(false)
    }
  }

  async function addLibraryMembersFromDatabase(projectIds: string[]) {
    if (!isDnaLibraryRecord(options.recordRef.current)) return void options.setStatus('Open a DNA library to add members from Database.')
    const uniqueIds = [...new Set(projectIds)]
    if (!uniqueIds.length) return void options.setStatus('No constructs were selected to add as members.')
    options.setMembersAddBusy(true)
    options.setStatus('Adding library members…')
    try {
      const entries = (await options.loadProjects(uniqueIds)).map((record) => libraryMemberSequenceEntryFromRecord(record, { skipRecordId: options.recordRef.current.id })).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      if (!entries.length) return void options.setStatus('Select DNA constructs to add as library members.')
      const result = await appendAlignedTracesFromSequences(entries, options.recordRef.current.sequence, options.traceFilesRef.current, { topology: options.recordRef.current.topology, alignPending })
      if (!result.addedCount) return void options.setStatus('No alignable DNA sequences in the Database selection.')
      options.onTraceFilesChange(result.traces)
      const selectId = result.addedTraceIds.at(-1) ?? result.scrollToTraceId
      if (selectId) options.setSelectedAlignmentTraceId(selectId)
      if (result.addedTraceIds.length) {
        options.setSelectedLibraryMemberIds(result.addedTraceIds)
        options.setMemberTabAnchorId(selectId ?? null)
      }
      if (result.scrollTemplateIndex !== undefined) options.requestAlignmentSequenceScroll(result.scrollTemplateIndex)
      options.setStatus(`Added ${result.addedCount} member${result.addedCount === 1 ? '' : 's'} from Database.`)
    } catch (error) {
      options.setStatus(error instanceof Error ? error.message : 'Could not add library members.')
    } finally {
      options.setMembersAddBusy(false)
    }
  }

  function beginLibraryMemberReorderDrag(memberId: string, event: React.PointerEvent<HTMLTableRowElement>) {
    if (event.button !== 0 || event.shiftKey || event.metaKey || event.ctrlKey) return
    const target = event.target as HTMLElement | null
    if (target?.closest('input, button, a, textarea, select, .members-name-edit')) return
    options.memberReorderDragActiveRef.current = false
    startLibraryMemberReorderPointerDrag({
      sourceId: memberId,
      sourceRow: event.currentTarget,
      clientX: event.clientX,
      clientY: event.clientY,
      onDropBeforeChange: options.setMemberReorderDropBeforeId,
      onActivated: () => {
        options.memberReorderDragActiveRef.current = true
        options.setMemberReorderSourceId(memberId)
        if (options.memberTabSortMode !== 'manual') {
          const orderedIds = options.libraryMemberTabRows.map((row) => row.member.id)
          options.onTraceFilesChange((current) => {
            const byId = new Map(current.map((trace) => [trace.id, trace]))
            const ordered = orderedIds.map((id) => byId.get(id)).filter((trace): trace is TraceFileRecord => Boolean(trace))
            return [...ordered, ...current.filter((trace) => !orderedIds.includes(trace.id))]
          })
          options.setMemberTabSortMode('manual')
        }
      },
      onFinished: () => options.setMemberReorderSourceId(null),
      onReorder: (movedId, beforeId) => {
        options.onTraceFilesChange((current) => {
          const moved = current.find((trace) => trace.id === movedId)
          if (!moved) return current
          const rest = current.filter((trace) => trace.id !== movedId)
          const index = beforeId ? rest.findIndex((trace) => trace.id === beforeId) : rest.length
          rest.splice(index < 0 ? rest.length : index, 0, moved)
          return rest
        })
        options.setMemberTabSortMode('manual')
        options.setStatus('Reordered library members.')
      },
    })
  }

  async function createDnaLibraryFromDroppedOrPickedFiles(files: File[]) {
    if (options.nativeRuntime) {
      const created = await options.createLibraryInNewWindow(files)
      options.setStatus(`Created DNA library “${created.name}” (${(created.traceFiles?.length ?? 0).toLocaleString()} member${(created.traceFiles?.length ?? 0) === 1 ? '' : 's'}, ${created.sequence.length.toLocaleString()} bp consensus).`)
      return
    }
    const { record, members } = await createDnaLibraryFromFiles(files, { name: files.length === 1 ? files[0]!.name : DEFAULT_DNA_LIBRARY_NAME, topology: 'linear', alignPending })
    options.openRecordInNewTab({ ...record, traceFiles: members }, { initiallyUnsaved: true })
    options.setStatus(`Created DNA library “${record.name}” (${members.length} member${members.length === 1 ? '' : 's'}, ${record.sequence.length.toLocaleString()} bp consensus).`)
  }

  async function convertOpenConstructToLibraryFromMembers(additionalMembers: TraceFileRecord[]) {
    if (!options.canConvertToLibrary) return
    const converted = convertConstructToLibrary(options.recordRef.current, additionalMembers)
    options.pushDocumentHistorySnapshot()
    options.updateRecord(() => converted.record, { recordHistory: false })
    options.onTraceFilesChange(converted.members)
    options.setSelectedLibraryMemberIds([])
    options.setMemberTabAnchorId(null)
    options.setSelectedAlignmentTraceId(null)
    options.setDatabaseLibraryMemberPick(null)
    options.setDatabaseOpen(false)
    options.setActiveTab('Members')
    options.setStatus(`Converted to DNA library (${converted.members.length.toLocaleString()} members, ${converted.record.sequence.length.toLocaleString()} bp consensus).`)
  }

  async function convertOpenConstructToLibraryFromFiles(files: File[]) {
    await convertOpenConstructToLibraryFromMembers(await options.parseMemberFiles(files))
  }

  async function convertOpenConstructToLibraryFromDatabase(projectIds: string[]) {
    if (!options.canConvertToLibrary) return void options.setStatus('Open a DNA construct with a sequence to convert it to a library.')
    const uniqueIds = [...new Set(projectIds)]
    if (!uniqueIds.length) return void options.setStatus('Select at least one DNA construct from Database.')
    options.setStatus('Converting to library…')
    try {
      const entries = (await options.loadProjects(uniqueIds)).map((record) => libraryMemberSequenceEntryFromRecord(record, { skipRecordId: options.recordRef.current.id })).filter(Boolean)
      if (!entries.length) return void options.setStatus('Select DNA constructs (not libraries or proteins) to convert with.')
      const traces = entries.map((entry) => ({ ...traceRecordFromSequence(entry!.sequence, entry!.name), features: entry!.features, primers: entry!.primers }))
      await convertOpenConstructToLibraryFromMembers(traces)
    } catch (error) { options.setStatus(error instanceof Error ? error.message : 'Could not convert to library.') }
  }

  async function rebuildLibraryConsensusFromMembers() {
    if (!isDnaLibraryRecord(options.record)) return
    const generation = ++consensusGenerationRef.current
    consensusAbortRef.current?.abort()
    const controller = new AbortController()
    consensusAbortRef.current = controller
    const sourceRecord = options.record
    const sourceTraces = options.traceFiles
    options.setStatus('Rebuilding library consensus…')
    const enabledCount = sourceTraces.filter((member) => member.enabled && !member.parseError && member.sequence.length > 0).length
    const progress = options.beginProgress('Rebuilding library consensus', enabledCount * 2)
    try {
      const rebuilt = await rebuildDnaLibraryConsensusAsync(sourceRecord.sequence, sourceTraces, sourceRecord.topology, controller.signal, (phase, completed, total) => progress.update(phase === 'seed' ? completed : total + completed, total * 2, `${phase === 'seed' ? 'Seed' : 'Polished'} alignment ${completed} of ${total}`), alignPending)
      if (controller.signal.aborted || generation !== consensusGenerationRef.current || options.recordRef.current.id !== sourceRecord.id || options.recordRef.current.sequence !== sourceRecord.sequence || options.traceFilesRef.current !== sourceTraces) return
      const { consensus, members } = rebuilt
      if (consensus === sourceRecord.sequence) { options.onTraceFilesChange(members); options.setStatus('Consensus unchanged.'); return }
      options.pushDocumentHistorySnapshot()
      options.lastAlignedSequenceRef.current = consensus
      options.setTracesNeedRealign(false)
      options.onTraceFilesChange(members)
      options.applyConsensusReplacement(consensus, sourceRecord.sequence.length)
      options.setStatus(`Rebuilt consensus (${consensus.length.toLocaleString()} bp) from ${members.filter((member) => member.enabled && member.sequence).length} enabled members.`)
    } catch (error) {
      if (!controller.signal.aborted && generation === consensusGenerationRef.current) options.setStatus(`Could not rebuild consensus: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      progress.finish()
      if (consensusAbortRef.current === controller) consensusAbortRef.current = null
    }
  }

  function scheduleLibraryMemberAssemble(keptId: string) {
    if (!isDnaLibraryRecord(options.record)) return
    assembleAbortByIdRef.current.get(keptId)?.abort()
    const controller = new AbortController()
    assembleAbortByIdRef.current.set(keptId, controller)
    const topology = options.record.topology
    const consensus = options.record.sequence
    void (async () => {
      try {
        const pending = options.traceFilesRef.current.find((member) => member.id === keptId)
        if (!pending?.reads?.length) return
        const assembled = await reassembleLibraryMemberAsync(pending, { topology, signal: controller.signal })
        if (controller.signal.aborted) return
        const latest = options.traceFilesRef.current.find((member) => member.id === keptId)
        if (!latest?.reads) return
        if (latest.reads.length !== pending.reads.length) {
          if (assembleAbortByIdRef.current.get(keptId) === controller) {
            assembleAbortByIdRef.current.delete(keptId)
          }
          return void scheduleLibraryMemberAssemble(keptId)
        }
        const [aligned] = await realignTraceFileRecordsAsync([assembled], consensus, { force: true, topology, signal: controller.signal, alignPending })
        if (controller.signal.aborted || !aligned) return
        const still = options.traceFilesRef.current.find((member) => member.id === keptId)
        if (!still?.reads || still.reads.length !== pending.reads.length) {
          if (assembleAbortByIdRef.current.get(keptId) === controller) {
            assembleAbortByIdRef.current.delete(keptId)
          }
          return void scheduleLibraryMemberAssemble(keptId)
        }
        const next = options.traceFilesRef.current.map((member) => member.id === keptId ? aligned : member)
        options.traceFilesRef.current = next
        options.onTraceFilesChange(next)
        if (assembleAbortByIdRef.current.get(keptId) === controller) {
          assembleAbortByIdRef.current.delete(keptId)
        }
        options.setStatus(`Grouped into “${aligned.fileName}” (${aligned.reads?.length ?? 0} reads, ${aligned.sequence.length.toLocaleString()} bp assembled).`)
      } catch (error) {
        if (!controller.signal.aborted && !(error instanceof DOMException && error.name === 'AbortError')) options.setStatus(error instanceof Error ? error.message : 'Could not assemble grouped member.')
      }
    })()
  }

  function groupLibraryMembers(memberIds: string[], keepMemberId?: string) {
    if (!isDnaLibraryRecord(options.record)) return
    try {
      const nested = nestLibraryMembersAsClone(options.traceFilesRef.current, memberIds, { keepMemberId })
      const keptId = keepMemberId ?? nested.find((member) => memberIds.includes(member.id) && (member.reads?.length ?? 0) > 0)?.id ?? null
      const kept = keptId ? nested.find((member) => member.id === keptId) : null
      options.pushDocumentHistorySnapshot()
      options.traceFilesRef.current = nested
      if (options.commitLibraryMembersOrCollapse(nested, { alreadyPushedHistory: true, statusIfMembers: kept ? `Grouped into “${kept.fileName}” (${kept.reads?.length ?? 0} reads) — assembling…` : 'Grouped members — assembling…' })) return
      options.setSelectedAlignmentTraceId(kept?.id ?? null)
      if (keptId) scheduleLibraryMemberAssemble(keptId)
    } catch (error) { options.setStatus(error instanceof Error ? error.message : 'Could not group members.') }
  }

  function combineLibraryMembersFromGroups(groups: ProposedLibraryCombineGroup[]) {
    if (!isDnaLibraryRecord(options.record) || groups.length === 0) return
    try {
      let current = options.traceFilesRef.current
      for (const group of groups) current = nestLibraryMembersAsClone(current, group.memberIds, { keepMemberId: group.keepMemberId, name: group.suggestedName })
      options.pushDocumentHistorySnapshot()
      options.traceFilesRef.current = current
      options.setCombineLibraryReadsOpen(false)
      if (options.commitLibraryMembersOrCollapse(current, { alreadyPushedHistory: true, statusIfMembers: `Combined ${groups.length} member${groups.length === 1 ? '' : 's'} (${groups.length} clones) — assembling…` })) return
      const keptIds = groups.map((group) => group.keepMemberId)
      options.setSelectedAlignmentTraceId(keptIds[0] ?? null)
      for (const keptId of keptIds) scheduleLibraryMemberAssemble(keptId)
    } catch (error) { options.setStatus(error instanceof Error ? error.message : 'Could not combine reads.') }
  }

  function reassembleSelectedLibraryMember(memberId: string) {
    if (!isDnaLibraryRecord(options.record)) return
    const member = options.traceFiles.find((trace) => trace.id === memberId)
    if (!member?.reads?.length) return void options.setStatus('That member has no nested reads to assemble.')
    try {
      const assembled = reassembleLibraryMember(member, { topology: options.record.topology })
      const [aligned] = realignTraceFileRecords([assembled], options.record.sequence, { force: true, topology: options.record.topology })
      if (!aligned) return
      options.pushDocumentHistorySnapshot()
      options.onTraceFilesChange(options.traceFiles.map((trace) => trace.id === memberId ? aligned : trace))
      options.setSelectedAlignmentTraceId(memberId)
      options.setStatus(`Reassembled “${assembled.fileName}” (${assembled.sequence.length.toLocaleString()} bp from ${assembled.reads?.length ?? 0} reads).`)
    } catch (error) { options.setStatus(error instanceof Error ? error.message : 'Could not assemble member.') }
  }

  function detachReadFromLibraryMember(memberId: string, readId: string) {
    if (!isDnaLibraryRecord(options.record)) return
    try {
      const next = detachLibraryMemberRead(options.traceFiles, memberId, readId, { topology: options.record.topology })
      options.pushDocumentHistorySnapshot()
      options.onTraceFilesChange(realignTraceFileRecords(next, options.record.sequence, { force: false, topology: options.record.topology }))
      options.setStatus('Detached read into its own library member.')
    } catch (error) { options.setStatus(error instanceof Error ? error.message : 'Could not detach read.') }
  }

  function acceptLibraryReadBaseAtTemplate(memberId: string, templateIndex: number, displayBase: string) {
    if (!isDnaLibraryRecord(options.record)) return
    const member = options.traceFilesRef.current.find((trace) => trace.id === memberId)
    if (!member) return
    try {
      const edited = applyMemberSequenceEditAtTemplateRange(member, templateIndex, templateIndex + 1, displayBase, options.record.topology, options.record.sequence)
      const [aligned] = realignTraceFileRecords([edited], options.record.sequence, { force: true, topology: options.record.topology })
      if (!aligned) return
      options.pushDocumentHistorySnapshot()
      const next = options.traceFilesRef.current.map((trace) => trace.id === memberId ? aligned : trace)
      options.traceFilesRef.current = next
      options.onTraceFilesChange(next)
      options.setSelectedAlignmentTraceId(memberId)
      options.setStatus(`Set member base at consensus ${templateIndex + 1} to ${displayBase.toUpperCase()}.`)
    } catch (error) { options.setStatus(error instanceof Error ? error.message : 'Could not apply read base.') }
  }

  function cropDnaLibraryToSelection() {
    if (!isDnaLibraryRecord(options.record)) return
    if (!options.selectedRange || options.selectedRange.start === options.selectedRange.end || options.cutStrandSelection) return void options.setStatus('Select a consensus range before cropping the library.')
    const { start, end } = options.selectedRange
    try {
      const { consensus, members } = cropDnaLibraryToTemplateRange(options.record.sequence, options.traceFiles, start, end, options.record.topology)
      options.pushDocumentHistorySnapshot()
      options.lastAlignedSequenceRef.current = consensus
      options.setTracesNeedRealign(false)
      options.onTraceFilesChange(members)
      options.updateRecord((current) => {
        let next = current
        if (end < current.sequence.length) next = { ...next, sequence: next.sequence.slice(0, end), ...applySequenceReplacementAnnotations(next, end, current.sequence.length, 0) }
        if (start > 0) { const before = applySequenceReplacementAnnotations(next, 0, start, 0); next = { ...next, sequence: next.sequence.slice(start), features: before.features, primers: before.primers } }
        return { ...next, sequence: consensus, operations: [...next.operations, { id: createId('op'), type: 'cropDnaLibrary', summary: `Cropped DNA library to ${start + 1}..${end} (${consensus.length} bp)`, createdAt: nowIso() }] }
      }, { recordHistory: false })
      options.setSelectedAlignmentTraceId(null)
      options.setSequenceRange({ start: 0, end: 0 }, { collapsed: true })
      options.setStatus(`Cropped library to ${consensus.length.toLocaleString()} bp consensus.`)
    } catch (error) { options.setStatus(error instanceof Error ? error.message : 'Could not crop library.') }
  }

  async function flipDnaLibraryOrientation() {
    if (!isDnaLibraryRecord(options.record)) return
    const generation = ++flipGenerationRef.current
    flipAbortRef.current?.abort()
    const controller = new AbortController()
    flipAbortRef.current = controller
    const sourceRecord = options.record
    const sourceTraces = options.traceFilesRef.current
    const progress = options.beginProgress('Flipping DNA library', sourceTraces.filter((member) => !member.parseError).length)
    options.setStatus('Flipping library and aligning members…')
    try {
      const { record: flipped, members } = await flipDnaLibraryAsync(sourceRecord, sourceTraces, sourceRecord.topology, controller.signal, (completed, total) => progress.update(completed, total, `${completed} of ${total} members aligned`), alignPending)
      if (controller.signal.aborted || generation !== flipGenerationRef.current || options.recordRef.current.id !== sourceRecord.id || options.recordRef.current.sequence !== sourceRecord.sequence || options.traceFilesRef.current !== sourceTraces) return
      options.pushDocumentHistorySnapshot(); options.lastAlignedSequenceRef.current = flipped.sequence; options.setTracesNeedRealign(false); options.traceFilesRef.current = members; options.onTraceFilesChange(members)
      options.updateRecord(() => addOperation(flipped, 'flip', 'Reverse-complemented the library'))
      options.setSelectedFeatureId(null); options.setSelectedPrimerId(null); options.setCutStrandSelection(null); options.setCutSelectionEnzymes(null); options.setCutSelectionAnchor(null); options.setSelectionFocus('dna'); options.setSelectedRange(null)
      options.setStatus(`Flipped library (${flipped.sequence.length.toLocaleString()} bp). Consensus and members reverse-complemented; alignments rebuilt.`)
    } catch (error) { if (!controller.signal.aborted && generation === flipGenerationRef.current) options.setStatus(error instanceof Error ? error.message : 'Could not flip library.') }
    finally { progress.finish(); if (flipAbortRef.current === controller) flipAbortRef.current = null }
  }

  function flipLibraryMemberOrientation(memberId: string) {
    if (!isDnaLibraryRecord(options.record)) return
    const member = options.traceFilesRef.current.find((trace) => trace.id === memberId)
    if (!member) return void options.setStatus('That library member is no longer available.')
    if (member.parseError || !member.sequence.length) return void options.setStatus(`Cannot flip ${member.fileName}: no usable sequence.`)
    try { options.pushDocumentHistorySnapshot(); const flipped = flipLibraryMember(member, options.record.sequence, options.record.topology); const next = options.traceFilesRef.current.map((trace) => trace.id === memberId ? flipped : trace); options.traceFilesRef.current = next; options.onTraceFilesChange(next); options.setStatus(`Flipped ${member.fileName} (${flipped.sequence.length.toLocaleString()} bp, now ${flipped.alignment?.orientation === 'reverse' ? 'reverse' : 'forward'} vs consensus).`) }
    catch (error) { options.setStatus(error instanceof Error ? error.message : 'Could not flip library member.') }
  }

  function openLibraryMemberAsConstruct(memberId: string) {
    if (!isDnaLibraryRecord(options.record)) return
    const member = options.traceFilesRef.current.find((trace) => trace.id === memberId)
      ?? options.traceFiles.find((trace) => trace.id === memberId)
    if (!member) return void options.setStatus('That library member is no longer available.')
    if (member.parseError || !member.sequence.length) return void options.setStatus(`Cannot open ${member.fileName} as a construct: no usable sequence.`)
    const sourceOrigin = options.documentOrigin.kind === 'database'
      ? libraryMemberWorkspaceDocumentOrigin({
          projectId: options.documentOrigin.projectId,
          folderId: options.documentOrigin.folderId,
          memberId: member.id,
          parentUpdatedAt: options.record.updatedAt,
        })
      : undefined
    options.openRecordInNewTab(
      constructRecordFromLibraryMember(member, { topology: 'linear', libraryName: options.record.name }),
      {
        initiallyUnsaved: true,
        ...(sourceOrigin?.kind === 'library-member'
          ? { documentOrigin: sourceOrigin, folderId: sourceOrigin.folderId }
          : {}),
      },
    )
    options.setStatus(`Opened ${member.fileName} as a construct.`)
  }

  return { addLibraryMembersFromFiles, addLibraryMembersFromDatabase, beginLibraryMemberReorderDrag, createDnaLibraryFromDroppedOrPickedFiles, convertOpenConstructToLibraryFromMembers, convertOpenConstructToLibraryFromFiles, convertOpenConstructToLibraryFromDatabase, rebuildLibraryConsensusFromMembers, scheduleLibraryMemberAssemble, groupLibraryMembers, combineLibraryMembersFromGroups, reassembleSelectedLibraryMember, detachReadFromLibraryMember, acceptLibraryReadBaseAtTemplate, cropDnaLibraryToSelection, flipDnaLibraryOrientation, flipLibraryMemberOrientation, openLibraryMemberAsConstruct }
}
