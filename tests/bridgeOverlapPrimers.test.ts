import { describe, expect, it } from 'vitest'
import { defaultConstructProperties } from '../src/domain/constructProperties'
import { defaultDnaEnds } from '../src/domain/dnaEnds'
import {
  defaultBridgeOverlapPrimerOptions,
  designBridgeOverlapPrimersForFragments,
  listBridgeOverlapPrimerTargets,
  mergeBridgeDesignedPrimersOntoRecord,
  type BridgeFragmentPrimerInput,
} from '../src/domain/bridgeOverlapPrimers'
import { reverseComplement } from '../src/domain/sequence'
import type { SequenceRecord } from '../src/domain/types'

function makeRecord(name: string, sequence: string): SequenceRecord {
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
  }
}

const coreA =
  'ATGCGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTTA'
const coreB =
  'GGCCTAAGGCCTAAGGCCTAAGGCCTAAGGCCTAAGGCCTAAGGCCTAAGGCCTAAGGCCTAAGGCCTAAGGCCTAAGGCCTAAGGCCTAAGGCCTAAGGCCTAAGGCCTAAGGCCTAAA'

function unfinishedFragment(
  index: number,
  name: string,
  sequence: string,
  amplify: { start: number; end: number },
): BridgeFragmentPrimerInput {
  return {
    index,
    template: makeRecord(name, sequence),
    selectedRange: amplify,
    forwardPrimer: { name: 'Primer 1', sequence: '', phosphorylated: false },
    reversePrimer: { name: 'Primer 2', sequence: '', phosphorylated: false },
    ready: false,
  }
}

describe('bridgeOverlapPrimers', () => {
  it('defaults to fixed 20 bp OE overlaps', () => {
    const options = defaultBridgeOverlapPrimerOptions()
    expect(options.overlapMode).toBe('fixed')
    expect(options.fixedOverlapBp).toBe(20)
    expect(options.overlapMinBp).toBe(15)
    expect(options.overlapMaxBp).toBe(25)
    expect(options.geneTmC).toBe(60)
  })

  it('lists unfinished amplify fragments for Choose, and all ranges for Regenerate', () => {
    const fragments = [
      unfinishedFragment(0, 'A', `AAAA${coreA}TTTT`, { start: 4, end: 4 + coreA.length }),
      unfinishedFragment(1, 'B', `CCCC${coreB}GGGG`, { start: 4, end: 4 + coreB.length }),
    ]
    const choose = listBridgeOverlapPrimerTargets({
      fragments,
      fusionReady: false,
      includeReadyFragments: false,
    })
    expect(choose.map((target) => target.fragmentIndex)).toEqual([0, 1])

    const withReady = [
      { ...fragments[0]!, ready: true },
      fragments[1]!,
    ]
    const chooseReadySkipped = listBridgeOverlapPrimerTargets({
      fragments: withReady,
      fusionReady: false,
      includeReadyFragments: false,
    })
    expect(chooseReadySkipped.map((target) => target.fragmentIndex)).toEqual([1])

    const regen = listBridgeOverlapPrimerTargets({
      fragments: withReady,
      fusionReady: true,
      includeReadyFragments: true,
    })
    expect(regen.map((target) => target.fragmentIndex)).toEqual([0, 1])
  })

  it('designs OE primers with half/half junctions and anneal-only free ends', () => {
    const fragments = [
      unfinishedFragment(0, 'A', `AAAA${coreA}TTTT`, { start: 4, end: 4 + coreA.length }),
      unfinishedFragment(1, 'B', `CCCC${coreB}GGGG`, { start: 4, end: 4 + coreB.length }),
    ]
    const designed = designBridgeOverlapPrimersForFragments({
      fragments,
      options: {
        ...defaultBridgeOverlapPrimerOptions(),
        overlapMode: 'fixed',
        fixedOverlapBp: 20,
      },
      includeReadyFragments: true,
    })
    expect(designed?.fragments).toHaveLength(2)
    const first = designed!.fragments.find((entry) => entry.fragmentIndex === 0)!
    const second = designed!.fragments.find((entry) => entry.fragmentIndex === 1)!
    expect(first.insertForward.name).toMatch(/_OE_F$/)
    expect(first.insertReverse.name).toMatch(/_OE_R$/)
    expect(second.insertForward.name).toMatch(/_OE_F$/)
    expect(second.insertReverse.name).toMatch(/_OE_R$/)

    // Free 5′ of the OE chain: anneal-only forward.
    expect(first.insertForward.sequence.length).toBeLessThan(second.insertForward.sequence.length)
    // Internal junction halves (~10 bp of 20 bp overlap).
    expect(second.insertForward.sequence.startsWith(coreA.slice(-10))).toBe(true)
    expect(first.insertReverse.sequence.startsWith(reverseComplement(coreB.slice(0, 10)))).toBe(true)
    // Free 3′ of the OE chain: anneal-only reverse.
    expect(second.insertReverse.sequence.length).toBeLessThan(first.insertReverse.sequence.length)
    expect(second.insertReverse.sequence.startsWith(reverseComplement(coreB.slice(0, 10)))).toBe(
      false,
    )

    const merged = mergeBridgeDesignedPrimersOntoRecord(fragments[0]!.template, first.insertPrimers)
    expect(merged.primers.map((primer) => primer.name)).toEqual([
      first.insertForward.name,
      first.insertReverse.name,
    ])
  })
})
