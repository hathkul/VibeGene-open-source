import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react'
import { applyLibraryMemberDeduplication, findLibraryDuplicateSequenceGroups, type LibraryDeduplicatePlanGroup, type LibraryDuplicateSequenceGroup } from '../../domain/libraryMemberDeduplicate'
import { isDnaLibraryRecord } from '../../domain/dnaLibrary'
import { getLibraryReferenceMemberId, isLibraryConsensusEnabled, withLibraryConsensusEnabled, withLibraryReferenceMemberId } from '../../domain/libraryMemberFeatures'
import type { SequenceRecord } from '../../domain/types'
import type { TraceFileRecord } from '../../domain/traceTypes'
import type { LibraryMemberTabSortDirection, LibraryMemberTabSortMode } from '../../domain/libraryMemberTab'
import {
  dedupeFocusedMemberReplacement,
  dedupeReferenceReplacement,
  referenceSelectionState,
  selectLibraryMember,
  selectedLibraryMemberIdsForDelete,
} from '../../application/databaseLibrary/memberTransitions'

type MemberNameState = {
  editingMemberNameId: string | null
  setEditingMemberNameId: (id: string | null) => void
  memberNameDraft: string
  setMemberNameDraft: (name: string) => void
}

type DatabaseLibraryMemberActionsOptions = {
  selectedLibraryMemberIds: string[]
  setSelectedLibraryMemberIds: Dispatch<SetStateAction<string[]>>
  memberTabAnchorId: string | null
  setMemberTabAnchorId: Dispatch<SetStateAction<string | null>>
  memberTabSortMode: LibraryMemberTabSortMode
  setMemberTabSortMode: (mode: LibraryMemberTabSortMode) => void
  setMemberTabSortDirection: React.Dispatch<React.SetStateAction<LibraryMemberTabSortDirection>>
  memberName: MemberNameState
  setDedupeLibraryMembersGroups: (groups: LibraryDuplicateSequenceGroup[] | null) => void
  getRecord: () => SequenceRecord
  getTraceFiles: () => TraceFileRecord[]
  getSelectedAlignmentTraceId: () => string | null
  onTraceFilesChange: (updater: SetStateAction<TraceFileRecord[]>) => void
  updateRecord: (updater: (current: SequenceRecord) => SequenceRecord, options?: { recordHistory?: boolean }) => void
  pushDocumentHistorySnapshot: () => void
  commitLibraryMembersOrCollapse: (nextMembers: TraceFileRecord[], options?: { alreadyPushedHistory?: boolean; statusIfMembers?: string }) => boolean
  setSelectedAlignmentTraceId: (id: string | null) => void
  setStatus: (message: string) => void
  membersAddMenuOpen: boolean
  setMembersAddMenuOpen: (open: boolean) => void
}

export function useDatabaseLibraryMemberActions({
  selectedLibraryMemberIds,
  setSelectedLibraryMemberIds,
  memberTabAnchorId,
  setMemberTabAnchorId,
  memberTabSortMode,
  setMemberTabSortMode,
  setMemberTabSortDirection,
  memberName,
  setDedupeLibraryMembersGroups,
  getRecord,
  getTraceFiles,
  getSelectedAlignmentTraceId,
  onTraceFilesChange,
  updateRecord,
  pushDocumentHistorySnapshot,
  commitLibraryMembersOrCollapse,
  setSelectedAlignmentTraceId,
  setStatus,
  membersAddMenuOpen,
  setMembersAddMenuOpen,
}: DatabaseLibraryMemberActionsOptions) {
  const membersAddMenuRef = useRef<HTMLDivElement | null>(null)
  const skipMemberNameCommitRef = useRef(false)
  const selectLibraryMemberTabRow = useCallback((memberId: string, event: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }, rowIds: readonly string[]) => {
    const next = selectLibraryMember({ rowIds, selectedIds: selectedLibraryMemberIds, anchorId: memberTabAnchorId, memberId, shiftKey: event.shiftKey, additive: event.metaKey || event.ctrlKey })
    if (!next) return
    setMemberTabAnchorId(next.anchorId)
    setSelectedLibraryMemberIds(next.selectedIds)
    setSelectedAlignmentTraceId(next.focusedId)
    if (next.message) setStatus(next.message)
  }, [memberTabAnchorId, selectedLibraryMemberIds, setMemberTabAnchorId, setSelectedAlignmentTraceId, setSelectedLibraryMemberIds, setStatus])

  const setLibraryMemberEnabled = useCallback((memberId: string, enabled: boolean) => {
    onTraceFilesChange((current) => current.map((trace) => (trace.id === memberId ? { ...trace, enabled } : trace)))
  }, [onTraceFilesChange])
  const setAllLibraryMembersEnabled = useCallback((enabled: boolean) => {
    onTraceFilesChange((current) => current.map((trace) => ({ ...trace, enabled, expanded: enabled ? trace.expanded : false })))
  }, [onTraceFilesChange])
  const beginLibraryMemberNameEdit = useCallback((memberId: string, currentName: string) => {
    memberName.setEditingMemberNameId(memberId)
    memberName.setMemberNameDraft(currentName)
    setSelectedLibraryMemberIds([memberId])
    setMemberTabAnchorId(memberId)
    setSelectedAlignmentTraceId(memberId)
  }, [memberName, setMemberTabAnchorId, setSelectedAlignmentTraceId, setSelectedLibraryMemberIds])
  const commitLibraryMemberNameEdit = useCallback(() => {
    if (skipMemberNameCommitRef.current) {
      skipMemberNameCommitRef.current = false
      memberName.setEditingMemberNameId(null)
      return
    }
    const memberId = memberName.editingMemberNameId
    const trimmed = memberName.memberNameDraft.trim()
    memberName.setEditingMemberNameId(null)
    if (!memberId || !trimmed) return
    const current = getTraceFiles().find((trace) => trace.id === memberId)
    if (!current || current.fileName === trimmed) return
    onTraceFilesChange((members) => members.map((trace) => (trace.id === memberId ? { ...trace, fileName: trimmed } : trace)))
    setStatus(`Renamed member to ${trimmed}.`)
  }, [getTraceFiles, memberName, onTraceFilesChange, setStatus])
  const cancelLibraryMemberNameEdit = useCallback(() => {
    skipMemberNameCommitRef.current = true
    memberName.setEditingMemberNameId(null)
  }, [memberName])

  const removeLibraryMembers = useCallback((ids: string[]) => {
    if (!ids.length) return
    const idSet = new Set(ids)
    const record = getRecord()
    const traceFiles = getTraceFiles()
    const names = traceFiles.filter((trace) => idSet.has(trace.id)).map((trace) => trace.fileName)
    const referenceId = getLibraryReferenceMemberId(record)
    const nextMembers = traceFiles.filter((trace) => !idSet.has(trace.id))
    pushDocumentHistorySnapshot()
    if (referenceId && idSet.has(referenceId) && nextMembers.length > 1) updateRecord((current) => withLibraryReferenceMemberId(current, null), { recordHistory: false })
    setSelectedLibraryMemberIds((current) => current.filter((id) => !idSet.has(id)))
    setMemberTabAnchorId((current) => (current && idSet.has(current) ? null : current))
    const focusedId = getSelectedAlignmentTraceId()
    if (focusedId && idSet.has(focusedId)) setSelectedAlignmentTraceId(null)
    commitLibraryMembersOrCollapse(nextMembers, { alreadyPushedHistory: true, statusIfMembers: names.length === 1 ? `Deleted member ${names[0]}.` : `Deleted ${names.length} members.` })
  }, [commitLibraryMembersOrCollapse, getRecord, getSelectedAlignmentTraceId, getTraceFiles, pushDocumentHistorySnapshot, setMemberTabAnchorId, setSelectedAlignmentTraceId, setSelectedLibraryMemberIds, updateRecord])
  const deleteSelectedLibraryMembers = useCallback(() => {
    const ids = selectedLibraryMemberIdsForDelete(selectedLibraryMemberIds, getSelectedAlignmentTraceId())
    if (!ids.length) return setStatus('Select a library member to delete.')
    removeLibraryMembers(ids)
  }, [getSelectedAlignmentTraceId, removeLibraryMembers, selectedLibraryMemberIds, setStatus])
  const openDeduplicateLibraryMembers = useCallback(() => {
    const record = getRecord()
    if (!isDnaLibraryRecord(record)) return
    const groups = findLibraryDuplicateSequenceGroups(getTraceFiles(), { referenceMemberId: getLibraryReferenceMemberId(record) })
    if (!groups.length) return setStatus('No duplicate member sequences found.')
    setDedupeLibraryMembersGroups(groups)
  }, [getRecord, getTraceFiles, setDedupeLibraryMembersGroups, setStatus])
  const confirmDeduplicateLibraryMembers = useCallback((groups: LibraryDeduplicatePlanGroup[]) => {
    const record = getRecord()
    if (!isDnaLibraryRecord(record) || groups.length === 0) return setDedupeLibraryMembersGroups(null)
    const removeIds = new Set<string>()
    const keepIds = new Set<string>()
    for (const group of groups) {
      keepIds.add(group.keepMemberId)
      for (const id of group.memberIds) if (id !== group.keepMemberId) removeIds.add(id)
    }
    const referenceId = getLibraryReferenceMemberId(record)
    const nextMembers = applyLibraryMemberDeduplication(getTraceFiles(), groups)
    pushDocumentHistorySnapshot()
    if (referenceId && removeIds.has(referenceId) && nextMembers.length > 1) updateRecord((current) => withLibraryReferenceMemberId(current, dedupeReferenceReplacement(groups, removeIds, referenceId) ?? null), { recordHistory: false })
    setSelectedLibraryMemberIds((current) => current.filter((id) => !removeIds.has(id)))
    setMemberTabAnchorId((current) => (current && removeIds.has(current) ? null : current))
    const focusedId = getSelectedAlignmentTraceId()
    if (focusedId && removeIds.has(focusedId)) setSelectedAlignmentTraceId(dedupeFocusedMemberReplacement(groups, focusedId, keepIds))
    setDedupeLibraryMembersGroups(null)
    commitLibraryMembersOrCollapse(nextMembers, { alreadyPushedHistory: true, statusIfMembers: `Deduplicated ${groups.length} group${groups.length === 1 ? '' : 's'} (removed ${removeIds.size} member${removeIds.size === 1 ? '' : 's'}).` })
  }, [commitLibraryMembersOrCollapse, getRecord, getSelectedAlignmentTraceId, getTraceFiles, pushDocumentHistorySnapshot, setDedupeLibraryMembersGroups, setMemberTabAnchorId, setSelectedAlignmentTraceId, setSelectedLibraryMemberIds, updateRecord])
  const setLibraryAnnotationReference = useCallback((memberId: string | null) => {
    const record = getRecord()
    if (!isDnaLibraryRecord(record)) return
    if (getLibraryReferenceMemberId(record) === memberId) return
    if (memberId && !getTraceFiles().some((trace) => trace.id === memberId)) return setStatus('That library member is no longer available.')
    const selection = referenceSelectionState(memberId)
    updateRecord((current) => withLibraryConsensusEnabled(withLibraryReferenceMemberId(current, selection.referenceId), selection.consensusEnabled), { recordHistory: false })
    if (memberId != null && getSelectedAlignmentTraceId() == null) {
      const firstEnabled = getTraceFiles().find((trace) => trace.enabled && trace.sequence.length > 0)
      if (firstEnabled) setSelectedAlignmentTraceId(firstEnabled.id)
    }
    const label = memberId ? (getTraceFiles().find((trace) => trace.id === memberId)?.fileName ?? 'member') : 'consensus'
    setStatus(memberId ? `Library annotation reference set to ${label}; consensus hidden.` : `Library annotation reference set to ${label}.`)
  }, [getRecord, getSelectedAlignmentTraceId, getTraceFiles, setSelectedAlignmentTraceId, setStatus, updateRecord])
  const setLibraryConsensusEnabled = useCallback((enabled: boolean) => {
    const record = getRecord()
    if (!isDnaLibraryRecord(record) || isLibraryConsensusEnabled(record) === enabled) return
    updateRecord((current) => withLibraryConsensusEnabled(current, enabled), { recordHistory: false })
    if (!enabled && getSelectedAlignmentTraceId() == null) {
      const firstEnabled = getTraceFiles().find((trace) => trace.enabled && trace.sequence.length > 0)
      if (firstEnabled) setSelectedAlignmentTraceId(firstEnabled.id)
    }
    setStatus(enabled ? 'Consensus shown.' : 'Consensus hidden.')
  }, [getRecord, getSelectedAlignmentTraceId, getTraceFiles, setSelectedAlignmentTraceId, setStatus, updateRecord])
  const toggleMemberTabSort = useCallback((mode: LibraryMemberTabSortMode) => {
    if (memberTabSortMode === mode) return setMemberTabSortDirection((current) => current === 'asc' ? 'desc' : 'asc')
    setMemberTabSortMode(mode)
    setMemberTabSortDirection(mode === 'name' || mode === 'status' || mode === 'orientation' ? 'asc' : 'desc')
  }, [memberTabSortMode, setMemberTabSortDirection, setMemberTabSortMode])
  useEffect(() => {
    if (!membersAddMenuOpen) return
    const handlePointerDown = (event: PointerEvent) => {
      if (!membersAddMenuRef.current?.contains(event.target as Node)) setMembersAddMenuOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => document.removeEventListener('pointerdown', handlePointerDown, true)
  }, [membersAddMenuOpen, setMembersAddMenuOpen])
  return { selectLibraryMemberTabRow, setLibraryMemberEnabled, setAllLibraryMembersEnabled, beginLibraryMemberNameEdit, commitLibraryMemberNameEdit, cancelLibraryMemberNameEdit, removeLibraryMembers, deleteSelectedLibraryMembers, openDeduplicateLibraryMembers, confirmDeduplicateLibraryMembers, setLibraryAnnotationReference, setLibraryConsensusEnabled, toggleMemberTabSort, membersAddMenuRef }
}
