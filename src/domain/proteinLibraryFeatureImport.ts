import type { CommonFeatureMatch, CommonFeatureTemplate } from './commonFeatures'
import { alignProteinToProtein } from './proteinAlignment'
import {
  formatProteinImportNotes,
  buildMemberProteinProjectionContext,
  cdsPeptideBeforeStop,
  consensusPeptideForCds,
  consensusResidueRangeFromProteinAlignment,
  resolveMemberCdsFeature,
} from './libraryMemberProteinFeatures'
import { sequenceRecordFromLibraryMember } from './libraryMemberRecord'
import {
  buildProteinFeatureImportMatches as buildConsensusProteinFeatureImportMatches,
  findMatchingTranslatedCds,
  mapProteinFeaturesOntoCds,
  resolveProteinImportCds,
  segmentsForProteinResidues,
  translationCellsMatchingProtein,
  type ProteinToDnaSkip,
} from './proteinAnnotationToDna'
import { dnaSequenceDigest } from './proteinTranslationProvenance'
import { featureBounds, sanitizeProtein } from './sequence'
import { alignTraceToTemplate } from './traceAlignment'
import { mapTraceSpanToTemplateSpan } from './traceAnnotationView'
import type { TraceFileRecord } from './traceTypes'
import type { FeatureSegment, SequenceFeature, SequenceRecord } from './types'

function normalizePeptide(sequence: string): string {
  return sanitizeProtein(sequence).replace(/\*/g, '').toUpperCase()
}

function isLikelyCodingFeature(feature: SequenceFeature): boolean {
  const type = feature.type.trim().toUpperCase()
  return type === 'CDS' || Boolean(feature.translateInSequenceView)
}

function dnaFeatureTypeFromProtein(type: string): string {
  const key = type.trim().toLowerCase()
  if (key === 'signal peptide') return 'sig_peptide'
  if (key === 'transit peptide') return 'transit_peptide'
  if (key === 'repeat') return 'repeat_region'
  if (key === 'binding site') return 'misc_binding'
  if (key === 'protein bind') return 'protein_bind'
  return 'misc_feature'
}

function isFeatureAlreadyPresent(dnaRecord: SequenceRecord, feature: SequenceFeature): boolean {
  const bounds = featureBounds(feature)
  return dnaRecord.features.some((existing) => {
    if (existing.name.trim().toLowerCase() !== feature.name.trim().toLowerCase()) return false
    if (existing.type.trim().toLowerCase() !== feature.type.trim().toLowerCase()) return false
    const existingBounds = featureBounds(existing)
    return existingBounds.start === bounds.start && existingBounds.end === bounds.end
  })
}

type MemberCdsMatch = {
  member: TraceFileRecord
  consensusCds: SequenceFeature
  memberCds: SequenceFeature
}

function ensureMemberAlignment(
  member: TraceFileRecord,
  consensusSequence: string,
): TraceFileRecord {
  if (member.alignment || member.parseError || !member.sequence.length) return member
  const alignment = alignTraceToTemplate(member.sequence, consensusSequence)
  return alignment ? { ...member, alignment } : member
}

/**
 * Prefer member-local CDS copies; fall back to guided projection of consensus CDS.
 */
function resolveMemberCodingFeatures(
  member: TraceFileRecord,
  consensusFeatures: readonly SequenceFeature[],
  consensusSequence: string,
  topology: SequenceRecord['topology'],
): SequenceFeature[] {
  const byId = new Map((member.features ?? []).map((feature) => [feature.id, feature]))
  const features = [...(member.features ?? [])]
  for (const feature of consensusFeatures) {
    if (!isLikelyCodingFeature(feature) || byId.has(feature.id)) continue
    const peptide = consensusPeptideForCds(feature, consensusSequence, topology)
    if (!peptide) continue
    const resolved = resolveMemberCdsFeature(feature, member)
    if (resolved) {
      features.push(resolved)
      continue
    }
    const context = buildMemberProteinProjectionContext(member, {
      cds: feature,
      consensusPeptide: peptide,
    })
    if (context?.memberCds) features.push(context.memberCds)
  }
  return features
}

function findMemberCdsMatches(
  protein: SequenceRecord,
  dnaRecord: SequenceRecord,
  members: readonly TraceFileRecord[],
): MemberCdsMatch[] {
  const proteinSeq = normalizePeptide(protein.sequence)
  if (!proteinSeq) return []
  const consensusCoding = dnaRecord.features.filter(isLikelyCodingFeature)
  const matches: MemberCdsMatch[] = []

  for (const member of members) {
    if (!member.sequence.length || member.parseError) continue
    const codingFeatures = resolveMemberCodingFeatures(
      member,
      consensusCoding,
      dnaRecord.sequence,
      dnaRecord.topology,
    )
    if (!codingFeatures.length) continue
    const memberRecord: SequenceRecord = {
      ...sequenceRecordFromLibraryMember(member),
      features: codingFeatures,
    }
    for (const entry of findMatchingTranslatedCds(memberRecord, proteinSeq)) {
      const consensusCds = consensusCoding.find((feature) => feature.id === entry.cds.id)
        ?? consensusCoding.find((feature) => (
          feature.name.trim().toLowerCase() === entry.cds.name.trim().toLowerCase()
        ))
      if (!consensusCds) continue
      matches.push({
        member,
        consensusCds,
        memberCds: entry.cds,
      })
    }
  }
  return matches
}

function preferMemberMatchByProvenance(
  protein: SequenceRecord,
  dnaRecord: SequenceRecord,
  matches: readonly MemberCdsMatch[],
): MemberCdsMatch | null {
  if (!matches.length) return null
  if (matches.length === 1) return matches[0]!

  const derivation = protein.protein?.translationDerivation
  if (derivation?.kind === 'translated-cds') {
    for (const source of derivation.sources) {
      if (source.projectId && source.projectId !== dnaRecord.id) continue
      const featureId = source.cds?.featureId
      const byDigest = matches.filter((entry) => (
        dnaSequenceDigest(entry.member.sequence) === source.sequenceDigest
      ))
      const pool = byDigest.length ? byDigest : matches
      if (featureId) {
        const preferred = pool.find((entry) => entry.consensusCds.id === featureId)
        if (preferred) return preferred
      } else if (byDigest.length === 1) {
        return byDigest[0]!
      }
    }
  }

  const cdsTyped = matches.filter((entry) => entry.consensusCds.type.trim().toUpperCase() === 'CDS')
  const pool = cdsTyped.length ? cdsTyped : matches
  return pool.toSorted(
    (a, b) => (
      featureBounds(a.consensusCds).start - featureBounds(b.consensusCds).start
      || a.consensusCds.name.localeCompare(b.consensusCds.name)
      || a.member.fileName.localeCompare(b.member.fileName)
    ),
  )[0] ?? null
}

function templateFromProteinFeature(
  protein: SequenceRecord,
  feature: SequenceFeature,
): CommonFeatureTemplate {
  const bounds = featureBounds(feature)
  const aa = normalizePeptide(protein.sequence.slice(bounds.start, bounds.end)) || 'X'
  return {
    id: feature.id,
    fileName: protein.name,
    name: feature.name,
    type: dnaFeatureTypeFromProtein(feature.type),
    color: feature.color || '#64748b',
    sequence: aa,
    notes: feature.notes,
    qualifiers: [],
    locations: [{ start: 0, end: aa.length, strand: 'forward' }],
  }
}

/**
 * Map protein annotations onto the matched member CDS exactly, lift DNA spans onto
 * consensus via the MSA, and tag notes with library-source so projection uses the
 * member peptide (not a stop-truncated consensus) as the homology reference.
 */
function buildFromMemberTranslation(
  protein: SequenceRecord,
  dnaRecord: SequenceRecord,
  members: readonly TraceFileRecord[],
): { matches: CommonFeatureMatch[]; cds: SequenceFeature; skipped: ProteinToDnaSkip[] } {
  const memberMatches = findMemberCdsMatches(protein, dnaRecord, members)
  const chosen = preferMemberMatchByProvenance(protein, dnaRecord, memberMatches)
  if (!chosen) {
    throw new Error(
      `No CDS on ${dnaRecord.name} (or its library members) translates to the protein sequence of ${protein.name}. `
      + 'Open a member CDS as protein from this library, or add a matching translated CDS on consensus.',
    )
  }

  const member = ensureMemberAlignment(chosen.member, dnaRecord.sequence)
  if (!member.alignment) {
    throw new Error(
      `Could not align library member ${member.fileName} to consensus to place imported annotations.`,
    )
  }

  const memberCells = translationCellsMatchingProtein(
    chosen.memberCds,
    member.sequence,
    'linear',
    protein.sequence,
  )
  if (!memberCells?.length) {
    throw new Error(
      `Member CDS “${chosen.memberCds.name}” on ${member.fileName} does not match the protein sequence.`,
    )
  }

  const cdsStrand = chosen.memberCds.locations[0]?.strand ?? 'forward'
  const { mapped, skipped } = mapProteinFeaturesOntoCds(
    protein.features,
    memberCells,
    cdsStrand,
    { cdsName: chosen.consensusCds.name, proteinName: protein.name },
  )

  const beforeStopPeptide = cdsPeptideBeforeStop(
    chosen.consensusCds,
    dnaRecord.sequence,
    dnaRecord.topology,
  ) || consensusPeptideForCds(chosen.consensusCds, dnaRecord.sequence, dnaRecord.topology)
  const consensusCells = beforeStopPeptide
    ? translationCellsMatchingProtein(
      chosen.consensusCds,
      dnaRecord.sequence,
      dnaRecord.topology,
      beforeStopPeptide,
    )
    : null
  const proteinToConsensus = beforeStopPeptide
    ? alignProteinToProtein(beforeStopPeptide, {
      id: member.id,
      name: member.fileName,
      fileName: member.fileName,
      kind: 'protein',
      sequence: protein.sequence,
      enabled: true,
      disabledFrameShiftKeys: [],
    })
    : null

  const matches: CommonFeatureMatch[] = []
  const liftSkipped: ProteinToDnaSkip[] = [...skipped]

  for (const entry of mapped) {
    const proteinFeature = protein.features.find((feature) => feature.id === entry.proteinFeatureId)
    const residueStart = proteinFeature
      ? Math.min(...proteinFeature.locations.map((location) => location.start))
      : entry.residueStart
    const residueEnd = proteinFeature
      ? Math.max(...proteinFeature.locations.map((location) => location.end))
      : entry.residueEnd

    let consensusLocations: FeatureSegment[] = entry.dnaFeature.locations.flatMap((location) => {
      const lifted = mapTraceSpanToTemplateSpan(member.alignment!, location.start, location.end)
      if (!lifted || lifted.end <= lifted.start) return []
      return [{ ...location, start: lifted.start, end: lifted.end }]
    })

    // Insertions / post-stop member spans may not lift via DNA MSA — fall back to AA remap
    // onto the consensus ORF before the first stop (display-only; projection uses library-source).
    if (!consensusLocations.length && consensusCells && proteinToConsensus) {
      const consRange = consensusResidueRangeFromProteinAlignment(
        proteinToConsensus,
        residueStart,
        residueEnd,
      )
      if (consRange) {
        consensusLocations = segmentsForProteinResidues(
          consensusCells,
          consRange.start,
          consRange.end,
          cdsStrand,
        )
      }
    }

    if (!consensusLocations.length) {
      // Still need a consensus feature record so library projection can run; pin to the
      // last sense codon before the first stop (display on consensus may be approximate).
      const codonCount = beforeStopPeptide.length
      if (codonCount > 0) {
        const cdsStart = chosen.consensusCds.locations[0]?.start ?? 0
        const pinStart = cdsStart + Math.max(0, codonCount - 1) * 3
        consensusLocations = [{ start: pinStart, end: pinStart + 3, strand: cdsStrand }]
      }
    }

    if (!consensusLocations.length) {
      liftSkipped.push({
        featureId: entry.proteinFeatureId,
        featureName: entry.dnaFeature.name,
        reason: `Could not place “${entry.dnaFeature.name}” from ${member.fileName} onto consensus DNA.`,
      })
      continue
    }

    const dnaFeature: SequenceFeature = {
      ...entry.dnaFeature,
      locations: consensusLocations,
      notes: formatProteinImportNotes({
        proteinName: protein.name,
        residueStart,
        residueEnd,
        cdsName: chosen.consensusCds.name,
        librarySourceMemberId: member.id,
        existing: proteinFeature?.notes,
      }),
    }

    const bounds = featureBounds(dnaFeature)
    matches.push({
      id: `protein-import:${entry.proteinFeatureId}:${bounds.start}`,
      templateId: entry.proteinFeatureId,
      template: proteinFeature
        ? templateFromProteinFeature(protein, proteinFeature)
        : {
            id: entry.proteinFeatureId,
            fileName: protein.name,
            name: dnaFeature.name,
            type: dnaFeature.type,
            color: dnaFeature.color,
            sequence: 'X',
            notes: dnaFeature.notes,
            qualifiers: [],
            locations: [{ start: 0, end: 1, strand: 'forward' }],
          },
      start: bounds.start,
      end: bounds.end,
      strand: cdsStrand,
      matchPercent: 100,
      matchedSegments: dnaFeature.locations.map((location) => ({
        start: location.start,
        end: location.end,
      })),
      alreadyPresent: isFeatureAlreadyPresent(dnaRecord, dnaFeature),
      feature: dnaFeature,
    })
  }

  matches.sort((a, b) => a.start - b.start || a.end - b.end || a.template.name.localeCompare(b.template.name))
  return { matches, cds: chosen.consensusCds, skipped: liftSkipped }
}

/**
 * Map protein annotations onto a DNA CDS. Exact consensus peptide match is preferred;
 * for DNA libraries, a matching member CDS translation is also accepted. Member-sourced
 * imports keep aa ranges relative to that member and tag library-source for projection.
 */
export function buildProteinFeatureImportMatches(
  protein: SequenceRecord,
  dnaRecord: SequenceRecord,
  options?: { libraryMembers?: readonly TraceFileRecord[] },
): { matches: CommonFeatureMatch[]; cds: SequenceFeature; skipped: ProteinToDnaSkip[] } {
  if (protein.molecule !== 'protein') {
    throw new Error('Choose a protein file to map amino-acid annotations onto DNA.')
  }
  if (dnaRecord.molecule !== 'dna') {
    throw new Error('Protein annotations can only be imported into a DNA construct.')
  }

  const members = options?.libraryMembers ?? []
  if (resolveProteinImportCds(protein, dnaRecord)) {
    return buildConsensusProteinFeatureImportMatches(protein, dnaRecord)
  }
  if (members.length) {
    return buildFromMemberTranslation(protein, dnaRecord, members)
  }

  return buildConsensusProteinFeatureImportMatches(protein, dnaRecord)
}
