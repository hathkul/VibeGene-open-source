import { useCallback, useEffect, useRef, useState } from 'react'
import { normalizeSequenceRecord } from '../domain/constructProperties'
import { hydrateLibraryTracesFromDocument } from '../domain/libraryMemberFeatures'
import { isSnapGeneBytes, parseSnapGene } from '../domain/parsers'
import type { SequenceRecord } from '../domain/types'
import { lazyDialog } from '../ui/lazyDialog'

const LazyDatabaseManagerDialog = lazyDialog(
  () => import('../DatabaseManagerDialog'),
  (module) => module.DatabaseManagerDialog,
)
import {
  deleteProject,
  getProjectFileBlob,
  getProject,
  listProjectSummaries,
  type StoredProject,
  type StoredProjectSummary,
} from '../storage/projects'
import { touchRecentDatabaseProject } from '../storage/recentFiles'
import {
  cancelDatabaseConstructPick,
  openOrFocusHybridWindow,
  subscribeHybridResults,
  type DatabaseConstructPick,
} from '../desktop/hybridWindows'
import { isTauriRuntime } from '../desktop/tauriRuntime'

async function recoverImportedLibraryMembers(project: StoredProject): Promise<StoredProject> {
  if (
    project.documentRole !== 'library' &&
    project.record.dna?.documentRole !== 'library'
  ) return project
  // Older database records can retain member shells while dropping the aligned
  // sequences.  A non-empty array alone is not enough for a batch-cloning
  // source: it must contain at least one usable member to expand.
  if (project.record.traceFiles?.some((member) => !member.parseError && member.sequence.length > 0)) return project

  // Database imports made before library-aware importing retained the original
  // .dna bytes but dropped their alignment packets from the parsed record.
  const blob = await getProjectFileBlob(project.id)
  if (!blob || !isSnapGeneBytes(blob.bytes)) return project
  try {
    const parsed = parseSnapGene(blob.bytes, blob.fileName)
    if (!parsed.traceFiles?.length) return project
    const dna = {
      ...parsed.dna,
      ...project.record.dna,
      documentRole: 'library' as const,
    }
    const recordWithMembers = {
      ...project.record,
      dna,
      traceFiles: parsed.traceFiles,
    }
    return {
      ...project,
      documentRole: 'library',
      record: normalizeSequenceRecord({
        ...recordWithMembers,
        traceFiles: hydrateLibraryTracesFromDocument(recordWithMembers, parsed.traceFiles),
      }),
    }
  } catch {
    return project
  }
}

export function DatabaseConstructPickerDialog({
  excludeRecordId,
  topology,
  multiple = false,
  allowCurrent = false,
  confirmLabel,
  cancelLabel,
  title,
  molecules,
  onCancel,
  onSelect,
  onSelectMany,
}: {
  excludeRecordId?: string
  topology?: SequenceRecord['topology']
  multiple?: boolean
  /** When true, the open editor construct stays selectable (gel bulk add). */
  allowCurrent?: boolean
  confirmLabel?: string
  cancelLabel?: string
  title?: string
  molecules?: Array<'dna' | 'protein'>
  onCancel: () => void
  onSelect?: (record: SequenceRecord, project: StoredProjectSummary) => void
  onSelectMany?: (choices: Array<{ record: SequenceRecord; project: StoredProjectSummary }>) => void
}) {
  const [projects, setProjects] = useState<StoredProjectSummary[] | null>(null)
  const [status, setStatus] = useState('')
  const [managerLoadFailed, setManagerLoadFailed] = useState(false)
  const selectionReceivedRef = useRef(false)
  const openGenerationRef = useRef(0)
  const onCancelRef = useRef(onCancel)
  const onSelectRef = useRef(onSelect)
  const onSelectManyRef = useRef(onSelectMany)
  const [request] = useState<DatabaseConstructPick>(() => ({
    requestId: `cloning-construct-${crypto.randomUUID()}`,
    targetRecordId: excludeRecordId ?? '',
    topology,
    multiple,
    allowCurrent,
    confirmLabel,
    cancelLabel,
    title,
    molecules,
  }))

  useEffect(() => {
    onCancelRef.current = onCancel
    onSelectRef.current = onSelect
    onSelectManyRef.current = onSelectMany
  }, [onCancel, onSelect, onSelectMany])

  const refresh = useCallback(async () => {
    setProjects(await listProjectSummaries())
  }, [])

  const chooseProject = useCallback(
    async (project: StoredProject) => {
      const recovered = await recoverImportedLibraryMembers(project)
      touchRecentDatabaseProject(recovered.id, recovered.name)
      if (request.multiple) {
        onSelectManyRef.current?.([{ record: recovered.record, project: recovered }])
      } else {
        onSelectRef.current?.(recovered.record, recovered)
      }
    },
    [request.multiple],
  )

  const chooseProjects = useCallback(
    async (selectedProjects: StoredProject[]) => {
      const recovered = await Promise.all(selectedProjects.map(recoverImportedLibraryMembers))
      recovered.forEach((project) => touchRecentDatabaseProject(project.id, project.name))
      onSelectManyRef.current?.(
        recovered.map((project) => ({ record: project.record, project })),
      )
    },
    [],
  )

  useEffect(() => {
    if (isTauriRuntime()) return
    let cancelled = false
    void listProjectSummaries().then(
      (rows) => {
        if (!cancelled) setProjects(rows)
      },
      (reason) => {
        if (!cancelled) setStatus(reason instanceof Error ? reason.message : String(reason))
      },
    )
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!isTauriRuntime()) return
    let cancelled = false
    let unlisten: (() => void) | undefined
    const pick = request
    const generation = ++openGenerationRef.current

    void subscribeHybridResults(async (result) => {
      if (cancelled || result.kind !== 'database') return
      if (result.type === 'add-construct' && result.requestId === pick.requestId) {
        selectionReceivedRef.current = true
        const project = await getProject(result.projectId)
        if (!project) {
          setStatus('The selected database construct is no longer available.')
          return
        }
        chooseProject(project)
        return
      }
      if (result.type === 'add-constructs' && result.requestId === pick.requestId) {
        selectionReceivedRef.current = true
        const loaded = await Promise.all(result.projectIds.map((projectId) => getProject(projectId)))
        const available = loaded.filter((project): project is StoredProject => Boolean(project))
        if (available.length !== result.projectIds.length) {
          setStatus('One or more selected database constructs are no longer available.')
          return
        }
        chooseProjects(available)
        return
      }
      if (
        result.type === 'construct-pick-cancelled' &&
        result.requestId === pick.requestId &&
        !selectionReceivedRef.current
      ) {
        onCancelRef.current()
        return
      }
      if (result.type === 'closed' && !selectionReceivedRef.current) onCancelRef.current()
    }).then((stop) => {
      if (cancelled) stop()
      else unlisten = stop
    })

    void openOrFocusHybridWindow('database', {
      currentRecordId: pick.targetRecordId || null,
      alignmentPick: null,
      constructPick: pick,
      libraryMemberPick: null,
    }, {
      isCancelled: () => cancelled,
    }).then((opened) => {
      if (cancelled && opened && openGenerationRef.current === generation) {
        void cancelDatabaseConstructPick(pick.requestId)
        return
      }
      if (!opened && !cancelled) setStatus('Could not open the Database window.')
    })

    return () => {
      cancelled = true
      unlisten?.()
      queueMicrotask(() => {
        if (
          // Deliberately compare with the latest setup so StrictMode's probe cleanup cannot cancel it.
          // eslint-disable-next-line react-hooks/exhaustive-deps
          openGenerationRef.current === generation &&
          !selectionReceivedRef.current
        ) {
          void cancelDatabaseConstructPick(pick.requestId)
        }
      })
    }
  }, [chooseProject, chooseProjects, request])

  if (isTauriRuntime()) {
    return status ? (
      <p className="database-construct-picker-error" role="alert">{status}</p>
    ) : null
  }

  if (managerLoadFailed) {
    return (
      <div className="translation-dialog-backdrop database-construct-picker-backdrop">
        <div className="translation-dialog" role="dialog" aria-label="Database">
          <p>Could not load the Database dialog.</p>
          <footer className="translation-dialog-footer">
            <button type="button" onClick={onCancel}>{cancelLabel ?? 'Cancel'}</button>
          </footer>
        </div>
      </div>
    )
  }

  if (!projects) {
    return (
      <div className="translation-dialog-backdrop database-construct-picker-backdrop">
        <div className="translation-dialog" role="dialog" aria-label="Database">
          <p>{status || 'Loading database…'}</p>
          <footer className="translation-dialog-footer">
            <button type="button" onClick={onCancel}>{cancelLabel ?? 'Cancel'}</button>
          </footer>
        </div>
      </div>
    )
  }

  return (
    <div
      className="database-construct-picker-event-boundary"
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <LazyDatabaseManagerDialog
        projects={projects}
        currentRecordId={excludeRecordId ?? null}
        constructPick={request}
        onClose={onCancel}
        onCancelConstructPick={onCancel}
        onRefresh={refresh}
        onOpenProject={chooseProject}
        onAddPrimersToCurrent={() => {}}
        onAddConstruct={chooseProject}
        onAddConstructs={chooseProjects}
        onDeleteProjects={async (projectIds) => {
          await Promise.all(projectIds.map((projectId) => deleteProject(projectId)))
        }}
        onStatus={setStatus}
        onLoadError={(error) => {
          console.error('Could not load the Database manager.', error)
          setManagerLoadFailed(true)
        }}
      />
    </div>
  )
}
