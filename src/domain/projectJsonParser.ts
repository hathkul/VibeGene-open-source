import type { CommonFeatureTemplate } from './commonFeatures'
import { hasNonDefaultDnaEnds } from './dnaEnds'
import { reconcileSgRnaOligoNamesInRecord } from './sgrnaOligoPrimers'
import { sequenceRecordJsonReplacer, sequenceRecordJsonReviver } from './sequenceRecordJson'
import { normalizeSequenceRecord } from './constructProperties'
import type { ProjectEnvelope, SequenceRecord } from './types'

export function isVibeGeneConstructJson(parsed: unknown): boolean {
  if (!parsed || typeof parsed !== 'object') return false
  const row = parsed as { schemaVersion?: unknown; record?: unknown; sequence?: unknown }
  const record = row.schemaVersion != null && row.record && typeof row.record === 'object'
    ? (row.record as { sequence?: unknown })
    : row
  return typeof record.sequence === 'string'
}

export function parseProjectJson(text: string): {
  record: SequenceRecord
  userCommonFeatures?: CommonFeatureTemplate[]
  displaySettings?: unknown
  customMwLadders?: import('./mwLadders').MwLadder[]
} {
  const parsed = JSON.parse(text, sequenceRecordJsonReviver) as ProjectEnvelope | SequenceRecord
  if (!isVibeGeneConstructJson(parsed)) throw new Error('Not a VibeGene construct file')
  const envelope = 'schemaVersion' in parsed ? parsed : null
  const raw = envelope ? envelope.record : (parsed as SequenceRecord)
  return {
    record: reconcileSgRnaOligoNamesInRecord(normalizeSequenceRecord({
      ...raw,
      features: Array.isArray(raw.features) ? raw.features : [],
      primers: Array.isArray(raw.primers) ? raw.primers : [],
      ...(!raw.dnaEndsProvenance && raw.dnaEnds && hasNonDefaultDnaEnds(raw.dnaEnds)
        ? { dnaEndsProvenance: 'legacy-defined' as const }
        : {}),
    })),
    ...(envelope?.userCommonFeatures?.length ? { userCommonFeatures: envelope.userCommonFeatures } : {}),
    ...(envelope?.displaySettings != null ? { displaySettings: envelope.displaySettings } : {}),
    ...(envelope?.customMwLadders?.length ? { customMwLadders: envelope.customMwLadders } : {}),
  }
}

export function exportProjectJson(
  record: SequenceRecord,
  options?: {
    userCommonFeatures?: CommonFeatureTemplate[]
    displaySettings?: unknown
    customMwLadders?: import('./mwLadders').MwLadder[]
  },
) {
  const envelope: ProjectEnvelope = {
    schemaVersion: 6,
    record,
    ...(options?.userCommonFeatures?.length ? { userCommonFeatures: options.userCommonFeatures } : {}),
    ...(options?.displaySettings != null ? { displaySettings: options.displaySettings } : {}),
    ...(options?.customMwLadders?.length ? { customMwLadders: options.customMwLadders } : {}),
  }
  return JSON.stringify(envelope, sequenceRecordJsonReplacer, 2)
}
