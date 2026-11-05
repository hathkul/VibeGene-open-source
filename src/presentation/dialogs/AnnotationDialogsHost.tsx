import type { Dispatch, ReactNode, SetStateAction } from 'react'
import type { SequenceFeature, SequenceRecord } from '../../domain/types'
import type { CloningWorkspaceRenderArgs } from '../../cloningWorkspaceTypes'
import type { TraceFileRecord } from '../../domain/traceTypes'
import type { FeatureEditorState } from '../../domain/featureQualifiers'
import { FeaturePropertiesDialog } from '../../FeaturePropertiesDialog'
import { ProteinFeaturePropertiesDialog } from '../../ProteinFeatureEditor'
import { CommonFeaturesDetectDialog } from '../../CommonFeaturesDetectDialog'
import { CrisprDetectionDialog } from '../../CrisprDetectionDialog'
import { FeaturesImportFromFileDialog } from '../../FeaturesImportFromFileDialog'
import { CommonFeaturesBrowseDialog } from '../../CommonFeaturesBrowseDialog'
import type { CommonFeatureMatch, CommonFeatureTemplate } from '../../domain/commonFeatures'
import type { CrisprDetectionResult } from '../../domain/crisprDetection'
import { isDnaLibraryRecord } from '../../domain/dnaLibrary'

export type AnnotationDialogsHostProps = {
  record: SequenceRecord
  traceFiles: TraceFileRecord[]
  featureEditor: FeatureEditorState | null
  setFeatureEditor: Dispatch<SetStateAction<FeatureEditorState | null>>
  setPendingFeatureMergeIds: (ids: string[] | null) => void
  saveFeatureEditor: (draft: FeatureEditorState) => void
  openFeatureDraftAsProtein: (draft: FeatureEditorState) => void
  proteinFeatureEditor: SequenceFeature | null
  setProteinFeatureEditor: Dispatch<SetStateAction<SequenceFeature | null>>
  saveProteinFeatureEditor: (feature: SequenceFeature) => void
  commonFeatureDetection: {
    matches: CommonFeatureMatch[]
    templates: CommonFeatureTemplate[]
    minimumIdentityPercent: number
  } | null
  redetectCommonFeatures: (minimumIdentityPercent: number) => void
  setCommonFeatureDetection: Dispatch<SetStateAction<AnnotationDialogsHostProps['commonFeatureDetection']>>
  addDetectedCommonFeatures: (features: SequenceFeature[]) => void
  crisprDetection: CrisprDetectionResult | null
  setCrisprDetection: Dispatch<SetStateAction<CrisprDetectionResult | null>>
  featuresImportFromFileOpen: boolean
  setFeaturesImportFromFileOpen: (open: boolean) => void
  otherOpenTabs: Array<{ tabId: string; name: string; molecule: SequenceRecord['molecule'] }>
  getOpenTabSession: (tabId: string) => Promise<{ record: SequenceRecord } | null>
  addImportedFeatures: (features: SequenceFeature[]) => void
  commonFeaturesBrowseOpen: boolean
  setCommonFeaturesBrowseOpen: (open: boolean) => void
  renderWorkspace: (args: CloningWorkspaceRenderArgs) => ReactNode
}

/** Hosts feature annotation editors, detection/import dialogs, and common-feature browsing. */
export function AnnotationDialogsHost(props: AnnotationDialogsHostProps) {
  const {
    record, traceFiles, featureEditor, setFeatureEditor, setPendingFeatureMergeIds,
    saveFeatureEditor, openFeatureDraftAsProtein, proteinFeatureEditor, setProteinFeatureEditor,
    saveProteinFeatureEditor, commonFeatureDetection, redetectCommonFeatures,
    setCommonFeatureDetection, addDetectedCommonFeatures, crisprDetection, setCrisprDetection,
    featuresImportFromFileOpen, setFeaturesImportFromFileOpen, otherOpenTabs,
    getOpenTabSession, addImportedFeatures, commonFeaturesBrowseOpen, setCommonFeaturesBrowseOpen,
    renderWorkspace,
  } = props
  return (
    <>
      {featureEditor && <FeaturePropertiesDialog draft={featureEditor} sequenceLength={featureEditor.libraryMemberId ? (traceFiles.find((trace) => trace.id === featureEditor.libraryMemberId)?.sequence.length ?? record.sequence.length) : record.sequence.length} sequence={featureEditor.libraryMemberId ? (traceFiles.find((trace) => trace.id === featureEditor.libraryMemberId)?.sequence ?? record.sequence) : record.sequence} topology={featureEditor.libraryMemberId ? 'linear' : record.topology} onCancel={() => { setFeatureEditor(null); setPendingFeatureMergeIds(null) }} onSave={saveFeatureEditor} onOpenAsProtein={openFeatureDraftAsProtein} />}
      {proteinFeatureEditor && <ProteinFeaturePropertiesDialog draft={proteinFeatureEditor} sequenceLength={record.sequence.length} onCancel={() => setProteinFeatureEditor(null)} onSave={saveProteinFeatureEditor} />}
      {commonFeatureDetection && <CommonFeaturesDetectDialog key={commonFeatureDetection.minimumIdentityPercent} recordName={record.name.endsWith('.dna') ? record.name : `${record.name}.dna`} record={record} matches={commonFeatureDetection.matches} minimumIdentityPercent={commonFeatureDetection.minimumIdentityPercent} onMinimumIdentityChange={redetectCommonFeatures} onCancel={() => setCommonFeatureDetection(null)} onAdd={addDetectedCommonFeatures} />}
      {crisprDetection && <CrisprDetectionDialog recordId={record.id} recordName={record.name.endsWith('.dna') ? record.name : `${record.name}.dna`} result={crisprDetection} onClose={() => setCrisprDetection(null)} />}
      {featuresImportFromFileOpen && <FeaturesImportFromFileDialog currentRecord={record} openTabs={otherOpenTabs} libraryMembers={isDnaLibraryRecord(record) ? traceFiles.filter((trace) => !trace.parseError && trace.sequence.length > 0) : undefined} onLoadOpenTab={async (openTabId) => (await getOpenTabSession(openTabId))?.record ?? null} onCancel={() => setFeaturesImportFromFileOpen(false)} onAdd={addImportedFeatures} />}
      {commonFeaturesBrowseOpen && <CommonFeaturesBrowseDialog onCancel={() => setCommonFeaturesBrowseOpen(false)} renderWorkspace={renderWorkspace} />}
    </>
  )
}
