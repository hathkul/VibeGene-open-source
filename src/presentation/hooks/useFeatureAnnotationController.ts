import { useRef, useState } from 'react'
import {
  appendDnaAnnotations,
  appendInterProAnnotations,
  appendProteinAnnotations,
  appendTranslatedOrfAnnotations,
} from '../../application/featureAnnotation/featureAnnotation'
import {
  planPostAnnotationFeatureSelection,
  type PostAnnotationFeatureSelectionPlan,
} from '../../application/featureAnnotation/postAnnotationFeatureSelection'
import { useCommonFeatureDetection } from './commonFeatureDetectionContext'
import { detectCrispr, type CrisprDetectionResult } from '../../domain/crisprDetection'
import type { CommonFeatureMatch, CommonFeatureTemplate } from '../../domain/commonFeatures'
import type { DnaAnnotationPlan } from '../../domain/dnaDatabaseAnnotation'
import type { InterProScanMatch } from '../../domain/proteinInterProAnnotation'
import type { UniProtAnnotationPlan } from '../../domain/proteinUniProtAnnotation'
import type { TranslatedOrfHitPlan } from '../../domain/translatedOrfAnnotation'
import type { ProteinBond, SequenceFeature, SequenceRecord } from '../../domain/types'
import type { SelectionRange } from '../sequence'
import { beginOperationProgress } from '../../domain/operationProgress'
import { isFeatureLongEnoughForCommonLibrary, MIN_COMMON_FEATURE_LENGTH_BP, templateFromRecordFeature } from '../../application/commonFeatures'
import { featureDisplayName } from '../map/mapPrimitives'
import { syncTranslatedFeaturesNotes } from '../../domain/featureQualifiers'

export type CommonFeatureDetectionState = {
  matches: CommonFeatureMatch[]
  templates: CommonFeatureTemplate[]
  minimumIdentityPercent: number
}

export type FeatureAnnotationControllerOptions = {
  record: SequenceRecord
  updateRecord: (updater: (current: SequenceRecord) => SequenceRecord) => void
  setStatus: (status: string) => void
  loadCommonFeatures: () => Promise<CommonFeatureTemplate[]>
  addUserCommonFeatures: (templates: CommonFeatureTemplate[]) => void
  selectedRange: SelectionRange | null
  selectedFeaturesForMenu: SequenceFeature[]
  setSelectedFeatureId: (id: string | null) => void
  setSelectedFeatureIds: (ids: string[]) => void
  setFeatureTabSelectionMemberId: (id: string | null) => void
  setFeatureTabAnchor: (value: { featureId: string; memberId: string | null } | null) => void
  setSelectionFocus: (focus: 'dna' | 'feature' | 'primer' | 'bond') => void
  setSelectedRange: (range: SelectionRange | null) => void
  tryOpenCommonFeaturesBrowser: () => Promise<boolean>
  openLocalCommonFeaturesBrowser: () => void
}

/** Owns asynchronous common-feature/CRISPR detection and external annotation command state. */
export function useFeatureAnnotationController(options: FeatureAnnotationControllerOptions) {
  const detectCommonFeaturesAsync = useCommonFeatureDetection()
  const [commonFeatureDetection, setCommonFeatureDetection] = useState<CommonFeatureDetectionState | null>(null)
  const [crisprDetection, setCrisprDetection] = useState<CrisprDetectionResult | null>(null)
  const [proteinUniProtAnnotationRange, setProteinUniProtAnnotationRange] = useState<SelectionRange | null>(null)
  const [dnaDatabaseAnnotationRange, setDnaDatabaseAnnotationRange] = useState<SelectionRange | null>(null)
  const [translatedOrfAnnotationRange, setTranslatedOrfAnnotationRange] = useState<SelectionRange | null>(null)
  const commonFeatureDetectionAbortRef = useRef<AbortController | null>(null)

  function applyPostAnnotationFeatureSelection(plan: PostAnnotationFeatureSelectionPlan) {
    if (plan.kind === 'noop') return
    options.setSelectedFeatureId(plan.primaryFeatureId)
    options.setSelectedFeatureIds(plan.selectedFeatureIds)
    if (plan.memberScope.kind === 'consensus') {
      options.setFeatureTabSelectionMemberId(plan.memberScope.featureTabSelectionMemberId)
      options.setFeatureTabAnchor(plan.memberScope.featureTabAnchor)
    }
    options.setSelectionFocus('feature')
    options.setSelectedRange({ start: plan.bounds.start, end: plan.bounds.end })
  }

  async function detectCommonFeaturesInDocument() {
    commonFeatureDetectionAbortRef.current?.abort()
    const controller = new AbortController()
    commonFeatureDetectionAbortRef.current = controller
    options.setStatus('Detecting common features…')
    let progress: ReturnType<typeof beginOperationProgress> | null = null
    try {
      const library = await options.loadCommonFeatures()
      if (controller.signal.aborted) return
      progress = beginOperationProgress('Detecting common features', library.length, { onCancel: () => controller.abort() })
      const matches = await detectCommonFeaturesAsync(options.record, library, {
        signal: controller.signal,
        onProgress: (completed, total) => progress?.update(completed, total, `${completed.toLocaleString()} of ${total.toLocaleString()} features scanned`),
      })
      if (controller.signal.aborted) return
      setCommonFeatureDetection({ matches, templates: library, minimumIdentityPercent: 100 })
      options.setStatus(matches.length === 0 ? 'No common features detected.' : `Detected ${matches.length} common feature match${matches.length === 1 ? '' : 'es'}.`)
    } catch (error) {
      if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
        options.setStatus('Common feature detection cancelled.')
        return
      }
      options.setStatus(`Common feature detection failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      progress?.finish()
      if (commonFeatureDetectionAbortRef.current === controller) commonFeatureDetectionAbortRef.current = null
    }
  }

  function redetectCommonFeatures(minimumIdentityPercent: number) {
    const current = commonFeatureDetection
    if (!current) return
    commonFeatureDetectionAbortRef.current?.abort()
    const controller = new AbortController()
    commonFeatureDetectionAbortRef.current = controller
    setCommonFeatureDetection({ ...current, minimumIdentityPercent })
    const progress = beginOperationProgress('Updating common feature matches', current.templates.length, { onCancel: () => controller.abort() })
    void detectCommonFeaturesAsync(options.record, current.templates, {
      minimumIdentityPercent,
      signal: controller.signal,
      onProgress: (completed, total) => progress.update(completed, total, `${completed.toLocaleString()} of ${total.toLocaleString()} features scanned`),
    }).then((matches) => {
      if (!controller.signal.aborted) setCommonFeatureDetection({ matches, templates: current.templates, minimumIdentityPercent })
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) options.setStatus(`Common feature detection failed: ${error instanceof Error ? error.message : String(error)}`)
    }).finally(() => {
      progress.finish()
      if (commonFeatureDetectionAbortRef.current === controller) commonFeatureDetectionAbortRef.current = null
    })
  }

  async function detectCrisprInDocument() {
    options.setStatus('Detecting CRISPR features…')
    try {
      const library = await options.loadCommonFeatures()
      const result = detectCrispr(options.record, { commonFeatures: library })
      setCrisprDetection(result)
      options.setStatus(`CRISPR detection complete: ${result.summary}.`)
    } catch (error) {
      options.setStatus(`CRISPR detection failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  function openProteinUniProtAnnotation(scope: 'whole' | 'selection') {
    if (options.record.molecule !== 'protein' || !options.record.sequence.length) return
    const range = scope === 'selection' ? options.selectedRange : { start: 0, end: options.record.sequence.length }
    if (!range || range.end <= range.start) return void options.setStatus('Select a protein sequence range before searching UniProt.')
    if (range.end - range.start < 10) return void options.setStatus('Select at least 10 amino acids for a database annotation search.')
    setProteinUniProtAnnotationRange({ start: range.start, end: range.end })
  }

  function openDnaDatabaseAnnotation(scope: 'whole' | 'selection') {
    if (options.record.molecule !== 'dna' || !options.record.sequence.length) return
    const range = scope === 'selection' ? options.selectedRange : { start: 0, end: options.record.sequence.length }
    if (!range || range.end <= range.start) return void options.setStatus('Select a DNA sequence range before searching annotation databases.')
    if (range.end - range.start < 30) return void options.setStatus('Select at least 30 bp for a DNA database annotation search.')
    setDnaDatabaseAnnotationRange({ start: range.start, end: range.end })
  }

  function addSelectedFeatureToCommonFeatures() {
    const features = options.selectedFeaturesForMenu
    if (!features.length) return void options.setStatus('Select a feature to add to Common Features.')
    const tooShort = features.filter((feature) => !isFeatureLongEnoughForCommonLibrary(feature, options.record.sequence.length))
    const templates = features.map((feature) => templateFromRecordFeature(options.record, feature)).filter((template): template is NonNullable<typeof template> => Boolean(template))
    if (!templates.length) {
      options.setStatus(tooShort.length === features.length ? `Features shorter than ${MIN_COMMON_FEATURE_LENGTH_BP} bp cannot be added to Common Features.` : 'Could not extract a sequence for the selected feature(s).')
      return
    }
    options.addUserCommonFeatures(templates)
    const skippedNote = tooShort.length > 0 ? ` Skipped ${tooShort.length} shorter than ${MIN_COMMON_FEATURE_LENGTH_BP} bp.` : ''
    options.setStatus(templates.length === 1 ? `Added “${templates[0].name}” to Common Features (${templates[0].sequence.length} bp).${skippedNote}` : `Added ${templates.length} features to Common Features.${skippedNote}`)
  }

  async function openCommonFeaturesBrowser() {
    const opened = await options.tryOpenCommonFeaturesBrowser()
    if (!opened) options.openLocalCommonFeaturesBrowser()
  }

  function addDetectedCommonFeatures(features: SequenceFeature[]) {
    if (!features.length) {
      setCommonFeatureDetection(null)
      return
    }
    const synced = syncTranslatedFeaturesNotes(features, options.record.sequence, options.record.topology)
    options.updateRecord((current) => ({ ...current, features: [...current.features, ...synced] }))
    setCommonFeatureDetection(null)
    // Plan from synced features so selection matches the committed records if normalization ever changes IDs or bounds.
    applyPostAnnotationFeatureSelection(planPostAnnotationFeatureSelection('commonDetected', synced))
    const first = synced[0]!
    options.setStatus(features.length === 1 ? `Added common feature ${featureDisplayName(first)}.` : `Added ${features.length} common features.`)
  }

  function applyDnaDatabaseAnnotations(features: SequenceFeature[], plans: DnaAnnotationPlan[]) {
    const accessions = [...new Set(plans.map((plan) => plan.hit.accession))]
    options.updateRecord((current) => appendDnaAnnotations(current, features, `Transferred ${features.length} DNA features from NCBI:${accessions.join(', ')}`))
    setDnaDatabaseAnnotationRange(null)
    applyPostAnnotationFeatureSelection(planPostAnnotationFeatureSelection('dnaDatabase', features))
    options.setStatus(`Added ${features.length} DNA database annotation${features.length === 1 ? '' : 's'} from ${accessions.length} match${accessions.length === 1 ? '' : 'es'}.`)
  }

  function applyTranslatedOrfAnnotations(features: SequenceFeature[], plans: TranslatedOrfHitPlan[]) {
    const accessions = [...new Set(plans.map((plan) => plan.hit.accession))]
    const orfCount = new Set(plans.map((plan) => plan.orf.id)).size
    options.updateRecord((current) => appendTranslatedOrfAnnotations(current, features, `Transferred ${features.length} protein features to ${orfCount} translated ORFs from UniProtKB:${accessions.join(', ')}`))
    setTranslatedOrfAnnotationRange(null)
    applyPostAnnotationFeatureSelection(planPostAnnotationFeatureSelection('translatedOrf', features))
    options.setStatus(`Added ${features.length} translated-ORF annotation${features.length === 1 ? '' : 's'} from ${accessions.length} UniProt match${accessions.length === 1 ? '' : 'es'}.`)
  }

  function applyProteinUniProtAnnotations(features: SequenceFeature[], bonds: ProteinBond[], plans: UniProtAnnotationPlan[]) {
    const accessions = [...new Set(plans.map((plan) => plan.hit.accession))]
    const sourceLabel = accessions.map((accession) => `UniProtKB:${accession}`).join(', ')
    options.updateRecord((current) => appendProteinAnnotations(current, features, bonds, `Transferred ${features.length} features and ${bonds.length} bonds from ${sourceLabel}`))
    setProteinUniProtAnnotationRange(null)
    applyPostAnnotationFeatureSelection(planPostAnnotationFeatureSelection('proteinUniProt', features))
    options.setStatus(`Added ${features.length} feature${features.length === 1 ? '' : 's'} and ${bonds.length} bond${bonds.length === 1 ? '' : 's'} from ${accessions.length} UniProt match${accessions.length === 1 ? '' : 'es'} (${accessions.join(', ')}).`)
  }

  function applyProteinInterProAnnotations(features: SequenceFeature[], matches: InterProScanMatch[]) {
    const interProAccessions = [...new Set(matches.map((match) => match.interProAccession).filter(Boolean))]
    const pfamAccessions = [...new Set(matches.map((match) => match.signatureAccession))]
    const sourceSummary = [interProAccessions.length ? `InterPro ${interProAccessions.join(', ')}` : '', pfamAccessions.length ? `Pfam ${pfamAccessions.join(', ')}` : ''].filter(Boolean).join('; ')
    options.updateRecord((current) => appendInterProAnnotations(current, features, `Added ${features.length} predicted protein features from ${sourceSummary}`))
    setProteinUniProtAnnotationRange(null)
    applyPostAnnotationFeatureSelection(planPostAnnotationFeatureSelection('proteinInterPro', features))
    options.setStatus(`Added ${features.length} InterPro/Pfam domain annotation${features.length === 1 ? '' : 's'}.`)
  }

  return {
    commonFeatureDetection,
    setCommonFeatureDetection,
    crisprDetection,
    setCrisprDetection,
    proteinUniProtAnnotationRange,
    setProteinUniProtAnnotationRange,
    dnaDatabaseAnnotationRange,
    setDnaDatabaseAnnotationRange,
    translatedOrfAnnotationRange,
    setTranslatedOrfAnnotationRange,
    detectCommonFeaturesInDocument,
    redetectCommonFeatures,
    detectCrisprInDocument,
    openProteinUniProtAnnotation,
    openDnaDatabaseAnnotation,
    applyDnaDatabaseAnnotations,
    applyTranslatedOrfAnnotations,
    applyProteinUniProtAnnotations,
    applyProteinInterProAnnotations,
    addSelectedFeatureToCommonFeatures,
    addDetectedCommonFeatures,
    openCommonFeaturesBrowser,
  }
}
