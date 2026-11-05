import type { Dispatch, SetStateAction } from 'react'
import { defaultRangeForNewFeature, explicitDnaRangeForNewFeature, featureEditorFromFeature, featureEditorFromNewSelection, featureFromEditor, syncTranslatedFeaturesNotes, type FeatureEditorState } from '../../domain/featureQualifiers'
import { createProteinFeature } from '../../domain/proteinFeatures'
import { createId, featureBounds, formatRange } from '../../domain/sequence'
import { featureDisplayName } from '../map/mapPrimitives'
import { sgRnaVisualParts } from '../../presentation/map/mapPrimitives'
import { isDnaLibraryRecord } from '../../domain/dnaLibrary'
import { deleteMemberFeatures, getLibraryReferenceMemberId, mergeLiftedFeaturesIntoConsensus, projectFeatureOntoLibraryMembers, projectFeaturesOntoLibraryMembers, projectReferenceFeatureOntoLibrary, removeFeatureFromLibraryMembers, upsertMemberFeature } from '../../domain/libraryMemberFeatures'
import { remapFeaturesToTemplate } from '../../domain/traceAnnotationView'
import { normalizePeptide, createSequenceRecordFromDatabaseProtein } from '../../application/databaseProtein'
import { proteinComparisonSourcesFromLibraryFeature } from '../../domain/proteinComparisonFromLibrary'
import { proteinTranslationSourceFromRecord } from '../../domain/proteinTranslationProvenance'
import { sequenceRecordFromLibraryMember } from '../../domain/libraryMemberRecord'
import { translateFeature } from '../../domain/geneticCode'
import type { SelectionIntent } from '../../domain/selectionIntent'
import type { SequenceFeature, SequenceRecord } from '../../domain/types'
import type { TraceFileRecord } from '../../domain/traceTypes'
import { withLinkedSgRnaFeatureIds, type SelectionRange } from '../sequence'

export type FeatureEditorControllerOptions = {
  record: SequenceRecord
  getCurrentRecord: () => SequenceRecord
  traceFiles: TraceFileRecord[]
  activeTab: string
  alignmentsVisible: boolean
  selectedAlignmentTraceId: string | null
  featureTabSelectionMemberId: string | null
  selectedRange: SelectionRange | null
  selectionFocus: 'dna' | 'feature' | 'primer' | 'bond'
  selectedPrimerIds: string[]
  facingPrimerAmpliconRange: (selectedIds: string[]) => SelectionRange | null
  cutStrandSelection: unknown
  selectedFeatureId: string | null
  selectedFeature: SequenceFeature | null
  selectedFeatureIds: string[]
  selectableAnnotations: SequenceFeature[]
  featureSelectionMember: TraceFileRecord | null
  selectedAnnotation: SequenceFeature | null
  pendingFeatureMergeIds: string[] | null
  setPendingFeatureMergeIds: Dispatch<SetStateAction<string[] | null>>
  setFeatureEditor: Dispatch<SetStateAction<FeatureEditorState | null>>
  setProteinFeatureEditor: Dispatch<SetStateAction<SequenceFeature | null>>
  setSelectedAlignmentTraceId: (id: string | null) => void
  setSelectedFeatureId: (id: string | null) => void
  setSelectedFeatureIds: (ids: string[]) => void
  setFeatureTabSelectionMemberId: (id: string | null) => void
  setFeatureTabAnchor: (value: { featureId: string; memberId: string | null } | null) => void
  setSelectionFocus: (focus: 'dna' | 'feature' | 'primer' | 'bond') => void
  setSelectedRange: (range: SelectionRange | null) => void
  setSequenceRange: (range: SelectionRange, options?: { collapsed?: boolean; sequenceLength?: number }) => void
  setTraceAlignBusy: (busy: boolean) => void
  selectFeatureById: (featureId: string, extendSelection?: boolean, allowToggle?: boolean, options?: { scroll?: boolean; libraryMemberId?: string | null }) => void
  openSgRnaEditor: (memberId: string | null, featureId: string) => void
  libraryFolderId: string | null
  openRecordInNewTab: (record: SequenceRecord, options?: { initiallyUnsaved?: boolean }) => void
  updateRecord: (updater: (current: SequenceRecord) => SequenceRecord) => void
  onTraceFilesChange: (updater: (current: TraceFileRecord[]) => TraceFileRecord[]) => void
  pushDocumentHistorySnapshot: () => void
  setStatus: (status: string) => void
  geneticCode: string
}

/** Owns feature editor open/save and consensus/member projection orchestration. */
export function useFeatureEditorController(options: FeatureEditorControllerOptions) {
  function newFeatureSelectionIntent(): SelectionIntent {
    if (options.selectionFocus === 'dna') return 'dna-range'
    if (options.selectionFocus === 'feature') return 'feature'
    if (options.selectionFocus !== 'primer' || options.selectedPrimerIds.length !== 2) return 'neutral'
    const amplicon = options.facingPrimerAmpliconRange(options.selectedPrimerIds)
    return amplicon
      && options.selectedRange
      && amplicon.start === options.selectedRange.start
      && amplicon.end === options.selectedRange.end
      ? 'primer-amplicon'
      : 'primer-binding'
  }

  function openFeatureEditorFromSelection() {
    if (options.record.molecule === 'protein') {
      if (!options.record.sequence.length) return void options.setStatus('Add residues before creating a protein feature.')
      const range = options.selectedRange && options.selectedRange.end > options.selectedRange.start ? options.selectedRange : { start: 0, end: Math.min(options.record.sequence.length, 10) }
      options.setProteinFeatureEditor(createProteinFeature(createId('feature'), range.start, range.end))
      return
    }
    const range = explicitDnaRangeForNewFeature(options.selectedRange, newFeatureSelectionIntent(), Boolean(options.cutStrandSelection))
    if (!range) return void options.setStatus('Select a sequence range before creating a feature.')
    const memberId = !options.alignmentsVisible && options.selectedAlignmentTraceId && isDnaLibraryRecord(options.record) ? options.selectedAlignmentTraceId : null
    options.setFeatureEditor({ ...featureEditorFromNewSelection(createId('feature'), range.start, range.end, { geneticCode: options.geneticCode }), libraryMemberId: memberId })
  }

  function addFeature() {
    const browseMember = !options.alignmentsVisible && options.selectedAlignmentTraceId && isDnaLibraryRecord(options.record)
      ? options.traceFiles.find((trace) => trace.id === options.selectedAlignmentTraceId) ?? null
      : null
    const sequenceLength = browseMember?.sequence.length ?? options.record.sequence.length
    if (sequenceLength === 0) {
      options.setStatus(options.record.molecule === 'protein' ? 'Add residues before creating a protein feature.' : 'Add sequence before creating a feature.')
      return
    }
    if (options.record.molecule === 'protein' || explicitDnaRangeForNewFeature(options.selectedRange, newFeatureSelectionIntent(), Boolean(options.cutStrandSelection))) {
      openFeatureEditorFromSelection()
      return
    }
    const range = defaultRangeForNewFeature(sequenceLength)
    if (!range) return
    options.setFeatureEditor({
      ...featureEditorFromNewSelection(createId('feature'), range.start, range.end, { geneticCode: options.geneticCode }),
      libraryMemberId: browseMember?.id ?? null,
    })
  }

  function deleteSelectedFeature() {
    const editingMemberId = (options.activeTab === 'Features' || options.selectionFocus === 'feature' || !options.alignmentsVisible)
      && isDnaLibraryRecord(options.record) ? (options.featureTabSelectionMemberId ?? options.selectedAlignmentTraceId) : null
    const editingMember = editingMemberId ? options.traceFiles.find((trace) => trace.id === editingMemberId) : null
    const libraryReferenceId = isDnaLibraryRecord(options.record) ? getLibraryReferenceMemberId(options.record) : null
    const selectedIdsForScope = (features: readonly SequenceFeature[]) => options.selectedFeatureIds.length > 0
      ? options.selectedFeatureIds.filter((id) => features.some((feature) => feature.id === id))
      : options.selectedFeature ? [options.selectedFeature.id] : []
    if (editingMember) {
      const ids = withLinkedSgRnaFeatureIds(selectedIdsForScope(editingMember.features ?? []), editingMember.features ?? [])
      if (!ids.length) return
      const idSet = new Set(ids)
      const features = (editingMember.features ?? []).filter((feature) => idSet.has(feature.id))
      if (!features.length) return
      const names = features.map((feature) => featureDisplayName(feature))
      const bounds = featureBounds(features[0]!)
      options.pushDocumentHistorySnapshot()
      if (libraryReferenceId === editingMemberId) {
        options.updateRecord((current) => ({ ...current, features: current.features.filter((feature) => !idSet.has(feature.id)) }))
        options.onTraceFilesChange((current) => {
          let next = current.map((trace) => trace.id === editingMemberId ? deleteMemberFeatures(trace, idSet) : trace)
          for (const id of ids) next = removeFeatureFromLibraryMembers(id, next)
          return next
        })
      } else {
        options.onTraceFilesChange((current) => current.map((trace) => trace.id === editingMemberId ? deleteMemberFeatures(trace, idSet) : trace))
      }
      options.setSelectedFeatureId(null)
      options.setSelectedFeatureIds([])
      options.setFeatureTabAnchor(null)
      options.setFeatureTabSelectionMemberId(null)
      options.setSelectionFocus('dna')
      options.setSequenceRange({ start: bounds.start, end: bounds.start }, { collapsed: true, sequenceLength: editingMember.sequence.length })
      options.setStatus(features.length === 1 ? `Deleted feature ${names[0]} on ${editingMember.fileName}.` : `Deleted ${features.length} features on ${editingMember.fileName}.`)
      return
    }
    const ids = withLinkedSgRnaFeatureIds(selectedIdsForScope(options.record.features), options.record.features)
    if (!ids.length) return
    const idSet = new Set(ids)
    const features = options.record.features.filter((feature) => idSet.has(feature.id))
    if (!features.length) return
    const names = features.map((feature) => featureDisplayName(feature))
    const bounds = featureBounds(features[0]!)
    options.updateRecord((current) => ({ ...current, features: current.features.filter((feature) => !idSet.has(feature.id)) }))
    if (isDnaLibraryRecord(options.record) && !libraryReferenceId) options.onTraceFilesChange((current) => ids.reduce((next, id) => removeFeatureFromLibraryMembers(id, next), current))
    options.setSelectedFeatureId(null)
    options.setSelectedFeatureIds([])
    options.setFeatureTabAnchor(null)
    options.setFeatureTabSelectionMemberId(null)
    options.setSelectionFocus('dna')
    options.setSequenceRange({ start: bounds.start, end: bounds.start }, { collapsed: true })
    options.setStatus(features.length === 1 ? `Deleted feature ${names[0]}.` : `Deleted ${features.length} features.`)
  }

  function duplicateSelectedFeature() {
    const selected = options.selectedFeature
    if (!selected) return void options.setStatus('Select a feature to duplicate.')
    if (options.record.molecule === 'protein') {
      const copy = { ...selected, id: createId('feature'), name: `${featureDisplayName(selected)} copy`, locations: selected.locations.map((location) => ({ ...location })) }
      options.updateRecord((current) => ({ ...current, features: [...current.features, copy] }))
      options.selectFeatureById(copy.id)
      options.setStatus(`Duplicated protein feature ${featureDisplayName(selected)}.`)
      return
    }
    const draft = featureEditorFromFeature(selected, options.record.sequence, options.record.topology)
    options.setFeatureEditor({
      ...draft,
      featureId: createId('feature'),
      name: `${draft.name} copy`,
      segments: draft.segments.map((segment) => ({ ...segment })),
      libraryMemberId: isDnaLibraryRecord(options.record) ? (options.activeTab === 'Features' ? options.featureTabSelectionMemberId : options.selectedAlignmentTraceId) : null,
    })
  }

  function addImportedFeatures(features: SequenceFeature[]) {
    if (!features.length) return
    const normalized = features.map((feature) => {
      if (!feature.translateInSequenceView || !feature.translation || feature.locations.length < 2) return feature
      const strand = feature.locations[0]?.strand ?? 'forward'
      const indexed = feature.locations.map((location, index) => ({ location, index }))
      const ordered = strand === 'reverse'
        ? indexed.toSorted((a, b) => b.location.start - a.location.start)
        : indexed.toSorted((a, b) => a.location.start - b.location.start)
      return {
        ...feature,
        locations: ordered.map(({ location }) => location),
        translation: {
          ...feature.translation,
          segmentNumbering: ordered.map(({ index }) => feature.translation!.segmentNumbering[index] ?? { startAt: 1, skip: false }),
        },
      }
    })
    const synced = syncTranslatedFeaturesNotes(normalized, options.record.sequence, options.record.topology)
    options.updateRecord((current) => ({ ...current, features: [...current.features, ...synced] }))
    const first = synced[0]!
    options.setSelectedFeatureId(first.id)
    options.setSelectedFeatureIds(synced.map((feature) => feature.id))
    options.setFeatureTabSelectionMemberId(null)
    options.setFeatureTabAnchor({ featureId: first.id, memberId: null })
    options.setSelectionFocus('feature')
    const bounds = featureBounds(first)
    options.setSelectedRange({ start: bounds.start, end: bounds.end })
    if (!isDnaLibraryRecord(options.record)) {
      options.setStatus(synced.length === 1 ? `Added feature ${featureDisplayName(first)}.` : `Added ${synced.length} features.`)
      return
    }
    const cds = options.record.features.find((entry) => entry.type.trim().toUpperCase() === 'CDS' || Boolean(entry.translateInSequenceView))
    const memberCount = options.traceFiles.length
    options.setTraceAlignBusy(true)
    options.setStatus(`Adding ${synced.length} feature${synced.length === 1 ? '' : 's'} to consensus and projecting onto ${memberCount} library member${memberCount === 1 ? '' : 's'}…`)
    window.setTimeout(() => {
      try {
        const currentRecord = options.getCurrentRecord()
        options.onTraceFilesChange((current) => projectFeaturesOntoLibraryMembers(synced, current, {
          consensusSequence: currentRecord.sequence,
          topology: currentRecord.topology,
          consensusCds: cds,
        }))
        options.setStatus(synced.length === 1 ? `Added feature ${featureDisplayName(first)} to consensus and library members.` : `Added ${synced.length} features to consensus and library members.`)
      } finally {
        options.setTraceAlignBusy(false)
      }
    }, 0)
  }

  function openFeatureEditorForFeature(featureId: string, editorOptions?: { scroll?: boolean; libraryMemberId?: string | null }) {
    const memberId = editorOptions && 'libraryMemberId' in editorOptions ? (editorOptions.libraryMemberId ?? null) : (!options.alignmentsVisible && isDnaLibraryRecord(options.record) ? options.selectedAlignmentTraceId : null)
    const memberFeature = memberId ? options.traceFiles.find((trace) => trace.id === memberId)?.features?.find((feature) => feature.id === featureId) : undefined
    const feature = memberFeature ?? options.record.features.find((candidate) => candidate.id === featureId)
    if (!feature) return void options.setStatus('Only stored features can be edited in Feature Properties.')
    const sgRna = sgRnaVisualParts(memberId && memberFeature ? (options.traceFiles.find((trace) => trace.id === memberId)?.features ?? []) : options.record.features).get(feature.id)
    if (sgRna?.annotation.pam) return options.openSgRnaEditor(memberId && memberFeature ? memberId : null, sgRna.annotation.id)
    if (memberId && options.selectedAlignmentTraceId !== memberId) options.setSelectedAlignmentTraceId(memberId)
    if (memberId === null && options.selectedAlignmentTraceId !== null && isDnaLibraryRecord(options.record) && options.activeTab === 'Features') {
      options.setSelectedAlignmentTraceId(null)
    }
    options.selectFeatureById(featureId, false, false, { scroll: editorOptions?.scroll, libraryMemberId: memberId })
    if (options.record.molecule === 'protein') return options.setProteinFeatureEditor({ ...feature, locations: feature.locations.map((location) => ({ ...location })) })
    const sequenceForEditor = memberFeature && memberId ? (options.traceFiles.find((trace) => trace.id === memberId)?.sequence ?? options.record.sequence) : options.record.sequence
    options.setFeatureEditor({ ...featureEditorFromFeature(feature, sequenceForEditor, memberFeature ? 'linear' : options.record.topology), libraryMemberId: memberId })
  }

  function editProteinSequenceFeature(featureId: string) {
    openFeatureEditorForFeature(featureId, { scroll: false })
  }

  function editDnaSequenceFeature(featureId: string, libraryMemberId?: string | null) {
    openFeatureEditorForFeature(featureId, {
      scroll: false,
      ...(libraryMemberId !== undefined ? { libraryMemberId } : {}),
    })
  }

  function saveFeatureEditor(next: FeatureEditorState) {
    const mergedSourceIds = options.pendingFeatureMergeIds
    const mergingFeatures = Boolean(mergedSourceIds?.includes(next.featureId))
    const editingMemberId = isDnaLibraryRecord(options.record) ? ('libraryMemberId' in next ? (next.libraryMemberId ?? null) : (options.activeTab === 'Features' || !options.alignmentsVisible ? (options.activeTab === 'Features' ? options.featureTabSelectionMemberId : options.selectedAlignmentTraceId) : null)) : null
    const editingMember = editingMemberId ? options.traceFiles.find((trace) => trace.id === editingMemberId) : null
    const libraryReferenceId = isDnaLibraryRecord(options.record) ? getLibraryReferenceMemberId(options.record) : null
    if (editingMember) {
      const patch = featureFromEditor(next, editingMember.sequence, 'linear')
      const feature = { id: next.featureId, ...patch }
      const synced = syncTranslatedFeaturesNotes([feature], editingMember.sequence, 'linear')[0] ?? feature
      const exists = editingMember.features?.some((entry) => entry.id === next.featureId)
      options.pushDocumentHistorySnapshot()
      const isReference = libraryReferenceId === editingMemberId
      if (isReference && editingMember.alignment && !editingMember.parseError) {
        const lifted = remapFeaturesToTemplate([synced], editingMember.alignment)[0]
        if (lifted) {
          const cds = options.record.features.find((entry) => entry.type.trim().toUpperCase() === 'CDS' || Boolean(entry.translateInSequenceView)) ?? (lifted.translateInSequenceView || lifted.type.trim().toUpperCase() === 'CDS' ? lifted : null)
          options.updateRecord((current) => ({ ...current, features: mergeLiftedFeaturesIntoConsensus(current.features, [lifted]) }))
          options.onTraceFilesChange((current) => projectReferenceFeatureOntoLibrary(lifted, current.map((trace) => trace.id === editingMemberId ? upsertMemberFeature(trace, synced) : trace), { referenceMemberId: editingMemberId, nativeFeature: synced, consensusSequence: options.record.sequence, topology: options.record.topology, consensusCds: cds ?? undefined }))
          options.setFeatureEditor(null)
          options.selectFeatureById(next.featureId, false, false, { libraryMemberId: editingMemberId, scroll: false })
          options.setStatus(exists ? `Updated feature ${patch.name} on reference ${editingMember.fileName} and library.` : `Added feature ${patch.name} on reference ${editingMember.fileName} and library.`)
          return
        }
      }
      options.onTraceFilesChange((current) => current.map((trace) => trace.id === editingMemberId ? upsertMemberFeature(trace, synced) : trace))
      options.setFeatureEditor(null)
      options.selectFeatureById(next.featureId, false, false, { libraryMemberId: editingMemberId, scroll: false })
      options.setStatus(exists ? `Updated feature ${patch.name} on ${editingMember.fileName}.` : `Added feature ${patch.name} on ${editingMember.fileName}.`)
      return
    }
    const patch = featureFromEditor(next, options.record.sequence, options.record.topology)
    const exists = options.record.features.some((feature) => feature.id === next.featureId)
    const feature = { id: next.featureId, ...patch }
    options.updateRecord((current) => ({ ...current, features: exists ? current.features.filter((entry) => !mergingFeatures || entry.id === next.featureId || !mergedSourceIds?.includes(entry.id)).map((entry) => entry.id === next.featureId ? { ...entry, ...patch } : entry) : [...current.features, feature] }))
    if (isDnaLibraryRecord(options.record) && !libraryReferenceId) {
      const cds = options.record.features.find((entry) => entry.type.trim().toUpperCase() === 'CDS' || Boolean(entry.translateInSequenceView)) ?? (feature.translateInSequenceView || feature.type.trim().toUpperCase() === 'CDS' ? feature : null)
      options.onTraceFilesChange((current) => projectFeatureOntoLibraryMembers(feature, current, { consensusSequence: options.record.sequence, consensusCds: cds ?? undefined, topology: options.record.topology }))
    }
    options.setFeatureEditor(null)
    options.setPendingFeatureMergeIds(null)
    options.selectFeatureById(next.featureId, false, false, { scroll: false })
    options.setStatus(mergingFeatures ? `Merged ${mergedSourceIds!.length} features into ${patch.name}.` : exists ? `Updated feature ${patch.name}.` : `Added feature ${patch.name}.`)
  }

  function saveProteinFeatureEditor(next: SequenceFeature) {
    const exists = options.record.features.some((feature) => feature.id === next.id)
    options.updateRecord((current) => ({ ...current, features: exists ? current.features.map((feature) => feature.id === next.id ? next : feature) : [...current.features, next] }))
    options.setProteinFeatureEditor(null)
    options.selectFeatureById(next.id)
    const bounds = featureBounds(next)
    options.setSelectedRange({ start: bounds.start, end: bounds.end })
    options.setStatus(exists ? `Updated protein feature ${featureDisplayName(next)}.` : `Added protein feature ${featureDisplayName(next)} at ${formatRange(bounds.start, bounds.end)}.`)
  }

  function openFeatureDraftAsProtein(draft: FeatureEditorState) {
    if (options.record.molecule === 'protein') return
    if (!draft.translateInSequenceView) {
      options.setStatus('Enable translation for this feature before opening it as a protein.')
      return
    }
    const memberId = draft.libraryMemberId ?? null
    const member = memberId ? options.traceFiles.find((trace) => trace.id === memberId) : null
    const sourceDnaSequence = member?.sequence ?? options.record.sequence
    const sourceTopology = member ? 'linear' as const : options.record.topology
    const patch = featureFromEditor(draft, sourceDnaSequence, sourceTopology)
    const peptide = normalizePeptide(translateFeature(
      { locations: patch.locations },
      sourceDnaSequence,
      patch.translation ?? draft.translation,
      { topology: sourceTopology },
    ))
    if (!peptide) {
      options.setStatus('This feature has no translation to open as a protein.')
      return
    }
    const name = draft.name.trim() || draft.qualifiers.product?.trim() || 'CDS'
    const sourceFeature: SequenceFeature = { id: draft.featureId, ...patch }
    const sourceRecord: SequenceRecord = member
      ? { ...sequenceRecordFromLibraryMember(member), id: options.record.id, name: `${options.record.name} · ${member.fileName}`, features: [sourceFeature] }
      : {
        ...options.record,
        features: options.record.features.some((feature) => feature.id === sourceFeature.id)
          ? options.record.features.map((feature) => feature.id === sourceFeature.id ? sourceFeature : feature)
          : [...options.record.features, sourceFeature],
      }
    const comparisonSources = isDnaLibraryRecord(options.record)
      ? proteinComparisonSourcesFromLibraryFeature(
        member ? (options.record.features.find((feature) => feature.id === sourceFeature.id) ?? sourceFeature) : sourceFeature,
        options.traceFiles,
      )
      : []
    const proteinRecord = createSequenceRecordFromDatabaseProtein({
      name: member ? `${name} (${member.fileName})` : name,
      sequence: peptide,
      color: draft.color,
      product: draft.qualifiers.product ?? '',
      sources: [{ projectId: options.record.id, projectName: options.record.name, folderId: options.libraryFolderId }],
      translationSources: [proteinTranslationSourceFromRecord(sourceRecord, sourceFeature, options.libraryFolderId)],
      comparisonSources,
    })
    options.openRecordInNewTab(proteinRecord, { initiallyUnsaved: true })
    options.setStatus(
      comparisonSources.length
        ? `Opened ${proteinRecord.name} as a protein (${proteinRecord.sequence.length} aa, ${comparisonSources.length} library homolog${comparisonSources.length === 1 ? '' : 's'}).`
        : `Opened ${proteinRecord.name} as a protein (${proteinRecord.sequence.length} aa).`,
    )
  }

  function openFeatureAsProtein(featureId: string) {
    const feature = options.selectableAnnotations.find((candidate) => candidate.id === featureId)
    if (!feature?.translateInSequenceView || !feature.translation) {
      options.setStatus('Select a translated feature or ORF before opening it as a protein.')
      return
    }
    const member = options.featureSelectionMember
    const memberForFeature = member?.features?.some((candidate) => candidate.id === featureId) ? member : null
    const draft = featureEditorFromFeature(feature, memberForFeature?.sequence ?? options.record.sequence, memberForFeature ? 'linear' : options.record.topology)
    openFeatureDraftAsProtein(memberForFeature ? { ...draft, libraryMemberId: memberForFeature.id } : draft)
  }

  function openSelectedFeatureAsProtein() {
    if (!options.selectedAnnotation) {
      options.setStatus('Select a translated feature or ORF before opening it as a protein.')
      return
    }
    openFeatureAsProtein(options.selectedAnnotation.id)
  }

  function openFeatureColorEditor() {
    if (!options.selectedFeature) {
      options.setStatus('Select a feature to change its color.')
      return
    }
    openFeatureEditorForFeature(options.selectedFeature.id)
  }

  return {
    addFeature,
    addImportedFeatures,
    deleteSelectedFeature,
    duplicateSelectedFeature,
    openFeatureEditorFromSelection,
    openFeatureEditorForFeature,
    editProteinSequenceFeature,
    editDnaSequenceFeature,
    openFeatureColorEditor,
    saveFeatureEditor,
    saveProteinFeatureEditor,
    openFeatureDraftAsProtein,
    openFeatureAsProtein,
    openSelectedFeatureAsProtein,
  }
}
