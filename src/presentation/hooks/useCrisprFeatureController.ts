import { useMemo, useState } from 'react'
import type { SgRnaDraft } from '../../SgRnaDialog'
import type { GuideScanAddPayload } from '../../GuideScanDesignPanel'
import type { GuideScanDesignCacheEntry } from '../../domain/guidescan'
import type { SgRNAAnnotation } from '../../domain/sgrna'
import { createSgRNAFeatures, replaceSgRNAAnnotation } from '../../domain/sgrna'
import { addOperation } from '../../domain/sequence'
import type { SequenceFeature, SequenceRecord } from '../../domain/types'
import type { TraceFileRecord } from '../../domain/traceTypes'
import { isDnaLibraryRecord } from '../../domain/dnaLibrary'
import { getLibraryReferenceMemberId, projectFeatureOntoLibraryMembers } from '../../domain/libraryMemberFeatures'
import { remapFeaturesToTemplate } from '../../domain/traceAnnotationView'
import { sequenceRecordFromLibraryMember } from '../../domain/libraryMemberRecord'
import type { SelectionRange } from '../sequence'
import { applyCrisprExcision, planCrisprExcision, type CrisprExcisionPlan } from '../../application/selectionEditing/crisprExcision'
import { previewCrisprJunction, type JunctionSettings } from '../../application/selectionEditing/crisprJunction'

type SgRnaDialogState = { memberId: string | null; editingId: string | null; selection: SelectionRange | null }
type GuideScanDialogState = { memberId: string | null }

export type CrisprFeatureControllerOptions = {
  record: SequenceRecord
  traceFiles: TraceFileRecord[]
  alignmentsVisible: boolean
  selectedAlignmentTraceId: string | null
  selectedRange: SelectionRange | null
  cutStrandSelection: unknown
  selectedSgRnasForCloning: SgRNAAnnotation[]
  featureTabSelectionMemberId: string | null
  selectedLibraryMemberId: string | null
  updateRecord: (updater: (current: SequenceRecord) => SequenceRecord, options?: { recordHistory?: boolean }) => void
  onTraceFilesChange: (updater: (current: TraceFileRecord[]) => TraceFileRecord[]) => void
  pushDocumentHistorySnapshot: () => void
  setSelectedAlignmentTraceId: (id: string | null) => void
  setSelectedFeatureId: (id: string | null) => void
  setSelectedFeatureIds: (ids: string[]) => void
  setSelectionFocus: (focus: 'dna' | 'feature' | 'primer' | 'bond') => void
  setStatus: (status: string) => void
  requestDocumentExit: (action: () => void | Promise<void>) => void
  commitUnsavedDownloadedRecord: (record: SequenceRecord) => void
  traceDocument: boolean
  selectedSgRnasForExport: SgRNAAnnotation[]
  getCurrentRecord: () => SequenceRecord
  setSequenceRange: (range: SelectionRange, options: { collapsed: boolean; sequenceLength: number }) => void
}

/** Owns sgRNA editing, cloning, GuideScan design, and excision application state. */
export function useCrisprFeatureController(options: CrisprFeatureControllerOptions) {
  const [sgRnaDialog, setSgRnaDialog] = useState<SgRnaDialogState | null>(null)
  const [sgRnaCloningSnapshot, setSgRnaCloningSnapshot] = useState<{ source: SequenceRecord; guides: SgRNAAnnotation[] } | null>(null)
  const [guideScanDesignDialog, setGuideScanDesignDialog] = useState<GuideScanDialogState | null>(null)
  const [crisprExcision, setCrisprExcision] = useState<{ plan: CrisprExcisionPlan; source: SequenceRecord } | null>(null)
  const crisprExcisionPlan = useMemo(() => !options.traceDocument && !isDnaLibraryRecord(options.record)
    ? planCrisprExcision(options.record, options.selectedSgRnasForExport)
    : null, [options.traceDocument, options.record, options.selectedSgRnasForExport])

  function openCrisprExcision() {
    if (crisprExcisionPlan) setCrisprExcision({ plan: crisprExcisionPlan, source: options.record })
  }

  function exciseCrisprRegion(arc: 'between' | 'across-origin', settings?: JunctionSettings) {
    if (!crisprExcision) return
    const current = options.getCurrentRecord()
    const plan = planCrisprExcision(current, crisprExcision.plan.guides)
    if (current.id !== crisprExcision.source.id || current.sequence !== crisprExcision.source.sequence || current.topology !== crisprExcision.source.topology || !plan ||
        plan.cuts[0] !== crisprExcision.plan.cuts[0] || plan.cuts[1] !== crisprExcision.plan.cuts[1]) {
      setCrisprExcision(null)
      options.setStatus('The selected sgRNA targets have changed; select them again to excise a region.')
      return
    }
    if (plan.guides.some((guide) => guide.nuclease === 'Cas12a') && (!settings || settings.arc !== arc || settings.sites.some((site, index) => site.guide.id !== plan.sites[index]?.guide.id))) {
      options.setStatus('Choose valid cut and junction settings before excising.')
      return
    }
    const junction = settings ? previewCrisprJunction(current, plan, settings) : null
    if (settings && !junction?.preview) {
      options.setStatus(junction?.error || 'Invalid junction settings.')
      return
    }
    const editPlan = junction?.preview?.deletionPlan ?? plan
    const editArc = junction?.preview?.deletionArc ?? arc
    const removed = editArc === 'between' ? editPlan.cuts[1] - editPlan.cuts[0] : current.sequence.length - editPlan.cuts[1] + editPlan.cuts[0]
    options.updateRecord((source) => applyCrisprExcision(source, editPlan, editArc))
    const position = editArc === 'between' ? editPlan.cuts[0] : 0
    options.setSequenceRange({ start: position, end: position }, { collapsed: true, sequenceLength: current.sequence.length - removed })
    setCrisprExcision(null)
    options.setStatus(settings ? `Excised ${removed} bp using simulated CRISPR cut and joining settings.` : `Excised ${removed} bp between nominal CRISPR cut sites.`)
  }

  function openAddSgRna() {
    if (options.record.molecule !== 'dna' || !options.record.sequence.length) return
    const memberId = !options.alignmentsVisible && options.selectedAlignmentTraceId && isDnaLibraryRecord(options.record) ? options.selectedAlignmentTraceId : null
    setSgRnaDialog({ memberId, editingId: null, selection: options.selectedRange && !options.cutStrandSelection && options.selectedRange.end > options.selectedRange.start ? { ...options.selectedRange } : null })
  }

  function openCloneSgRna() {
    if (!options.selectedSgRnasForCloning.length) return
    const memberId = options.featureTabSelectionMemberId ?? options.selectedLibraryMemberId
    const member = memberId ? options.traceFiles.find((trace) => trace.id === memberId) : null
    setSgRnaCloningSnapshot({ source: member ? sequenceRecordFromLibraryMember(member) : options.record, guides: options.selectedSgRnasForCloning.map((entry) => ({ ...entry, guide: { ...entry.guide }, pam: entry.pam ? { ...entry.pam } : undefined })) })
  }

  function openGuideScanDesign() {
    if (options.record.molecule !== 'dna' || !options.record.sequence.length) return
    const memberId = !options.alignmentsVisible && options.selectedAlignmentTraceId && isDnaLibraryRecord(options.record) ? options.selectedAlignmentTraceId : null
    setGuideScanDesignDialog({ memberId })
  }

  function applyGuideScanSelectedGuides(payload: GuideScanAddPayload, target: GuideScanDialogState) {
    const { annotationRecord, drafts } = payload
    if (!drafts.length) return
    const applyAll = (features: SequenceFeature[]) => drafts.reduce((next, draft) => {
      const pair = createSgRNAFeatures(draft.hit, { name: draft.name, nuclease: draft.nuclease, pamMotif: draft.pamMotif, pamSide: draft.pamSide, spacer: draft.spacer, guideScanEvidence: draft.guideScanEvidence })
      return [...next, ...pair]
    }, features)
    const annotated = addOperation({ ...annotationRecord, features: applyAll(annotationRecord.features) }, 'annotate', `Added ${drafts.length} GuideScan2 sgRNA${drafts.length === 1 ? '' : 's'}.`)
    if (annotationRecord.id !== options.record.id) {
      options.requestDocumentExit(() => { options.commitUnsavedDownloadedRecord(annotated); options.setStatus(`Added ${drafts.length} sgRNA${drafts.length === 1 ? '' : 's'} to ${annotated.name} (opened in this window).`) })
      return
    }
    if (target.memberId) {
      const member = options.traceFiles.find((trace) => trace.id === target.memberId)
      if (!member) return void options.setStatus('The selected library member is no longer available.')
      options.pushDocumentHistorySnapshot()
      options.onTraceFilesChange((current) => current.map((trace) => trace.id === target.memberId ? { ...trace, features: applyAll(trace.features ?? []) } : trace))
      const last = drafts[drafts.length - 1]!
      const lastPair = createSgRNAFeatures(last.hit, { name: last.name, nuclease: last.nuclease, pamMotif: last.pamMotif, pamSide: last.pamSide, spacer: last.spacer, guideScanEvidence: last.guideScanEvidence })
      if (getLibraryReferenceMemberId(options.record) === target.memberId && member.alignment && !member.parseError) {
        const lifted = remapFeaturesToTemplate(lastPair, member.alignment)
        if (lifted.length) options.updateRecord((current) => ({ ...current, features: applyAll(current.features).filter((feature) => !lastPair.some((entry) => entry.id === feature.id)).concat(lifted) }), { recordHistory: false })
      }
      options.setSelectedAlignmentTraceId(target.memberId)
    } else {
      options.updateRecord((current) => addOperation({ ...current, features: applyAll(current.features) }, 'annotate', `Added ${drafts.length} GuideScan2 sgRNA${drafts.length === 1 ? '' : 's'}.`))
      if (isDnaLibraryRecord(options.record) && !getLibraryReferenceMemberId(options.record)) {
        const pairs = drafts.flatMap((draft) => createSgRNAFeatures(draft.hit, { name: draft.name, nuclease: draft.nuclease, pamMotif: draft.pamMotif, pamSide: draft.pamSide, spacer: draft.spacer, guideScanEvidence: draft.guideScanEvidence }))
        options.onTraceFilesChange((current) => pairs.reduce((members, feature) => projectFeatureOntoLibraryMembers(feature, members, { consensusSequence: options.record.sequence, topology: options.record.topology }), current))
      }
    }
    options.setStatus(`Added ${drafts.length} GuideScan2 sgRNA${drafts.length === 1 ? '' : 's'}.`)
  }

  function guideScanDesignAddSelected(payload: GuideScanAddPayload) {
    if (!guideScanDesignDialog) return
    const target = guideScanDesignDialog
    setGuideScanDesignDialog(null)
    applyGuideScanSelectedGuides(payload, target)
  }

  function persistGuideScanDesignCache(entry: GuideScanDesignCacheEntry) {
    options.updateRecord((current) => ({ ...current, dna: { ...(current.dna ?? { comparisonSources: [], comparisonAlignmentCache: [] }), guideScanDesignCache: entry } }), { recordHistory: false })
  }

  function saveSgRna(draft: SgRnaDraft) {
    const target = sgRnaDialog
    if (!target) return
    const pair = createSgRNAFeatures(draft.hit, { name: draft.name, nuclease: draft.nuclease, pamMotif: draft.pamMotif, pamSide: draft.pamSide, spacer: draft.spacer, id: draft.existingId, guideScanEvidence: draft.guideScanEvidence })
    const apply = (features: SequenceFeature[]) => draft.existingId ? replaceSgRNAAnnotation(features, draft.existingId, pair) : [...features, ...pair]
    if (target.memberId) {
      const member = options.traceFiles.find((trace) => trace.id === target.memberId)
      if (!member) return void options.setStatus('The selected library member is no longer available.')
      options.pushDocumentHistorySnapshot()
      options.onTraceFilesChange((current) => current.map((trace) => trace.id === target.memberId ? { ...trace, features: apply(trace.features ?? []) } : trace))
      if (getLibraryReferenceMemberId(options.record) === target.memberId && member.alignment && !member.parseError) {
        const lifted = remapFeaturesToTemplate(pair, member.alignment)
        if (lifted.length) options.updateRecord((current) => ({ ...current, features: apply(current.features).filter((feature) => !pair.some((entry) => entry.id === feature.id)).concat(lifted) }))
      }
      options.setSelectedAlignmentTraceId(target.memberId)
    } else {
      options.updateRecord((current) => ({ ...current, features: apply(current.features) }))
      if (isDnaLibraryRecord(options.record) && !getLibraryReferenceMemberId(options.record)) options.onTraceFilesChange((current) => pair.reduce((members, feature) => projectFeatureOntoLibraryMembers(feature, members, { consensusSequence: options.record.sequence, topology: options.record.topology }), current))
    }
    setSgRnaDialog(null)
    options.setSelectedFeatureId(pair[0]!.id)
    options.setSelectedFeatureIds([pair[0]!.id])
    options.setSelectionFocus('feature')
    options.setStatus(`${draft.existingId ? 'Updated' : 'Added'} ${draft.name} at ${draft.hit.guideLocations.map((part) => `${part.start + 1}–${part.end}`).join(' + ')} with ${draft.hit.pamSequence} PAM.`)
  }

  return { sgRnaDialog, setSgRnaDialog, sgRnaCloningSnapshot, setSgRnaCloningSnapshot, guideScanDesignDialog, setGuideScanDesignDialog, openAddSgRna, openCloneSgRna, openGuideScanDesign, guideScanDesignAddSelected, persistGuideScanDesignCache, saveSgRna, crisprExcision, setCrisprExcision, crisprExcisionPlan, openCrisprExcision, exciseCrisprRegion }
}
