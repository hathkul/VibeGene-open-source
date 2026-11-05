import { type SequenceRecord } from '../../domain/types'

export function proteinTranslationOriginLabel(record: SequenceRecord): string | null {
  const sourceNames = [...new Set(
    (record.protein?.translationDerivation?.sources ?? [])
      .map((source) => source.projectName.trim())
      .filter(Boolean),
  )]
  return sourceNames.length ? `Translated from ${sourceNames.join(', ')}` : null
}
