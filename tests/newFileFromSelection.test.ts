import { describe, expect, it } from 'vitest'
import { defaultConstructProperties } from '../src/domain/constructProperties'
import { exportSnapGeneBlock8Xml, parseSnapGeneBlock8DnaEnds } from '../src/domain/dnaEnds'
import {
  createRecordFromSelection,
  regeneratedEndRestrictionSites,
} from '../src/domain/newFileFromSelection'
import { exportSnapGeneHistoryTreeXml } from '../src/domain/snapgeneHistoryExport'
import type { RestrictionSite, SequenceRecord } from '../src/domain/types'

function stubSite(name: string, cutTop: number, cutBottom: number): RestrictionSite {
  return {
    enzyme: {
      name,
      notation: name,
      recognition: 'AATT',
      cutTop: 1,
      cutBottom: 5,
      type: 'II',
      overhang: { type: "5'", sequence: 'AATT', length: 4 },
      manufacturers: [],
      notes: [],
    },
    start: Math.min(cutTop, cutBottom),
    end: Math.max(cutTop, cutBottom) + 4,
    match: 'AATT',
    cutTop,
    cutBottom,
  }
}

function sourceRecord(sequence: string): SequenceRecord {
  return {
    id: 'src',
    name: 'parent',
    description: '',
    molecule: 'dna',
    topology: 'circular',
    sequence,
    features: [
      {
        id: 'f1',
        name: 'mid',
        type: 'misc_feature',
        color: '#999',
        locations: [{ start: 10, end: 20, strand: 'forward' }],
      },
    ],
    primers: [],
    operations: [],
    construct: defaultConstructProperties,
    createdAt: '',
    updatedAt: '',
  }
}

describe('newFileFromSelection', () => {
  it('builds a blunt linear fragment from a duplex range', () => {
    const source = sourceRecord('ATGCGTACGTAAACCCGGGTTTAA')
    const next = createRecordFromSelection({
      source,
      selectedRange: { start: 5, end: 15 },
    })
    expect(next).not.toBeNull()
    expect(next!.topology).toBe('linear')
    expect(next!.sequence).toBe('TACGTAAACC')
    expect(next!.dnaEnds?.upstream.stickiness).toBe(0)
    expect(next!.name).toBe('parent (6 - 15)')
    expect(next!.features).toHaveLength(1)
    expect(next!.features[0]!.locations[0]).toMatchObject({ start: 5, end: 10 })
  })

  it('preserves source overhangs when the selection includes those ends', () => {
    const source: SequenceRecord = {
      ...sourceRecord('ABCDEFGHIJKLMNOP'),
      topology: 'linear',
      dnaEnds: {
        upstream: { modification: 'fivePrimePhosphorylated', stickiness: 3, enzymeName: 'EcoRI' },
        downstream: { modification: 'unmodified', stickiness: -2, enzymeName: 'PstI' },
      },
    }

    const whole = createRecordFromSelection({
      source,
      selectedRange: { start: 0, end: 16 },
    })
    expect(whole!.dnaEnds).toEqual({
      upstream: { modification: 'fivePrimePhosphorylated', stickiness: 3, enzymeName: 'EcoRI' },
      downstream: { modification: 'unmodified', stickiness: -2, enzymeName: 'PstI' },
    })
    expect(whole!.history?.upstreamStickiness).toBe(3)
    expect(whole!.history?.downstreamStickiness).toBe(-2)

    const left = createRecordFromSelection({
      source,
      selectedRange: { start: 0, end: 8 },
    })
    expect(left!.dnaEnds).toEqual({
      upstream: { modification: 'fivePrimePhosphorylated', stickiness: 3, enzymeName: 'EcoRI' },
      downstream: { modification: 'fivePrimePhosphorylated', stickiness: 0 },
    })

    const right = createRecordFromSelection({
      source,
      selectedRange: { start: 8, end: 16 },
    })
    expect(right!.dnaEnds).toEqual({
      upstream: { modification: 'fivePrimePhosphorylated', stickiness: 0 },
      downstream: { modification: 'unmodified', stickiness: -2, enzymeName: 'PstI' },
    })

    // Mid-overhang start: keep the remaining ss stretch, drop the enzyme tip label.
    const trimmedLeft = createRecordFromSelection({
      source,
      selectedRange: { start: 1, end: 8 },
    })
    expect(trimmedLeft!.dnaEnds?.upstream).toEqual({
      modification: 'fivePrimePhosphorylated',
      stickiness: 2,
    })
  })

  it('builds sticky ends and enzyme labels from a two-enzyme cut selection', () => {
    const source = sourceRecord('N'.repeat(100))
    const left = stubSite('MfeI', 20, 24)
    const right = stubSite('BbvCI', 50, 53)
    const next = createRecordFromSelection({
      source,
      cutStrandSelection: {
        forward: { start: 20, end: 50 },
        reverse: { start: 24, end: 53 },
      },
      cutEnzymes: { upstream: left, downstream: right },
    })
    expect(next).not.toBeNull()
    expect(next!.sequence).toHaveLength(33)
    expect(next!.dnaEnds).toEqual({
      upstream: { modification: 'fivePrimePhosphorylated', stickiness: 4, enzymeName: 'MfeI' },
      downstream: { modification: 'fivePrimePhosphorylated', stickiness: 3, enzymeName: 'BbvCI' },
    })
    expect(next!.name).toContain('MfeI (21)')
    expect(next!.name).toContain('BbvCI (51)')
    expect(next!.history?.operation).toBe('newFileFromSelection')
    expect(next!.history?.regeneratedSites).toEqual([
      { name: '<MfeI>', pos: 0, siteCount: 1, blunt: false },
      { name: '<BbvCI>', pos: 30, siteCount: 1, blunt: false },
    ])

    const block8 = exportSnapGeneBlock8Xml(next!.dnaEnds!)
    expect(block8).toContain('<UpstreamEnzymeName>MfeI</UpstreamEnzymeName>')
    expect(block8).toContain('<DownstreamEnzymeName>BbvCI</DownstreamEnzymeName>')
    expect(parseSnapGeneBlock8DnaEnds(block8)).toEqual(next!.dnaEnds)

    const historyXml = exportSnapGeneHistoryTreeXml(next!.history!, 'dna')
    expect(historyXml).toContain('operation="newFileFromSelection"')
    expect(historyXml).toContain('name="&lt;MfeI&gt;"')
    expect(historyXml).toContain('name="&lt;BbvCI&gt;"')
    expect(historyXml).toContain('upstreamStickiness="4"')
    expect(historyXml).toContain('downstreamStickiness="3"')
  })

  it('exposes regenerated end sites for sticky-end enzyme labels', () => {
    const sites = regeneratedEndRestrictionSites(
      {
        upstream: { modification: 'fivePrimePhosphorylated', stickiness: 4, enzymeName: 'MfeI' },
        downstream: { modification: 'fivePrimePhosphorylated', stickiness: 3, enzymeName: 'BbvCI' },
      },
      238,
    )
    expect(sites.map((site) => site.enzyme.name)).toEqual(['<MfeI>', '<BbvCI>'])
    expect(sites[0]!.start).toBe(0)
    expect(sites[1]!.start).toBe(235)
  })
})
