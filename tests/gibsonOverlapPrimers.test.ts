import { describe, expect, it } from 'vitest'
import { defaultConstructProperties } from '../src/domain/constructProperties'
import { defaultDnaEnds } from '../src/domain/dnaEnds'
import {
  analyzeGibsonAssembly,
  defaultGibsonPartConfig,
  resolveGibsonPart,
} from '../src/domain/gibsonAssembly'
import {
  canOfferGibsonOverlapPrimerDesign,
  defaultGibsonOverlapPrimerOptions,
  designGibsonOverlapPrimers,
  designGibsonOverlapPrimersForAssembly,
  listGibsonOverlapPrimerTargets,
  homologyFromVectorEnd,
  mergeGibsonDesignedPrimersOntoRecord,
  resolveGibsonHomologyLength,
} from '../src/domain/gibsonOverlapPrimers'
import { reverseComplement } from '../src/domain/sequence'
import type { RestrictionEnzyme, RestrictionSite, SequenceRecord } from '../src/domain/types'

function makeRecord(name: string, sequence: string, overrides?: Partial<SequenceRecord>): SequenceRecord {
  return {
    id: `seq-${name}`,
    name,
    description: '',
    molecule: 'dna',
    topology: 'linear',
    sequence,
    features: [],
    primers: [],
    operations: [],
    construct: defaultConstructProperties,
    dnaEnds: defaultDnaEnds(),
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function fakeSite(name: string, recognition: string, match: string): RestrictionSite {
  const enzyme: RestrictionEnzyme = {
    name,
    aliases: [],
    recognition,
    cutTop: 0,
    cutBottom: 0,
    type: 'II',
    overhang: { type: "3'", sequence: null, length: 3 },
    methylation: { dam: false, dcm: false, ecoKI: false },
    suppliers: [],
  }
  return {
    enzyme,
    start: 0,
    end: match.length,
    strand: 'forward',
    match,
    cutTop: 3,
    cutBottom: 6,
  }
}

/** Linear vector of known termini used as a restriction-linearized fragment. */
const VECTOR_SEQ =
  'GAATTCTGACTGACTGACTGACTGACTGACTGACTGACTGACTGACTGACTGACTGACTGACTGACTGACTGACTGACTGACTGACTGACTGACTGACTGACTGACTGACTGCCTAGG'
/** ≥120 bp insert core so HiFi min fragment / amplify floors are met. */
const INSERT_CORE =
  'ATGCGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTTA'

describe('gibsonOverlapPrimers', () => {
  it('defaults fixed overlap lengths into each method’s Optimal band', () => {
    const classic = defaultGibsonOverlapPrimerOptions('classic-gibson')
    expect(classic.overlapMode).toBe('fixed')
    expect(classic.fixedOverlapBp).toBe(40)
    expect(classic.overlapMinBp).toBe(20)
    expect(classic.overlapMaxBp).toBe(40)
    expect(classic.overlapTargetTmC).toBe(50)

    const hifi = defaultGibsonOverlapPrimerOptions('nebuilder-hifi')
    expect(hifi.overlapMode).toBe('fixed')
    expect(hifi.fixedOverlapBp).toBe(20)
    expect(hifi.overlapMinBp).toBe(15)
    expect(hifi.overlapMaxBp).toBe(20)

    const infusion = defaultGibsonOverlapPrimerOptions('infusion')
    expect(infusion.overlapMode).toBe('fixed')
    expect(infusion.fixedOverlapBp).toBe(15)

    const classicMulti = defaultGibsonOverlapPrimerOptions('classic-gibson', 5)
    expect(classicMulti.fixedOverlapBp).toBe(40)
    expect(classicMulti.overlapMinBp).toBe(25)
  })

  it('designs Classic Gibson defaults into Optimal junctions', () => {
    // Distinct termini (not ACGT-like insert) so Classic’s 40 bp preferred length is realistic.
    const vectorSeq =
      'GGTACCGAGCTCGGATCCACTAGTAACGGCCGCCAGTGTGCTGGAATTC' +
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT' +
      'TCTAGAGGATCCCCGGGTACCGAGCTCGAATTCACTGGCCGTCGTTTTAC'
    const insertRecord = makeRecord('I', `GGGG${INSERT_CORE}CCCC`)
    const vector = resolveGibsonPart(
      {
        ...defaultGibsonPartConfig('vector', makeRecord('V', vectorSeq)),
        linearizationMode: 'direct',
      },
      0,
      0,
      0,
    )
    const options = defaultGibsonOverlapPrimerOptions('classic-gibson', 2, {
      maxFragmentBp: Math.max(vector.sequence.length, INSERT_CORE.length),
      productBp: vector.sequence.length + INSERT_CORE.length,
    })
    expect(options.fixedOverlapBp).toBe(40)

    const designed = designGibsonOverlapPrimers({
      vector,
      insertRecord,
      insertAmplifyRange: { start: 4, end: 4 + INSERT_CORE.length },
      options,
    })
    expect(designed?.overlapBp).toBe(40)

    const insertWithPrimers = mergeGibsonDesignedPrimersOntoRecord(
      insertRecord,
      designed!.insertPrimers,
    )
    const insertResolved = resolveGibsonPart(
      {
        ...defaultGibsonPartConfig('fragment', insertWithPrimers),
        linearizationMode: 'pcr',
        amplifyRange: { start: 4, end: 4 + INSERT_CORE.length },
        forwardPrimer: designed!.insertForward,
        reversePrimer: designed!.insertReverse,
      },
      0,
      0,
      1,
    )
    expect(insertResolved.ready).toBe(true)
    const analysis = analyzeGibsonAssembly([vector, insertResolved], {
      mode: 'cloning',
      method: 'classic-gibson',
    })
    expect(analysis.ready).toBe(true)
    expect(analysis.designGrade?.level).toBe('optimal')
    for (const junction of analysis.junctions ?? []) {
      expect(junction.grade.level).toBe('optimal')
      expect(junction.overlapLength).toBe(40)
    }
  })

  it('resolves fixed homology length from UI / method floors', () => {
    const template = 'A'.repeat(60) + 'C'.repeat(20)
    const length = resolveGibsonHomologyLength(
      template,
      {
        method: 'nebuilder-hifi',
        overlapMode: 'fixed',
        fixedOverlapBp: 18,
        overlapMinBp: 15,
        overlapMaxBp: 25,
        overlapTargetTmC: 50,
      },
      2,
      2000,
      4000,
    )
    expect(length).toBe(18)
  })

  it('never injects IUPAC N from enzyme catalog recognition (e.g. DraIII)', () => {
    const vector = 'CACATCGTG' + 'A'.repeat(40) + 'TCTAGA'
    const draIII = fakeSite('DraIII', 'CACNNNGTG', 'CACATCGTG')
    const tail = homologyFromVectorEnd(vector, 'upstream', 15, true, draIII)
    expect(tail).toMatch(/^[ACGT]+$/)
    expect(tail.includes('N')).toBe(false)
    expect(tail.startsWith('CACATCGTG')).toBe(true)
  })

  it('offers design for cloning and linear when amplify range is valid', () => {
    const vectorRecord = makeRecord('V', VECTOR_SEQ)
    const insertRecord = makeRecord('I', `NNNN${INSERT_CORE}NNNN`)
    const vector = resolveGibsonPart(
      {
        ...defaultGibsonPartConfig('vector', vectorRecord),
        linearizationMode: 'direct',
      },
      0,
      0,
      0,
    )
    expect(
      canOfferGibsonOverlapPrimerDesign({
        mode: 'cloning',
        vector,
        insertAmplifyRange: { start: 4, end: 4 + INSERT_CORE.length },
        insertRecord,
        assemblyReady: false,
      }),
    ).toBe(true)
    expect(
      canOfferGibsonOverlapPrimerDesign({
        mode: 'linear',
        vector,
        insertAmplifyRange: { start: 4, end: 4 + INSERT_CORE.length },
        insertRecord,
        assemblyReady: false,
      }),
    ).toBe(true)
    expect(
      canOfferGibsonOverlapPrimerDesign({
        mode: 'cloning',
        vector,
        insertAmplifyRange: null,
        insertRecord,
        assemblyReady: false,
      }),
    ).toBe(false)
  })

  it('designs named insert primers that assemble with a restriction-style vector', () => {
    const vectorRecord = makeRecord('V', VECTOR_SEQ)
    const insertRecord = makeRecord('I', `GGGG${INSERT_CORE}CCCC`)
    const vector = resolveGibsonPart(
      {
        ...defaultGibsonPartConfig('vector', vectorRecord),
        linearizationMode: 'direct',
      },
      0,
      0,
      0,
    )
    const options = {
      ...defaultGibsonOverlapPrimerOptions('nebuilder-hifi'),
      overlapMode: 'fixed' as const,
      fixedOverlapBp: 20,
      amplifyVectorWithoutExtensions: true,
      regenerateEnzymeSites: true,
    }
    const draIII = fakeSite('DraIII', 'CACNNNGTG', VECTOR_SEQ.slice(0, 9))
    const designed = designGibsonOverlapPrimers({
      vector,
      insertRecord,
      insertAmplifyRange: { start: 4, end: 4 + INSERT_CORE.length },
      vectorLeftSite: draIII,
      vectorRightSite: fakeSite('XbaI', 'TCTAGA', VECTOR_SEQ.slice(-6)),
      options,
    })
    expect(designed).not.toBeNull()
    expect(designed!.vectorForward).toBeNull()
    expect(designed!.insertForward.name).toBe('I_HiFi_F')
    expect(designed!.insertReverse.name).toBe('I_HiFi_R')
    expect(designed!.insertForward.sequence.includes('N')).toBe(false)
    expect(designed!.insertReverse.sequence.includes('N')).toBe(false)
    expect(designed!.insertForward.sourcePrimerId).toBeTruthy()
    expect(designed!.insertPrimers).toHaveLength(2)
    expect(designed!.insertForward.sequence.startsWith(VECTOR_SEQ.slice(-20))).toBe(true)
    expect(
      designed!.insertReverse.sequence.startsWith(reverseComplement(VECTOR_SEQ.slice(0, 20))),
    ).toBe(true)

    const insertWithPrimers = mergeGibsonDesignedPrimersOntoRecord(
      insertRecord,
      designed!.insertPrimers,
    )
    expect(insertWithPrimers.primers.map((primer) => primer.name)).toEqual([
      'I_HiFi_F',
      'I_HiFi_R',
    ])

    const insertResolved = resolveGibsonPart(
      {
        ...defaultGibsonPartConfig('fragment', insertWithPrimers),
        linearizationMode: 'pcr',
        amplifyRange: { start: 4, end: 4 + INSERT_CORE.length },
        forwardPrimer: designed!.insertForward,
        reversePrimer: designed!.insertReverse,
      },
      0,
      0,
      1,
    )
    expect(insertResolved.ready).toBe(true)
    const analysis = analyzeGibsonAssembly([vector, insertResolved], {
      mode: 'cloning',
      method: 'nebuilder-hifi',
    })
    expect(analysis.ready).toBe(true)
    expect(analysis.closed).toBe(true)
  })

  it('also designs anneal-only vector primers when extensions are requested', () => {
    const vectorRecord = makeRecord('V', VECTOR_SEQ)
    const insertRecord = makeRecord('I', `GGGG${INSERT_CORE}CCCC`)
    const vector = resolveGibsonPart(
      {
        ...defaultGibsonPartConfig('vector', vectorRecord),
        linearizationMode: 'direct',
      },
      0,
      0,
      0,
    )
    const designed = designGibsonOverlapPrimers({
      vector,
      insertRecord,
      insertAmplifyRange: { start: 4, end: 4 + INSERT_CORE.length },
      options: {
        ...defaultGibsonOverlapPrimerOptions('infusion'),
        overlapMode: 'fixed',
        fixedOverlapBp: 15,
        amplifyVectorWithoutExtensions: false,
        regenerateEnzymeSites: false,
      },
    })
    expect(designed?.vectorForward?.sequence.length).toBeGreaterThan(15)
    expect(designed?.vectorReverse?.sequence.length).toBeGreaterThan(15)
  })

  it('designs overlapping primers for every unfinished multi-fragment insert', () => {
    const vectorSeq =
      'GGTACCGAGCTCGGATCCACTAGTAACGGCCGCCAGTGTGCTGGAATTC' +
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT' +
      'TCTAGAGGATCCCCGGGTACCGAGCTCGAATTCACTGGCCGTCGTTTTAC'
    const insertACore =
      'ATGCGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTTA'
    const insertBCore =
      'GGCCTAAGGCCTAAGGCCTAAGGCCTAAGGCCTAAGGCCTAAGGCCTAAGGCCTAAGGCCTAAGGCCTAAGGCCTAAGGCCTAAGGCCTAAGGCCTAAGGCCTAAGGCCTAAGGCCTAAA'
    const vector = resolveGibsonPart(
      {
        ...defaultGibsonPartConfig('vector', makeRecord('V', vectorSeq)),
        linearizationMode: 'direct',
      },
      0,
      0,
      0,
    )
    const fragA = {
      ...defaultGibsonPartConfig('fragment', makeRecord('A', `AAAA${insertACore}TTTT`)),
      linearizationMode: 'pcr' as const,
      amplifyRange: { start: 4, end: 4 + insertACore.length },
    }
    const fragB = {
      ...defaultGibsonPartConfig('fragment', makeRecord('B', `CCCC${insertBCore}GGGG`)),
      linearizationMode: 'pcr' as const,
      amplifyRange: { start: 4, end: 4 + insertBCore.length },
    }
    const resolvedA = resolveGibsonPart(fragA, 0, 0, 1)
    const resolvedB = resolveGibsonPart(fragB, 1, 1, 2)
    expect(resolvedA.ready).toBe(false)
    expect(resolvedB.ready).toBe(false)

    const targets = listGibsonOverlapPrimerTargets({
      mode: 'cloning',
      vector,
      fragments: [fragA, fragB],
      fragmentOrder: [0, 1],
      resolvedFragments: [resolvedA, resolvedB],
      assemblyReady: false,
    })
    expect(targets.map((target) => target.fragmentIndex)).toEqual([0, 1])

    const designed = designGibsonOverlapPrimersForAssembly({
      vector,
      fragments: [fragA, fragB],
      fragmentOrder: [0, 1],
      resolvedFragments: [resolvedA, resolvedB],
      options: {
        ...defaultGibsonOverlapPrimerOptions('nebuilder-hifi', 3),
        overlapMode: 'fixed',
        fixedOverlapBp: 20,
        regenerateEnzymeSites: false,
      },
    })
    expect(designed?.inserts).toHaveLength(2)
    expect(designed!.inserts[0]!.fragmentIndex).toBe(0)
    expect(designed!.inserts[1]!.fragmentIndex).toBe(1)
    // F1 is vector-adjacent on the left → full forward overhang; F2 closes to vector → full reverse.
    expect(designed!.inserts[0]!.insertForward.sequence.startsWith(vectorSeq.slice(-20))).toBe(true)
    expect(
      designed!.inserts[1]!.insertReverse.sequence.startsWith(reverseComplement(vectorSeq.slice(0, 20))),
    ).toBe(true)
    // Insert–insert halves on F1 reverse / F2 forward.
    const f1End = insertACore.slice(-10)
    const f2Start = insertBCore.slice(0, 10)
    expect(designed!.inserts[1]!.insertForward.sequence.startsWith(f1End)).toBe(true)
    expect(designed!.inserts[0]!.insertReverse.sequence.startsWith(reverseComplement(f2Start))).toBe(
      true,
    )
    // No primer is anneal-only; flanks are longer than middles but both strands have tails.
    for (const entry of designed!.inserts) {
      expect(entry.insertForward.sequence.length).toBeGreaterThan(25)
      expect(entry.insertReverse.sequence.length).toBeGreaterThan(25)
    }

    const resolvedDesigned = [fragA, fragB].map((config, index) => {
      const entry = designed!.inserts.find((item) => item.fragmentIndex === index)!
      const withPrimers = mergeGibsonDesignedPrimersOntoRecord(config.record!, entry.insertPrimers)
      return resolveGibsonPart(
        {
          ...config,
          record: withPrimers,
          linearizationMode: 'pcr',
          forwardPrimer: entry.insertForward,
          reversePrimer: entry.insertReverse,
        },
        index,
        index,
        index + 1,
      )
    })
    expect(resolvedDesigned.every((part) => part.ready)).toBe(true)
    const analysis = analyzeGibsonAssembly([vector, ...resolvedDesigned], {
      mode: 'cloning',
      method: 'nebuilder-hifi',
    })
    expect(analysis.ready).toBe(true)
    expect(analysis.closed).toBe(true)
    for (const junction of analysis.junctions ?? []) {
      expect(junction.overlapLength).toBeGreaterThanOrEqual(15)
      expect(['optimal', 'good']).toContain(junction.grade.level)
    }
  })

  it('keeps prior primers and versions names when regenerating for another method', () => {
    const vectorRecord = makeRecord('V', VECTOR_SEQ)
    const insertRecord = makeRecord('I', `GGGG${INSERT_CORE}CCCC`)
    const vector = resolveGibsonPart(
      {
        ...defaultGibsonPartConfig('vector', vectorRecord),
        linearizationMode: 'direct',
      },
      0,
      0,
      0,
    )
    const amplifyRange = { start: 4, end: 4 + INSERT_CORE.length }
    const first = designGibsonOverlapPrimers({
      vector,
      insertRecord,
      insertAmplifyRange: amplifyRange,
      options: {
        ...defaultGibsonOverlapPrimerOptions('nebuilder-hifi'),
        overlapMode: 'fixed',
        fixedOverlapBp: 20,
        regenerateEnzymeSites: false,
      },
    })
    expect(first).not.toBeNull()
    const afterFirst = mergeGibsonDesignedPrimersOntoRecord(insertRecord, first!.insertPrimers)
    expect(afterFirst.primers.map((primer) => primer.name)).toEqual(['I_HiFi_F', 'I_HiFi_R'])

    const frag = {
      ...defaultGibsonPartConfig('fragment', afterFirst),
      linearizationMode: 'pcr' as const,
      amplifyRange,
      forwardPrimer: first!.insertForward,
      reversePrimer: first!.insertReverse,
    }
    const resolved = resolveGibsonPart(frag, 0, 0, 1)
    expect(resolved.ready).toBe(true)

    expect(
      listGibsonOverlapPrimerTargets({
        mode: 'cloning',
        vector,
        fragments: [frag],
        fragmentOrder: [0],
        resolvedFragments: [resolved],
        assemblyReady: true,
        includeReadyInserts: false,
      }),
    ).toHaveLength(0)
    expect(
      listGibsonOverlapPrimerTargets({
        mode: 'cloning',
        vector,
        fragments: [frag],
        fragmentOrder: [0],
        resolvedFragments: [resolved],
        assemblyReady: true,
        includeReadyInserts: true,
      }),
    ).toHaveLength(1)

    const second = designGibsonOverlapPrimersForAssembly({
      vector,
      fragments: [frag],
      fragmentOrder: [0],
      resolvedFragments: [resolved],
      options: {
        ...defaultGibsonOverlapPrimerOptions('classic-gibson'),
        overlapMode: 'fixed',
        fixedOverlapBp: 40,
        regenerateEnzymeSites: false,
      },
      includeReadyInserts: true,
    })
    expect(second?.inserts).toHaveLength(1)
    expect(second!.inserts[0]!.insertForward.name).toBe('I_Gibson_F')
    expect(second!.inserts[0]!.insertReverse.name).toBe('I_Gibson_R')

    const afterSecond = mergeGibsonDesignedPrimersOntoRecord(
      afterFirst,
      second!.inserts[0]!.insertPrimers,
    )
    expect(afterSecond.primers.map((primer) => primer.name)).toEqual([
      'I_HiFi_F',
      'I_HiFi_R',
      'I_Gibson_F',
      'I_Gibson_R',
    ])

    const third = designGibsonOverlapPrimersForAssembly({
      vector,
      fragments: [
        {
          ...frag,
          record: afterSecond,
          forwardPrimer: second!.inserts[0]!.insertForward,
          reversePrimer: second!.inserts[0]!.insertReverse,
        },
      ],
      fragmentOrder: [0],
      resolvedFragments: [resolved],
      options: {
        ...defaultGibsonOverlapPrimerOptions('classic-gibson'),
        overlapMode: 'fixed',
        fixedOverlapBp: 40,
        regenerateEnzymeSites: false,
      },
      includeReadyInserts: true,
    })
    expect(third!.inserts[0]!.insertForward.name).toBe('I_Gibson_v2_F')
    expect(third!.inserts[0]!.insertReverse.name).toBe('I_Gibson_v2_R')
  })

  it('designs linear-assembly primers with no homology on free ends', () => {
    const coreA =
      'ATGCGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTTA'
    const coreB =
      'GGCCTAAGGCCTAAGGCCTAAGGCCTAAGGCCTAAGGCCTAAGGCCTAAGGCCTAAGGCCTAAGGCCTAAGGCCTAAGGCCTAAGGCCTAAGGCCTAAGGCCTAAGGCCTAAGGCCTAAA'
    const primaryConfig = {
      ...defaultGibsonPartConfig('fragment', makeRecord('A', `AAAA${coreA}TTTT`)),
      linearizationMode: 'pcr' as const,
      amplifyRange: { start: 4, end: 4 + coreA.length },
    }
    const fragB = {
      ...defaultGibsonPartConfig('fragment', makeRecord('B', `CCCC${coreB}GGGG`)),
      linearizationMode: 'pcr' as const,
      amplifyRange: { start: 4, end: 4 + coreB.length },
    }
    const primary = resolveGibsonPart(primaryConfig, 0, 0, 0)
    const resolvedB = resolveGibsonPart(fragB, 0, 1, 1)
    expect(primary.ready).toBe(false)
    expect(resolvedB.ready).toBe(false)

    const targets = listGibsonOverlapPrimerTargets({
      mode: 'linear',
      vector: primary,
      primaryConfig,
      fragments: [fragB],
      fragmentOrder: [0],
      resolvedFragments: [resolvedB],
      assemblyReady: false,
    })
    expect(targets.map((target) => target.fragmentIndex)).toEqual([null, 0])

    const designed = designGibsonOverlapPrimersForAssembly({
      mode: 'linear',
      vector: primary,
      primaryConfig,
      fragments: [fragB],
      fragmentOrder: [0],
      resolvedFragments: [resolvedB],
      options: {
        ...defaultGibsonOverlapPrimerOptions('nebuilder-hifi', 2),
        overlapMode: 'fixed',
        fixedOverlapBp: 20,
        regenerateEnzymeSites: false,
      },
    })
    expect(designed?.inserts).toHaveLength(2)
    const first = designed!.inserts.find((entry) => entry.fragmentIndex === null)!
    const second = designed!.inserts.find((entry) => entry.fragmentIndex === 0)!
    // Free 5′ of the linear chain: anneal-only forward (no neighbor homology).
    expect(first.insertForward.sequence.length).toBeLessThan(second.insertForward.sequence.length)
    // Internal junction halves.
    expect(second.insertForward.sequence.startsWith(coreA.slice(-10))).toBe(true)
    expect(first.insertReverse.sequence.startsWith(reverseComplement(coreB.slice(0, 10)))).toBe(true)
    // Free 3′ of the linear chain: anneal-only reverse (no neighbor homology).
    expect(second.insertReverse.sequence.length).toBeLessThan(first.insertReverse.sequence.length)
    expect(second.insertReverse.sequence.startsWith(reverseComplement(coreB.slice(0, 10)))).toBe(
      false,
    )
  })
})
