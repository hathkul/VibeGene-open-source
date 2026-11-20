import { type ProteinTranslationSource, type SequenceRecord } from '../../domain/types'

export function proteinTranslationOriginSources(record: SequenceRecord): ProteinTranslationSource[] {
  const sources = new Map<string, ProteinTranslationSource>()
  for (const source of record.protein?.translationDerivation?.sources ?? []) {
    const name = source.projectName.trim()
    const key = source.projectId ? `id:${source.projectId}` : `name:${name}`
    if (!name) continue
    const previous = sources.get(key)
    if (!previous || (!previous.sourceRecord && source.sourceRecord)) sources.set(key, source)
  }
  return [...sources.values()]
}

export function proteinTranslationOriginNames(record: SequenceRecord): string[] {
  return proteinTranslationOriginSources(record).map((source) => source.projectName.trim())
}

export function proteinTranslationOriginLabel(record: SequenceRecord): string | null {
  const sourceNames = proteinTranslationOriginNames(record)
  if (!sourceNames.length) return null
  const extra = sourceNames.length - 1
  return `Translated from ${sourceNames[0]}${extra ? ` and ${extra} more…` : ''}`
}
