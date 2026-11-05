import { useCallback } from 'react'
import { clipboardStrands } from '../../application/workspaceInteraction/clipboardColor'
import { complementDnaBase, extractRangePreserveCase, reverseComplement } from '../../domain/sequence'
import { defaultFeatureTranslationOptions, translateFeature } from '../../domain/geneticCode'
import { clearStrandColorForSelection, paintStrandColorForSelection } from '../../domain/snapgeneStrandColors'
import { recordColorEditInHistory } from '../../domain/snapgeneHistoryExport'
import { addOperation } from '../../domain/sequence'
import type { SequenceFeature, SequenceRecord, Strand } from '../../domain/types'
type SelectionRange = { start: number; end: number }

type StrandPaintTarget = 'top' | 'bottom' | 'both'
type CutSelection = { forward: SelectionRange; reverse: SelectionRange }

type WorkspaceClipboardColorOptions = {
  record: SequenceRecord
  selectedRange: SelectionRange | null
  cutStrandSelection: CutSelection | null
  selectedFeature: SequenceFeature | null
  updateRecord: (updater: (current: SequenceRecord) => SequenceRecord) => void
  setDisplaySection: (key: 'dnaColors', patch: { enabled: boolean; mode: 'user' }) => void
  featureDisplayName: (feature: SequenceFeature) => string
  writeClipboardText: (text: string) => Promise<void>
  setStatus: (status: string) => void
}

/** Owns clipboard strand/translation actions and user-color painting coordination. */
export function useWorkspaceClipboardColorController(options: WorkspaceClipboardColorOptions) {
  const { record, selectedRange, cutStrandSelection, selectedFeature, updateRecord, setDisplaySection, featureDisplayName, writeClipboardText, setStatus } = options
  const hasStickyFragmentSelection = (() => {
    if (!cutStrandSelection) return false
    const span = (range: SelectionRange) => range.end >= range.start ? range.end - range.start : record.sequence.length - range.start + range.end
    return span(cutStrandSelection.forward) > 1 || span(cutStrandSelection.reverse) > 1
  })()

  const copyToClipboard = useCallback((text: string, message: string) => {
    void writeClipboardText(text).then(() => setStatus(message)).catch(() => setStatus('Could not copy to clipboard.'))
  }, [setStatus, writeClipboardText])

  const copyTopStrand = useCallback(() => {
    const strands = clipboardStrands(selectedRange, cutStrandSelection, hasStickyFragmentSelection)
    if (!strands) { setStatus('Select a sequence range before copying.'); return }
    const text = extractRangePreserveCase(record.sequence, strands.top.start, strands.top.end)
    copyToClipboard(text, `Copied top strand (${text.length} bp) to clipboard.`)
  }, [copyToClipboard, cutStrandSelection, hasStickyFragmentSelection, record.sequence, selectedRange, setStatus])

  const copyBottomStrand53 = useCallback(() => {
    const strands = clipboardStrands(selectedRange, cutStrandSelection, hasStickyFragmentSelection)
    if (!strands) { setStatus('Select a sequence range before copying.'); return }
    const bottom = reverseComplement(extractRangePreserveCase(record.sequence, strands.bottom.start, strands.bottom.end))
    copyToClipboard(bottom, `Copied bottom strand 5'→3' (${bottom.length} bp) to clipboard.`)
  }, [copyToClipboard, cutStrandSelection, hasStickyFragmentSelection, record.sequence, selectedRange, setStatus])

  const copyBottomStrand35 = useCallback(() => {
    const strands = clipboardStrands(selectedRange, cutStrandSelection, hasStickyFragmentSelection)
    if (!strands) { setStatus('Select a sequence range before copying.'); return }
    const bottom = extractRangePreserveCase(record.sequence, strands.bottom.start, strands.bottom.end).split('').map(complementDnaBase).join('')
    copyToClipboard(bottom, `Copied bottom strand 3'→5' (${bottom.length} bp) to clipboard.`)
  }, [copyToClipboard, cutStrandSelection, hasStickyFragmentSelection, record.sequence, selectedRange, setStatus])

  const copyTranslation = useCallback(() => {
    if (!selectedFeature) { setStatus('Select a feature before copying its translation.'); return }
    const translation = selectedFeature.translation ?? defaultFeatureTranslationOptions(selectedFeature.locations.length)
    const peptide = translateFeature(selectedFeature, record.sequence, translation)
    if (!peptide) { setStatus('Selected feature has no translation.'); return }
    copyToClipboard(peptide, `Copied translation of ${featureDisplayName(selectedFeature)} (${peptide.length} aa) to clipboard.`)
  }, [copyToClipboard, featureDisplayName, record.sequence, selectedFeature, setStatus])

  const activateUserDnaColors = useCallback(() => {
    setDisplaySection('dnaColors', { enabled: true, mode: 'user' })
    setStatus('Enabled DNA colors — pick a swatch in the left sidebar to paint the selection.')
  }, [setDisplaySection, setStatus])

  const paintUserStrandColor = useCallback((colorName: string, strandTarget: StrandPaintTarget) => {
    if (!selectedRange || cutStrandSelection) return
    const strands: Strand[] = strandTarget === 'top' ? ['forward'] : strandTarget === 'bottom' ? ['reverse'] : ['forward', 'reverse']
    updateRecord((current) => {
      let strandColors = current.strandColors
      for (const strand of strands) strandColors = paintStrandColorForSelection(strandColors, strand, selectedRange!, colorName, current.sequence.length)
      const withColors = { ...current, strandColors }
      return addOperation({ ...withColors, history: recordColorEditInHistory(withColors.history, withColors, selectedRange!) }, 'user-colors', `Painted ${colorName} on selected sequence`)
    })
  }, [cutStrandSelection, selectedRange, updateRecord])

  const paintUserProteinColor = useCallback((colorName: string | null) => {
    if (!selectedRange || selectedRange.end <= selectedRange.start) { setStatus('Select one or more amino acids before painting.'); return }
    updateRecord((current) => {
      if (!current.protein) return current
      const userColors = colorName === null
        ? clearStrandColorForSelection(current.protein.userColors, 'forward', selectedRange!, current.sequence.length)
        : paintStrandColorForSelection(current.protein.userColors, 'forward', selectedRange!, colorName, current.sequence.length)
      return addOperation({ ...current, protein: { ...current.protein, userColors } }, 'user-colors', colorName === null ? 'Removed color from selected amino acids' : `Painted ${colorName} on selected amino acids`)
    })
    setStatus(colorName === null ? `Removed color from ${selectedRange.end - selectedRange.start} selected amino acids.` : `Painted ${selectedRange.end - selectedRange.start} selected amino acids ${colorName}.`)
  }, [selectedRange, setStatus, updateRecord])

  return { copyTopStrand, copyBottomStrand53, copyBottomStrand35, copyTranslation, activateUserDnaColors, paintUserStrandColor, paintUserProteinColor }
}
