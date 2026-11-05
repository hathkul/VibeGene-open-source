import type { SequenceFeature } from './types'
import { parseFeatureQualifiers, serializeFeatureQualifiers } from './featureQualifiers'

export const PROTEIN_FEATURE_TYPES = [
  'region',
  'chain',
  'domain',
  'repeat',
  'motif',
  'binding site',
  'active site',
  'metal binding',
  'signal peptide',
  'transit peptide',
  'transmembrane',
  'coiled coil',
  'modified residue',
  'glycosylation',
  'lipidation',
  'cross-link',
  'site',
  'other',
] as const

export type ProteinFeatureType = (typeof PROTEIN_FEATURE_TYPES)[number]

export const PROTEIN_FEATURE_FIELDS = [
  'bound_moiety',
  'citation',
  'db_xref',
  'EC_number',
  'evidence',
  'experiment',
  'function',
  'gene',
  'gene_synonym',
  'inference',
  'label',
  'locus_tag',
  'note',
  'number',
  'old_locus_tag',
  'operon',
  'product',
  'protein_id',
  'region_name',
  'site_type',
  'standard_name',
] as const

/** Parse GenPept-style fields, treating legacy free-form protein notes as /note. */
export function proteinFeatureFieldValues(notes: string | undefined): Record<string, string> {
  const fields = parseFeatureQualifiers(notes)
  if (Object.keys(fields).length || !notes?.trim()) return fields
  return { note: notes.trim() }
}

export function serializeProteinFeatureFields(fields: Record<string, string>): string {
  return serializeFeatureQualifiers(fields)
}

export const PROTEIN_FEATURE_COLORS: Record<ProteinFeatureType, string> = {
  region: '#64748b',
  chain: '#0f766e',
  domain: '#2563eb',
  repeat: '#7c3aed',
  motif: '#9333ea',
  'binding site': '#0891b2',
  'active site': '#dc2626',
  'metal binding': '#ca8a04',
  'signal peptide': '#16a34a',
  'transit peptide': '#65a30d',
  transmembrane: '#ea580c',
  'coiled coil': '#4f46e5',
  'modified residue': '#db2777',
  glycosylation: '#c026d3',
  lipidation: '#be123c',
  'cross-link': '#92400e',
  site: '#475569',
  other: '#64748b',
}

function clampPosition(value: unknown, minimum: number, maximum: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return minimum
  return Math.max(minimum, Math.min(maximum, Math.trunc(parsed)))
}

export function normalizeProteinFeatures(
  features: readonly SequenceFeature[],
  sequenceLength: number,
): SequenceFeature[] {
  return features.flatMap((feature) => {
    if (!feature.id) return []
    const locations = feature.locations
      .map((location) => ({
        start: clampPosition(location.start, 0, sequenceLength),
        end: clampPosition(location.end, 0, sequenceLength),
        strand: 'forward' as const,
      }))
      .filter((location) => location.end > location.start)
      .sort((left, right) => left.start - right.start || left.end - right.end)
    if (!locations.length) return []
    return [{
      ...feature,
      name: feature.name,
      type: feature.type.trim() || 'region',
      color: feature.color || '#64748b',
      locations,
      translateInSequenceView: undefined,
      translation: undefined,
      cleavageArrows: undefined,
      mapTrack: undefined,
      proteinNumberingStart: Number.isFinite(feature.proteinNumberingStart)
        ? Math.trunc(feature.proteinNumberingStart!)
        : undefined,
    }]
  })
}

export function createProteinFeature(
  id: string,
  start: number,
  end: number,
  type: ProteinFeatureType = 'region',
): SequenceFeature {
  return {
    id,
    name: type === 'region' ? 'New region' : `New ${type}`,
    type,
    color: PROTEIN_FEATURE_COLORS[type],
    locations: [{ start, end, strand: 'forward' }],
  }
}

export function proteinFeaturesOverlappingRange(
  features: readonly SequenceFeature[],
  start: number,
  end: number,
): SequenceFeature[] {
  return features.filter(
    (feature) => feature.visible !== false && feature.locations.some((location) => location.start < end && start < location.end),
  )
}
