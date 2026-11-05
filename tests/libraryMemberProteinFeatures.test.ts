import { describe, expect, it } from 'vitest'
import { alignDnaToProtein } from '../src/domain/proteinAlignment'
import {
  consensusResidueRangeFromProteinAlignment,
  memberResidueRangeFromProteinAlignment,
  parseImportedProteinResidueRange,
  projectProteinImportedFeatureOntoMember,
} from '../src/domain/libraryMemberProteinFeatures'
import { defaultFeatureTranslationOptions } from '../src/domain/geneticCode'
import { featureBounds } from '../src/domain/sequence'
import { alignTraceToTemplate } from '../src/domain/traceAlignment'
import { traceRecordFromSequence } from '../src/domain/sequenceTraceFactory'
import type { SequenceFeature } from '../src/domain/types'

describe('libraryMemberProteinFeatures', () => {
  it('parses imported protein residue ranges from notes', () => {
    expect(parseImportedProteinResidueRange(
      '/note="Imported from protein VHH (aa 100–111) onto CDS VHH"',
    )).toEqual({ start: 99, end: 111 })
    expect(parseImportedProteinResidueRange('aa 5-29')).toEqual({ start: 4, end: 29 })
    expect(parseImportedProteinResidueRange('no range')).toBeNull()
  })

  it('includes member insertions inside a consensus AA range', () => {
    // Consensus peptide MKGFT; member coding has an extra codon in the middle of G F
    const reference = 'MKGFT'
    const memberDna = 'ATGAAAGGGGCGTTTACA' // M K G A F T — insertion of A between G and F
    const alignment = alignDnaToProtein(reference, {
      id: 'm1',
      name: 'm1',
      kind: 'dna',
      sequence: memberDna,
      enabled: true,
    })
    expect(alignment).not.toBeNull()
    // Consensus residues G F = indices 2..4 (G,F) — wait MKGFT: M0 K1 G2 F3 T4
    // Feature covering G–F = [2, 4)
    const range = memberResidueRangeFromProteinAlignment(alignment!, 2, 4)
    expect(range).not.toBeNull()
    // Member should span G, inserted A, F → 3 residues
    expect(range!.end - range!.start).toBe(3)
  })

  it('maps member AA ranges back onto consensus through the same alignment', () => {
    const reference = 'MKGFT'
    const memberDna = 'ATGAAAGGGGCGTTTACA' // M K G A F T
    const alignment = alignDnaToProtein(reference, {
      id: 'm1',
      name: 'm1',
      kind: 'dna',
      sequence: memberDna,
      enabled: true,
    })
    expect(alignment).not.toBeNull()
    // Member residues spanning G, inserted A, F should collapse to consensus G–F
    const memberSpan = memberResidueRangeFromProteinAlignment(alignment!, 2, 4)
    expect(memberSpan).not.toBeNull()
    const back = consensusResidueRangeFromProteinAlignment(
      alignment!,
      memberSpan!.start,
      memberSpan!.end,
    )
    expect(back).toEqual({ start: 2, end: 4 })
  })

  it('projects an imported CDR onto a longer member homolog as one DNA span', () => {
    // Consensus CDS: ATG AAA GGG TTT CCC = M K G F P (no stop for peptide)
    const consensus = 'ATGAAAGGGTTTCCC'
    // Member inserts GCG (A) in CDR-like region after GGG
    const memberSeq = 'ATGAAAGGGGCGTTTCCC'
    const alignment = alignTraceToTemplate(memberSeq, consensus)
    expect(alignment).not.toBeNull()
    const member = {
      ...traceRecordFromSequence(memberSeq, 'clone.seq'),
      alignment,
    }
    const cds: SequenceFeature = {
      id: 'cds',
      name: 'VHH',
      type: 'CDS',
      color: '#f59e0b',
      locations: [{ start: 0, end: consensus.length, strand: 'forward' }],
      translateInSequenceView: true,
      translation: defaultFeatureTranslationOptions(1),
    }
    const cdr: SequenceFeature = {
      id: 'cdr',
      name: 'CDR3',
      type: 'misc_feature',
      color: '#2563eb',
      locations: [{ start: 6, end: 12, strand: 'forward' }], // GGG TTT
      notes: '/note="Imported from protein VHH (aa 3–4) onto CDS VHH"',
    }
    const projected = projectProteinImportedFeatureOntoMember(cdr, member, {
      cds,
      consensusPeptide: 'MKGFP',
      consensusSequence: consensus,
      topology: 'linear',
    })
    expect(projected).not.toBeNull()
    expect(projected!.locations).toHaveLength(1)
    const bounds = featureBounds(projected!)
    expect((bounds.end - bounds.start) % 3).toBe(0)
    // Should cover GGG GCG TTT on member (9 bp), not a gapped pair of codons
    expect(bounds.end - bounds.start).toBe(9)
    expect(memberSeq.slice(bounds.start, bounds.end)).toBe('GGGGCGTTT')
  })
})
