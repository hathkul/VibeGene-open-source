import { describe, expect, it } from 'vitest'
import { defaultConstructProperties } from '../src/domain/constructProperties'
import { defaultDnaEnds } from '../src/domain/dnaEnds'
import { traceRecordFromSequence } from '../src/domain/sequenceTraceFactory'
import {
  analyzeCloningOrientationAmbiguity,
  applyCutEndTreatment,
  assembleRestrictionCloningProduct,
  buildCloningProductDiagram,
  buildDntpFillPreview,
  countPartialFillBases,
  cutEndOverhangPolarity,
  defaultCloningPartConfig,
  defaultDigestFragmentId,
  endsShareOverhangPolarity,
  formatOverhangLabel,
  formatStickyEndPreview,
  listDigestFragmentsBetweenCuts,
  analyzePartialDigestWarning,
  listCompleteDigestFragments,
  resolveCloningPart,
  samePolarityTreatmentsConflict,
  sortDigestFragmentsForDisplay,
  synchronizeSamePolarityTreatments,
  validateCloningAssembly,
  validateFragmentDeletion,
  validateLinearLigation,
  validateSiteDestruction,
} from '../src/domain/restrictionCloning'
import { setCircularOrigin } from '../src/domain/sequence'
import type { RestrictionEnzyme, RestrictionSite, SequenceRecord } from '../src/domain/types'

function fakeEnzyme(
  name: string,
  recognition = 'GGTACC',
  overhangSeq = 'GTAC',
): RestrictionEnzyme {
  return {
    name,
    notation: recognition,
    recognition,
    cutTop: 1,
    cutBottom: 5,
    type: 'II',
    overhang: { type: "5'", sequence: overhangSeq, length: overhangSeq.length },
    manufacturers: [],
    notes: [],
  }
}

function site(name: string, cut: number, overhangSeq = 'GTAC'): RestrictionSite {
  const enzyme = fakeEnzyme(name, 'GGTACC', overhangSeq)
  return {
    enzyme,
    start: cut,
    end: cut + 6,
    match: enzyme.recognition,
    cutTop: cut + enzyme.cutTop,
    cutBottom: cut + enzyme.cutBottom,
  }
}

function record(length: number): SequenceRecord {
  return {
    id: 'test',
    name: 'plasmid',
    description: '',
    molecule: 'dna',
    topology: 'circular',
    sequence: 'A'.repeat(length),
    features: [],
    primers: [],
    operations: [],
    construct: { ...defaultConstructProperties },
    dnaEnds: defaultDnaEnds(),
    createdAt: '',
    updatedAt: '',
  }
}

describe('restriction cloning fragments', () => {
  it('defaults the vector to the longer digest arc', () => {
    const plasmid = record(5880)
    const acc65i = site('Acc65I', 100)
    const bamhi = site('BamHI', 390)
    const fragments = listDigestFragmentsBetweenCuts(plasmid, acc65i, bamhi)
    const defaultId = defaultDigestFragmentId('vector', fragments, plasmid.sequence.length)
    const chosen = fragments.find((fragment) => fragment.id === defaultId)!
    expect(chosen.length).toBe(Math.max(...fragments.map((fragment) => fragment.length)))
    expect(chosen.wraps).toBe(true)
  })

  it('defaults a linear insert to the fragment between two restriction sites regardless of length', () => {
    const insert = record(1000)
    insert.topology = 'linear'
    const left = site('EcoRI', 450)
    const right = site('BamHI', 550)
    const fragments = listDigestFragmentsBetweenCuts(insert, left, right)

    expect(fragments.find((fragment) => fragment.id === 'between')?.length).toBeLessThan(
      fragments.find((fragment) => fragment.id === 'left-flank')!.length,
    )
    expect(defaultDigestFragmentId('insert', fragments, insert.sequence.length)).toBe('between')
  })

  it('lists major and minor arcs between Acc65I and BamHI', () => {
    const plasmid = record(5880)
    const acc65i = site('Acc65I', 100)
    const bamhi = site('BamHI', 390)
    const fragments = sortDigestFragmentsForDisplay(
      listDigestFragmentsBetweenCuts(plasmid, acc65i, bamhi),
    )
    expect(fragments).toHaveLength(2)
    expect(fragments[0]!.length).toBeGreaterThan(5000)
    expect(fragments[1]!.length).toBeLessThan(400)
  })

  it('encodes the major arc as a wrap selection (start > end)', () => {
    const plasmid = record(5880)
    const acc65i = site('Acc65I', 100)
    const bamhi = site('BamHI', 390)
    const major = sortDigestFragmentsForDisplay(
      listDigestFragmentsBetweenCuts(plasmid, acc65i, bamhi),
    )[0]!
    expect(major.wraps).toBe(true)
    expect(major.start).toBeGreaterThan(major.end)
  })

  it('still offers the major arc when BamHI is chosen before Acc65I', () => {
    const plasmid = record(5880)
    const acc65i = site('Acc65I', 100)
    const bamhi = site('BamHI', 390)
    const fragments = sortDigestFragmentsForDisplay(
      listDigestFragmentsBetweenCuts(plasmid, bamhi, acc65i),
    )
    expect(fragments).toHaveLength(2)
    expect(fragments[0]!.length).toBeGreaterThan(5000)
    expect(fragments[0]!.wraps).toBe(true)
    expect(fragments[0]!.start).toBeGreaterThan(fragments[0]!.end)
  })

  it('labels the vector arc as the selected fragment direction (S1→S2 or S2→S1)', () => {
    const plasmid = record(5880)
    const acc65i = site('Acc65I', 100)
    const bamhi = site('BamHI', 390)

    const minor = resolveCloningPart(
      {
        ...defaultCloningPartConfig('vector', plasmid),
        leftCut: { enzymeName: 'Acc65I', site: acc65i, treatment: 'none' as const, fillWith: { A: true, C: true, G: true, T: true } },
        rightCut: { enzymeName: 'BamHI', site: bamhi, treatment: 'none' as const, fillWith: { A: true, C: true, G: true, T: true } },
        selectedFragmentId: 'forward',
      },
      '#000',
    )
    expect(minor).not.toBeNull()
    expect(minor!.leftEnzyme).toBe('Acc65I')
    expect(minor!.rightEnzyme).toBe('BamHI')
    expect(minor!.length).toBeLessThan(400)

    const major = resolveCloningPart(
      {
        ...defaultCloningPartConfig('vector', plasmid),
        leftCut: { enzymeName: 'Acc65I', site: acc65i, treatment: 'none' as const, fillWith: { A: true, C: true, G: true, T: true } },
        rightCut: { enzymeName: 'BamHI', site: bamhi, treatment: 'none' as const, fillWith: { A: true, C: true, G: true, T: true } },
        selectedFragmentId: 'reverse',
      },
      '#000',
    )
    expect(major).not.toBeNull()
    expect(major!.leftEnzyme).toBe('BamHI')
    expect(major!.rightEnzyme).toBe('Acc65I')
    expect(major!.length).toBeGreaterThan(5000)
  })

  it('keeps BamHI→Acc65I when that is the selected forward fragment', () => {
    const plasmid = record(5880)
    const acc65i = site('Acc65I', 100)
    const bamhi = site('BamHI', 390)
    const part = resolveCloningPart(
      {
        ...defaultCloningPartConfig('vector', plasmid),
        leftCut: { enzymeName: 'BamHI', site: bamhi, treatment: 'none' as const, fillWith: { A: true, C: true, G: true, T: true } },
        rightCut: { enzymeName: 'Acc65I', site: acc65i, treatment: 'none' as const, fillWith: { A: true, C: true, G: true, T: true } },
        selectedFragmentId: 'forward',
      },
      '#000',
    )
    expect(part).not.toBeNull()
    expect(part!.leftEnzyme).toBe('BamHI')
    expect(part!.rightEnzyme).toBe('Acc65I')
  })

  it('keeps major insert when reverse fragment is selected', () => {
    const plasmid = record(5880)
    const acc65i = site('Acc65I', 100)
    const bamhi = site('BamHI', 390)
    const config = {
      ...defaultCloningPartConfig('insert', plasmid),
      leftCut: { enzymeName: 'Acc65I', site: acc65i, treatment: 'none' as const, fillWith: { A: true, C: true, G: true, T: true } },
      rightCut: { enzymeName: 'BamHI', site: bamhi, treatment: 'none' as const, fillWith: { A: true, C: true, G: true, T: true } },
      selectedFragmentId: 'reverse',
    }
    const part = resolveCloningPart(config, '#c00')
    expect(part).not.toBeNull()
    expect(part!.length).toBeGreaterThan(5000)
    expect(part!.leftEnzyme).toBe('BamHI')
    expect(part!.rightEnzyme).toBe('Acc65I')
  })

  it('linearizes a circular plasmid at a single restriction site', () => {
    const plasmid = record(5880)
    const bamhi = site('BamHI', 390)
    const fragments = listDigestFragmentsBetweenCuts(plasmid, bamhi, bamhi)
    expect(fragments).toHaveLength(1)
    expect(fragments[0]!.id).toBe('linearized')
    expect(fragments[0]!.length).toBe(5880)

    const part = resolveCloningPart(
      {
        ...defaultCloningPartConfig('insert', plasmid),
        leftCut: { enzymeName: 'BamHI', site: bamhi, treatment: 'none' as const, fillWith: { A: true, C: true, G: true, T: true } },
        rightCut: { enzymeName: 'BamHI', site: bamhi, treatment: 'none' as const, fillWith: { A: true, C: true, G: true, T: true } },
        selectedFragmentId: 'linearized',
      },
      '#c00',
    )
    expect(part).not.toBeNull()
    expect(part!.length).toBe(5880)
    expect(part!.leftEnzyme).toBe('BamHI')
    expect(part!.rightEnzyme).toBe('BamHI')
    expect(part!.upstreamOverhang?.sequence?.toUpperCase()).toBe('GTAC')
  })

  it('shows enzyme overhang plus duplex context in sticky previews', () => {
    const plasmid = record(5880)
    plasmid.sequence = 'ACGT'.repeat(1470)
    const bamhi = site('BamHI', 390)
    const part = resolveCloningPart(
      {
        ...defaultCloningPartConfig('insert', plasmid),
        leftCut: { enzymeName: 'BamHI', site: bamhi, treatment: 'none' as const, fillWith: { A: true, C: true, G: true, T: true } },
        rightCut: { enzymeName: 'BamHI', site: bamhi, treatment: 'none' as const, fillWith: { A: true, C: true, G: true, T: true } },
        selectedFragmentId: 'linearized',
      },
      '#c00',
    )!
    const left = formatStickyEndPreview(
      part.sequence,
      part.dnaEnds,
      'upstream',
      6,
      part.upstreamOverhang?.sequence,
    )
    expect(left.top.startsWith('gtac')).toBe(true)
    expect(left.top.endsWith('...')).toBe(true)
    expect(left.bottom.startsWith('    ')).toBe(true)
  })

  it('aligns complementary duplex columns in sticky end previews', () => {
    const complement: Record<string, string> = { a: 't', t: 'a', g: 'c', c: 'g' }
    const sequence = 'GATCctcagtAAAAGATC'.toUpperCase()
    const ends = {
      upstream: { modification: 'fivePrimePhosphorylated' as const, stickiness: 4, enzymeName: 'BamHI' },
      downstream: { modification: 'fivePrimePhosphorylated' as const, stickiness: 4, enzymeName: 'BamHI' },
    }
    const left = formatStickyEndPreview(sequence, ends, 'upstream', 6, 'GATC')
    const right = formatStickyEndPreview(sequence, ends, 'downstream', 6, 'GATC')

    // Left: 5′ GATC on top. Right: recessed top (...G), bottom overhang ...CCTAG.
    expect(left.top).toBe('gatcctcagt...')
    expect(left.bottom).toBe('    gagtca...')
    expect(right.top).toBe('...gtaaaa')
    expect(right.bottom).toBe('...cattttctag')

    for (const preview of [left, right]) {
      const top = preview.top.replaceAll('.', ' ').toLowerCase()
      const bottom = preview.bottom.replaceAll('.', ' ').toLowerCase()
      const width = Math.max(top.length, bottom.length)
      for (let index = 0; index < width; index += 1) {
        const a = top[index] ?? ' '
        const b = bottom[index] ?? ' '
        if (a === ' ' || b === ' ') continue
        expect(complement[a]).toBe(b)
      }
    }
  })

  it('renders BamHI right end as recessed top G and CCTAG-style bottom overhang', () => {
    // Last bases: G (duplex) + GATC (top-encoded overhang region of BamHI)
    const sequence = 'AAAAAGGATC'
    const ends = {
      upstream: { modification: 'fivePrimePhosphorylated' as const, stickiness: 0 },
      downstream: { modification: 'fivePrimePhosphorylated' as const, stickiness: 4, enzymeName: 'BamHI' },
    }
    const right = formatStickyEndPreview(sequence, ends, 'downstream', 1, 'GATC')
    expect(right.top).toBe('...g')
    expect(right.bottom).toBe('...cctag')
  })

  it('does not report a closed loop when insert order breaks intermediate junctions', () => {
    const plasmid = record(5880)
    const acc65i = site('Acc65I', 100, 'GTAC')
    const bamhi = site('BamHI', 390, 'GATC')

    const vectorAccBam = resolveCloningPart(
      {
        ...defaultCloningPartConfig('vector', plasmid),
        leftCut: { enzymeName: 'Acc65I', site: acc65i, treatment: 'none' as const, fillWith: { A: true, C: true, G: true, T: true } },
        rightCut: { enzymeName: 'BamHI', site: bamhi, treatment: 'none' as const, fillWith: { A: true, C: true, G: true, T: true } },
        selectedFragmentId: 'forward',
      },
      '#222',
    )!
    expect(vectorAccBam.leftEnzyme).toBe('Acc65I')
    expect(vectorAccBam.rightEnzyme).toBe('BamHI')

    const insertBamAcc = resolveCloningPart(
      {
        ...defaultCloningPartConfig('insert', plasmid),
        leftCut: { enzymeName: 'BamHI', site: bamhi, treatment: 'none' as const, fillWith: { A: true, C: true, G: true, T: true } },
        rightCut: { enzymeName: 'Acc65I', site: acc65i, treatment: 'none' as const, fillWith: { A: true, C: true, G: true, T: true } },
        selectedFragmentId: 'forward',
      },
      '#c00',
    )!
    expect(insertBamAcc.leftEnzyme).toBe('BamHI')
    expect(insertBamAcc.rightEnzyme).toBe('Acc65I')

    const insertAccOnly = resolveCloningPart(
      {
        ...defaultCloningPartConfig('insert', plasmid),
        leftCut: { enzymeName: 'Acc65I', site: acc65i, treatment: 'none' as const, fillWith: { A: true, C: true, G: true, T: true } },
        rightCut: { enzymeName: 'Acc65I', site: acc65i, treatment: 'none' as const, fillWith: { A: true, C: true, G: true, T: true } },
        selectedFragmentId: 'linearized',
      },
      '#09c',
    )!
    expect(insertAccOnly.leftEnzyme).toBe('Acc65I')
    expect(insertAccOnly.rightEnzyme).toBe('Acc65I')

    const ok = validateCloningAssembly(vectorAccBam, [insertBamAcc, insertAccOnly], [0, 1])
    expect(ok.ready).toBe(true)
    expect(ok.closed).toBe(true)

    const swapped = validateCloningAssembly(vectorAccBam, [insertBamAcc, insertAccOnly], [1, 0])
    expect(swapped.ready).toBe(false)
    expect(swapped.closed).toBe(false)
    expect(swapped.issues.length).toBeGreaterThan(0)
  })

  it('builds product diagrams that expose junction gaps for mismatched ends', () => {
    const plasmid = record(5880)
    const acc65i = site('Acc65I', 100, 'GTAC')
    const bamhi = site('BamHI', 390, 'GATC')

    const vector = resolveCloningPart(
      {
        ...defaultCloningPartConfig('vector', plasmid),
        leftCut: { enzymeName: 'Acc65I', site: acc65i, treatment: 'none' as const, fillWith: { A: true, C: true, G: true, T: true } },
        rightCut: { enzymeName: 'BamHI', site: bamhi, treatment: 'none' as const, fillWith: { A: true, C: true, G: true, T: true } },
        selectedFragmentId: 'forward',
      },
      '#222',
    )!
    const insertMatching = resolveCloningPart(
      {
        ...defaultCloningPartConfig('insert', plasmid),
        leftCut: { enzymeName: 'BamHI', site: bamhi, treatment: 'none' as const, fillWith: { A: true, C: true, G: true, T: true } },
        rightCut: { enzymeName: 'Acc65I', site: acc65i, treatment: 'none' as const, fillWith: { A: true, C: true, G: true, T: true } },
        selectedFragmentId: 'forward',
      },
      '#c00',
    )!
    const insertAccOnly = resolveCloningPart(
      {
        ...defaultCloningPartConfig('insert', plasmid),
        leftCut: { enzymeName: 'Acc65I', site: acc65i, treatment: 'none' as const, fillWith: { A: true, C: true, G: true, T: true } },
        rightCut: { enzymeName: 'Acc65I', site: acc65i, treatment: 'none' as const, fillWith: { A: true, C: true, G: true, T: true } },
        selectedFragmentId: 'linearized',
      },
      '#09c',
    )!

    expect(buildCloningProductDiagram(null, [], [])).toEqual({
      layout: 'empty',
      segments: [],
      junctionSealed: [],
    })

    const vectorOnly = buildCloningProductDiagram(vector, [], [])
    expect(vectorOnly.layout).toBe('circular')
    expect(vectorOnly.segments).toHaveLength(1)
    expect(vectorOnly.segments[0]!.role).toBe('vector')

    const insertOnly = buildCloningProductDiagram(null, [insertMatching], [0])
    expect(insertOnly.layout).toBe('linear')
    expect(insertOnly.segments).toHaveLength(1)
    expect(insertOnly.junctionSealed).toEqual([])

    const sealed = buildCloningProductDiagram(vector, [insertMatching], [0])
    expect(sealed.layout).toBe('circular')
    expect(sealed.segments.map((part) => part.role)).toEqual(['vector', 'insert'])
    expect(sealed.junctionSealed).toEqual([true, true])

    const oneBad = buildCloningProductDiagram(vector, [insertAccOnly], [0])
    expect(oneBad.layout).toBe('circular')
    expect(oneBad.junctionSealed.filter((sealed) => !sealed).length).toBeGreaterThan(0)
    expect(oneBad.junctionSealed.some(Boolean)).toBe(true)

    const bothBad = buildCloningProductDiagram(vector, [insertMatching, insertAccOnly], [1, 0])
    expect(bothBad.layout).toBe('circular')
    expect(bothBad.segments).toHaveLength(3)
    expect(bothBad.junctionSealed.filter((sealed) => !sealed).length).toBeGreaterThanOrEqual(2)
  })

  it('partially fills 5′ overhangs until a missing dNTP is required', () => {
    expect(countPartialFillBases('GATC', { A: false, C: false, G: true, T: false })).toBe(1)
    expect(countPartialFillBases('GATC', { A: true, C: false, G: true, T: false })).toBe(2)
    expect(countPartialFillBases('GATC', { A: true, C: true, G: true, T: true })).toBe(4)
    expect(countPartialFillBases('GATC', { A: false, C: false, G: false, T: false })).toBe(0)

    const plasmid = record(5880)
    const bamhi = site('BamHI', 390, 'GATC')
    const acc65i = site('Acc65I', 100, 'GTAC')

    const untreated = resolveCloningPart(
      {
        ...defaultCloningPartConfig('vector', plasmid),
        leftCut: {
          enzymeName: 'Acc65I',
          site: acc65i,
          treatment: 'none',
          fillWith: { A: true, C: true, G: true, T: true },
        },
        rightCut: {
          enzymeName: 'BamHI',
          site: bamhi,
          treatment: 'none',
          fillWith: { A: true, C: true, G: true, T: true },
        },
        selectedFragmentId: 'forward',
      },
      '#222',
    )!
    expect(untreated.downstreamOverhang?.sequence).toBe('GATC')
    expect(untreated.downstreamOverhang?.length).toBe(4)
    expect(untreated.dnaEnds.downstream.stickiness).toBe(4)

    const partial = resolveCloningPart(
      {
        ...defaultCloningPartConfig('vector', plasmid),
        leftCut: {
          enzymeName: 'Acc65I',
          site: acc65i,
          treatment: 'none',
          fillWith: { A: true, C: true, G: true, T: true },
        },
        rightCut: {
          enzymeName: 'BamHI',
          site: bamhi,
          treatment: 'fill',
          fillWith: { A: false, C: false, G: true, T: false },
        },
        selectedFragmentId: 'forward',
      },
      '#222',
    )!
    expect(partial.downstreamOverhang?.sequence).toBe('ATC')
    expect(partial.downstreamOverhang?.length).toBe(3)
    expect(partial.dnaEnds.downstream.stickiness).toBe(3)

    const full = resolveCloningPart(
      {
        ...defaultCloningPartConfig('vector', plasmid),
        leftCut: {
          enzymeName: 'Acc65I',
          site: acc65i,
          treatment: 'none',
          fillWith: { A: true, C: true, G: true, T: true },
        },
        rightCut: {
          enzymeName: 'BamHI',
          site: bamhi,
          treatment: 'fill',
          fillWith: { A: true, C: true, G: true, T: true },
        },
        selectedFragmentId: 'forward',
      },
      '#222',
    )!
    expect(full.downstreamOverhang?.type).toBe('blunt')
    expect(full.dnaEnds.downstream.stickiness).toBe(0)

    const removed = resolveCloningPart(
      {
        ...defaultCloningPartConfig('vector', plasmid),
        leftCut: {
          enzymeName: 'Acc65I',
          site: acc65i,
          treatment: 'none',
          fillWith: { A: true, C: true, G: true, T: true },
        },
        rightCut: {
          enzymeName: 'BamHI',
          site: bamhi,
          treatment: 'remove',
          fillWith: { A: true, C: true, G: true, T: true },
        },
        selectedFragmentId: 'forward',
      },
      '#222',
    )!
    expect(removed.downstreamOverhang?.type).toBe('blunt')
    expect(removed.dnaEnds.downstream.stickiness).toBe(0)
    expect(removed.length).toBe(untreated.length - 4)
  })

  it('previews Acc65I sticky ends with gray duplex and white filled bases', () => {
    // ...tcg|GTACC... / ...agc|CATGG... around an Acc65I site
    const prefix = 'A'.repeat(100)
    const sequence = `${prefix}TCGGTACCTT${'A'.repeat(100)}`
    const recognitionStart = prefix.length + 2 // G of GGTACC in ...TCGGTACC...
    const acc65i: RestrictionSite = {
      enzyme: fakeEnzyme('Acc65I', 'GGTACC', 'GTAC'),
      start: recognitionStart,
      end: recognitionStart + 6,
      match: 'GGTACC',
      cutTop: recognitionStart + 1,
      cutBottom: recognitionStart + 5,
    }

    const full = buildDntpFillPreview(acc65i, sequence, {
      A: true,
      C: true,
      G: true,
      T: true,
    })
    expect(full.overhangType).toBe("5'")
    expect(full.leftFilled).toBe(4)
    expect(full.rightFilled).toBe(4)
    expect(full.leftTop.filter((g) => g.role === 'filled').map((g) => g.char).join('')).toBe('gtac')
    expect(full.leftBottom.filter((g) => g.role === 'overhang').map((g) => g.char).join('')).toBe('catg')
    expect(full.rightTop.filter((g) => g.role === 'overhang').map((g) => g.char).join('')).toBe('gtac')
    expect(full.rightBottom.filter((g) => g.role === 'filled').map((g) => g.char).join('')).toBe('catg')
    expect(full.leftTop.filter((g) => g.role === 'duplex').map((g) => g.char).join('')).toContain('tcg')

    const onlyG = buildDntpFillPreview(acc65i, sequence, {
      A: false,
      C: false,
      G: true,
      T: false,
    })
    expect(onlyG.leftFilled).toBe(1)
    expect(onlyG.rightFilled).toBe(0)
    expect(onlyG.leftTop.filter((g) => g.role === 'filled').map((g) => g.char).join('')).toBe('g')
    expect(onlyG.rightBottom.filter((g) => g.role === 'filled')).toHaveLength(0)
  })

  it('resolves degenerate catalog overhangs (ArsI NNNNN, DraIII NNN) from plasmid DNA', () => {
    // ArsI: GACNNNNNNTTYG(8/13) — cutTop/Bottom are 21/26 from recognition start → 5′ ATACG.
    const arsPrefix = 'C'.repeat(40)
    const arsRecognition = 'GACAAAAAATTCG'
    const arsAfter = `${'G'.repeat(8)}ATACG${'T'.repeat(20)}GGATCC${'A'.repeat(40)}`
    const arsSequence = `${arsPrefix}${arsRecognition}${arsAfter}`
    const arsStart = arsPrefix.length
    const arsI: RestrictionSite = {
      enzyme: {
        ...fakeEnzyme('ArsI', 'GACNNNNNNTTYG', 'NNNNN'),
        cutTop: 21,
        cutBottom: 26,
        type: 'IIS',
        overhang: { type: "5'", sequence: 'NNNNN', length: 5 },
      },
      start: arsStart,
      end: arsStart + arsRecognition.length,
      match: arsRecognition,
      cutTop: arsStart + 21,
      cutBottom: arsStart + 26,
    }
    expect(arsSequence.slice(arsI.cutTop, arsI.cutBottom)).toBe('ATACG')

    const arsPreview = buildDntpFillPreview(arsI, arsSequence, {
      A: true,
      C: true,
      G: true,
      T: true,
    })
    expect(arsPreview.overhangSequence).toBe('ATACG')
    expect(arsPreview.leftFilled).toBe(5)
    expect(arsPreview.rightFilled).toBe(5)

    const bamStart = arsSequence.indexOf('GGATCC')
    const bamhi: RestrictionSite = {
      enzyme: fakeEnzyme('BamHI', 'GGATCC', 'GATC'),
      start: bamStart,
      end: bamStart + 6,
      match: 'GGATCC',
      cutTop: bamStart + 1,
      cutBottom: bamStart + 5,
    }
    const arsPlasmid: SequenceRecord = { ...record(arsSequence.length), sequence: arsSequence }
    const filledArs = resolveCloningPart(
      {
        ...defaultCloningPartConfig('vector', arsPlasmid),
        leftCut: {
          enzymeName: 'ArsI',
          site: arsI,
          treatment: 'fill',
          fillWith: { A: true, C: true, G: true, T: true },
        },
        rightCut: {
          enzymeName: 'BamHI',
          site: bamhi,
          treatment: 'none',
          fillWith: { A: true, C: true, G: true, T: true },
        },
        selectedFragmentId: 'forward',
      },
      '#222',
    )!
    expect(filledArs.upstreamOverhang?.type).toBe('blunt')
    expect(filledArs.dnaEnds.upstream.stickiness).toBe(0)

    // DraIII: CACNNN/GTG — 3′ overhang; bases come from the matched NNN (here ATC).
    const draPrefix = 'G'.repeat(30)
    const draRecognition = 'CACATCGTG'
    const draSequence = `${draPrefix}${draRecognition}${'A'.repeat(40)}`
    const draStart = draPrefix.length
    const draIII: RestrictionSite = {
      enzyme: {
        ...fakeEnzyme('DraIII', 'CACNNNGTG', 'NNN'),
        cutTop: 6,
        cutBottom: 3,
        overhang: { type: "3'", sequence: 'NNN', length: 3 },
      },
      start: draStart,
      end: draStart + 9,
      match: draRecognition,
      cutTop: draStart + 6,
      cutBottom: draStart + 3,
    }
    const draPreview = buildDntpFillPreview(draIII, draSequence, {
      A: true,
      C: true,
      G: true,
      T: true,
    })
    expect(draPreview.overhangSequence).toBe('ATC')
    expect(draPreview.overhangType).toBe("3'")
    // Polymerase fill-in does not extend 3′ overhangs.
    expect(draPreview.leftFilled).toBe(0)
    expect(draPreview.rightFilled).toBe(0)

    const untreatedDra = resolveCloningPart(
      {
        ...defaultCloningPartConfig('vector', { ...record(draSequence.length), sequence: draSequence }),
        leftCut: {
          enzymeName: 'DraIII',
          site: draIII,
          treatment: 'none',
          fillWith: { A: true, C: true, G: true, T: true },
        },
        rightCut: {
          enzymeName: 'DraIII',
          site: draIII,
          treatment: 'none',
          fillWith: { A: true, C: true, G: true, T: true },
        },
        selectedFragmentId: 'linearized',
      },
      '#222',
    )!
    expect(untreatedDra.upstreamOverhang?.sequence).toBe('ATC')
    expect(untreatedDra.downstreamOverhang?.sequence).toBe('ATC')
    const sticky = formatStickyEndPreview(
      untreatedDra.sequence,
      untreatedDra.dnaEnds,
      'upstream',
      6,
      untreatedDra.upstreamOverhang?.sequence,
    )
    expect(sticky.bottom.toUpperCase()).toContain('TAG')
  })

  it('assembles a product with parental primers, history lineages, and vector origin numbering', () => {
    const vectorSeq = `${'G'.repeat(100)}GGATCC${'C'.repeat(200)}GGTACC${'T'.repeat(500)}`
    const insertSeq = `${'A'.repeat(50)}GGATCC${'N'.repeat(80)}GGTACC${'A'.repeat(50)}`.replace(/N/g, 'A')
    // Use unique bases so origin rotation is observable: vector starts with G-run.
    const vectorRecord: SequenceRecord = {
      ...record(vectorSeq.length),
      id: 'vector',
      name: 'VectorParent',
      traceFiles: [{ ...traceRecordFromSequence('ACGT', 'parent.ab1'), enabled: false }],
      sequence: vectorSeq,
      primers: [
        {
          id: 'p1',
          name: 'VecPrimer',
          sequence: 'GGGGGGGGGG',
          color: '#00f',
          bindings: [
            {
              strand: 'forward',
              templateStart: 0,
              templateEnd: 10,
              components: [{ primerBases: 'GGGGGGGGGG', templateStart: 0, templateEnd: 10 }],
            },
          ],
        },
      ],
      features: [
        {
          id: 'f1',
          name: 'OriMarker',
          type: 'misc_feature',
          color: '#111',
          locations: [{ start: 0, end: 20, strand: 'forward' }],
        },
      ],
      history: {
        id: 'h-vector',
        name: 'VectorParent.dna',
        seqLen: vectorSeq.length,
        circular: true,
        operation: 'invalid',
        resurrectable: false,
        hideHistory: false,
        oligos: [],
        regeneratedSites: [],
        inputSummaries: [],
        features: [],
        children: [],
      },
    }

    const insertRecord: SequenceRecord = {
      ...record(insertSeq.length),
      id: 'insert',
      name: 'InsertParent',
      sequence: insertSeq,
      topology: 'circular',
      primers: [
        {
          id: 'p2',
          name: 'InsPrimer',
          sequence: 'AAAAAAAAAA',
          color: '#f00',
          bindings: [
            {
              strand: 'forward',
              templateStart: 60,
              templateEnd: 70,
              components: [{ primerBases: 'AAAAAAAAAA', templateStart: 60, templateEnd: 70 }],
            },
          ],
        },
      ],
      history: {
        id: 'h-insert',
        name: 'InsertParent.dna',
        seqLen: insertSeq.length,
        circular: true,
        operation: 'invalid',
        resurrectable: false,
        hideHistory: false,
        oligos: [],
        regeneratedSites: [],
        inputSummaries: [],
        features: [],
        children: [],
      },
    }

    const bamhiV = site('BamHI', 100, 'GATC')
    bamhiV.cutTop = 101
    bamhiV.cutBottom = 105
    bamhiV.start = 100
    bamhiV.end = 106
    const acc65iV = site('Acc65I', 306, 'GTAC')
    acc65iV.cutTop = 307
    acc65iV.cutBottom = 311
    acc65iV.start = 306
    acc65iV.end = 312

    const bamhiI = site('BamHI', 50, 'GATC')
    bamhiI.cutTop = 51
    bamhiI.cutBottom = 55
    bamhiI.start = 50
    bamhiI.end = 56
    const acc65iI = site('Acc65I', 136, 'GTAC')
    acc65iI.cutTop = 137
    acc65iI.cutBottom = 141
    acc65iI.start = 136
    acc65iI.end = 142

    const vectorPart = resolveCloningPart(
      {
        ...defaultCloningPartConfig('vector', vectorRecord),
        leftCut: {
          enzymeName: 'BamHI',
          site: bamhiV,
          treatment: 'none',
          fillWith: { A: true, C: true, G: true, T: true },
        },
        rightCut: {
          enzymeName: 'Acc65I',
          site: acc65iV,
          treatment: 'none',
          fillWith: { A: true, C: true, G: true, T: true },
        },
        // Major arc includes the origin (BamHI←…origin…→Acc65I as Acc→Bam walk).
        selectedFragmentId: 'reverse',
      },
      '#222',
    )!
    expect(vectorPart.fragment.wraps).toBe(true)
    expect(vectorPart.originOffsetInFragment).not.toBeNull()
    expect(vectorPart.primers.some((primer) => primer.name === 'VecPrimer')).toBe(true)

    const insertPart = resolveCloningPart(
      {
        ...defaultCloningPartConfig('insert', insertRecord),
        leftCut: {
          enzymeName: 'BamHI',
          site: bamhiI,
          treatment: 'none',
          fillWith: { A: true, C: true, G: true, T: true },
        },
        rightCut: {
          enzymeName: 'Acc65I',
          site: acc65iI,
          treatment: 'none',
          fillWith: { A: true, C: true, G: true, T: true },
        },
        selectedFragmentId: 'forward',
      },
      '#c00',
    )!
    expect(insertPart.leftEnzyme).toBe('BamHI')
    expect(insertPart.rightEnzyme).toBe('Acc65I')
    expect(insertPart.primers.some((primer) => primer.name === 'InsPrimer')).toBe(true)

    const validation = validateCloningAssembly(vectorPart, [insertPart], [0])
    expect(validation.ready).toBe(true)
    expect(validation.closed).toBe(true)

    const { record: product, partSpans } = assembleRestrictionCloningProduct({
      vector: vectorPart,
      inserts: [insertPart],
      insertOrder: [0],
      productName: 'Cloned.dna',
    })

    expect(product.topology).toBe('circular')
    // Vector origin numbering: product should start with the parental G-run, not the cut site.
    expect(product.sequence.startsWith('G'.repeat(20))).toBe(true)
    // Part spans are in the origin-restored frame and cover the full product.
    expect(partSpans.some((span) => span.role === 'vector' && span.start === 0)).toBe(true)
    expect(partSpans.reduce((sum, span) => sum + (span.end - span.start), 0)).toBe(product.sequence.length)
    expect(product.primers.map((primer) => primer.name).sort()).toEqual(['InsPrimer', 'VecPrimer'])
    expect(product.features.some((feature) => feature.name === 'OriMarker')).toBe(true)
    expect(product.history?.features.some((feature) => feature.name === 'OriMarker')).toBe(true)
    expect(product.history?.operation).toBe('insertFragment')
    expect(product.history?.children).toHaveLength(2)
    expect(product.history?.children[0]?.name).toContain('VectorParent')
    expect(product.history?.children[0]?.traceFiles?.[0]).toMatchObject({ fileName: 'parent.ab1', enabled: false })
    expect(product.history?.children[1]?.name).toContain('InsertParent')
    expect(product.history?.inputSummaries.some((summary) => summary.manipulation === 'replace')).toBe(
      true,
    )
    expect(product.history?.inputSummaries.some((summary) => summary.manipulation === 'insert')).toBe(
      true,
    )
  })
})

describe('restriction fragment deletion', () => {
  const allDntps = { A: true, C: true, G: true, T: true }

  function deletionVector(
    leftSite: RestrictionSite,
    rightSite: RestrictionSite,
    treatment: 'none' | 'fill' | 'remove' = 'none',
    plasmid = record(5880),
  ) {
    return resolveCloningPart(
      {
        ...defaultCloningPartConfig('vector', plasmid),
        leftCut: { enzymeName: leftSite.enzyme.name, site: leftSite, treatment, fillWith: allDntps },
        rightCut: {
          enzymeName: rightSite.enzyme.name,
          site: rightSite,
          treatment,
          fillWith: allDntps,
        },
        selectedFragmentId: 'forward',
      },
      '#222',
    )!
  }

  it('describes overhangs for the compatibility verdict', () => {
    expect(formatOverhangLabel(null)).toBe('unknown end')
    expect(formatOverhangLabel({ type: "5'", sequence: 'gatc', length: 4, enzymeName: 'BamHI' })).toBe(
      "BamHI 5' GATC",
    )
    expect(formatOverhangLabel({ type: 'blunt', sequence: null, length: 0, enzymeName: 'SmaI' })).toBe(
      'SmaI blunt',
    )
  })

  it('asks for cuts before anything is configured', () => {
    const validation = validateFragmentDeletion(null)
    expect(validation.ready).toBe(false)
    expect(validation.message).toContain('two restriction cuts')
  })

  it('re-ligates matching sticky ends and reports the removed span', () => {
    const vector = deletionVector(site('BamHI', 100, 'GATC'), site('BamHI', 4000, 'GATC'))
    expect(vector.length).toBe(3904)

    const validation = validateFragmentDeletion(vector)
    expect(validation.ready).toBe(true)
    expect(validation.closed).toBe(true)
    // Overhang bases are shared once the ends anneal, so the loop is 4 bp shorter.
    expect(validation.productLength).toBe(3900)
    expect(validation.message).toContain(`${(1980).toLocaleString()} bp removed`)
  })

  it('refuses to ligate mismatched sticky ends', () => {
    const vector = deletionVector(site('Acc65I', 100, 'GTAC'), site('BamHI', 4000, 'GATC'))
    const validation = validateFragmentDeletion(vector)
    expect(validation.ready).toBe(false)
    expect(validation.closed).toBe(false)
    expect(validation.issues).toHaveLength(1)
    expect(validation.message).toContain('do not ligate')
    expect(validation.message).toContain("Acc65I 5' GTAC")
    expect(validation.message).toContain("BamHI 5' GATC")
    expect(validation.message).toContain('Fill in or remove')
    expect(validation.message).toContain('same treatment')
  })

  it('rejects mixed fill and remove on same-polarity ends', () => {
    const leftSite = site('Acc65I', 100, 'GTAC')
    const rightSite = site('BamHI', 4000, 'GATC')
    const config = {
      ...defaultCloningPartConfig('vector', record(5880)),
      leftCut: {
        enzymeName: leftSite.enzyme.name,
        site: leftSite,
        treatment: 'fill' as const,
        fillWith: allDntps,
      },
      rightCut: {
        enzymeName: rightSite.enzyme.name,
        site: rightSite,
        treatment: 'remove' as const,
        fillWith: allDntps,
      },
      selectedFragmentId: 'forward',
    }
    const vector = resolveCloningPart(config, '#222')!
    const validation = validateFragmentDeletion(vector, config)
    expect(validation.ready).toBe(false)
    expect(validation.message).toContain('Cannot fill one 5′ overhang and remove the other')
  })

  it('tells the user to chew back rather than fill 3′ overhangs', () => {
    const threePrime = (name: string, cut: number, overhangSeq: string): RestrictionSite => {
      const base = site(name, cut, overhangSeq)
      return {
        ...base,
        enzyme: {
          ...base.enzyme,
          overhang: { type: "3'", sequence: overhangSeq, length: overhangSeq.length },
        },
        cutTop: cut + 5,
        cutBottom: cut + 1,
      }
    }
    const vector = deletionVector(
      threePrime('AatII', 100, 'ACGT'),
      threePrime('KpnI', 4000, 'GTAC'),
    )
    const validation = validateFragmentDeletion(vector)
    expect(validation.ready).toBe(false)
    expect(validation.message).toContain('3′ overhangs cannot be filled in')
  })

  it('accepts mismatched ends once both overhangs are blunted', () => {
    const filled = deletionVector(site('Acc65I', 100, 'GTAC'), site('BamHI', 4000, 'GATC'), 'fill')
    expect(filled.upstreamOverhang?.type).toBe('blunt')
    expect(filled.downstreamOverhang?.type).toBe('blunt')
    const validation = validateFragmentDeletion(filled)
    expect(validation.ready).toBe(true)
    expect(validation.closed).toBe(true)
    expect(validation.productLength).toBe(filled.length)

    const chewed = deletionVector(site('Acc65I', 100, 'GTAC'), site('BamHI', 4000, 'GATC'), 'remove')
    expect(validateFragmentDeletion(chewed).ready).toBe(true)
  })

  it('assembles a circular deletion product and ignores configured inserts', () => {
    const vector = deletionVector(site('BamHI', 100, 'GATC'), site('BamHI', 4000, 'GATC'))
    const strayInsert = deletionVector(site('BamHI', 100, 'GATC'), site('BamHI', 500, 'GATC'))

    const { record: product, validation } = assembleRestrictionCloningProduct({
      vector,
      inserts: [strayInsert],
      insertOrder: [0],
      productName: 'Deleted.dna',
      mode: 'delete-fragment',
    })

    expect(validation.ready).toBe(true)
    expect(product.topology).toBe('circular')
    expect(product.sequence.length).toBe(3900)
    expect(product.description).toBe('Restriction fragment deletion')
    expect(product.history?.operation).toBe('deleteFragment')
    expect(product.history?.children).toHaveLength(1)
  })

  it('keeps the insert pathway on the default mode', () => {
    const vector = deletionVector(site('BamHI', 100, 'GATC'), site('BamHI', 4000, 'GATC'))
    const { record: product } = assembleRestrictionCloningProduct({
      vector,
      inserts: [],
      insertOrder: [],
      productName: 'Cloned.dna',
    })
    expect(product.history?.operation).toBe('insertFragment')
    expect(product.description).toBe('Restriction cloning product')
  })

  it('writes bacterial strain and sequence author onto the product construct', () => {
    const vector = deletionVector(site('BamHI', 100, 'GATC'), site('BamHI', 4000, 'GATC'))
    const { record: product } = assembleRestrictionCloningProduct({
      vector,
      inserts: [],
      insertOrder: [],
      productName: 'Deleted.dna',
      mode: 'delete-fragment',
      constructOverrides: {
        bacterialTransformationStrain: 'stbl3',
        sequenceAuthor: 'Lab User',
        hostMethylation: { dam: true, dcm: true, ecoKI: false },
      },
    })
    expect(product.construct.bacterialTransformationStrain).toBe('stbl3')
    expect(product.construct.sequenceAuthor).toBe('Lab User')
    expect(product.construct.hostMethylation).toEqual({ dam: true, dcm: true, ecoKI: false })
    expect(product.construct.syntheticDna).toBe(true)
  })
})

describe('restriction site destruction', () => {
  const allDntps = { A: true, C: true, G: true, T: true }

  function destroyConfig(
    cutSite: RestrictionSite,
    treatment: 'none' | 'fill' | 'remove',
    plasmid = record(5880),
  ) {
    return {
      ...defaultCloningPartConfig('vector', plasmid),
      leftCut: {
        enzymeName: cutSite.enzyme.name,
        site: cutSite,
        treatment,
        fillWith: allDntps,
      },
      rightCut: {
        enzymeName: cutSite.enzyme.name,
        site: cutSite,
        treatment,
        fillWith: allDntps,
      },
      selectedFragmentId: 'linearized' as const,
    }
  }

  it('refuses untreated sticky ends that would regenerate the site', () => {
    const bamhi = site('BamHI', 390, 'GATC')
    const config = destroyConfig(bamhi, 'none')
    const part = resolveCloningPart(config, '#222')!
    const validation = validateSiteDestruction(part, config)
    expect(validation.ready).toBe(false)
    expect(validation.message).toContain('regenerate')
  })

  it('destroys BamHI after filling both overhangs', () => {
    const bamhi = site('BamHI', 390, 'GATC')
    const config = destroyConfig(bamhi, 'fill')
    const part = resolveCloningPart(config, '#222')!
    expect(part.upstreamOverhang?.type).toBe('blunt')
    expect(part.downstreamOverhang?.type).toBe('blunt')
    expect(part.length).toBe(5880)

    const validation = validateSiteDestruction(part, config)
    expect(validation.ready).toBe(true)
    expect(validation.closed).toBe(true)
    expect(validation.message).toContain('BamHI destroyed')
    expect(validation.productLength).toBe(5880)

    const { record: product } = assembleRestrictionCloningProduct({
      vector: part,
      inserts: [],
      insertOrder: [],
      productName: 'Destroyed.dna',
      mode: 'destroy-site',
    })
    expect(product.topology).toBe('circular')
    expect(product.sequence.length).toBe(5880)
    expect(product.history?.operation).toBe('destroySite')
    expect(product.history?.regeneratedSites).toEqual([])
    expect(product.description).toBe('Restriction site destruction')
  })

  it('destroys BamHI after removing overhangs and shortens the product', () => {
    const bamhi = site('BamHI', 390, 'GATC')
    const config = destroyConfig(bamhi, 'remove')
    const part = resolveCloningPart(config, '#222')!
    expect(part.length).toBe(5880 - 8)
    const validation = validateSiteDestruction(part, config)
    expect(validation.ready).toBe(true)
    expect(validation.productLength).toBe(5872)
  })

  it('rejects blunt cutters that cannot be destroyed by fill/remove', () => {
    const sma: RestrictionSite = {
      enzyme: {
        ...fakeEnzyme('SmaI', 'CCCGGG', ''),
        cutTop: 3,
        cutBottom: 3,
        overhang: { type: 'blunt', sequence: null, length: 0 },
      },
      start: 200,
      end: 206,
      match: 'CCCGGG',
      cutTop: 203,
      cutBottom: 203,
    }
    const config = destroyConfig(sma, 'fill')
    const part = resolveCloningPart(config, '#222')!
    const validation = validateSiteDestruction(part, config)
    expect(validation.ready).toBe(false)
    expect(validation.message).toContain('blunt')
  })
})

describe('same-polarity overhang treatment sync', () => {
  const allDntps = { A: true, C: true, G: true, T: true }
  const onlyG = { A: false, C: false, G: true, T: false }

  function threePrimeSite(name: string, cut: number, overhangSeq: string): RestrictionSite {
    const base = site(name, cut, overhangSeq)
    return {
      ...base,
      enzyme: {
        ...base.enzyme,
        overhang: { type: "3'", sequence: overhangSeq, length: overhangSeq.length },
      },
      cutTop: cut + 5,
      cutBottom: cut + 1,
    }
  }

  it('links fill/remove when both ends are 5′', () => {
    const leftSite = site('Acc65I', 100, 'GTAC')
    const rightSite = site('BamHI', 400, 'GATC')
    const base = {
      ...defaultCloningPartConfig('vector', record(2000)),
      leftCut: {
        enzymeName: leftSite.enzyme.name,
        site: leftSite,
        treatment: 'none' as const,
        fillWith: allDntps,
      },
      rightCut: {
        enzymeName: rightSite.enzyme.name,
        site: rightSite,
        treatment: 'none' as const,
        fillWith: allDntps,
      },
    }
    expect(endsShareOverhangPolarity(base.leftCut, base.rightCut)).toBe(true)
    expect(cutEndOverhangPolarity(base.leftCut)).toBe("5'")

    const filled = applyCutEndTreatment(base, 'left', {
      ...base.leftCut,
      treatment: 'fill',
      fillWith: onlyG,
    })
    expect(filled.leftCut.treatment).toBe('fill')
    expect(filled.rightCut.treatment).toBe('fill')
    expect(filled.rightCut.fillWith).toEqual(onlyG)

    const chewed = applyCutEndTreatment(filled, 'right', {
      ...filled.rightCut,
      treatment: 'remove',
    })
    expect(chewed.leftCut.treatment).toBe('remove')
    expect(chewed.rightCut.treatment).toBe('remove')
  })

  it('does not link a 5′ end to a 3′ end', () => {
    const leftSite = site('BamHI', 100, 'GATC')
    const rightSite = threePrimeSite('KpnI', 400, 'GTAC')
    const base = {
      ...defaultCloningPartConfig('vector', record(2000)),
      leftCut: {
        enzymeName: leftSite.enzyme.name,
        site: leftSite,
        treatment: 'none' as const,
        fillWith: allDntps,
      },
      rightCut: {
        enzymeName: rightSite.enzyme.name,
        site: rightSite,
        treatment: 'none' as const,
        fillWith: allDntps,
      },
    }
    expect(endsShareOverhangPolarity(base.leftCut, base.rightCut)).toBe(false)

    const filled = applyCutEndTreatment(base, 'left', {
      ...base.leftCut,
      treatment: 'fill',
    })
    expect(filled.leftCut.treatment).toBe('fill')
    expect(filled.rightCut.treatment).toBe('none')
  })

  it('reconciles conflicting treatments after a matching site is chosen', () => {
    const leftSite = site('Acc65I', 100, 'GTAC')
    const rightSite = site('BamHI', 400, 'GATC')
    const conflicting = {
      ...defaultCloningPartConfig('vector', record(2000)),
      leftCut: {
        enzymeName: leftSite.enzyme.name,
        site: leftSite,
        treatment: 'fill' as const,
        fillWith: allDntps,
      },
      rightCut: {
        enzymeName: rightSite.enzyme.name,
        site: rightSite,
        treatment: 'remove' as const,
        fillWith: allDntps,
      },
    }
    expect(samePolarityTreatmentsConflict(conflicting.leftCut, conflicting.rightCut)).toBe(true)
    const synced = synchronizeSamePolarityTreatments(conflicting)
    expect(synced.leftCut.treatment).toBe('fill')
    expect(synced.rightCut.treatment).toBe('fill')
    expect(samePolarityTreatmentsConflict(synced.leftCut, synced.rightCut)).toBe(false)
  })
})

describe('linear ligation', () => {
  const allDntps = { A: true, C: true, G: true, T: true }

  function part(
    leftSite: RestrictionSite,
    rightSite: RestrictionSite,
    fragmentId: string,
    plasmid = record(5880),
  ) {
    return resolveCloningPart(
      {
        ...defaultCloningPartConfig('insert', plasmid),
        leftCut: {
          enzymeName: leftSite.enzyme.name,
          site: leftSite,
          treatment: 'none',
          fillWith: allDntps,
        },
        rightCut: {
          enzymeName: rightSite.enzyme.name,
          site: rightSite,
          treatment: 'none',
          fillWith: allDntps,
        },
        selectedFragmentId: fragmentId,
      },
      '#c00',
    )!
  }

  it('requires at least two fragments', () => {
    const bamA = site('BamHI', 100, 'GATC')
    const bamB = site('BamHI', 4000, 'GATC')
    const only = part(bamA, bamB, 'forward')
    const validation = validateLinearLigation([only], [0])
    expect(validation.ready).toBe(false)
    expect(validation.message).toContain('at least two')
  })

  it('accepts a linear product when terminal ends do not close', () => {
    const eco = site('EcoRI', 100, 'AATT')
    eco.enzyme = {
      ...eco.enzyme,
      recognition: 'GAATTC',
      notation: 'GAATTC',
      cutTop: 1,
      cutBottom: 5,
    }
    eco.end = eco.start + 6
    eco.cutTop = eco.start + 1
    eco.cutBottom = eco.start + 5
    eco.match = 'GAATTC'
    const bam = site('BamHI', 4000, 'GATC')

    // Fragment A: EcoRI → BamHI; Fragment B: BamHI → EcoRI would close.
    // Use BamHI → BamHI second fragment so middle seals but ends stay open? 
    // Better: A ends BamHI, B starts BamHI, B ends Acc65I, A starts EcoRI → linear.
    const acc = site('Acc65I', 2000, 'GTAC')
    const fragA = part(eco, bam, 'forward')
    const fragB = part(bam, acc, 'forward')
    const validation = validateLinearLigation([fragA, fragB], [0, 1])
    expect(validation.ready).toBe(true)
    expect(validation.closed).toBe(false)
    expect(validation.message).toContain('Linear product')

    const { record: product } = assembleRestrictionCloningProduct({
      inserts: [fragA, fragB],
      insertOrder: [0, 1],
      productName: 'Ligated.dna',
      mode: 'linear-ligation',
    })
    expect(product.topology).toBe('linear')
    expect(product.description).toBe('Linear ligation product')
    expect(product.history?.operation).toBe('ligateFragments')
    expect(product.history?.children).toHaveLength(2)
  })

  it('circularizes when terminal ends match', () => {
    const bamA = site('BamHI', 100, 'GATC')
    const bamB = site('BamHI', 4000, 'GATC')
    const fragA = part(bamA, bamB, 'forward')
    const fragB = part(bamA, bamB, 'reverse')
    const validation = validateLinearLigation([fragA, fragB], [0, 1])
    expect(validation.ready).toBe(true)
    expect(validation.closed).toBe(true)
    expect(validation.message).toContain('Circular product')

    const diagram = buildCloningProductDiagram(null, [fragA, fragB], [0, 1])
    expect(diagram.layout).toBe('circular')
    expect(diagram.junctionSealed.every(Boolean)).toBe(true)

    const { record: product } = assembleRestrictionCloningProduct({
      inserts: [fragA, fragB],
      insertOrder: [0, 1],
      productName: 'Ligated.dna',
      mode: 'linear-ligation',
    })
    expect(product.topology).toBe('circular')
  })

  it('keeps a one-cut linear flank plus a one-cut circular digest linear', () => {
    const bam = site('BamHI', 100, 'GATC')
    const linearSource = record(1000)
    linearSource.name = 'linear source'
    linearSource.topology = 'linear'
    const circularSource = record(1200)
    circularSource.name = 'circular source'

    const linearFlank = part(bam, bam, 'left-flank', linearSource)
    const circularDigest = part(bam, bam, 'linearized', circularSource)

    expect(linearFlank.length).toBe(Math.max(bam.cutTop, bam.cutBottom))
    expect(linearFlank.upstreamEnzyme).toBe('end')
    expect(linearFlank.upstreamOverhang?.type).toBe('blunt')
    expect(linearFlank.downstreamEnzyme).toBe('BamHI')

    const validation = validateLinearLigation([linearFlank, circularDigest], [0, 1])
    expect(validation.ready).toBe(true)
    expect(validation.closed).toBe(false)
    expect(validation.message).toContain('Linear product')

    const { record: product } = assembleRestrictionCloningProduct({
      inserts: [linearFlank, circularDigest],
      insertOrder: [0, 1],
      productName: 'Linear plus circular.dna',
      mode: 'linear-ligation',
    })
    expect(product.topology).toBe('linear')
  })

  it('rejects mismatched consecutive junctions', () => {
    const bam = site('BamHI', 100, 'GATC')
    const acc = site('Acc65I', 4000, 'GTAC')
    const eco = site('EcoRI', 2000, 'AATT')
    eco.enzyme = {
      ...eco.enzyme,
      recognition: 'GAATTC',
      notation: 'GAATTC',
      cutTop: 1,
      cutBottom: 5,
    }
    eco.end = eco.start + 6
    eco.cutTop = eco.start + 1
    eco.cutBottom = eco.start + 5
    eco.match = 'GAATTC'

    const fragA = part(bam, acc, 'forward')
    const fragB = part(eco, bam, 'forward')
    const validation = validateLinearLigation([fragA, fragB], [0, 1])
    expect(validation.ready).toBe(false)
    expect(validation.message).toContain('not compatible')
  })
})

describe('cloning orientation ambiguity', () => {
  const allDntps = { A: true, C: true, G: true, T: true }

  function bluntSite(name: string, cut: number): RestrictionSite {
    return {
      enzyme: {
        ...fakeEnzyme(name, 'CCCGGG', ''),
        cutTop: 3,
        cutBottom: 3,
        overhang: { type: 'blunt', sequence: null, length: 0 },
      },
      start: cut,
      end: cut + 6,
      match: 'CCCGGG',
      cutTop: cut + 3,
      cutBottom: cut + 3,
    }
  }

  function part(
    role: 'vector' | 'insert',
    leftSite: RestrictionSite,
    rightSite: RestrictionSite,
    fragmentId: string,
    plasmid = record(5880),
  ) {
    return resolveCloningPart(
      {
        ...defaultCloningPartConfig(role, plasmid),
        leftCut: {
          enzymeName: leftSite.enzyme.name,
          site: leftSite,
          treatment: 'none',
          fillWith: allDntps,
        },
        rightCut: {
          enzymeName: rightSite.enzyme.name,
          site: rightSite,
          treatment: 'none',
          fillWith: allDntps,
        },
        selectedFragmentId: fragmentId,
      },
      role === 'vector' ? '#222' : '#c00',
    )!
  }

  it('warns when blunt insert can clone either way, including vector self-ligation', () => {
    const left = bluntSite('SmaI', 100)
    const right = bluntSite('EcoRV', 4000)
    const vector = part('vector', left, right, 'forward')
    const insert = part('insert', left, right, 'reverse')
    expect(validateCloningAssembly(vector, [insert], [0]).ready).toBe(true)

    const ambiguity = analyzeCloningOrientationAmbiguity(vector, [insert])
    expect(ambiguity).not.toBeNull()
    // Self-ligated vector + insert forward + insert reverse.
    expect(ambiguity!.variantCount).toBe(3)
    expect(ambiguity!.includesVectorSelfLigation).toBe(true)
    expect(ambiguity!.singleInsertVariantCount).toBe(2)
    expect(ambiguity!.intendedProbability).toBeCloseTo(1 / 3)
    expect(ambiguity!.ambiguousInsertIndexes).toEqual([0])
    expect(ambiguity!.message).toContain('vector self-ligation')
    expect(ambiguity!.message).toContain('1 in 3')
  })

  it('warns when identical sticky ends allow either insert orientation', () => {
    const bamA = site('BamHI', 100, 'GATC')
    const bamB = site('BamHI', 4000, 'GATC')
    const vector = part('vector', bamA, bamB, 'forward')
    const insert = part('insert', bamA, bamB, 'reverse')
    expect(validateCloningAssembly(vector, [insert], [0]).ready).toBe(true)

    const ambiguity = analyzeCloningOrientationAmbiguity(vector, [insert])
    expect(ambiguity).not.toBeNull()
    expect(ambiguity!.variantCount).toBe(3)
    expect(ambiguity!.includesVectorSelfLigation).toBe(true)
    expect(ambiguity!.message).toContain('1 in 3')
  })

  it('stays silent for directional EcoRI / BamHI cloning', () => {
    const eco = site('EcoRI', 100, 'AATT')
    eco.enzyme = {
      ...eco.enzyme,
      recognition: 'GAATTC',
      notation: 'GAATTC',
      cutTop: 1,
      cutBottom: 5,
    }
    eco.end = eco.start + 6
    eco.cutTop = eco.start + 1
    eco.cutBottom = eco.start + 5
    eco.match = 'GAATTC'

    const bam = site('BamHI', 4000, 'GATC')
    const vector = part('vector', eco, bam, 'forward')
    // Insert must present BamHI upstream (to vector downstream BamHI) and EcoRI downstream.
    const insert = part('insert', bam, eco, 'forward')
    const validation = validateCloningAssembly(vector, [insert], [0])
    expect(validation.ready).toBe(true)

    expect(analyzeCloningOrientationAmbiguity(vector, [insert])).toBeNull()
  })

  it('counts self-ligation, single-insert, and order/orientation products for two blunt inserts', () => {
    const left = bluntSite('SmaI', 100)
    const right = bluntSite('PvuII', 4000)
    const vector = part('vector', left, right, 'forward')
    const insert1 = part('insert', left, right, 'reverse')
    const insert2 = part('insert', left, right, 'reverse')
    expect(validateCloningAssembly(vector, [insert1, insert2], [0, 1]).ready).toBe(true)

    const ambiguity = analyzeCloningOrientationAmbiguity(vector, [insert1, insert2])
    expect(ambiguity).not.toBeNull()
    // 1 self + 2 inserts × 2 orients + 2 orders × 4 orients = 1 + 4 + 8 = 13
    expect(ambiguity!.variantCount).toBe(13)
    expect(ambiguity!.includesVectorSelfLigation).toBe(true)
    expect(ambiguity!.singleInsertVariantCount).toBe(4)
    expect(ambiguity!.fullAssemblyVariantCount).toBe(8)
    expect(ambiguity!.partialAssemblyVariantCount).toBe(0)
    expect(ambiguity!.intendedProbability).toBeCloseTo(1 / 13)
    expect(ambiguity!.message).toContain('vector self-ligation')
    expect(ambiguity!.message).toContain('single-insert')
    expect(ambiguity!.message).toContain('1 in 13')
    expect(ambiguity!.ambiguousInsertIndexes).toEqual([0, 1])
  })

  it('resolves a sticky-ended oligo without selecting restriction sites', () => {
    const oligo = record(24)
    oligo.topology = 'linear'
    oligo.name = 'sticky-oligo'
    // BamHI 5′ GATC … EcoRI 5′ AATT
    oligo.sequence = 'GATCaaaaaaaaaaaaaaaaAATT'
    oligo.dnaEnds = {
      upstream: {
        modification: 'fivePrimePhosphorylated',
        stickiness: 4,
        enzymeName: 'BamHI',
      },
      downstream: {
        modification: 'fivePrimePhosphorylated',
        stickiness: 4,
        enzymeName: 'EcoRI',
      },
    }

    const part = resolveCloningPart(defaultCloningPartConfig('insert', oligo), '#c00')
    expect(part).not.toBeNull()
    expect(part!.fragment.id).toBe('existing-ends')
    expect(part!.upstreamOverhang?.enzymeName).toBe('BamHI')
    expect(part!.downstreamOverhang?.enzymeName).toBe('EcoRI')
    expect(part!.upstreamOverhang?.sequence?.toUpperCase()).toBe('GATC')
    expect(part!.downstreamOverhang?.sequence?.toUpperCase()).toBe('AATT')
  })

  it('preserves lowercase bases through ligation and circular origin restore', () => {
    const vector = record(100)
    vector.topology = 'linear'
    vector.sequence = 'GATCccccccccccccccccAATT'
    vector.dnaEnds = {
      upstream: { modification: 'fivePrimePhosphorylated', stickiness: 4, enzymeName: 'BamHI' },
      downstream: { modification: 'fivePrimePhosphorylated', stickiness: 4, enzymeName: 'EcoRI' },
    }

    const insert = record(24)
    insert.topology = 'linear'
    insert.name = 'lowercase-insert'
    insert.sequence = 'AATTggggggggggggggggGATC'
    insert.dnaEnds = {
      upstream: { modification: 'fivePrimePhosphorylated', stickiness: 4, enzymeName: 'EcoRI' },
      downstream: { modification: 'fivePrimePhosphorylated', stickiness: 4, enzymeName: 'BamHI' },
    }

    const vectorPart = resolveCloningPart(defaultCloningPartConfig('vector', vector), '#000')!
    const insertPart = resolveCloningPart(defaultCloningPartConfig('insert', insert), '#c00')!
    expect(insertPart.sequence).toContain('gggg')

    const { record: product } = assembleRestrictionCloningProduct({
      vector: vectorPart,
      inserts: [insertPart],
      insertOrder: [0],
      productName: 'Product.dna',
    })
    expect(product.sequence).toContain('gggg')
    expect(product.sequence).toContain('cccc')

    // Circular cloning restores the parental origin via rotateCircularRecord — that
    // used to uppercase the whole product.
    const restored = setCircularOrigin({ ...product, topology: 'circular' }, 12)
    expect(restored.sequence).toContain('gggg')
    expect(restored.sequence).toContain('cccc')
  })

  it('clones a sticky oligo into a matching cut vector without insert site picks', () => {
    const plasmid = record(200)
    plasmid.sequence = 'A'.repeat(200)
    const bamhi = site('BamHI', 40, 'GATC')
    bamhi.enzyme = {
      ...bamhi.enzyme,
      recognition: 'GGATCC',
      cutTop: 1,
      cutBottom: 5,
      overhang: { type: "5'", sequence: 'GATC', length: 4 },
    }
    bamhi.cutTop = 40 + 1
    bamhi.cutBottom = 40 + 5
    const ecori = site('EcoRI', 120, 'AATT')
    ecori.enzyme = {
      ...ecori.enzyme,
      recognition: 'GAATTC',
      cutTop: 1,
      cutBottom: 5,
      overhang: { type: "5'", sequence: 'AATT', length: 4 },
    }
    ecori.cutTop = 120 + 1
    ecori.cutBottom = 120 + 5

    const vector = resolveCloningPart(
      {
        ...defaultCloningPartConfig('vector', plasmid),
        leftCut: {
          enzymeName: 'BamHI',
          site: bamhi,
          treatment: 'none',
          fillWith: { A: true, C: true, G: true, T: true },
        },
        rightCut: {
          enzymeName: 'EcoRI',
          site: ecori,
          treatment: 'none',
          fillWith: { A: true, C: true, G: true, T: true },
        },
        selectedFragmentId: null,
      },
      '#222',
    )
    expect(vector).not.toBeNull()

    // Major backbone arc exposes EcoRI upstream / BamHI downstream, so a BamHI…EcoRI
    // oligo ligates in the forward orientation without picking sites on the insert.
    const oligo = record(28)
    oligo.topology = 'linear'
    oligo.sequence = 'GATCccccccccccccccccccccAATT'
    oligo.dnaEnds = {
      upstream: {
        modification: 'fivePrimePhosphorylated',
        stickiness: 4,
        enzymeName: 'BamHI',
      },
      downstream: {
        modification: 'fivePrimePhosphorylated',
        stickiness: 4,
        enzymeName: 'EcoRI',
      },
    }
    const insert = resolveCloningPart(defaultCloningPartConfig('insert', oligo), '#c00')
    expect(insert).not.toBeNull()

    const validation = validateCloningAssembly(vector, [insert!], [0])
    expect(validation.ready).toBe(true)
    expect(validation.closed).toBe(true)
    expect(validation.issues).toHaveLength(0)
  })

  it('does not auto-resolve a blunt linear fragment with no named ends', () => {
    const blunt = record(40)
    blunt.topology = 'linear'
    blunt.sequence = 'A'.repeat(40)
    blunt.dnaEnds = defaultDnaEnds()
    expect(resolveCloningPart(defaultCloningPartConfig('insert', blunt), '#c00')).toBeNull()
  })
})
describe('partial digest warnings', () => {
  it('does not warn when the intended piece is a complete-digest band (extra enzyme sites elsewhere)', () => {
    const plasmid = record(5880)
    const eco = site('EcoRI', 100)
    const bamA = site('BamHI', 390)
    const bamB = site('BamHI', 2000)
    const config = {
      ...defaultCloningPartConfig('vector', plasmid),
      leftCut: {
        ...defaultCloningPartConfig('vector', plasmid).leftCut,
        enzymeName: 'EcoRI',
        site: eco,
      },
      rightCut: {
        ...defaultCloningPartConfig('vector', plasmid).rightCut,
        enzymeName: 'BamHI',
        site: bamA,
      },
      selectedFragmentId: 'between',
    }
    const arcs = listDigestFragmentsBetweenCuts(plasmid, eco, bamA)
    const intended = arcs.find((fragment) => fragment.followsLeftToRight && !fragment.wraps) ?? arcs[0]!
    config.selectedFragmentId = intended.id

    // BamHI also cuts elsewhere, but EcoRI–BamHI(390) is still one complete Eco+Bam band.
    expect(analyzePartialDigestWarning('Vector', config, [eco, bamA, bamB])).toBeNull()
  })

  it('does not warn when both BamHI sites bound the intended fragment (full digest)', () => {
    const plasmid = record(7000)
    const bamA = site('BamHI', 5768)
    const bamB = site('BamHI', 6206)
    const config = {
      ...defaultCloningPartConfig('vector', plasmid),
      leftCut: {
        ...defaultCloningPartConfig('vector', plasmid).leftCut,
        enzymeName: 'BamHI',
        site: bamA,
      },
      rightCut: {
        ...defaultCloningPartConfig('vector', plasmid).rightCut,
        enzymeName: 'BamHI',
        site: bamB,
      },
    }
    const arcs = listDigestFragmentsBetweenCuts(plasmid, bamA, bamB)
    const shortArc = arcs.find((fragment) => fragment.length === 442) ?? arcs[0]!
    config.selectedFragmentId = shortArc.id
    expect(analyzePartialDigestWarning('Vector', config, [bamA, bamB])).toBeNull()
  })

  it('warns when an extra cut of a chosen enzyme lies inside the intended fragment', () => {
    const plasmid = record(5880)
    const bamA = site('BamHI', 100)
    const bamMid = site('BamHI', 800)
    const bamB = site('BamHI', 2000)
    const config = {
      ...defaultCloningPartConfig('vector', plasmid),
      leftCut: {
        ...defaultCloningPartConfig('vector', plasmid).leftCut,
        enzymeName: 'BamHI',
        site: bamA,
      },
      rightCut: {
        ...defaultCloningPartConfig('vector', plasmid).rightCut,
        enzymeName: 'BamHI',
        site: bamB,
      },
    }
    const arcs = listDigestFragmentsBetweenCuts(plasmid, bamA, bamB)
    const spanning = arcs.find((fragment) => fragment.length > 1500 && !fragment.wraps) ?? arcs[0]!
    config.selectedFragmentId = spanning.id

    const warning = analyzePartialDigestWarning('Vector', config, [bamA, bamMid, bamB])
    expect(warning).not.toBeNull()
    expect(warning!.nonUniqueEnzymes).toEqual(['BamHI'])
    expect(warning!.message).toContain('partial')
    expect(warning!.message).toContain('inside the selected fragment')
    expect(warning!.otherFragments.length).toBeGreaterThanOrEqual(2)
  })

  it('does not warn when both chosen enzymes are unique', () => {
    const plasmid = record(5880)
    const eco = site('EcoRI', 100)
    const bam = site('BamHI', 390)
    const config = {
      ...defaultCloningPartConfig('vector', plasmid),
      leftCut: {
        ...defaultCloningPartConfig('vector', plasmid).leftCut,
        enzymeName: 'EcoRI',
        site: eco,
      },
      rightCut: {
        ...defaultCloningPartConfig('vector', plasmid).rightCut,
        enzymeName: 'BamHI',
        site: bam,
      },
    }
    expect(analyzePartialDigestWarning('Vector', config, [eco, bam])).toBeNull()
  })

  it('does not count duplicate scan rows for one physical site as non-unique', () => {
    const plasmid = record(5880)
    const eco = site('EcoRI', 100)
    const bam = site('BamHI', 390)
    const config = {
      ...defaultCloningPartConfig('vector', plasmid),
      leftCut: {
        ...defaultCloningPartConfig('vector', plasmid).leftCut,
        enzymeName: 'EcoRI',
        site: eco,
      },
      rightCut: {
        ...defaultCloningPartConfig('vector', plasmid).rightCut,
        enzymeName: 'BamHI',
        site: bam,
      },
    }
    expect(analyzePartialDigestWarning('Vector', config, [eco, { ...eco }, bam, { ...bam }])).toBeNull()
  })

  it('lists complete multi-cut fragments around a circular plasmid', () => {
    const plasmid = record(3000)
    const a = site('EcoRI', 100)
    const b = site('BamHI', 1100)
    const c = site('BamHI', 2100)
    const fragments = sortDigestFragmentsForDisplay(listCompleteDigestFragments(plasmid, [a, b, c]))
    expect(fragments).toHaveLength(3)
    expect(fragments.map((fragment) => fragment.length).sort((left, right) => left - right)).toEqual([
      1004, 1004, 1004,
    ])
  })
})
