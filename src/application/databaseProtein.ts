import { defaultConstructProperties } from '../domain/constructProperties'
import { createId, nowIso, sanitizeProtein } from '../domain/sequence'
import { translatedCdsDerivation } from '../domain/proteinTranslationProvenance'
import type { ProteinTranslationSource, SequenceRecord } from '../domain/types'

export type DatabaseProteinSource = {
  projectId: string
  projectName: string
  folderId: string | null
  featureId?: string
}

export type DatabaseProteinRow = {
  key: string
  name: string
  sequence: string
  color: string
  product: string
  sources: DatabaseProteinSource[]
}

/** Uppercase AA letters; drop whitespace and stop/gap markers for identity. */
export function normalizePeptide(sequence: string): string {
  return sequence.replace(/[^A-Za-z]/g, '').toUpperCase()
}

/** Open a Database CDS row as a standalone protein molecule (new window / tab). */
export function createSequenceRecordFromDatabaseProtein(
  protein: Pick<DatabaseProteinRow, 'name' | 'sequence' | 'color' | 'product' | 'sources'> & {
    translationSources?: ProteinTranslationSource[]
    comparisonSources?: import('../domain/proteinAlignmentTypes').ProteinComparisonSource[]
  },
): SequenceRecord {
  const timestamp = nowIso()
  const sequence = sanitizeProtein(protein.sequence).toUpperCase()
  const name = protein.name.trim() || 'CDS'
  const sourceNames = protein.sources.map((source) => source.projectName).filter(Boolean)
  const sourceNote =
    sourceNames.length === 0
      ? ''
      : sourceNames.length === 1
        ? `Translated CDS from ${sourceNames[0]}.`
        : `Translated CDS from ${sourceNames.length} database files.`
  const notes = [
    protein.product ? `/product="${protein.product.replace(/"/g, '')}"` : '',
    sourceNote ? `/note="${sourceNote.replace(/"/g, '')}"` : '',
  ]
    .filter(Boolean)
    .join(' ')
  const comparisonSources = (protein.comparisonSources ?? []).filter((source) => source.sequence.length > 0)
  return {
    id: createId('protein'),
    name,
    description: sourceNote,
    molecule: 'protein',
    topology: 'linear',
    sequence,
    protein: {
      numberingStart: 1,
      numberingRegions: [],
      bonds: [],
      translationDerivation: translatedCdsDerivation(protein.translationSources ?? [], timestamp),
      ...(comparisonSources.length ? { comparisonSources } : {}),
    },
    features: sequence
      ? [
          {
            id: createId('feature'),
            name,
            type: 'region',
            color: protein.color?.trim() || '#f59e0b', // theme-color-allow: persisted biological feature data, not UI chrome.
            notes: notes || undefined,
            locations: [{ start: 0, end: sequence.length, strand: 'forward' }],
          },
        ]
      : [],
    primers: [],
    operations: [
      {
        id: createId('op'),
        type: 'openDatabaseProtein',
        summary: comparisonSources.length
          ? `Opened translated CDS “${name}” (${sequence.length} aa, ${comparisonSources.length} library homolog${comparisonSources.length === 1 ? '' : 's'})`
          : `Opened translated CDS “${name}” (${sequence.length} aa)`,
        createdAt: timestamp,
      },
    ],
    construct: { ...defaultConstructProperties, syntheticDna: false },
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}
