import { useCallback, useRef, useState } from 'react'
import type { DatabaseAlignmentPick, DatabaseLibraryMemberPick } from '../../application/ports/hybridWindows'
import type { LibraryDuplicateSequenceGroup } from '../../domain/libraryMemberDeduplicate'
import type { LibraryMemberTabSortDirection, LibraryMemberTabSortMode } from '../../domain/libraryMemberTab'
import type { StoredProjectSummary } from '../../application/ports/projectPersistence'

type DatabaseWindowPayload = {
  currentRecordId: string
  alignmentPick: DatabaseAlignmentPick | null
  constructPick: null
  libraryMemberPick: DatabaseLibraryMemberPick | null
}

type DatabaseLibraryControllerOptions = {
  initialFolderId: string | null | undefined
  currentRecordId: string
  openDatabaseWindow: (payload: DatabaseWindowPayload) => Promise<boolean>
}

/** Owns database-window routing and shared library-member state. */
export function useDatabaseLibraryController({
  initialFolderId,
  currentRecordId,
  openDatabaseWindow: openDatabaseWindowAdapter,
}: DatabaseLibraryControllerOptions) {
  const [projects, setProjects] = useState<StoredProjectSummary[]>([])
  const [libraryFolderId, setLibraryFolderId] = useState<string | null | undefined>(initialFolderId)
  const [databaseSaveBusy, setDatabaseSaveBusy] = useState(false)
  const databaseSaveAsCopyRef = useRef(false)
  const [selectedLibraryMemberIds, setSelectedLibraryMemberIds] = useState<string[]>([])
  const [memberTabAnchorId, setMemberTabAnchorId] = useState<string | null>(null)
  const [memberTabSortMode, setMemberTabSortMode] = useState<LibraryMemberTabSortMode>('manual')
  const [memberTabSortDirection, setMemberTabSortDirection] = useState<LibraryMemberTabSortDirection>('asc')
  const [membersAddBusy, setMembersAddBusy] = useState(false)
  const [membersAddMenuOpen, setMembersAddMenuOpen] = useState(false)
  const [editingMemberNameId, setEditingMemberNameId] = useState<string | null>(null)
  const [memberNameDraft, setMemberNameDraft] = useState('')
  const [combineLibraryReadsOpen, setCombineLibraryReadsOpen] = useState(false)
  const [dedupeLibraryMembersGroups, setDedupeLibraryMembersGroups] = useState<LibraryDuplicateSequenceGroup[] | null>(null)
  const [databaseOpen, setDatabaseOpen] = useState(false)
  const [databaseAlignmentPick, setDatabaseAlignmentPick] = useState<DatabaseAlignmentPick | null>(null)
  const [databaseLibraryMemberPick, setDatabaseLibraryMemberPick] = useState<DatabaseLibraryMemberPick | null>(null)
  const [convertToLibrarySourceOpen, setConvertToLibrarySourceOpen] = useState(false)

  const presentDatabaseWindow = useCallback((options: {
    alignmentPick: DatabaseAlignmentPick | null
    libraryMemberPick: DatabaseLibraryMemberPick | null
  }) => {
    setDatabaseAlignmentPick(options.alignmentPick)
    setDatabaseLibraryMemberPick(options.libraryMemberPick)
    void openDatabaseWindowAdapter({
      currentRecordId,
      alignmentPick: options.alignmentPick,
      constructPick: null,
      libraryMemberPick: options.libraryMemberPick,
    }).then((opened) => {
      if (!opened) setDatabaseOpen(true)
    })
  }, [currentRecordId, openDatabaseWindowAdapter])
  const openDatabaseWindow = useCallback(() => {
    presentDatabaseWindow({ alignmentPick: null, libraryMemberPick: null })
  }, [presentDatabaseWindow])
  const openDatabaseForAlignment = useCallback((mode: DatabaseAlignmentPick['mode']) => {
    presentDatabaseWindow({ alignmentPick: { mode, targetRecordId: currentRecordId }, libraryMemberPick: null })
  }, [currentRecordId, presentDatabaseWindow])
  const openDatabaseForLibraryMembers = useCallback((purpose?: DatabaseLibraryMemberPick['purpose']) => {
    presentDatabaseWindow({ alignmentPick: null, libraryMemberPick: { targetRecordId: currentRecordId, ...(purpose ? { purpose } : {}) } })
  }, [currentRecordId, presentDatabaseWindow])

  return {
    projects, setProjects, libraryFolderId, setLibraryFolderId,
    databaseSaveBusy, setDatabaseSaveBusy, databaseSaveAsCopyRef,
    selectedLibraryMemberIds, setSelectedLibraryMemberIds,
    memberTabAnchorId, setMemberTabAnchorId,
    memberTabSortMode, setMemberTabSortMode, memberTabSortDirection, setMemberTabSortDirection,
    membersAddBusy, setMembersAddBusy, membersAddMenuOpen, setMembersAddMenuOpen,
    editingMemberNameId, setEditingMemberNameId, memberNameDraft, setMemberNameDraft,
    combineLibraryReadsOpen, setCombineLibraryReadsOpen,
    dedupeLibraryMembersGroups, setDedupeLibraryMembersGroups,
    databaseOpen, setDatabaseOpen, databaseAlignmentPick, setDatabaseAlignmentPick,
    databaseLibraryMemberPick, setDatabaseLibraryMemberPick,
    convertToLibrarySourceOpen, setConvertToLibrarySourceOpen,
    openDatabaseWindow, openDatabaseForAlignment, openDatabaseForLibraryMembers,
  }
}
