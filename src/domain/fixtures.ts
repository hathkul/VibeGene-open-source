import type { SequenceRecord } from './types'
import { createId, nowIso } from './sequence'
import { exportGenBank } from './parsers'
import { defaultConstructProperties, normalizeSequenceRecord } from './constructProperties'

const backbone =
  'GAATTCGCTAGCATGACCATGATTACGCCAAGCTTGCGGCCGCTCGAGGGTCTCACTAGT' +
  'TTGACAATTAATCATCGGCTCGTATAATGTGTGGAATTGTGAGCGGATAACAATTTCACACAGGAAACAGCTATGAC' +
  'ATGAGTAAAGGAGAAGAACTTTTCACTGGAGTTGTCCCAATTCTTGTTGAATTAGATGGTGATGTTAATGGGCACAAATTTTCTGTCAGTGGAGAGGGTGAAGGTGATGCAACATACGGAAAATCTACCCTTAAATTTATTTGCACTACTGGAAAACCTGTTCCATGGCCAACACTTGTCACTACTTTCTCTTATGGTGTTCAATGCTTTTCAAGATACCCAGATCATATGAAACAGCATGACTTTTTCAAGAGTGCCATGCCCGAAGGTTATGTACAGGAACGCACTATATCTTTCAAAGATGACGGGACCTACAAGACGCGTGCTGAAGTCAAGTTTGAAGGTGATACCCTTGTTAATCGTATCGAGTTAAAAGGTATTGATTTTAAAGAAGATGGAAACATTCTCGGACACAAACTCGAGTACAACTATAACTCACACAATGTATACATCATGGCAGACAAACAAAAGAATGGAATCAAAGCTAACTTCAAAATTAGACACAACATTGAAGATGGATCCGTTCAACTAGCAGACCATTATCAACAAAATACTCCAATTGGCGATGGCCCTGTCCTTTTACCAGACAACCATTACCTGTCGACACAATCTGCCCTTTCGAAAGATCCCAACGAAAAGAGAGACCACATGGTCCTTCTTGAGTTTGTAACAGCTGCTGGGATTACACATGGCATGGATGAACTATACAAATAA' +
  'AAGCTTGGTACCGGATCCCTGCAGCATATGGCGGCCGCTCTAGAGTCGAC' +
  // Backbone filler so the pMB1 ori (880-1010) and AmpR fragment (1010-1134)
  // features fall inside the sequence (total length 1134 bp).
  'AAGCCCAATAAACCACTCTGACTGGCCGAATAGGGATATAGGCAACGACATGTGCGGCGACCCTTGCGACAGTGACGCTTTCGCCGTTGCCTAAACCTATTTGAAGGAGTCTAGCAGCCGCAGTAAGGCACAATACCTCGTCCGTGTTACCAGACCAAACAAGACGTCCTCTTCAATGTTTAAATGACCCTCTCGTCATAAAACCTTTCTACTATGTGTTCCGCAAGAATCAA'

export const labPlasmid: SequenceRecord = {
  id: 'fixture_research_plasmid',
  name: 'VibeGene-pDemo',
  description: 'Representative research-lab plasmid with promoter, reporter, MCS, origin, resistance marker, primers, and common restriction sites.',
  molecule: 'dna',
  topology: 'circular',
  sequence: backbone,
  features: [
    {
      id: 'feature_lac_promoter',
      name: 'lac promoter',
      type: 'promoter',
      color: '#2563eb',
      locations: [{ start: 66, end: 145, strand: 'forward' }],
    },
    {
      id: 'feature_mcs',
      name: 'multiple cloning site',
      type: 'misc_feature',
      color: '#64748b',
      locations: [{ start: 0, end: 64, strand: 'forward' }],
    },
    {
      id: 'feature_reporter',
      name: 'sfGFP-like reporter',
      type: 'CDS',
      color: '#16a34a',
      locations: [{ start: 145, end: 860, strand: 'forward' }],
      notes: 'Synthetic reporter-style CDS fixture for ORF, translation, and annotation testing.',
    },
    {
      id: 'feature_origin',
      name: 'pMB1 ori',
      type: 'rep_origin',
      color: '#7c3aed',
      locations: [{ start: 880, end: 1010, strand: 'forward' }],
    },
    {
      id: 'feature_amp',
      name: 'AmpR fragment',
      type: 'CDS',
      color: '#f59e0b',
      locations: [{ start: 1010, end: 1134, strand: 'reverse' }],
    },
  ],
  primers: [
    { id: 'primer_m13_f', name: 'M13 Forward', sequence: 'GTAAAACGACGGCCAGT', color: '#db2777' },
    { id: 'primer_m13_r', name: 'M13 Reverse', sequence: 'CAGGAAACAGCTATGAC', color: '#0891b2' },
  ],
  operations: [
    {
      id: 'op_fixture',
      type: 'fixture',
      summary: 'Seeded representative research-lab workflow fixture.',
      createdAt: nowIso(),
    },
  ],
  construct: { ...defaultConstructProperties, syntheticDna: true },
  createdAt: nowIso(),
  updatedAt: nowIso(),
}

export const representativeFiles = [
  {
    name: 'Demo plasmid GenBank',
    fileName: 'vibegene-pdemo.gbk',
    description: 'Rich GenBank fixture with circular topology and multiple feature classes.',
    contents: exportGenBank(labPlasmid),
  },
  {
    name: 'Reporter insert FASTA',
    fileName: 'reporter-insert.fasta',
    description: 'FASTA insert fixture for primer design, PCR, and cloning simulations.',
    contents: `>reporter_insert synthetic cloning insert\n${backbone.slice(145, 520)}\n`,
  },
]

export function cloneFixture(): SequenceRecord {
  const timestamp = nowIso()
  return normalizeSequenceRecord({
    ...labPlasmid,
    id: createId('seq'),
    features: labPlasmid.features.map((feature) => ({ ...feature, id: createId('feature') })),
    primers: labPlasmid.primers.map((primer) => ({ ...primer, id: createId('primer') })),
    operations: labPlasmid.operations.map((operation) => ({ ...operation, id: createId('op') })),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
}
