import { defaultConstructProperties } from './constructProperties'
import { defaultDnaEnds } from './dnaEnds'
import { createId, nowIso, sanitizeDna } from './sequence'
import type { SequenceRecord, Topology } from './types'

export type NewDnaFileResult = {
  sequence: string
  topology: Topology
  fileName: string
}

/** Build the SequenceRecord created by the new-DNA dialog and hybrid window. */
export function createSequenceRecordFromNewDnaFile(result: NewDnaFileResult): SequenceRecord {
  const timestamp = nowIso()
  const sequence = sanitizeDna(result.sequence).toUpperCase()
  const baseName = result.fileName.replace(/\.dna$/i, '') || 'Untitled'
  return {
    id: createId('seq'),
    name: baseName,
    description: '',
    molecule: 'dna',
    topology: result.topology,
    sequence,
    features: [],
    primers: [],
    operations: [
      {
        id: createId('op'),
        type: 'newDnaFile',
        summary: `New ${result.topology} DNA file (${sequence.length} bp)`,
        createdAt: timestamp,
      },
    ],
    dnaEnds: result.topology === 'linear' ? defaultDnaEnds() : undefined,
    construct: { ...defaultConstructProperties, syntheticDna: true },
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}
