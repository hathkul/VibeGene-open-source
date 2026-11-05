import { useCallback } from 'react'
import { mergeTranslationCellsForGroup, type CdsTranslationRowGroup } from '../../domain/cdsTranslationFrame'
import { translationCopyTextFromMergedCells, type FeatureTranslationCell } from '../../domain/geneticCode'
import { featureDisplayName } from '../map/mapPrimitives'
import type { SequenceFeature } from '../../domain/types'

/**
 * Copy the translation the user actually selected.
 *
 * In-frame CDS features without a stop codon render as one seamless
 * translation, so a selection may span several features. The copy is
 * therefore resolved against the merged group cells — the same cells the drag
 * selection uses — instead of a single feature's own cells, which would drop
 * the part contributed by the neighbouring feature.
 */
export function useTranslationCopyAction({
  translationByFeatureId,
  translationRowGroups,
  annotationFeatures,
  selectedRange,
  hasCutStrandSelection,
  onStatus,
  onCopied,
}: {
  translationByFeatureId: Map<string, FeatureTranslationCell[]>
  translationRowGroups: CdsTranslationRowGroup[]
  annotationFeatures: SequenceFeature[]
  selectedRange: { start: number; end: number } | null
  hasCutStrandSelection: boolean
  onStatus?: (message: string) => void
  onCopied: () => void
}) {
  return useCallback((featureId: string) => {
    const ownCells = translationByFeatureId.get(featureId)
    if (!ownCells?.length) return
    const group = translationRowGroups.find((entry) => entry.features.some((feature) => feature.id === featureId))
    const mergedCells = group ? mergeTranslationCellsForGroup(group, translationByFeatureId) : ownCells
    const text = translationCopyTextFromMergedCells(mergedCells, hasCutStrandSelection ? null : selectedRange)
    const feature = annotationFeatures.find((entry) => entry.id === featureId)
    const label = feature ? featureDisplayName(feature) : 'translation'
    void navigator.clipboard.writeText(text).then(() => {
      onStatus?.(`Copied ${text.length} amino acids from ${label}.`)
      onCopied()
    })
  }, [annotationFeatures, hasCutStrandSelection, onCopied, onStatus, selectedRange, translationByFeatureId, translationRowGroups])
}
