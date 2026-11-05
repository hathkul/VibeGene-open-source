import { useCallback, useEffect, useRef, useState } from 'react'
import { CloningRecordWorkspace } from '../App'
import { CommonFeaturesBrowseDialog } from '../CommonFeaturesBrowseDialog'
import { lazyDialog } from '../ui/lazyDialog'
import { EnzymeInfoDialog } from '../EnzymeInfoDialog'
import { PrimerPropertiesDialog } from '../PrimerPropertiesDialog'
import {
  NewDnaFileDialog,
} from '../NewDnaFileDialog'
import { createSequenceRecordFromNewDnaFile, type NewDnaFileResult } from '../domain/newDnaFile'
import { NewProteinFileDialog } from '../NewProteinFileDialog'
import { createSequenceRecordFromNewProteinFile, type NewProteinFileResult } from '../domain/newProteinFile'
import { GeneticCodeTablesDialog, LetterCodesDialog } from '../ToolsDialogs'
import { PreferencesDialog } from '../PreferencesDialog'
import { readAppPreferences } from '../domain/appPreferences'
import { databaseWorkspaceDocumentOrigin } from '../domain/workspaceDocumentOrigin'
import { deleteProject, listProjectSummaries, putHandoffRecord, type StoredProjectSummary } from '../storage/projects'
import { subscribeLibraryChanged, writeHandoffDocumentOrigin, writeHandoffFolderId } from '../storage/libraryEvents'
import { writeDatabaseWindowSize } from '../storage/databaseUiPrefs'
import { enzymes } from '../domain/enzymes'
import { createId } from '../domain/sequence'
import { openWorkspaceWindowWithHandoff } from './workspaceWindow'
import { installHybridFallbackNativeAppMenu } from './nativeAppMenu'
import {
  cancelDatabaseConstructPick,
  completeDatabaseConstructPick,
  clearHybridPayload,
  closeCurrentHybridWindow,
  createStandaloneAgaroseGelPayload,
  emitHybridResult,
  emitDatabaseProjectsDrag,
  emitDatabasePrimersDrag,
  fitCurrentHybridWindowToContent,
  HYBRID_WINDOW_SPECS,
  readHybridPayload,
  readPrimerPropertiesPayload,
  subscribeHybridPayloadUpdates,
  type AgaroseGelPayload,
  type HybridWindowKind,
  type PrimerPropertiesPayload,
} from './hybridWindows'
import { subscribeDesktopCloseRequested, subscribeDesktopQuitRequested } from './windowCloseGuard'
import {
  quitNativeAppAfterDatabaseSync,
  scheduleDatabaseBackgroundSync,
} from './syncOnExit'
import { syncNativeWindowTitle } from './windowTitle'
import { isLastVisibleAppWindow } from './workspaceWindows'
import type { AgaroseGelDnaSource } from '../domain/agaroseGelLibrary'
import { StartupWindow } from '../StartupWindow'

const LazyDatabaseManagerDialog = lazyDialog(
  () => import('../DatabaseManagerDialog'),
  (module) => module.DatabaseManagerDialog,
)

const LazyAgaroseGelDialog = lazyDialog(
  () => import('../AgaroseGelDialog'),
  (module) => module.AgaroseGelDialog,
)

async function finishClose(kind: HybridWindowKind): Promise<boolean> {
  // Closing a utility/Database window is never an application shutdown.
  // Keep sync noninteractive and let the surviving process flush in backgound.
  void isLastVisibleAppWindow().then((last) => {
    if (last) scheduleDatabaseBackgroundSync()
  }).catch(console.warn)
  const constructPickRequestId =
    kind === 'database' ? readHybridPayload('database')?.constructPick?.requestId : undefined
  clearHybridPayload(kind)
  try {
    if (kind === 'database' && constructPickRequestId) {
      await emitHybridResult({
        kind: 'database',
        type: 'construct-pick-cancelled',
        requestId: constructPickRequestId,
      })
    } else {
      await emitHybridResult({ kind, type: 'closed' })
    }
  } finally {
    await closeCurrentHybridWindow(kind)
  }
  return true
}

/** Keep the OS window inner size matched to a dialog's natural layout. */
function useFitHybridWindowToDialog(dialogSelector: string, contentKey?: string) {
  const lastFitKeyRef = useRef('')
  const fittingRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    let debounceTimer = 0

    const runFit = async () => {
      const el = document.querySelector(dialogSelector) as HTMLElement | null
      if (!el || cancelled) return
      if (fittingRef.current) {
        scheduleFit()
        return
      }

      const rect = el.getBoundingClientRect()
      const width = Math.max(el.offsetWidth, el.scrollWidth, Math.ceil(rect.width))
      const height = Math.max(el.offsetHeight, el.scrollHeight, Math.ceil(rect.height))
      const key = `${width}x${height}`
      if (key === lastFitKeyRef.current) return

      fittingRef.current = true
      try {
        const fitted = await fitCurrentHybridWindowToContent(el, { lockSize: true })
        if (!cancelled && fitted) {
          // Keep the unpadded content key so a successful fit doesn't thrash.
          lastFitKeyRef.current = key
        }
      } finally {
        fittingRef.current = false
      }
    }

    const scheduleFit = () => {
      window.clearTimeout(debounceTimer)
      debounceTimer = window.setTimeout(() => {
        void runFit()
      }, 32)
    }

    // Fit once at launch and once after lazy content settles. Observing the
    // dialog continuously creates a native resize/content-size feedback loop.
    scheduleFit()
    const late = window.setTimeout(scheduleFit, 120)

    return () => {
      cancelled = true
      window.clearTimeout(debounceTimer)
      window.clearTimeout(late)
    }
  }, [dialogSelector, contentKey])
}

function LetterCodesHost() {
  useFitHybridWindowToDialog('.tools-letter-codes-dialog')
  return (
    <LetterCodesDialog
      onClose={() => {
        void finishClose('letter-codes')
      }}
    />
  )
}

function PreferencesHost() {
  const [tab, setTab] = useState('general')
  useFitHybridWindowToDialog('.preferences-dialog', tab)
  return (
    <PreferencesDialog
      initial={readAppPreferences()}
      onTabChange={setTab}
      onClose={() => {
        void finishClose('preferences')
      }}
      onSave={async (preferences) => {
        try {
          const { emit } = await import('@tauri-apps/api/event')
          await emit('vg-app-preferences-changed', preferences)
        } catch {
          // ignore
        }
      }}
    />
  )
}

function GeneticCodeTablesHost() {
  useFitHybridWindowToDialog('.tools-genetic-code-dialog')
  return (
    <GeneticCodeTablesDialog
      onClose={() => {
        void finishClose('genetic-code-tables')
      }}
    />
  )
}

function EnzymeDatabaseHost() {
  const [initialName, setInitialName] = useState(() => {
    return (
      readHybridPayload('enzyme-database')?.initialEnzymeName ??
      enzymes[0]?.name ??
      'EcoRI'
    )
  })

  useEffect(() => {
    let unlisten: (() => void) | undefined
    void subscribeHybridPayloadUpdates('enzyme-database', () => {
      setInitialName(
        readHybridPayload('enzyme-database')?.initialEnzymeName ??
          enzymes[0]?.name ??
          'EcoRI',
      )
    }).then((stop) => {
      unlisten = stop
    })
    return () => unlisten?.()
  }, [])

  return (
    <EnzymeInfoDialog
      key={initialName}
      initialEnzymeName={initialName}
      onClose={() => {
        void finishClose('enzyme-database')
      }}
    />
  )
}

function CommonFeaturesBrowseHost() {
  return (
    <CommonFeaturesBrowseDialog
      onCancel={() => {
        void finishClose('common-features-browse')
      }}
      renderWorkspace={(args) => <CloningRecordWorkspace {...args} />}
    />
  )
}

function isAgaroseGelDnaSource(entry: unknown): entry is AgaroseGelDnaSource {
  if (!entry || typeof entry !== 'object') return false
  const value = entry as { label?: unknown; record?: { sequence?: unknown }; enzymeNames?: unknown }
  if (typeof value.label !== 'string' || !value.record || typeof value.record.sequence !== 'string') {
    return false
  }
  if (value.enzymeNames !== undefined) {
    if (!Array.isArray(value.enzymeNames) || value.enzymeNames.some((name) => typeof name !== 'string')) {
      return false
    }
  }
  return true
}

function readAgaroseGelPayload(): AgaroseGelPayload {
  const payload = readHybridPayload('agarose-gel')
  const record = payload?.currentRecord
  if (!record || typeof record.sequence !== 'string') {
    // Tools menu / stale empty payload: open a blank gel instead of failing.
    return createStandaloneAgaroseGelPayload({
      openedAt: typeof payload?.openedAt === 'number' ? payload.openedAt : Date.now(),
      initialSamples: Array.isArray(payload?.initialSamples)
        ? payload.initialSamples.filter(isAgaroseGelDnaSource)
        : [],
      libraryMemberSources: Array.isArray(payload?.libraryMemberSources)
        ? payload.libraryMemberSources.filter(isAgaroseGelDnaSource)
        : undefined,
      currentSourceLabel:
        typeof payload?.currentSourceLabel === 'string' ? payload.currentSourceLabel : undefined,
      currentTabId: typeof payload?.currentTabId === 'string' ? payload.currentTabId : 'standalone',
    })
  }
  const initialSamples = Array.isArray(payload?.initialSamples)
    ? payload.initialSamples.filter(isAgaroseGelDnaSource)
    : undefined
  const libraryMemberSources = Array.isArray(payload?.libraryMemberSources)
    ? payload.libraryMemberSources.filter(isAgaroseGelDnaSource)
    : undefined
  return {
    currentRecord: record,
    currentTabId: typeof payload?.currentTabId === 'string' ? payload.currentTabId : 'main',
    openedAt: typeof payload?.openedAt === 'number' ? payload.openedAt : Date.now(),
    initialSamples,
    libraryMemberSources,
    currentSourceLabel:
      typeof payload?.currentSourceLabel === 'string' ? payload.currentSourceLabel : undefined,
  }
}

function AgaroseGelHost() {
  const [payload, setPayload] = useState<AgaroseGelPayload>(() => readAgaroseGelPayload())
  const [gelLoadError, setGelLoadError] = useState<string | null>(null)

  useEffect(() => {
    let unlisten: (() => void) | undefined
    void subscribeHybridPayloadUpdates('agarose-gel', () => {
      setPayload(readAgaroseGelPayload())
    }).then((stop) => {
      unlisten = stop
    })
    return () => unlisten?.()
  }, [])

  if (gelLoadError) {
    return (
      <div className="translation-dialog-backdrop">
        <div className="translation-dialog" role="dialog" aria-label="Agarose gel">
          <p>{gelLoadError}</p>
        </div>
      </div>
    )
  }

  const currentRecord = payload.currentRecord
  if (!currentRecord) {
    return null
  }

  return (
    <LazyAgaroseGelDialog
      key={payload.openedAt ?? 'gel'}
      currentRecord={currentRecord}
      currentTabId={payload.currentTabId ?? 'standalone'}
      initialSamples={payload.initialSamples}
      libraryMemberSources={payload.libraryMemberSources}
      currentSourceLabel={payload.currentSourceLabel}
      onClose={() => {
        void finishClose('agarose-gel')
      }}
      renderWorkspace={(args) => <CloningRecordWorkspace {...args} />}
      onLoadError={(error) => {
        console.error('Could not load the agarose gel dialog.', error)
        setGelLoadError('Could not load the agarose gel window content.')
      }}
    />
  )
}

function DatabaseHost() {
  const closingRef = useRef(false)
  const [projects, setProjects] = useState<StoredProjectSummary[] | null>(null)
  const [currentRecordId, setCurrentRecordId] = useState<string | null>(
    () => readHybridPayload('database')?.currentRecordId ?? null,
  )
  const [alignmentPick, setAlignmentPick] = useState(
    () => readHybridPayload('database')?.alignmentPick ?? null,
  )
  const [constructPick, setConstructPick] = useState(
    () => readHybridPayload('database')?.constructPick ?? null,
  )
  const [libraryMemberPick, setLibraryMemberPick] = useState(
    () => readHybridPayload('database')?.libraryMemberPick ?? null,
  )
  const [managerLoadError, setManagerLoadError] = useState<string | null>(null)

  const cancelConstructSelection = useCallback(async () => {
    const requestId = constructPick?.requestId
    if (!requestId) return
    setConstructPick(null)
    await cancelDatabaseConstructPick(requestId)
  }, [constructPick?.requestId])

  const refresh = useCallback(async () => {
    return listProjectSummaries()
  }, [])

  useEffect(() => {
    let cancelled = false
    void refresh().then((next) => {
      if (!cancelled) setProjects(next)
    })
    return () => {
      cancelled = true
    }
  }, [refresh])

  useEffect(() => {
    let cancelled = false
    let unlisten: (() => void) | undefined
    void subscribeDesktopCloseRequested(async (preventClose) => {
      if (cancelled) return
      preventClose()
      if (closingRef.current) return
      closingRef.current = true
      try {
        await finishClose('database')
      } finally {
        // The Database webview is retained and can be reopened many times.
        closingRef.current = false
      }
    }).then((stop) => {
      if (cancelled) stop()
      else unlisten = stop
    })
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [])

  useEffect(() => subscribeLibraryChanged(() => {
    void refresh().then(setProjects)
  }), [refresh])

  useEffect(() => {
    let unlisten: (() => void) | undefined
    void subscribeHybridPayloadUpdates('database', () => {
      const payload = readHybridPayload('database')
      setCurrentRecordId(payload?.currentRecordId ?? null)
      setAlignmentPick(payload?.alignmentPick ?? null)
      setConstructPick(payload?.constructPick ?? null)
      setLibraryMemberPick(payload?.libraryMemberPick ?? null)
      void refresh().then(setProjects)
    }).then((stop) => {
      unlisten = stop
    })
    return () => unlisten?.()
  }, [refresh])

  useEffect(() => {
    let cancelled = false
    let unlisten: (() => void) | undefined
    let debounceTimer = 0

    void (async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window')
        const win = getCurrentWindow()
        const persist = async () => {
          try {
            const factor = await win.scaleFactor()
            const physical = await win.innerSize()
            writeDatabaseWindowSize({
              width: Math.round(physical.width / factor),
              height: Math.round(physical.height / factor),
            })
          } catch {
            // ignore
          }
        }
        unlisten = await win.onResized(() => {
          window.clearTimeout(debounceTimer)
          debounceTimer = window.setTimeout(() => {
            void persist()
          }, 120)
        })
        if (cancelled) {
          unlisten()
          return
        }
        // Capture size once on open in case prefs were empty / defaults used.
        void persist()
      } catch {
        // Non-Tauri / capability missing
      }
    })()

    return () => {
      cancelled = true
      window.clearTimeout(debounceTimer)
      unlisten?.()
      // Flush latest size on close so a quick resize+close is not lost.
      void (async () => {
        try {
          const { getCurrentWindow } = await import('@tauri-apps/api/window')
          const win = getCurrentWindow()
          const factor = await win.scaleFactor()
          const physical = await win.innerSize()
          writeDatabaseWindowSize({
            width: Math.round(physical.width / factor),
            height: Math.round(physical.height / factor),
          })
        } catch {
          // ignore
        }
      })()
    }
  }, [])

  if (managerLoadError) {
    return (
      <div className="translation-dialog-backdrop">
        <div className="translation-dialog" role="dialog" aria-label="Database">
          <p>{managerLoadError}</p>
        </div>
      </div>
    )
  }

  if (!projects) {
    return (
      <div className="translation-dialog-backdrop">
        <div className="translation-dialog" role="dialog" aria-label="Database">
          <p>Loading database…</p>
          {constructPick && (
            <footer className="translation-dialog-footer">
              <button type="button" onClick={() => void cancelConstructSelection()}>
                {constructPick.cancelLabel ?? 'Cancel cloning selection'}
              </button>
            </footer>
          )}
        </div>
      </div>
    )
  }

  return (
    <LazyDatabaseManagerDialog
      projects={projects}
      currentRecordId={currentRecordId}
      alignmentPick={alignmentPick}
      constructPick={constructPick}
      libraryMemberPick={libraryMemberPick}
      onLoadError={(error) => {
        console.error('Could not load the Database manager.', error)
        setManagerLoadError('Could not load the Database window content.')
      }}
      onCancelConstructPick={constructPick ? () => void cancelConstructSelection() : undefined}
      onClose={() => {
        void finishClose('database')
      }}
      onRefresh={() => { void refresh().then(setProjects) }}
      onDragProjectsToWorkspace={(projectIds) => { void emitDatabaseProjectsDrag(projectIds) }}
      onDragPrimersToWorkspace={(primers) => { void emitDatabasePrimersDrag(primers) }}
      onOpenProject={(project) => {
        void (async () => {
          try {
            const { focusExistingWorkspaceDocument } = await import('./workspaceDocumentRegistry')
            if (
              project.documentOrigin?.kind !== 'library-member'
              && await focusExistingWorkspaceDocument({ kind: 'database', projectId: project.id })
            ) {
              await emitHybridResult({
                kind: 'database',
                type: 'status',
                message: `Brought “${project.name}” to the front.`,
              })
              return
            }
            const key = createId('hist')
            const documentOrigin = project.documentOrigin
              ?? databaseWorkspaceDocumentOrigin(project.id, project.folderId)
            await putHandoffRecord(key, project.record, documentOrigin)
            writeHandoffFolderId(key, project.folderId ?? null)
            writeHandoffDocumentOrigin(key, documentOrigin)
            const opened = await openWorkspaceWindowWithHandoff(key, {
              title: `${project.name} — from Database`,
              focus: true,
              ...(documentOrigin.kind === 'database' ? { projectId: project.id } : {}),
            })
            await emitHybridResult({
              kind: 'database',
              type: 'status',
              message: opened === 'focused'
                ? `Brought “${project.name}” to the front.`
                : opened === 'opened'
                  ? `Opened ${project.name} in a new window.`
                  : `Could not open ${project.name} in a new window.`,
            })
          } catch (error) {
            await emitHybridResult({
              kind: 'database',
              type: 'status',
              message: `Could not open project: ${error instanceof Error ? error.message : String(error)}`,
            })
          }
        })()
      }}
      onAddPrimersToCurrent={(primers) => {
        void emitHybridResult({
          kind: 'database',
          type: 'add-primers',
          targetRecordId: currentRecordId,
          primers: primers.map((primer) => ({
            name: primer.name,
            sequence: primer.sequence,
            color: primer.color,
            description: primer.description,
          })),
        })
      }}
      onAddToAlignment={(constructs) => {
        if (!alignmentPick) return
        void emitHybridResult({
          kind: 'database',
          type: 'add-to-alignment',
          mode: alignmentPick.mode,
          targetRecordId: alignmentPick.targetRecordId,
          constructs,
        })
      }}
      onAddLibraryMembers={(projectIds) => {
        if (!libraryMemberPick) return
        void emitHybridResult({
          kind: 'database',
          type: 'add-library-members',
          targetRecordId: libraryMemberPick.targetRecordId,
          projectIds,
        })
      }}
      onAddConstruct={(project) => {
        if (!constructPick) return
        void (async () => {
          await emitHybridResult({
            kind: 'database',
            type: 'add-construct',
            requestId: constructPick.requestId,
            projectId: project.id,
          })
          await completeDatabaseConstructPick(constructPick.requestId)
        })()
      }}
      onAddConstructs={(selectedProjects) => {
        if (!constructPick?.multiple) return
        void (async () => {
          await emitHybridResult({
            kind: 'database',
            type: 'add-constructs',
            requestId: constructPick.requestId,
            projectIds: selectedProjects.map((project) => project.id),
          })
          await completeDatabaseConstructPick(constructPick.requestId)
        })()
      }}
      onDeleteProjects={async (projectIds) => {
        await Promise.all(projectIds.map((projectId) => deleteProject(projectId)))
      }}
      onStatus={(message) => {
        void emitHybridResult({ kind: 'database', type: 'status', message })
      }}
      onOpenPrimerProperties={(primer) => {
        void emitHybridResult({ kind: 'database', type: 'open-primer-properties', primer })
      }}
    />
  )
}

function NewDnaFileHost() {
  useFitHybridWindowToDialog('.new-dna-dialog')

  const handleCreate = useCallback(async (result: NewDnaFileResult) => {
    const next = createSequenceRecordFromNewDnaFile(result)
    const key = createId('hist')
    try {
      await putHandoffRecord(key, next)
      const opened = await openWorkspaceWindowWithHandoff(key, {
        title: next.name,
        focus: true,
        initiallyUnsaved: true,
      })
      if (!opened) {
        await emitHybridResult({
          kind: 'new-dna-file',
          type: 'status',
          message: 'Could not open the new DNA file in a workspace window.',
        })
        return
      }
      await emitHybridResult({
        kind: 'new-dna-file',
        type: 'status',
        message: `Created ${next.name}.dna (${next.topology}, ${next.sequence.length} bp).`,
      })
      await finishClose('new-dna-file')
    } catch (error) {
      await emitHybridResult({
        kind: 'new-dna-file',
        type: 'status',
        message: `Could not create DNA file: ${error instanceof Error ? error.message : String(error)}`,
      })
    }
  }, [])

  return (
    <NewDnaFileDialog
      onCancel={() => {
        void finishClose('new-dna-file')
      }}
      onCreate={(result) => {
        void handleCreate(result)
      }}
    />
  )
}

function NewProteinFileHost() {
  useFitHybridWindowToDialog('.new-dna-dialog')

  const handleCreate = useCallback(async (result: NewProteinFileResult) => {
    const next = createSequenceRecordFromNewProteinFile(result)
    const key = createId('hist')
    try {
      await putHandoffRecord(key, next)
      const opened = await openWorkspaceWindowWithHandoff(key, {
        title: next.name,
        focus: true,
        initiallyUnsaved: true,
      })
      if (!opened) {
        await emitHybridResult({
          kind: 'new-protein-file',
          type: 'status',
          message: 'Could not open the new protein file in a workspace window.',
        })
        return
      }
      await emitHybridResult({
        kind: 'new-protein-file',
        type: 'status',
        message: `Created ${next.name} (${next.sequence.length} aa).`,
      })
      await finishClose('new-protein-file')
    } catch (error) {
      await emitHybridResult({
        kind: 'new-protein-file',
        type: 'status',
        message: `Could not create protein file: ${error instanceof Error ? error.message : String(error)}`,
      })
    }
  }, [])

  return (
    <NewProteinFileDialog
      onCancel={() => {
        void finishClose('new-protein-file')
      }}
      onCreate={(result) => {
        void handleCreate(result)
      }}
    />
  )
}

function PrimerPropertiesHost() {
  useFitHybridWindowToDialog('.primer-properties-dialog')
  const [payload, setPayload] = useState<PrimerPropertiesPayload | null>(() => readPrimerPropertiesPayload())

  useEffect(() => {
    let unlisten: (() => void) | undefined
    void subscribeHybridPayloadUpdates('primer-properties', () => {
      setPayload(readPrimerPropertiesPayload())
    }).then((stop) => {
      unlisten = stop
    })
    return () => unlisten?.()
  }, [])

  if (!payload) {
    return (
      <div className="modal-backdrop">
        <div className="primer-editor-dialog primer-properties-dialog" role="dialog" aria-label="Primer Properties">
          <p>No primer was provided.</p>
          <footer className="primer-editor-footer">
            <button type="button" onClick={() => void finishClose('primer-properties')}>
              Close
            </button>
          </footer>
        </div>
      </div>
    )
  }

  return (
    <PrimerPropertiesDialog
      key={`${payload.name}:${payload.sequence}`}
      primer={payload}
      templateSequence={payload.templateSequence}
      preferredStrand={payload.preferredStrand}
      bindings={payload.bindings}
      onClose={() => {
        void finishClose('primer-properties')
      }}
    />
  )
}

export function HybridWindowHost({ kind }: { kind: HybridWindowKind }) {
  useEffect(() => subscribeLibraryChanged(() => {
    scheduleDatabaseBackgroundSync()
  }), [])

  useEffect(() => {
    let cancelled = false
    let unlisten: (() => void) | undefined
    void subscribeDesktopQuitRequested(() => {
      if (!cancelled) void quitNativeAppAfterDatabaseSync()
    }).then((stop) => {
      if (cancelled) stop()
      else unlisten = stop
    })
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [])

  useEffect(() => {
    document.documentElement.classList.add('vg-hybrid-window')
    const spec = HYBRID_WINDOW_SPECS[kind]
    document.documentElement.classList.toggle('vg-hybrid-fit-content', !!spec.fitToContent)
    document.title = spec.title
    void syncNativeWindowTitle(spec.title)
    return () => {
      document.documentElement.classList.remove('vg-hybrid-window', 'vg-hybrid-fit-content')
    }
  }, [kind])

  // Database / startup outlive construct windows; reclaim the native menu so File → New
  // still works when no workspace webview remains to own MenuItem callbacks.
  useEffect(() => {
    if (kind !== 'database' && kind !== 'startup') return
    let stop: (() => void) | undefined
    void installHybridFallbackNativeAppMenu().then((unlisten) => {
      stop = unlisten
    })
    return () => stop?.()
  }, [kind])

  switch (kind) {
    case 'startup':
      return <StartupWindow />
    case 'letter-codes':
      return <LetterCodesHost />
    case 'preferences':
      return <PreferencesHost />
    case 'genetic-code-tables':
      return <GeneticCodeTablesHost />
    case 'enzyme-database':
      return <EnzymeDatabaseHost />
    case 'common-features-browse':
      return <CommonFeaturesBrowseHost />
    case 'agarose-gel':
      return <AgaroseGelHost />
    case 'database':
      return <DatabaseHost />
    case 'new-dna-file':
      return <NewDnaFileHost />
    case 'new-protein-file':
      return <NewProteinFileHost />
    case 'primer-properties':
      return <PrimerPropertiesHost />
    default:
      return null
  }
}
