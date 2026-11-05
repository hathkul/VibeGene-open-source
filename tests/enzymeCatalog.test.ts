import { describe, expect, it } from 'vitest'
import { parseSibRecognition, parseThermoRecognition } from '../src/domain/enzymeParser'
import { enzymes } from '../src/domain/enzymes'
import {
  compatibleStickyEndGroups,
  filterCatalogEnzymeNames,
  recognitionDisplayFor,
  sameRecognitionGroups,
} from '../src/domain/enzymeCatalog'

describe('enzymeCatalog', () => {
  it('filters enzyme names by prefix fragments', () => {
    const matches = filterCatalogEnzymeNames('eco')
    expect(matches.some((name) => name.startsWith('Eco'))).toBe(true)
    expect(matches.every((name) => name.toLowerCase().includes('eco'))).toBe(true)
  })

  it('groups isoschizomers with the same recognition sequence', () => {
    const eco = enzymes.find((entry) => entry.name.startsWith('EcoRI'))
    expect(eco).toBeTruthy()
    const groups = sameRecognitionGroups(eco!)
    const names = groups.flatMap((group) => group.entries.map((entry) => entry.enzyme.name))
    expect(names.some((name) => name.includes('EcoRI'))).toBe(true)
  })

  it('splits same recognition sequence into same-cut and different-cut recognition groups', () => {
    const ajnI = enzymes.find((entry) => entry.name === 'AjnI')
    expect(ajnI).toBeTruthy()

    const groups = sameRecognitionGroups(ajnI!)
    expect(groups.map((group) => group.title)).toEqual([
      'Same Cut Site (different enzyme — use its own buffer data)',
      'Same Recognition, Different Cut Site',
    ])

    const sameCutNames = groups[0]!.entries.map((entry) => entry.enzyme.name)
    const differentCutNames = groups[1]!.entries.map((entry) => entry.enzyme.name)

    expect(sameCutNames).toEqual(['Psp6I'])
    expect(differentCutNames).toContain('EcoRII')
    expect(differentCutNames).not.toContain('Psp6I')
  })

  it('lists neoschizomers under different cut site for the same recognition sequence', () => {
    const acc65I = enzymes.find((entry) => entry.name === 'Acc65I')
    expect(acc65I).toBeTruthy()

    const groups = sameRecognitionGroups(acc65I!)
    expect(groups).toHaveLength(1)
    expect(groups[0]!.title).toBe('Same Recognition, Different Cut Site')
    expect(groups[0]!.entries.map((entry) => entry.enzyme.name)).toEqual(['KpnI', 'KpnI-HF'])
  })

  it('finds enzymes with compatible sticky end groups', () => {
    const enzyme = enzymes[0]
    expect(enzyme).toBeTruthy()
    const groups = compatibleStickyEndGroups(enzyme)
    expect(Array.isArray(groups)).toBe(true)
  })

  it('splits compatible sticky ends into always and sometimes compatible groups, keeping distinct product aliases', () => {
    const accI = enzymes.find((entry) => entry.name === 'AccI')
    expect(accI).toBeTruthy()

    const groups = compatibleStickyEndGroups(accI!)
    expect(groups.map((group) => group.title)).toEqual(['Always Compatible', 'Sometimes Compatible'])

    const alwaysNames = groups[0]!.entries.map((entry) => entry.enzyme.name)
    const sometimesNames = groups[1]!.entries.map((entry) => entry.enzyme.name)

    expect(alwaysNames).toEqual(['FblI', 'XmiI'])
    expect(sometimesNames).toContain('ClaI')
    expect(sometimesNames).not.toContain('FblI')
  })

  it('keeps a single Bbv12I entry with SibEnzyme and Vivantis (not a Bbv12l OCR duplicate)', () => {
    expect(enzymes.filter((entry) => entry.name === 'Bbv12l')).toHaveLength(0)
    expect(enzymes.filter((entry) => entry.name === 'FbII')).toHaveLength(0)
    const bbv12I = enzymes.find((entry) => entry.name === 'Bbv12I')
    expect(bbv12I).toMatchObject({
      notation: 'GWGCW/C',
      recognition: 'GWGCWC',
    })
    expect(bbv12I!.manufacturers.map((entry) => entry.id).toSorted()).toEqual(['sibenzyme', 'vivantis'])
  })

  it('keeps concrete sticky ends in the always-compatible group only', () => {
    const ecoRI = enzymes.find((entry) => entry.name === 'EcoRI')
    expect(ecoRI).toBeTruthy()

    const groups = compatibleStickyEndGroups(ecoRI!)
    expect(groups).toHaveLength(1)
    expect(groups[0]!.title).toBe('Always Compatible')
    expect(groups[0]!.entries.some((entry) => entry.enzyme.name === 'MfeI')).toBe(true)
  })

  it('displays complementary strands and both cut boundaries for in-sequence cutters', () => {
    const eco = enzymes.find((entry) => entry.name.startsWith('EcoRI'))
    expect(eco).toBeTruthy()
    const display = recognitionDisplayFor(eco!)
    expect(display.top.segments.map((segment) => segment.text).join('')).toBe('GAATTC')
    expect(display.bottom.segments.map((segment) => segment.text).join('')).toBe('CTTAAG')
    expect(display.top.cutBoundary).toBe(1)
    expect(display.bottom.cutBoundary).toBe(5)
  })

  it('shows spacer context and cut arrows for offset cutters such as AlwI', () => {
    const alwI = enzymes.find((entry) => entry.name === 'AlwI')
    expect(alwI).toBeTruthy()
    const display = recognitionDisplayFor(alwI!)
    expect(display.top.segments).toEqual([
      { kind: 'recognition', text: 'GGATC', rangeStart: 0, rangeEnd: 5 },
      { kind: 'spacer', text: '', rangeStart: 5, rangeEnd: 9 },
      { kind: 'spacer', text: '', rangeStart: 9, rangeEnd: 10, role: 'overhang' },
      { kind: 'spacer', text: '', rangeStart: 10, rangeEnd: 11 },
    ])
    expect(display.bottom.segments).toEqual([
      { kind: 'recognition', text: 'CCTAG', rangeStart: 0, rangeEnd: 5 },
      { kind: 'spacer', text: '', rangeStart: 5, rangeEnd: 9 },
      { kind: 'spacer', text: '', rangeStart: 9, rangeEnd: 10, role: 'overhang' },
      { kind: 'spacer', text: '', rangeStart: 10, rangeEnd: 11 },
    ])
    expect(display.top.cutBoundary).toBe(9)
    expect(display.top.cutColumn).toBe(9)
    expect(display.top.columnCount).toBe(11)
    expect(display.bottom.cutBoundary).toBe(10)
    expect(display.bottom.cutColumn).toBe(10)
    expect(display.bottom.columnCount).toBe(11)
  })

  it('maps in-sequence cut boundaries to column positions for type II enzymes', () => {
    const eco = enzymes.find((entry) => entry.name.startsWith('EcoRI'))
    expect(eco).toBeTruthy()
    const display = recognitionDisplayFor(eco!)
    expect(display.top.cutColumn).toBe(1)
    expect(display.top.columnCount).toBe(6)
    expect(display.bottom.cutColumn).toBe(5)
    expect(display.bottom.columnCount).toBe(6)
  })

  it('shows upstream spacer context for negative cut offsets', () => {
    const bbvci = enzymes.find((entry) => entry.name === 'BbvCI')
    expect(bbvci).toBeTruthy()
    const display = recognitionDisplayFor(bbvci!)
    expect(display.top.segments.slice(0, 2)).toEqual([
      { kind: 'spacer', text: '', rangeStart: -6, rangeEnd: -5 },
      { kind: 'spacer', text: '', rangeStart: -5, rangeEnd: -2, role: 'overhang' },
    ])
    expect(display.top.cutBoundary).toBe(-5)
    expect(display.top.cutColumn).toBe(1)
    expect(display.bottom.cutBoundary).toBe(-2)
    expect(display.bottom.cutColumn).toBe(4)
  })

  it('keeps long upstream cuts inside visible context for homing endonucleases', () => {
    const sceI = enzymes.find((entry) => entry.name === 'I-SceI')
    expect(sceI).toBeTruthy()
    const display = recognitionDisplayFor(sceI!)
    expect(display.top.segments).toEqual([
      { kind: 'spacer', text: '', rangeStart: -14, rangeEnd: -13 },
      { kind: 'spacer', text: '', rangeStart: -13, rangeEnd: -9, role: 'overhang' },
      { kind: 'spacer', text: '', rangeStart: -9, rangeEnd: 0 },
      { kind: 'recognition', text: 'TAGGGATAACAGGGTAAT', rangeStart: 0, rangeEnd: 18 },
    ])
    expect(display.bottom.segments).toEqual([
      { kind: 'spacer', text: '', rangeStart: -14, rangeEnd: -13 },
      { kind: 'spacer', text: '', rangeStart: -13, rangeEnd: -9, role: 'overhang' },
      { kind: 'spacer', text: '', rangeStart: -9, rangeEnd: 0 },
      { kind: 'recognition', text: 'ATCCCTATTGTCCCATTA', rangeStart: 0, rangeEnd: 18 },
    ])
    expect(display.top.cutColumn).toBe(5)
    expect(display.bottom.cutColumn).toBe(1)
  })

  it('parses Sib dual-spacer IIS recognition for PsrI, ArsI, and FalI', () => {
    expect(parseSibRecognition('↑ (N) 7 GAACNNNNNNTAC(N) 12 ↑ ↓ (N) 12 CTTGNNNNNNATG(N) 7 ↓')).toMatchObject({
      recognition: 'GAACNNNNNNTAC',
      type: 'IIS',
      notation: '(7/12)GAACNNNNNNTAC(12/7)',
      cutTop: 25,
      cutBottom: 20,
      upstreamCutTop: -7,
      upstreamCutBottom: -12,
      overhang: { type: "3'", length: 5 },
    })

    expect(parseSibRecognition('↑ (N) 8 GACNNNNNNTTYG(N) 11 ↑ ↓ (N) 13 CTGNNNNNNAARC(N) 6 ↓')).toMatchObject({
      recognition: 'GACNNNNNNTTYG',
      type: 'IIS',
      notation: '(8/13)GACNNNNNNTTYG(11/6)',
      cutTop: 24,
      cutBottom: 19,
      upstreamCutTop: -8,
      upstreamCutBottom: -13,
      overhang: { type: "3'", length: 5 },
    })

    expect(parseSibRecognition('↑ (N) 8 AAGNNNNNCTT(N) 13 ↑ ↓ (N) 13 TTCNNNNNGAA(N) 8 ↓')).toMatchObject({
      recognition: 'AAGNNNNNCTT',
      type: 'IIS',
      notation: '(8/13)AAGNNNNNCTT(13/8)',
      cutTop: 24,
      cutBottom: 19,
      upstreamCutTop: -8,
      upstreamCutBottom: -13,
      overhang: { type: "3'", length: 5 },
    })
  })

  it('parses Sib leading-cut notation for isoschizomers such as AjnI', () => {
    expect(parseSibRecognition('↑ CCWGG GGWCC ↓')).toMatchObject({
      recognition: 'CCWGG',
      cutTop: 1,
      cutBottom: 4,
      notation: 'C/CWGG',
    })
  })

  it('parses SibEnzyme recognition notation for type II enzymes', () => {
    const ahlI = parseSibRecognition('A ↑ CTAGT TGATC ↓ A')
    expect(ahlI).toMatchObject({
      recognition: 'ACTAGT',
      cutTop: 1,
      cutBottom: 5,
      type: 'II',
    })

    const aatII = parseSibRecognition('GACGT ↑ C C ↓ TGCAG')
    expect(aatII).toMatchObject({
      recognition: 'GACGTC',
      cutTop: 5,
      cutBottom: 1,
    })
  })

  it('parses Thermo recognition notation for type II and IIS enzymes', () => {
    expect(parseThermoRecognition('G^GATCC')).toMatchObject({
      recognition: 'GGATCC',
      cutTop: 1,
      cutBottom: 5,
      type: 'II',
    })

    expect(parseThermoRecognition('GGTCTC(1/5)^')).toMatchObject({
      recognition: 'GGTCTC',
      type: 'IIS',
    })

    expect(parseThermoRecognition('^(10/12)GCA(N)6TGC(12/10)^')).toMatchObject({
      recognition: 'GCANNNNNNTGC',
      type: 'IIS',
    })

    // AloI: Thermo uses a degenerate distal cut (12 or 13 nt); take the first endpoint.
    // Both proximal and distal cut pairs are retained for recognition display.
    expect(parseThermoRecognition('^(7/12-13)GAAC(N)6TCC(12-13/7)^')).toMatchObject({
      recognition: 'GAACNNNNNNTCC',
      cutTop: 25,
      cutBottom: 20,
      upstreamCutTop: -7,
      upstreamCutBottom: -12,
      type: 'IIS',
      overhang: { type: "3'", length: 5 },
    })

    expect(parseThermoRecognition('CCTNA GCGGANT?CG')).toMatchObject({
      recognition: 'CCTNAGCGGANTCG',
      type: 'II',
    })
  })

  it('shows both upstream and downstream cuts for AloI recognition', () => {
    const aloI = enzymes.find((entry) => entry.name === 'AloI')
    expect(aloI).toMatchObject({
      recognition: 'GAACNNNNNNTCC',
      cutTop: 25,
      cutBottom: 20,
      upstreamCutTop: -7,
      upstreamCutBottom: -12,
    })
    const display = recognitionDisplayFor(aloI!)
    expect(display.top.cutBoundaries).toEqual([-7, 25])
    expect(display.bottom.cutBoundaries).toEqual([-12, 20])
    expect(display.top.rangeStart).toBeLessThan(0)
    expect(display.top.segments.some((segment) => segment.kind === 'recognition' && segment.text === 'GAACNNNNNNTCC')).toBe(
      true,
    )
    expect(display.bottom.segments.some((segment) => segment.kind === 'recognition' && segment.text === 'CTTGNNNNNNAGG')).toBe(
      true,
    )
  })

  it('shows both cut pairs for every dual-cutting enzyme in the catalog', () => {
    const dualCutters = enzymes.filter(
      (entry) => entry.upstreamCutTop != null && entry.upstreamCutBottom != null,
    )
    expect(dualCutters.map((entry) => entry.name)).toEqual([
      'AjuI',
      'AlfI',
      'AloI',
      'ArsI',
      'BaeI',
      'BarI',
      'BcgI',
      'BplI',
      'BsaXI',
      'CspCI',
      'FalI',
      'PsrI',
    ])

    for (const enzyme of dualCutters) {
      const display = recognitionDisplayFor(enzyme)
      expect(display.top.cutBoundaries, enzyme.name).toEqual([enzyme.upstreamCutTop, enzyme.cutTop])
      expect(display.bottom.cutBoundaries, enzyme.name).toEqual([enzyme.upstreamCutBottom, enzyme.cutBottom])
      expect(display.top.rangeStart, enzyme.name).toBeLessThan(0)
      expect(
        display.top.segments.some(
          (segment) => segment.kind === 'recognition' && segment.text === enzyme.recognition,
        ),
        enzyme.name,
      ).toBe(true)
    }
  })

  it('includes Sib-only catalog enzymes such as AhlI', () => {
    const ahlI = enzymes.find((entry) => entry.name === 'AhlI')
    expect(ahlI).toBeTruthy()
    expect(ahlI!.manufacturers.some((entry) => entry.id === 'sibenzyme')).toBe(true)
    expect(ahlI!.manufacturers.some((entry) => entry.id === 'neb')).toBe(false)
  })

  it('includes Thermo-only catalog enzymes such as AarI', () => {
    const aarI = enzymes.find((entry) => entry.name === 'AarI')
    expect(aarI).toBeTruthy()
    expect(aarI!.manufacturers.some((entry) => entry.id === 'thermo')).toBe(true)
    expect(aarI!.manufacturers.some((entry) => entry.id === 'neb')).toBe(false)
  })
})
