import type { SequenceRecord } from './types'
import { defaultConstructProperties, normalizeSequenceRecord } from './constructProperties'
import { createId, nowIso, sanitizeSequenceForMolecule } from './sequence'

export const featureColors: Record<string, string> = {
  CDS: '#f59e0b',
  gene: '#22c55e',
  promoter: '#3b82f6',
  regulatory: '#3b82f6',
  rep_origin: '#8b5cf6',
  oriT: '#a855f7',
  misc_feature: '#64748b',
  primer_bind: '#ec4899',
  protein_bind: '#14b8a6',
  misc_binding: '#0f766e',
  terminator: '#ef4444',
  mRNA: '#10b981',
  transcript: '#10b981',
  prim_transcript: '#10b981',
  exon: '#84cc16',
  intron: '#a3a3a3',
  ncRNA: '#06b6d4',
  rRNA: '#06b6d4',
  tRNA: '#06b6d4',
  RBS: '#f97316',
  enhancer: '#60a5fa',
  operator: '#38bdf8',
  polyA_signal: '#f43f5e',
  polyA_site: '#f43f5e',
  misc_difference: '#eab308',
}

export function makeRecord(partial: Partial<SequenceRecord>): SequenceRecord {
  const timestamp = nowIso()
  const molecule = partial.molecule ?? 'dna'
  return normalizeSequenceRecord({
    id: partial.id ?? createId('seq'),
    name: partial.name ?? 'Untitled sequence',
    mapLabel: partial.mapLabel,
    description: partial.description ?? '',
    molecule,
    topology: molecule === 'protein' ? 'linear' : partial.topology ?? 'circular',
    sequence: sanitizeSequenceForMolecule(partial.sequence ?? '', molecule),
    protein: partial.protein,
    features: partial.features ?? [],
    primers: partial.primers ?? [],
    operations: partial.operations ?? [],
    history: partial.history,
    snapGeneNativeHistory: partial.snapGeneNativeHistory,
    strandColors: partial.strandColors,
    snapGeneEnzymes: partial.snapGeneEnzymes,
    fileEnzymeSets: partial.fileEnzymeSets,
    dnaEnds: partial.dnaEnds,
    dnaEndsProvenance: partial.dnaEndsProvenance,
    traceFiles: partial.traceFiles,
    construct: partial.construct ?? defaultConstructProperties,
    createdAt: partial.createdAt ?? timestamp,
    updatedAt: partial.updatedAt ?? timestamp,
  })
}
