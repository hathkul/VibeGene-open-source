/* eslint-disable react-refresh/only-export-components, react-hooks/exhaustive-deps, react-hooks/preserve-manual-memoization, react-hooks/set-state-in-effect */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, ClipboardEvent as ReactClipboardEvent, CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { enzymes } from '../../domain/enzymes'
import { primerAnnealedSequence } from '../../domain/cloning'
import { codonFrequencyLabel } from '../../domain/codonUsage'
import { primerEditorAnnealPreview, annealMaskFromBindingLayout, buildPrimerFrameDisplay, primerConstructAnnealSequence, refreshExactPrimerBindings, primerBindingLayoutRange } from '../../domain/primerSequenceLayout'
import { calculateAnnealTemperature } from '../../domain/primerThermodynamics'
import { primerDuplexTmForLayout } from '../../domain/primerDuplexThermodynamics'
import { gcContent, normalizeDna, reverseComplement } from '../../domain/sequence'
import { primerLengthError } from '../../domain/primerLimits'
import type { Primer, PrimerBindingLayout, SequenceRecord, Strand } from '../../domain/types'
import { formatThermoTemperature, type PrimerEditorState, type SelectionRange } from '../sequence'
import { PrimerStructuresPanel } from '../../PrimerStructuresPanel'
import { CloningRecordWorkspace } from '../cloning/CloningRecordWorkspace'
import { Primer3ThalSummary } from './Primer3ThalSummary'
import { PrimerTmConditions } from './PrimerTmConditions'
import { PrimerBindingSpecificityCheck } from '../../PrimerBindingSpecificityCheck'
import { defaultPrimerTmConditionValues, primerTmConditionsForCalculation } from './PrimerTmConditionsModel'
import { buildPrimer3ThalRequest, primerFrameDisplayFromPrimer3Thal } from './primer3ThalForBinding'
import { usePrimer3Thal } from './usePrimer3Thal'
import { primerPreviewWindow } from './primerPreviewWindow'
import './PrimerEditorPreview.css'
const aminoAcidOptions = [
  { name: 'Ala', code: 'A', codons: ['GCT', 'GCC', 'GCA', 'GCG'] },
  { name: 'Arg', code: 'R', codons: ['CGT', 'CGC', 'CGA', 'CGG', 'AGA', 'AGG'] },
  { name: 'Asn', code: 'N', codons: ['AAT', 'AAC'] },
  { name: 'Asp', code: 'D', codons: ['GAT', 'GAC'] },
  { name: 'Cys', code: 'C', codons: ['TGT', 'TGC'] },
  { name: 'Gln', code: 'Q', codons: ['CAA', 'CAG'] },
  { name: 'Glu', code: 'E', codons: ['GAA', 'GAG'] },
  { name: 'Gly', code: 'G', codons: ['GGT', 'GGC', 'GGA', 'GGG'] },
  { name: 'His', code: 'H', codons: ['CAT', 'CAC'] },
  { name: 'Ile', code: 'I', codons: ['ATT', 'ATC', 'ATA'] },
  { name: 'Leu', code: 'L', codons: ['TTA', 'TTG', 'CTT', 'CTC', 'CTA', 'CTG'] },
  { name: 'Lys', code: 'K', codons: ['AAA', 'AAG'] },
  { name: 'Met', code: 'M', codons: ['ATG'] },
  { name: 'Phe', code: 'F', codons: ['TTT', 'TTC'] },
  { name: 'Pro', code: 'P', codons: ['CCT', 'CCC', 'CCA', 'CCG'] },
  { name: 'Ser', code: 'S', codons: ['TCT', 'TCC', 'TCA', 'TCG', 'AGT', 'AGC'] },
  { name: 'Thr', code: 'T', codons: ['ACT', 'ACC', 'ACA', 'ACG'] },
  { name: 'Trp', code: 'W', codons: ['TGG'] },
  { name: 'Tyr', code: 'Y', codons: ['TAT', 'TAC'] },
  { name: 'Val', code: 'V', codons: ['GTT', 'GTC', 'GTA', 'GTG'] },
  { name: 'Stop', code: '*', codons: ['TAA', 'TAG', 'TGA'] },
]

const peptideInsertionOptions = [
  { group: 'Epitope and Affinity Tags', label: '6xHis', peptide: 'HHHHHH', dna: 'CACCACCACCACCACCAC' },
  { group: 'Epitope and Affinity Tags', label: '8xHis', peptide: 'HHHHHHHH', dna: 'CACCACCACCACCACCACCACCAC' },
  { group: 'Epitope and Affinity Tags', label: '10xHis', peptide: 'HHHHHHHHHH', dna: 'CACCACCACCACCACCACCACCACCACCAC' },
  { group: 'Epitope and Affinity Tags', label: 'AviTag(TM)', peptide: 'GLNDIFEAQKIEWHE', dna: 'GGTCTGAACGATATCTTCGAAGCTCAGAAGATCGAATGGCATGAA' },
  { group: 'Epitope and Affinity Tags', label: 'c-myc', peptide: 'EQKLISEEDL', dna: 'GAACAGAAGCTGATCTCCGAAGAAGACCTG' },
  { group: 'Epitope and Affinity Tags', label: 'FLAG', peptide: 'DYKDDDDK', dna: 'GACTACAAGGACGACGATGACAAG' },
  { group: 'Epitope and Affinity Tags', label: 'Glu-Glu', peptide: 'EYMPME', dna: 'GAATACATGCCAATGGAA' },
  { group: 'Epitope and Affinity Tags', label: 'Hemagglutinin (HA)', peptide: 'YPYDVPDYA', dna: 'TACCCATACGACGTCCCAGACTACGCT' },
  { group: 'Epitope and Affinity Tags', label: 'HSV', peptide: 'QPELAPEDPED', dna: 'CAGCCAGAATTGGCTCCAGAAGACCCAGAAGAC' },
  { group: 'Epitope and Affinity Tags', label: 'S-Tag', peptide: 'KETAAAKFERQHMDS', dna: 'AAGGAAACCGCTGCTGCTAAGTTCGAACGTCAGCATATGGACTCT' },
  { group: 'Epitope and Affinity Tags', label: 'Strep-Tag II', peptide: 'WSHPQFEK', dna: 'TGGTCCCACCCGCAGTTCGAAAAG' },
  { group: 'Epitope and Affinity Tags', label: 'T7', peptide: 'MASMTGGQQMG', dna: 'ATGGCTTCTATGACCGGTGGTCAGCAAATGGGT' },
  { group: 'Epitope and Affinity Tags', label: 'VSV-G', peptide: 'YTDIEMNRLGK', dna: 'TACACCGACATCGAAATGAACCGTCTGGGTAAG' },
  { group: 'Epitope and Affinity Tags', label: 'V5', peptide: 'GKPIPNPLLGLDST', dna: 'GGTAAGCCTATCCCTAACCCTCTCCTCGGTCTCGATTCTACC' },
  { group: 'Protease Cleavage Sites', label: 'Enterokinase', peptide: 'DDDDK', dna: 'GACGACGACGACAAG' },
  { group: 'Protease Cleavage Sites', label: 'Factor Xa', peptide: 'IEGR', dna: 'ATCGAAGGTCGT' },
  { group: 'Protease Cleavage Sites', label: 'Genenase(TM) I', peptide: 'PGAAHY', dna: 'CCAGGTGCTGCTCATTAC' },
  { group: 'Protease Cleavage Sites', label: 'PreScission Protease (HRV 3C)', peptide: 'LEVLFQGP', dna: 'CTGGAAGTTCTGTTCCAGGGTCCA' },
  { group: 'Protease Cleavage Sites', label: 'TEV Protease', peptide: 'EDLYFQS', dna: 'GAAGACCTGTATTTCCAGTCT' },
  { group: 'Protease Cleavage Sites', label: 'Thrombin', peptide: 'LVPRGS', dna: 'CTGGTGCCGCGTGGTAGC' },
]

const iupacExpansionBases: Record<string, string[]> = {
  A: ['A'], C: ['C'], G: ['G'], T: ['T'], R: ['A', 'G'], Y: ['C', 'T'], S: ['G', 'C'], W: ['A', 'T'],
  K: ['G', 'T'], M: ['A', 'C'], B: ['C', 'G', 'T'], D: ['A', 'G', 'T'], H: ['A', 'C', 'T'], V: ['A', 'C', 'G'], N: ['A', 'C', 'G', 'T'],
}

function expandDegenerateDna(sequence: string, limit = 256) {
  let variants = ['']
  for (const base of normalizeDna(sequence)) {
    const options = iupacExpansionBases[base] ?? [base]
    variants = variants.flatMap((prefix) => options.map((option) => prefix + option))
    if (variants.length > limit) return variants.slice(0, limit)
  }
  return variants
}

export function primerAnnealedLength(primer: Primer) {
  return primerAnnealedSequence(primer).length
}

export function preserveBindingsForFivePrimeInsertion(primer: Primer, nextSequence: string): PrimerBindingLayout[] | undefined {
  if (!primer.bindings?.length) return undefined
  const previousSequence = normalizeDna(primer.sequence)
  if (!nextSequence.endsWith(previousSequence)) return undefined
  const inserted = nextSequence.slice(0, nextSequence.length - previousSequence.length)
  if (!inserted) return primer.bindings
  return primer.bindings.map((binding) => ({
    ...binding,
    components: [{ primerBases: inserted }, ...binding.components],
  }))
}

export type PrimerEditorAnnealInfo = {
  mask: boolean[]
  annealedCount: number
  terminalSequence: string
  bindings?: PrimerBindingLayout[]
}

export function inferPrimerEditorAnneal(
  template: string,
  sequence: string,
  preferredStrand?: Strand,
  bindings?: PrimerBindingLayout[],
): PrimerEditorAnnealInfo {
  const preview = primerEditorAnnealPreview(template, sequence, { preferredStrand, bindings })
  return {
    mask: preview.mask,
    annealedCount: preview.annealedCount,
    terminalSequence: preview.terminalSequence,
    bindings: preview.bindings,
  }
}

export function PrimerEditorDialog({
  draft,
  record,
  onCancel,
  onSave,
  onSpecificityChange,
}: {
  draft: PrimerEditorState
  record: SequenceRecord
  onCancel: () => void
  onSave: (next: PrimerEditorState) => void
  onSpecificityChange?: (value: Primer['specificity']) => void
}) {
  const [localDraft, setLocalDraft] = useState(draft)
  const [previewSelection, setPreviewSelection] = useState<SelectionRange | null>(null)
  const [bindingSiteIndex, setBindingSiteIndex] = useState(0)
  const [tmConditionValues, setTmConditionValues] = useState({ ...defaultPrimerTmConditionValues })
  const [dialogSize, setDialogSize] = useState(() => ({
    width: Math.min(900, window.innerWidth - 32),
    height: null as number | null,
  }))
  const dialogResizeRef = useRef<{
    startX: number
    startY: number
    startWidth: number
    startHeight: number
  } | null>(null)
  const sequenceInputRef = useRef<HTMLInputElement | null>(null)
  const nameInputRef = useRef<HTMLInputElement | null>(null)
  const sequenceHighlightRef = useRef<HTMLDivElement | null>(null)
  const pendingSequenceSelectionRef = useRef<{ start: number; end: number } | null>(null)
  const [activePrimerTab, setActivePrimerTab] = useState<'description' | 'insertions' | 'structures'>('insertions')
  const [selectedAminoAcidCode, setSelectedAminoAcidCode] = useState('A')
  const selectedAminoAcid = aminoAcidOptions.find((option) => option.code === selectedAminoAcidCode) ?? aminoAcidOptions[0]
  const [selectedCodon, setSelectedCodon] = useState(selectedAminoAcid.codons[0])
  const [selectedEnzymeName, setSelectedEnzymeName] = useState(() => (enzymes.some((enzyme) => enzyme.name === 'AanI') ? 'AanI' : (enzymes[0]?.name ?? '')))
  const selectedEnzyme = enzymes.find((enzyme) => enzyme.name === selectedEnzymeName) ?? enzymes[0]
  const enzymeSequences = expandDegenerateDna(selectedEnzyme?.recognition ?? '')
  const [selectedEnzymeSequence, setSelectedEnzymeSequence] = useState(enzymeSequences[0] ?? '')
  const [selectedPeptideLabel, setSelectedPeptideLabel] = useState('6xHis')
  const selectedPeptide = peptideInsertionOptions.find((option) => option.label === selectedPeptideLabel) ?? peptideInsertionOptions[0]
  const [insertReverseComplement, setInsertReverseComplement] = useState(false)
  const sequence = normalizeDna(localDraft.sequence)
  const sequenceLengthError = primerLengthError(sequence.length)
  const canAnalyzePrimer = sequenceLengthError === null
  const gc = sequence ? gcContent(sequence) : 0
  const annealInfo = useMemo(
    () => canAnalyzePrimer
      ? inferPrimerEditorAnneal(normalizeDna(record.sequence), sequence, localDraft.strand, localDraft.bindings)
      : { mask: [], annealedCount: 0, terminalSequence: '', bindings: [] },
    [canAnalyzePrimer, localDraft.bindings, localDraft.strand, record.sequence, sequence],
  )
  const previewPrimerId = localDraft.primerId ?? 'primer-editor-preview'
  const bindingSites = useMemo(() => {
    if (!canAnalyzePrimer) return []
    const resolved = refreshExactPrimerBindings([{
      id: previewPrimerId,
      name: localDraft.name.trim() || 'Primer',
      sequence,
      color: localDraft.color,
      description: localDraft.description,
    }], normalizeDna(record.sequence))[0]?.bindings ?? []
    const preferred = annealInfo.bindings?.[0]
    if (!preferred || resolved.length < 2) return resolved
    const preferredIndex = resolved.findIndex((binding) =>
      binding.strand === preferred.strand &&
      binding.templateStart === preferred.templateStart &&
      binding.templateEnd === preferred.templateEnd
    )
    if (preferredIndex <= 0) return resolved
    return [resolved[preferredIndex]!, ...resolved.slice(0, preferredIndex), ...resolved.slice(preferredIndex + 1)]
  }, [annealInfo.bindings, canAnalyzePrimer, localDraft.color, localDraft.description, localDraft.name, previewPrimerId, record.sequence, sequence])
  const activeBindingSiteIndex = Math.min(bindingSiteIndex, Math.max(0, bindingSites.length - 1))
  const activeBinding = bindingSites[activeBindingSiteIndex] ?? annealInfo.bindings?.[0]
  const activeAnnealInfo = useMemo<PrimerEditorAnnealInfo>(() => {
    if (!activeBinding) return annealInfo
    const mask = annealMaskFromBindingLayout(record.sequence, sequence, activeBinding)
    return {
      mask,
      annealedCount: mask.filter(Boolean).length,
      terminalSequence: primerConstructAnnealSequence(record.sequence, activeBinding),
      bindings: [activeBinding],
    }
  }, [activeBinding, annealInfo, record.sequence, sequence])
  const tmConditions = primerTmConditionsForCalculation(tmConditionValues)
  const validTmConditions = tmConditions !== null
  const terminalAnnealedThermo = calculateAnnealTemperature(validTmConditions ? activeAnnealInfo.terminalSequence : '', validTmConditions ? tmConditions : {})
  const duplexThermo = activeBinding && validTmConditions ? primerDuplexTmForLayout(record.sequence, activeBinding, sequence, tmConditions) : null
  const primer3Request = useMemo(() => buildPrimer3ThalRequest({
    primer: sequence,
    template: record.sequence,
    topology: record.topology,
    binding: activeBinding,
    conditions: tmConditions,
  }), [activeBinding, bindingSites.length, record.sequence, record.topology, sequence, tmConditions?.dntpConc, tmConditions?.mgConc, tmConditions?.monoConc, tmConditions?.oligoConc])
  const primer3Thal = usePrimer3Thal(
    primer3Request.status === 'ready' ? primer3Request.input : null,
    primer3Request.status === 'unavailable' ? primer3Request.reason : undefined,
  )
  const previewPrimer = useMemo<Primer>(() => ({
    id: previewPrimerId,
    name: localDraft.name.trim() || 'Primer',
    sequence,
    color: localDraft.color,
    description: localDraft.description,
    bindings: activeAnnealInfo.bindings,
  }), [activeAnnealInfo.bindings, localDraft.color, localDraft.description, localDraft.name, previewPrimerId, sequence])
  const primer3Preview = useMemo(() => {
    if (!activeBinding || primer3Request.status !== 'ready' || primer3Thal.status !== 'estimated') return null
    return primerFrameDisplayFromPrimer3Thal({
      primer: previewPrimer,
      template: record.sequence,
      topology: record.topology,
      binding: activeBinding,
      input: primer3Request.input,
      result: primer3Thal.result,
      fallbackDisplay: buildPrimerFrameDisplay(previewPrimer, record.sequence, activeBinding),
      excludedPrimer5PrimeBases: primer3Request.approximation?.excludedPrimer5PrimeBases,
    })
  }, [activeBinding, primer3Request, primer3Thal, previewPrimer, record.sequence, record.topology])
  const previewRecord = useMemo<SequenceRecord>(() => ({
    ...record,
    primers: [{
      ...previewPrimer,
      bindings: primer3Preview ? [primer3Preview.layout] : activeAnnealInfo.bindings,
    }],
  }), [activeAnnealInfo.bindings, primer3Preview, previewPrimer, record])
  const previewAnnealRange = useMemo<SelectionRange | null>(() => {
    const binding = activeBinding ?? localDraft.bindings?.[0]
    if (!binding || record.sequence.length <= 0) return localDraft.sourceRange ?? null
    const { start, end } = primerBindingLayoutRange(binding)
    if (end <= start) return localDraft.sourceRange ?? null
    return { start, end }
  }, [activeBinding, localDraft.bindings, localDraft.sourceRange, record.sequence.length])
  const previewWindow = useMemo(() => {
    if (!previewAnnealRange) return null
    // Match SequenceRows' measured one-line capacity after dialog padding, the 48 px
    // preview sidebar, row labels, and end-position gutter. Never request a second row.
    const estimatedVisibleBases = Math.max(1, Math.floor((dialogSize.width - 330) / 10))
    const display = primer3Preview?.display ?? (activeBinding ? buildPrimerFrameDisplay(previewPrimer, record.sequence, activeBinding) : null)
    return primerPreviewWindow(display, previewAnnealRange, record.sequence.length, estimatedVisibleBases)
  }, [activeBinding, dialogSize.width, previewAnnealRange, previewPrimer, primer3Preview, record.sequence])

  function beginDialogResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()
    const dialog = event.currentTarget.closest('.primer-editor-dialog')
    dialogResizeRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startWidth: dialogSize.width,
      startHeight: dialog?.getBoundingClientRect().height ?? 560,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function moveDialogResize(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dialogResizeRef.current
    if (!drag) return
    const maxWidth = Math.max(320, window.innerWidth - 16)
    const maxHeight = Math.max(320, window.innerHeight - 16)
    const minWidth = Math.min(760, maxWidth)
    const minHeight = Math.min(560, maxHeight)
    setDialogSize({
      width: Math.max(minWidth, Math.min(maxWidth, drag.startWidth + event.clientX - drag.startX)),
      height: Math.max(minHeight, Math.min(maxHeight, drag.startHeight + event.clientY - drag.startY)),
    })
  }

  function endDialogResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dialogResizeRef.current) return
    dialogResizeRef.current = null
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // Ignore a pointer capture already released by the browser.
    }
  }

  function navigateBindingSite(direction: -1 | 1) {
    if (bindingSites.length < 2) return
    setBindingSiteIndex((current) => {
      const safeCurrent = Math.min(current, bindingSites.length - 1)
      return (safeCurrent + direction + bindingSites.length) % bindingSites.length
    })
    setPreviewSelection(null)
  }

  function update(patch: Partial<PrimerEditorState>) {
    setLocalDraft((current) => ({ ...current, ...patch }))
  }

  function insertSequence(insert: string) {
    const normalizedInsert = insertReverseComplement ? reverseComplement(insert) : normalizeDna(insert)
    pendingSequenceSelectionRef.current = { start: normalizedInsert.length, end: normalizedInsert.length }
    update({ sequence: normalizeDna(`${normalizedInsert}${localDraft.sequence}`) })
  }

  function updateSequenceFromInput(rawValue: string, selectionStart: number | null, selectionEnd: number | null) {
    const normalizedSequence = normalizeDna(rawValue)
    const start = selectionStart ?? rawValue.length
    const end = selectionEnd ?? start
    pendingSequenceSelectionRef.current = {
      start: normalizeDna(rawValue.slice(0, start)).length,
      end: normalizeDna(rawValue.slice(0, end)).length,
    }
    update({ sequence: normalizedSequence })
  }

  function handleSequenceChange(event: ChangeEvent<HTMLInputElement>) {
    updateSequenceFromInput(event.currentTarget.value, event.currentTarget.selectionStart, event.currentTarget.selectionEnd)
  }

  function syncSequenceHighlightScroll(input: HTMLInputElement) {
    if (!sequenceHighlightRef.current) return
    sequenceHighlightRef.current.style.transform = `translateX(${-input.scrollLeft}px)`
  }

  function keepSequenceCaretVisible(input: HTMLInputElement) {
    const highlight = sequenceHighlightRef.current
    if (!highlight || !sequence.length) return
    const caret = input.selectionEnd ?? sequence.length
    const caretLeft = (highlight.scrollWidth * caret) / sequence.length
    const visibleWidth = Math.max(1, input.clientWidth - 16)
    if (caretLeft < input.scrollLeft + 6) {
      input.scrollLeft = Math.max(0, caretLeft - 6)
    } else if (caretLeft > input.scrollLeft + visibleWidth) {
      input.scrollLeft = caretLeft - visibleWidth
    }
    syncSequenceHighlightScroll(input)
  }

  function scheduleSequenceCaretVisibility(input: HTMLInputElement) {
    window.requestAnimationFrame(() => keepSequenceCaretVisible(input))
  }

  function handleSequencePaste(event: ReactClipboardEvent<HTMLInputElement>) {
    event.preventDefault()
    const insert = normalizeDna(event.clipboardData.getData('text'))
    const start = event.currentTarget.selectionStart ?? sequence.length
    const end = event.currentTarget.selectionEnd ?? start
    const nextSequence = `${sequence.slice(0, start)}${insert}${sequence.slice(end)}`
    const nextCursor = start + insert.length
    pendingSequenceSelectionRef.current = { start: nextCursor, end: nextCursor }
    update({ sequence: nextSequence })
  }

  useEffect(() => {
    const aminoAcid = aminoAcidOptions.find((option) => option.code === selectedAminoAcidCode) ?? aminoAcidOptions[0]
    setSelectedCodon(aminoAcid.codons[0])
  }, [selectedAminoAcidCode])

  useEffect(() => {
    const enzyme = enzymes.find((entry) => entry.name === selectedEnzymeName) ?? enzymes[0]
    setSelectedEnzymeSequence(expandDegenerateDna(enzyme?.recognition ?? '')[0] ?? '')
  }, [selectedEnzymeName])

  useLayoutEffect(() => {
    const selection = pendingSequenceSelectionRef.current
    const input = sequenceInputRef.current
    if (!selection || !input) return
    input.setSelectionRange(selection.start, selection.end)
    keepSequenceCaretVisible(input)
    pendingSequenceSelectionRef.current = null
  }, [sequence])

  useLayoutEffect(() => {
    const input = nameInputRef.current
    if (!input) return
    input.focus()
    input.select()
  }, [])

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onCancel}>
      <section
        className="primer-editor-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="primer-editor-title"
        style={{ width: dialogSize.width, height: dialogSize.height ?? undefined }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="primer-editor-titlebar">
          <h2 id="primer-editor-title">{localDraft.mode === 'edit' ? `Edit Primer in ${record.name}` : `New Primer in ${record.name}`}</h2>
        </header>

        <div className="primer-editor-anneal-pane" aria-label="Live primer annealing preview" style={{
          '--primer-preview-left-bases': previewWindow?.left ?? 0,
          '--primer-preview-right-bases': previewWindow?.right ?? 0,
        } as CSSProperties}>
          {canAnalyzePrimer ? <CloningRecordWorkspace
            record={previewRecord}
            title={primer3Preview ? 'Primer3 preview' : 'Original alignment preview'}
            selectedRange={previewSelection ?? previewAnnealRange}
            cutStrandSelection={null}
            selectedSites={[]}
            allowEnzymeSelect={false}
            includePrimersTab
            showFeatureTranslations
            selectedPrimerIds={[previewPrimerId]}
            primerFrameDisplayOverrides={primer3Preview ? [primer3Preview.display] : undefined}
            disablePrimer3PrimerFrameRefinement
            sequenceOnly
            sequenceOnlySidebar
            hideSequenceMinimap
            singleRowSequence
            selectionDetailsInStatus
            sequenceViewRange={previewWindow?.range ?? null}
            onRangeSelect={setPreviewSelection}
          /> : (
            <p className="muted" role="alert">
              {sequenceLengthError} Shorten the sequence to restore the annealing preview.
            </p>
          )}
        </div>

        {bindingSites.length > 1 && (
          <nav className="primer-editor-binding-sites" aria-label="Primer binding sites">
            <button type="button" aria-label="Previous binding site" onClick={() => navigateBindingSite(-1)}>
              &#8249;
            </button>
            <span>Showing {activeBindingSiteIndex + 1} of {bindingSites.length} binding sites</span>
            <button type="button" aria-label="Next binding site" onClick={() => navigateBindingSite(1)}>
              &#8250;
            </button>
          </nav>
        )}

        <div className="primer-editor-top">
          <label>
            Primer:
            <input
              ref={nameInputRef}
              value={localDraft.name}
              onChange={(event) => update({ name: event.target.value })}
              autoFocus
            />
          </label>
          <div className="primer-editor-tm-estimates">
            {sequence.length}-mer / {gc.toFixed(0)}% GC / 3&apos; exact-match Tm (original alignment) {formatThermoTemperature(terminalAnnealedThermo)}
            <Primer3ThalSummary
              primer3={primer3Thal}
              fixedAlignment={duplexThermo}
              primer3MappedToPreview={primer3Preview !== null}
              approximation={primer3Request.status === 'ready' ? primer3Request.approximation : undefined}
            />
          </div>
          <label>
            Color:
            <select value={localDraft.color} onChange={(event) => update({ color: event.target.value })}>
              <option value="#7c3aed">Purple</option>
              <option value="#000000">Black</option>
              <option value="#0ea5e9">Blue</option>
              <option value="#dc2626">Red</option>
              <option value="#16a34a">Green</option>
            </select>
          </label>
        </div>

        <PrimerTmConditions value={tmConditionValues} onChange={setTmConditionValues} />
        <div className="primer-editor-sequence-row">
          <span>5&apos;</span>
          <div className="primer-editor-sequence-field">
            <div className="primer-editor-sequence-highlight" aria-hidden="true">
              <div ref={sequenceHighlightRef}>
                {canAnalyzePrimer && sequence.split('').map((base, index) => (
                  <span key={`${index}-${base}`} className={activeAnnealInfo.mask[index] ? 'is-annealed' : 'is-overhang'}>
                    {base}
                  </span>
                ))}
              </div>
            </div>
            <input
              ref={sequenceInputRef}
              className="primer-editor-sequence"
              value={sequence}
              onChange={handleSequenceChange}
              onPaste={handleSequencePaste}
              onScroll={(event) => syncSequenceHighlightScroll(event.currentTarget)}
              onSelect={(event) => scheduleSequenceCaretVisibility(event.currentTarget)}
              onKeyUp={(event) => scheduleSequenceCaretVisibility(event.currentTarget)}
              spellCheck={false}
            />
          </div>
          <span>3&apos;</span>
        </div>

        <PrimerBindingSpecificityCheck
          sequence={sequence}
          templateSequence={record.sequence}
          preferredStrand={activeBinding?.strand ?? localDraft.strand}
          bindings={activeAnnealInfo.bindings}
          savedResult={localDraft.specificity}
          storageNotice={localDraft.mode === 'create' ? 'Save the primer and the construct to keep this result.' : 'Save the construct to keep changes to this result.'}
          onResultChange={(specificity) => { update({ specificity }); onSpecificityChange?.(specificity) }}
          toolbarLeading={<label className="checkbox-line">
            <input
              type="checkbox"
              checked={localDraft.phosphorylated}
              onChange={(event) => update({ phosphorylated: event.target.checked })}
            />
            5&apos; Phosphorylated
          </label>}
          reverseComplementButton={<button type="button" onClick={() => update({ sequence: reverseComplement(localDraft.sequence) })}>
            Reverse Complement
          </button>}
        />

        <div className="primer-editor-tabs">
          <button
            type="button"
            className={activePrimerTab === 'description' ? 'active' : ''}
            onClick={() => setActivePrimerTab('description')}
          >
            Description
          </button>
          <button
            type="button"
            className={activePrimerTab === 'insertions' ? 'active' : ''}
            onClick={() => setActivePrimerTab('insertions')}
          >
            Insertions
          </button>
          <button
            type="button"
            className={activePrimerTab === 'structures' ? 'active' : ''}
            disabled={!canAnalyzePrimer}
            title={sequenceLengthError ?? undefined}
            onClick={() => setActivePrimerTab('structures')}
          >
            Structures
          </button>
        </div>

        {activePrimerTab === 'description' ? (
          <div className="primer-editor-description-panel">
            <textarea
              value={localDraft.description}
              onChange={(event) => update({ description: event.target.value })}
              rows={8}
              placeholder="Primer description"
            />
          </div>
        ) : activePrimerTab === 'insertions' ? (
          <div className="primer-editor-insert-panel">
            <label className="checkbox-line">
              <input
                type="checkbox"
                checked={insertReverseComplement}
                onChange={(event) => setInsertReverseComplement(event.target.checked)}
              />
              Insert and reverse complement
            </label>
            <label>
              <select value={selectedAminoAcidCode} onChange={(event) => setSelectedAminoAcidCode(event.target.value)}>
                {aminoAcidOptions.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.name}
                  </option>
                ))}
              </select>
              <span>codon:</span>
              <select value={selectedCodon} onChange={(event) => setSelectedCodon(event.target.value)}>
                {selectedAminoAcid.codons.map((codon) => (
                  <option key={codon} value={codon}>
                    {codonFrequencyLabel(codon)}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => insertSequence(selectedCodon)}>
                Insert
              </button>
            </label>
            <label>
              <select value={selectedEnzymeName} onChange={(event) => setSelectedEnzymeName(event.target.value)}>
                {enzymes.map((enzyme) => (
                  <option key={enzyme.name} value={enzyme.name}>
                    {enzyme.name}
                  </option>
                ))}
              </select>
              <span>site:</span>
              <select value={selectedEnzymeSequence} onChange={(event) => setSelectedEnzymeSequence(event.target.value)}>
                {enzymeSequences.map((variant) => (
                  <option key={variant} value={variant}>
                    {variant}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => insertSequence(selectedEnzymeSequence)}>
                Insert
              </button>
            </label>
            <label className="primer-editor-peptide-row">
              <span>Peptide coding sequence:</span>
              <select value={selectedPeptideLabel} onChange={(event) => setSelectedPeptideLabel(event.target.value)}>
                {[...new Set(peptideInsertionOptions.map((option) => option.group))].map((group) => (
                  <optgroup key={group} label={group}>
                    {peptideInsertionOptions.filter((option) => option.group === group).map((option) => (
                      <option key={option.label} value={option.label}>
                        {option.label}  {option.peptide}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <button type="button" onClick={() => insertSequence(selectedPeptide.dna)}>
                Insert
              </button>
            </label>
          </div>
        ) : (
          <PrimerStructuresPanel sequence={sequence} />
        )}

        <footer className="primer-editor-footer">
          <span>
            Original alignment: {activeAnnealInfo.annealedCount} annealed bases / 3&apos; exact-match Tm {formatThermoTemperature(terminalAnnealedThermo)}
          </span>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave({ ...localDraft, sequence })}
            disabled={!sequence || !localDraft.name.trim() || !canAnalyzePrimer}
          >
            OK
          </button>
        </footer>
        <div
          className="primer-editor-resize-handle"
          role="separator"
          aria-label="Resize primer properties dialog"
          onPointerDown={beginDialogResize}
          onPointerMove={moveDialogResize}
          onPointerUp={endDialogResize}
          onPointerCancel={endDialogResize}
        />
      </section>
    </div>
  )
}
