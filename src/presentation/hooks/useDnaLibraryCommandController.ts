import { useCallback, useMemo, useRef, type MutableRefObject, type RefObject } from 'react'
import {
  canConvertConstructToLibrary,
  convertToLibraryPickerBlockedStatus,
  createdDnaLibraryStatusMessage,
  libraryCollapseStatusMessage,
} from '../../application/databaseLibrary/convertToLibraryEligibility'
import { planLibraryMemberCommit } from '../../application/databaseLibrary/memberTransitions'
import type {
  DnaLibraryCreationCommands,
  DnaLibraryConvertCommands,
  DnaLibraryNativePickerPort,
} from '../../application/ports/dnaLibraryCommandPorts'
import type { SequenceRecord } from '../../domain/types'
import type { TraceFileRecord } from '../../domain/traceTypes'

export type DnaLibraryCommandControllerOptions = {
  record: SequenceRecord
  recordRef: { current: SequenceRecord }
  nativePicker: DnaLibraryNativePickerPort
  createCommandsRef: MutableRefObject<DnaLibraryCreationCommands>
  convertCommandsRef: MutableRefObject<DnaLibraryConvertCommands>
  setStatus: (status: string) => void
  setConvertToLibrarySourceOpen: (open: boolean) => void
  openDatabaseForLibraryMembers: (purpose?: 'convert') => void
  onTraceFilesChange: (next: TraceFileRecord[] | ((current: TraceFileRecord[]) => TraceFileRecord[])) => void
  updateRecord: (updater: (current: SequenceRecord) => SequenceRecord, options?: { recordHistory?: boolean }) => void
  pushDocumentHistorySnapshot: () => void
  setSelectedLibraryMemberIds: (ids: string[]) => void
  setMemberTabAnchorId: (id: string | null) => void
  setSelectedAlignmentTraceId: (id: string | null) => void
}

/** Owns DNA-library creation/convert picker routing and member commit/collapse orchestration. */
export function useDnaLibraryCommandController(options: DnaLibraryCommandControllerOptions) {
  const libraryFileInputRef = useRef<HTMLInputElement | null>(null)
  const convertToLibraryFileInputRef = useRef<HTMLInputElement | null>(null)

  const canConvertToLibrary = useMemo(
    () => canConvertConstructToLibrary(options.record),
    [options.record],
  )
  const { createCommandsRef, convertCommandsRef, setStatus } = options

  const commitLibraryMembersOrCollapse = useCallback((
    nextMembers: TraceFileRecord[],
    commitOptions?: { alreadyPushedHistory?: boolean; statusIfMembers?: string },
  ): boolean => {
    const currentRecord = options.recordRef.current
    const plan = planLibraryMemberCommit(currentRecord, nextMembers)
    if (plan.kind === 'members') {
      options.onTraceFilesChange(nextMembers)
      if (commitOptions?.statusIfMembers) options.setStatus(commitOptions.statusIfMembers)
      return false
    }
    if (!commitOptions?.alreadyPushedHistory) options.pushDocumentHistorySnapshot()
    options.updateRecord(() => plan.record, { recordHistory: false })
    options.onTraceFilesChange([])
    options.setSelectedLibraryMemberIds([])
    options.setMemberTabAnchorId(null)
    options.setSelectedAlignmentTraceId(null)
    options.setStatus(libraryCollapseStatusMessage(nextMembers.length))
    return true
  }, [options])

  const convertOpenConstructToLibraryFromFiles = useCallback(async (files: File[]) => {
    try {
      await convertCommandsRef.current.convertOpenConstructToLibraryFromFiles(files)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not convert to library.')
    }
  }, [convertCommandsRef, setStatus])

  const createDnaLibraryFromFiles = useCallback(async (files: File[]) => {
    try {
      await createCommandsRef.current.createDnaLibraryFromFiles(files)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not create DNA library.')
    }
  }, [createCommandsRef, setStatus])

  const convertOpenConstructToLibraryFromDatabase = useCallback(async (projectIds: string[]) => {
    await options.convertCommandsRef.current.convertOpenConstructToLibraryFromDatabase(projectIds)
  }, [options.convertCommandsRef])

  const openNewDnaLibraryPicker = useCallback(() => {
    if (options.nativePicker.nativeRuntime) {
      void options.nativePicker.pickCreateLibraryInNewWindow()
        .then((created) => {
          if (!created) return
          options.setStatus(createdDnaLibraryStatusMessage(created))
        })
        .catch((error) => {
          options.setStatus(error instanceof Error ? error.message : 'Could not create DNA library.')
        })
      return
    }
    libraryFileInputRef.current?.click()
  }, [options])

  const openConvertToLibraryPicker = useCallback(() => {
    if (!canConvertToLibrary) {
      options.setStatus(convertToLibraryPickerBlockedStatus(options.record))
      return
    }
    options.setConvertToLibrarySourceOpen(true)
  }, [canConvertToLibrary, options])

  const openConvertToLibraryFromFiles = useCallback(() => {
    options.setConvertToLibrarySourceOpen(false)
    if (options.nativePicker.nativeRuntime) {
      void (async () => {
        try {
          const picked = await options.nativePicker.pickConvertToLibraryMemberFiles()
          if (picked.kind === 'cancelled') return
          if (picked.kind === 'unreadable') {
            options.setStatus('Could not read the selected files.')
            return
          }
          await convertOpenConstructToLibraryFromFiles(picked.files)
        } catch (error) {
          options.setStatus(error instanceof Error ? error.message : 'Could not convert to library.')
        }
      })()
      return
    }
    convertToLibraryFileInputRef.current?.click()
  }, [convertOpenConstructToLibraryFromFiles, options])

  const openDatabaseForConvertToLibrary = useCallback(() => {
    if (!canConvertToLibrary) return
    options.setConvertToLibrarySourceOpen(false)
    options.openDatabaseForLibraryMembers('convert')
  }, [canConvertToLibrary, options])

  return {
    canConvertToLibrary,
    libraryFileInputRef: libraryFileInputRef as RefObject<HTMLInputElement | null>,
    convertToLibraryFileInputRef: convertToLibraryFileInputRef as RefObject<HTMLInputElement | null>,
    openNewDnaLibraryPicker,
    openConvertToLibraryPicker,
    openConvertToLibraryFromFiles,
    openDatabaseForConvertToLibrary,
    createDnaLibraryFromFiles,
    convertOpenConstructToLibraryFromFiles,
    convertOpenConstructToLibraryFromDatabase,
    commitLibraryMembersOrCollapse,
  }
}
