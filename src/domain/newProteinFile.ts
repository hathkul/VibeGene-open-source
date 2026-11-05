import { defaultConstructProperties } from './constructProperties'
import { createId, nowIso, sanitizeProtein } from './sequence'
import type { SequenceRecord } from './types'

export type NewProteinFileResult = {
  sequence: string
  fileName: string
}

export const DEFAULT_NEW_PROTEIN_FILE_NAME = 'Untitled protein.prot'

export function normalizeNewProteinFileName(fileName: string): string {
  const trimmed = fileName.trim() || DEFAULT_NEW_PROTEIN_FILE_NAME
  return /\.[^.]+$/.test(trimmed) ? trimmed : `${trimmed}.prot`
}

export function createSequenceRecordFromNewProteinFile(result: NewProteinFileResult): SequenceRecord {
  const timestamp = nowIso()
  const sequence = sanitizeProtein(result.sequence).toUpperCase()
  const baseName = result.fileName.replace(/\.(?:json|faa|fasta|fa|pep|prot|protein)$/i, '') || 'Untitled protein'
  return {
    id: createId('protein'),
    name: baseName,
    description: '',
    molecule: 'protein',
    topology: 'linear',
    sequence,
    protein: { numberingStart: 1, numberingRegions: [], bonds: [] },
    features: [],
    primers: [],
    operations: [{
      id: createId('op'),
      type: 'newProteinFile',
      summary: `New protein file (${sequence.length} aa)`,
      createdAt: timestamp,
    }],
    construct: { ...defaultConstructProperties, syntheticDna: false },
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}
