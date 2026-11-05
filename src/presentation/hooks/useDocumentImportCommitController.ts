import { useCallback } from 'react'
import type { PreparedImportedFile } from '../../application/documentImport/prepareImportedFile'
import { planProjectImportCommit, planSnapGeneImportCommit } from '../../application/documentImport/importCommitPlan'
import type { CommonFeatureTemplate } from '../../domain/commonFeatures'
import type { MwLadder } from '../../domain/mwLadders'
import type { PersistedVisualSettings } from '../../domain/displaySettingsPreferences'
import type { SequenceRecord } from '../../domain/types'
import type { TraceFileRecord } from '../../domain/traceTypes'
import type { DisplaySettings } from '../sequence'

type SnapGenePrepared = Extract<PreparedImportedFile, { kind: 'snapgene' }>
type ProjectPrepared = Extract<PreparedImportedFile, { kind: 'project' }>

export type DocumentImportCommitOptions = {
  setDisplaySettings: (updater: DisplaySettings | ((current: DisplaySettings) => DisplaySettings)) => void
  setRecord: (record: SequenceRecord) => void
  setLibraryFolderId: (folderId: string | null | undefined) => void
  setWorkspaceDiskPath: (path: string | null) => void
  applyDefaultMapViewForTopology: (topology: SequenceRecord['topology'], sequenceLength?: number) => void
  setTraceFiles: (recordId: string, traces: TraceFileRecord[]) => void
  clearDocumentSelection: () => void
  setActiveTabForRecord: (record: SequenceRecord) => void
  setAlignmentsVisible: () => void
  setLastAlignedSequence: (sequence: string) => void
  setTracesNeedRealign: (value: boolean) => void
  markClean: (record: SequenceRecord, traces: TraceFileRecord[]) => void
  touchRecentLocalFile: (path: string, fileName: string) => void
  setStatus: (status: string) => void
  addImportOperation: (record: SequenceRecord, fileName: string) => SequenceRecord
  mergeUserCommonFeatures: (features: CommonFeatureTemplate[]) => void
  mergeCustomMwLadders: (ladders: MwLadder[]) => void
  mergeDisplaySettingsFromProject: (partial: unknown, topology: SequenceRecord['topology']) => DisplaySettings
  loadPersistedVisualSettings: () => PersistedVisualSettings | undefined
  persistVisualSettingsFromPatch: (patch: unknown) => void
}

/** Owns SnapGene and project import commit orchestration; App.tsx supplies concrete state and adapter ports. */
export function useDocumentImportCommitController(options: DocumentImportCommitOptions) {
  const commitSnapGeneImport = useCallback((prepared: SnapGenePrepared, fileName: string, localPath?: string) => {
    const imported = options.addImportOperation(prepared.record, fileName)
    options.setLastAlignedSequence(imported.sequence)
    options.setTracesNeedRealign(false)
    const plan = planSnapGeneImportCommit({
      record: imported,
      fileName,
      traceCount: prepared.traces.length,
      enzymeDisplay: prepared.enzymeDisplay,
    })
    options.setDisplaySettings((current) => ({
      ...current,
      enzymes: {
        ...current.enzymes,
        ...(plan.enzymeDisplay ? {
          set: plan.enzymeDisplay.set,
          supplierSetId: plan.enzymeDisplay.supplierSetId ?? null,
          ...(plan.enzymeDisplay.selectedNames ? { selectedNames: plan.enzymeDisplay.selectedNames } : {}),
        } : {}),
        // Visibility is document metadata: SnapGene's block 0x1c explicitly
        // lists hidden enzymes, while files without the block mean none hidden.
        hiddenNames: imported.snapGeneEnzymes?.hiddenEnzymeNames ?? [],
      },
    }))
    options.setRecord(imported)
    options.setLibraryFolderId(undefined)
    options.setWorkspaceDiskPath(localPath ?? null)
    options.applyDefaultMapViewForTopology(imported.topology, imported.sequence.length)
    options.setTraceFiles(imported.id, prepared.traces)
    options.clearDocumentSelection()
    options.setActiveTabForRecord(imported)
    if (plan.showLibraryAlignments) options.setAlignmentsVisible()
    const unavailableCount = plan.enzymeDisplay?.unavailableNames?.length ?? 0
    options.setStatus(unavailableCount
      ? `${plan.status} ${unavailableCount} enzyme${unavailableCount === 1 ? ' is' : 's are'} unavailable in VibeGene's catalog and cannot be scanned.`
      : plan.status)
    options.markClean(imported, prepared.traces)
    if (localPath) options.touchRecentLocalFile(localPath, fileName)
  }, [options])

  const commitProjectImport = useCallback((prepared: ProjectPrepared, fileName: string, localPath?: string) => {
    const { project } = prepared
    if (project.userCommonFeatures?.length) options.mergeUserCommonFeatures(project.userCommonFeatures)
    if (project.customMwLadders?.length) options.mergeCustomMwLadders(project.customMwLadders)
    const imported = options.addImportOperation(project.record, fileName)
    const plan = planProjectImportCommit({
      record: imported,
      fileName,
      commonFeatureCount: project.userCommonFeatures?.length ?? 0,
      customMwLadderCount: project.customMwLadders?.length ?? 0,
      hasVisualSettings: project.displaySettings != null,
    })
    options.setRecord(imported)
    options.setLibraryFolderId(undefined)
    options.setWorkspaceDiskPath(localPath ?? null)
    options.setDisplaySettings(options.mergeDisplaySettingsFromProject(project.displaySettings ?? options.loadPersistedVisualSettings(), imported.topology))
    if (project.displaySettings != null) options.persistVisualSettingsFromPatch(project.displaySettings)
    options.setTraceFiles(imported.id, imported.traceFiles ?? [])
    options.clearDocumentSelection()
    options.setActiveTabForRecord(imported)
    if (plan.showLibraryAlignments) options.setAlignmentsVisible()
    options.setStatus(plan.status)
    options.markClean(imported, imported.traceFiles ?? [])
    if (localPath) options.touchRecentLocalFile(localPath, fileName)
  }, [options])

  return { commitSnapGeneImport, commitProjectImport }
}
