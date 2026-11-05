import { describe, expect, it } from 'vitest'
import { defaultConstructProperties } from '../src/domain/constructProperties'
import { defaultFeatureTranslationOptions } from '../src/domain/geneticCode'
import {
  applyHistoryRetention,
  trimHistoryTree,
  trimTranslationDerivation,
} from '../src/domain/historyRetention'
import type {
  HistoryNode,
  ProteinTranslationDerivation,
  ProteinTranslationSource,
  SequenceRecord,
} from '../src/domain/types'

function historyNode(
  id: string,
  children: HistoryNode[] = [],
  sequence = `SEQ-${id}`,
): HistoryNode {
  return {
    id,
    name: `${id}.dna`,
    seqLen: sequence.length,
    circular: false,
    operation: children.length ? 'assemble' : 'invalid',
    resurrectable: children.length === 0,
    hideHistory: false,
    oligos: [{ name: `${id}-primer`, sequence: 'ATGC' }],
    regeneratedSites: [],
    inputSummaries: [],
    features: [{
      name: `${id}-feature`,
      type: 'misc_feature',
      color: '#123456',
      strand: 'forward',
      segments: [{ start: 0, end: 2 }],
    }],
    sequence,
    children,
  }
}

function branchedHistory() {
  return historyNode('root', [
    historyNode('left', [historyNode('left-parent')]),
    historyNode('right'),
  ])
}

function sourceRecord(history = branchedHistory()): SequenceRecord {
  return {
    id: 'source-dna',
    name: 'source.dna',
    description: '',
    molecule: 'dna',
    topology: 'linear',
    sequence: 'ATGGTTTAA',
    features: [],
    primers: [],
    operations: [],
    history,
    construct: defaultConstructProperties,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  }
}

function translationSource(): ProteinTranslationSource {
  return {
    projectId: 'source-dna',
    projectName: 'source.dna',
    folderId: null,
    recordUpdatedAt: '2026-01-02T00:00:00.000Z',
    sequenceDigest: 'fnv1a64:1234',
    retention: 'complete',
    cds: {
      featureId: 'cds-1',
      featureName: 'CDS',
      locations: [{ start: 0, end: 9, strand: 'forward' }],
      translation: defaultFeatureTranslationOptions(1),
      nucleotideSequence: 'ATGGTTTAA',
      includedTerminalStop: true,
    },
    sourceRecord: sourceRecord(),
  }
}

function derivation(): ProteinTranslationDerivation {
  return {
    kind: 'translated-cds',
    createdAt: '2026-01-03T00:00:00.000Z',
    sources: [translationSource()],
  }
}

describe('trimHistoryTree', () => {
  it('keeps the requested number of ancestor generations across every branch', () => {
    const input = branchedHistory()
    const trimmed = trimHistoryTree(input, { mode: 'generations', generations: 1 })!

    expect(trimmed.children.map((child) => child.id)).toEqual(['left', 'right'])
    expect(trimmed.children[0]?.children).toEqual([])
    expect(trimmed.children[0]?.ancestryTrimmed).toBe(true)
    expect(trimmed.children[1]?.ancestryTrimmed).toBeUndefined()
    expect(input.children[0]?.children).toHaveLength(1)
    expect(input.children[0]?.ancestryTrimmed).toBeUndefined()
  })

  it('normalizes invalid generation counts to current-generation only', () => {
    const trimmed = trimHistoryTree(branchedHistory(), { mode: 'generations', generations: -5 })!
    expect(trimmed.children).toEqual([])
    expect(trimmed.ancestryTrimmed).toBe(true)
  })

  it('retains the visible tree while removing every decoded history sequence', () => {
    const input = branchedHistory()
    const trimmed = trimHistoryTree(input, { mode: 'tree-only' })!
    expect(trimmed.children[0]?.children[0]?.id).toBe('left-parent')
    expect(trimmed.sequence).toBeUndefined()
    expect(trimmed.children[0]?.sequence).toBeUndefined()
    expect(trimmed.children[0]?.children[0]?.sequence).toBeUndefined()
    expect(input.children[0]?.children[0]?.sequence).toBe('SEQ-left-parent')
  })

  it('distinguishes a current-only root from complete removal', () => {
    const current = trimHistoryTree(branchedHistory(), { mode: 'current-only' })!
    expect(current.id).toBe('root')
    expect(current.children).toEqual([])
    expect(current.sequence).toBeUndefined()
    expect(trimHistoryTree(branchedHistory(), { mode: 'remove' })).toBeUndefined()
  })

  it('returns detached nested history data in complete mode', () => {
    const input = branchedHistory()
    const cloned = trimHistoryTree(input, { mode: 'complete' })!
    expect(cloned).not.toBe(input)
    expect(cloned.children[0]).not.toBe(input.children[0])
    expect(cloned.features[0]?.segments[0]).not.toBe(input.features[0]?.segments[0])
    expect(cloned.oligos[0]).not.toBe(input.oligos[0])
  })
})

describe('trimTranslationDerivation', () => {
  it('trims embedded DNA ancestry independently of CDS provenance', () => {
    const trimmed = trimTranslationDerivation(derivation(), {
      mode: 'complete',
      ancestry: { mode: 'generations', generations: 1 },
    })!
    const source = trimmed.sources[0]!
    expect(source.cds?.nucleotideSequence).toBe('ATGGTTTAA')
    expect(source.sourceRecord?.history?.children[0]?.children).toEqual([])
    expect(source.sourceRecord?.history?.children[0]?.ancestryTrimmed).toBe(true)
  })

  it('supports current-DNA, CDS-only, reference-only, and removal levels', () => {
    const currentDna = trimTranslationDerivation(derivation(), { mode: 'current-dna' })!
      .sources[0]!
    expect(currentDna.sourceRecord?.sequence).toBe('ATGGTTTAA')
    expect(currentDna.sourceRecord?.history).toBeUndefined()
    expect(currentDna.cds).toBeDefined()

    const cdsOnly = trimTranslationDerivation(derivation(), { mode: 'cds-only' })!.sources[0]!
    expect(cdsOnly.retention).toBe('cds-only')
    expect(cdsOnly.cds?.nucleotideSequence).toBe('ATGGTTTAA')
    expect(cdsOnly.sourceRecord).toBeUndefined()

    const referenceOnly = trimTranslationDerivation(derivation(), { mode: 'reference-only' })!
      .sources[0]!
    expect(referenceOnly.retention).toBe('reference-only')
    expect(referenceOnly.projectId).toBe('source-dna')
    expect(referenceOnly.sequenceDigest).toBe('fnv1a64:1234')
    expect(referenceOnly.cds).toBeUndefined()
    expect(referenceOnly.sourceRecord).toBeUndefined()

    expect(trimTranslationDerivation(derivation(), { mode: 'remove' })).toBeUndefined()
  })
})

describe('applyHistoryRetention', () => {
  it('applies native, provenance, and operation-log retention independently', () => {
    const input: SequenceRecord = {
      id: 'protein-1',
      name: 'protein.prot',
      description: '',
      molecule: 'protein',
      topology: 'linear',
      sequence: 'MV',
      protein: {
        numberingStart: 1,
        numberingRegions: [],
        bonds: [],
        translationDerivation: derivation(),
      },
      features: [],
      primers: [],
      operations: [{ id: 'op-1', type: 'translate', summary: 'Translated CDS', createdAt: '' }],
      history: branchedHistory(),
      construct: defaultConstructProperties,
      createdAt: '',
      updatedAt: '',
    }
    const before = JSON.stringify(input)
    const trimmed = applyHistoryRetention(input, {
      nativeAncestry: { mode: 'current-only' },
      ancestorTraces: { mode: 'complete' },
      translationSources: { mode: 'cds-only' },
      clearOperationLog: true,
    })

    expect(trimmed.history?.children).toEqual([])
    expect(trimmed.operations).toEqual([])
    expect(trimmed.protein?.translationDerivation?.sources[0]?.cds).toBeDefined()
    expect(trimmed.protein?.translationDerivation?.sources[0]?.sourceRecord).toBeUndefined()
    expect(JSON.stringify(input)).toBe(before)
  })
})
