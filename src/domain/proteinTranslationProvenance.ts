import { computeFeatureTranslationCells, defaultFeatureTranslationOptions, transcriptionStrandFromReadingFrame, translateFeature } from './geneticCode'
import { complementDnaBase } from './sequence'
import type {
  ProteinTranslationDerivation,
  ProteinTranslationSource,
  SequenceFeature,
  SequenceRecord,
} from './types'

/** Stable, compact identity check for an embedded source snapshot. */
export function dnaSequenceDigest(sequence: string): string {
  let hash = 0xcbf29ce484222325n
  const prime = 0x100000001b3n
  for (const byte of new TextEncoder().encode(sequence.toUpperCase())) {
    hash ^= BigInt(byte)
    hash = BigInt.asUintN(64, hash * prime)
  }
  return `fnv1a64:${hash.toString(16).padStart(16, '0')}`
}

export function snapshotProteinSourceDna(record: SequenceRecord): SequenceRecord {
  return {
    ...record,
    molecule: 'dna',
    protein: undefined,
    traceFiles: undefined,
    features: record.features.map((feature) => ({
      ...feature,
      locations: feature.locations.map((location) => ({ ...location })),
      translation: feature.translation
        ? { ...feature.translation, segmentNumbering: feature.translation.segmentNumbering.map((segment) => ({ ...segment })) }
        : undefined,
    })),
    primers: record.primers.map((primer) => ({
      ...primer,
      bindings: primer.bindings?.map((binding) => ({
        ...binding,
        components: binding.components.map((component) => ({ ...component })),
      })),
    })),
  }
}

export function proteinTranslationSourceFromRecord(
  record: SequenceRecord,
  feature: SequenceFeature,
  folderId: string | null = null,
): ProteinTranslationSource {
  const translation = feature.translation ?? defaultFeatureTranslationOptions(feature.locations.length)
  const strand = transcriptionStrandFromReadingFrame(
    translation.readingFrame,
    feature.locations[0]?.strand ?? 'forward',
  )
  const cells = computeFeatureTranslationCells(feature, record.sequence, translation, { topology: record.topology })
  const nucleotideSequence = cells
    .flatMap((cell) => cell.positions)
    .map((position) => {
      const base = record.sequence[position] ?? 'N'
      return strand === 'reverse' ? complementDnaBase(base) : base.toUpperCase()
    })
    .join('')
  const rawTranslation = translateFeature(feature, record.sequence, translation, { topology: record.topology })

  return {
    projectId: record.id,
    projectName: record.name,
    folderId,
    recordUpdatedAt: record.updatedAt,
    sequenceDigest: dnaSequenceDigest(record.sequence),
    cds: {
      featureId: feature.id,
      featureName: feature.name,
      locations: feature.locations.map((location) => ({ ...location })),
      translation: {
        ...translation,
        segmentNumbering: translation.segmentNumbering.map((segment) => ({ ...segment })),
      },
      nucleotideSequence,
      includedTerminalStop: rawTranslation.endsWith('*'),
    },
    sourceRecord: snapshotProteinSourceDna(record),
  }
}

export function translatedCdsDerivation(
  sources: ProteinTranslationSource[],
  createdAt = new Date().toISOString(),
): ProteinTranslationDerivation | undefined {
  return sources.length ? { kind: 'translated-cds', createdAt, sources } : undefined
}
