import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import {
  ATTB_MOTIFS,
  analyzeGatewayAssembly,
  analyzeGatewayLrAssembly,
  assembleGatewayProduct,
  assembleGatewayLrProduct,
  attBPrimerSubtypesFromDonor,
  bpProductSiteLabel,
  buildGatewayLrAssemblyDiagram,
  buildGatewayLrEndsDuplex,
  defaultGatewayInsertConfig,
  defaultGatewayVectorConfig,
  findAttSites,
  parseNamedAttPPair,
  resolveGatewayDonor,
  resolveGatewayDestination,
  resolveGatewayEntry,
  resolveGatewayInsert,
} from '../src/domain/gatewayBpCloning'
import { designGatewayAttBPrimers, normalizeGatewayAmplifyRange } from '../src/domain/gatewayBpPrimers'
import { defaultConstructProperties } from '../src/domain/constructProperties'
import { defaultDnaEnds } from '../src/domain/dnaEnds'
import { createId, nowIso, reverseComplement } from '../src/domain/sequence'
import type { SequenceRecord } from '../src/domain/types'

function makeRecord(sequence: string, name = 'Test.dna'): SequenceRecord {
  const now = nowIso()
  return {
    id: createId('seq'),
    name,
    description: '',
    molecule: 'dna',
    topology: 'linear',
    sequence,
    features: [],
    primers: [],
    operations: [],
    dnaEnds: defaultDnaEnds(),
    construct: defaultConstructProperties,
    createdAt: now,
    updatedAt: now,
  }
}

function uniqueGene(length = 600) {
  let out = ''
  for (let i = 0; i < length; i++) {
    out += 'ACGT'[Math.abs((Math.sin(i * 12.9898) * 43758.5453) | 0) % 4]!
  }
  return `ATG${out}TAA`
}

function loadDonorJson(fileName: string): SequenceRecord {
  const donorJson = JSON.parse(
    readFileSync(join('public', 'gateway-vectors', 'donor', fileName), 'utf8'),
  ) as {
    name: string
    sequence: string
    features: SequenceRecord['features']
    topology: SequenceRecord['topology']
  }
  return {
    ...makeRecord(donorJson.sequence, donorJson.name),
    topology: donorJson.topology || 'circular',
    features: donorJson.features || [],
  }
}

describe('gatewayBpCloning', () => {
  it('seeds insert PCR amplify range from an opening selection', () => {
    const template = makeRecord(uniqueGene(400), 'ORF.dna')
    const selectedRange = normalizeGatewayAmplifyRange(template, { start: 10, end: 210 })
    expect(selectedRange).toEqual({ start: 10, end: 210 })
    const insert = defaultGatewayInsertConfig(template, { selectedRange })
    expect(insert.mode).toBe('pcr')
    expect(insert.selectedRange).toEqual({ start: 10, end: 210 })
    expect(defaultGatewayInsertConfig(template, { selectedRange: { start: 5, end: 10 } }).selectedRange)
      .toEqual({ start: 5, end: 10 })
  })

  it('detects attB motifs on a linear PCR-style insert', () => {
    const insert = makeRecord(
      `${ATTB_MOTIFS['1']}${uniqueGene(200)}${reverseComplement(ATTB_MOTIFS['2']!)}`,
    )
    const sites = findAttSites(insert, ['B'])
    expect(sites.map((site) => site.name).sort()).toEqual(['attB1', 'attB2'])
  })

  it('parses MultiSite P-pair labels including reverse sites', () => {
    expect(parseNamedAttPPair('pDONR™221 P1-P5r')).toEqual(['1', '5r'])
    expect(parseNamedAttPPair('pDONR221 P4r-P3r')).toEqual(['4r', '3r'])
    expect(bpProductSiteLabel('1')).toBe('attL1')
    expect(bpProductSiteLabel('5r')).toBe('attR5')
  })

  it('derives attB primer subtypes from the donor attP pair', () => {
    const donor221 = resolveGatewayDonor(
      { source: 'custom', standardId: null, customRecord: loadDonorJson('pDONR221.json') },
      null,
    )
    expect(attBPrimerSubtypesFromDonor(donor221)).toMatchObject({
      left: '1',
      right: '2',
    })

    const donorP1P4 = resolveGatewayDonor(
      {
        source: 'custom',
        standardId: null,
        customRecord: loadDonorJson('pDONR221 P1-P4.json'),
      },
      null,
    )
    expect(attBPrimerSubtypesFromDonor(donorP1P4)).toMatchObject({
      left: '1',
      right: '4',
    })

    const donorP1P5r = resolveGatewayDonor(
      {
        source: 'custom',
        standardId: null,
        customRecord: loadDonorJson('pDONR221 P1-P5r.json'),
      },
      null,
    )
    expect(attBPrimerSubtypesFromDonor(donorP1P5r)).toMatchObject({
      left: '1',
      right: '5r',
      leftName: 'attB1',
      rightName: 'attB5r',
    })
    expect(donorP1P5r.message).toMatch(/attP5r/)
  })

  it('designs attB1/attB4 primers for a P1-P4 donor', () => {
    const gene = uniqueGene(900)
    const template = makeRecord(gene, 'ORF.dna')
    const designed = designGatewayAttBPrimers({
      insertRecord: template,
      amplifyRange: { start: 0, end: gene.length },
      options: {
        method: 'bp',
        geneTmC: 60,
        siteOrientation: 'forward',
        useAdapterPrimers: false,
        leftSubtype: '1',
        rightSubtype: '4',
      },
    })
    expect(designed).not.toBeNull()
    expect(designed!.insertForward.sequence.startsWith(ATTB_MOTIFS['1']!)).toBe(true)
    expect(designed!.insertReverse.sequence.startsWith(ATTB_MOTIFS['4']!)).toBe(true)
    expect(designed!.insertForward.name).toMatch(/attB1/i)
    expect(designed!.insertReverse.name).toMatch(/attB4/i)
  })

  it('clones into P1-P5r yielding attL1 and attR5 with SnapGene-compatible site DNA', () => {
    const donorRecord = loadDonorJson('pDONR221 P1-P5r.json')
    const gene = uniqueGene(900)
    const template = makeRecord(gene, 'ORF.dna')
    const designed = designGatewayAttBPrimers({
      insertRecord: template,
      amplifyRange: { start: 0, end: gene.length },
      options: {
        method: 'bp',
        geneTmC: 60,
        siteOrientation: 'forward',
        useAdapterPrimers: false,
        leftSubtype: '1',
        rightSubtype: '5r',
      },
    })
    expect(designed).not.toBeNull()
    expect(designed!.insertReverse.name).toMatch(/attB5r/i)
    // Thermo attB5r oligo uses the same core motif as attB5.
    expect(designed!.insertReverse.sequence.startsWith(ATTB_MOTIFS['5']!)).toBe(true)

    const insert = resolveGatewayInsert({
      ...defaultGatewayInsertConfig(template),
      mode: 'pcr',
      forwardPrimer: designed!.insertForward,
      reversePrimer: designed!.insertReverse,
      selectedRange: { start: 0, end: gene.length },
      attBLeftSubtype: '1',
      attBRightSubtype: '5r',
    })
    const donor = resolveGatewayDonor(
      { source: 'custom', standardId: null, customRecord: donorRecord },
      null,
    )
    const analysis = analyzeGatewayAssembly(insert, donor, 'bp')
    expect(analysis.ready).toBe(true)
    expect(analysis.leftSite).toBe('attL1')
    expect(analysis.rightSite).toBe('attR5')
    expect(analysis.features.map((f) => f.name)).toEqual(
      expect.arrayContaining(['attL1', 'attR5']),
    )
    // SnapGene LR recognition motifs (must be contiguous on the product).
    expect(analysis.sequence).toContain('CTTTGTACAAAAAAGCAGGCT')
    const snapAttR5 =
      'CAACTTTGTATACAAAAGTTGAACGAGAAACGTAAAATGATATAAATATCAATATATTAAATTAGATTTTGCATAAAAAACAGACTACATAATACTGTAAAACACAACATATCCAGTCACTATG'
    expect(analysis.sequence).toContain(snapAttR5)
    expect(analysis.features.find((f) => f.name === 'attR5')!.locations[0]!.end -
      analysis.features.find((f) => f.name === 'attR5')!.locations[0]!.start).toBe(124)
    // SnapGene Gateway dialog lists entry clones that carry these LR qualifiers.
    const attL1Notes = analysis.features.find((f) => f.name === 'attL1')!.notes ?? ''
    const attR5Notes = analysis.features.find((f) => f.name === 'attR5')!.notes ?? ''
    expect(attL1Notes).toContain('recombination site for the Gateway® LR reaction')
    expect(attL1Notes).toContain('LR Clonase')
    expect(attL1Notes).toMatch(/gene=.*attL/)
    expect(attR5Notes).toMatch(/gene=.*attR/)
    // Gene must abut attR5 — no reverse-attB leftover (CAACTTTTGTATACAAAGTTG).
    const attR5 = analysis.features.find((f) => f.name === 'attR5')!.locations[0]!
    const beforeR5 = analysis.sequence.slice(Math.max(0, attR5.start - 30), attR5.start)
    expect(beforeR5.endsWith('CAACTTTTGTATACAAAGTTG')).toBe(false)
    expect(analysis.sequence.includes('CAACTTTTGTATACAAAGTTG' + 'CAACTTTGTATACAAAAGTTG')).toBe(
      false,
    )
    // Classic attL1 chimera (donor may omit the leading C SnapGene includes).
    expect(
      analysis.sequence.includes(
        'AAATAATGATTTTATTTTGACTGATAGTGACCTGTTCGTTGCAACAAATTGATGAGCAATGCTTTTTTATAATGCCAACTTTGTACAAAAAAGCAGGCT',
      ),
    ).toBe(true)
  })

  it('clones into P4r-P3r yielding mapped attR4 and attR3 for Multisite LR', () => {
    const donorRecord = loadDonorJson('pDONR221 P4r-P3r.json')
    const gene = uniqueGene(900)
    const template = makeRecord(gene, 'ORF.dna')
    const designed = designGatewayAttBPrimers({
      insertRecord: template,
      amplifyRange: { start: 0, end: gene.length },
      options: {
        method: 'bp',
        geneTmC: 60,
        siteOrientation: 'forward',
        useAdapterPrimers: false,
        leftSubtype: '4r',
        rightSubtype: '3r',
      },
    })
    expect(designed).not.toBeNull()
    expect(designed!.insertForward.name).toMatch(/attB4r/i)
    expect(designed!.insertReverse.name).toMatch(/attB3r/i)

    const insert = resolveGatewayInsert({
      ...defaultGatewayInsertConfig(template),
      mode: 'pcr',
      forwardPrimer: designed!.insertForward,
      reversePrimer: designed!.insertReverse,
      selectedRange: { start: 0, end: gene.length },
      attBLeftSubtype: '4r',
      attBRightSubtype: '3r',
    })
    const donor = resolveGatewayDonor(
      { source: 'custom', standardId: null, customRecord: donorRecord },
      null,
    )
    expect(attBPrimerSubtypesFromDonor(donor)).toMatchObject({
      left: '4r',
      right: '3r',
    })

    const analysis = analyzeGatewayAssembly(insert, donor, 'bp')
    expect(analysis.ready).toBe(true)
    expect(analysis.leftSite).toBe('attR4')
    expect(analysis.rightSite).toBe('attR3')
    expect(analysis.features.map((f) => f.name)).toEqual(
      expect.arrayContaining(['attR4', 'attR3']),
    )

    const snapAttR4 =
      'CCAACTTTGTATAGAAAAGTTGAACGAGAAACGTAAAATGATATAAATATCAATATATTAAATTAGATTTTGCATAAAAAACAGACTACATAATACTGTAAAACACAACATATCCAGTCACTATG'
    const snapAttR3 =
      'CAACTTTGTATAATAAAGTTGAACGAGAAACGTAAAATGATATAAATATCAATATATTAAATTAGATTTTGCATAAAAAACAGACTACATAATACTGTAAAACACAACATATCCAGTCACTATG'
    // Reverse donor attP sites often leave attR on the opposite top-strand polarity.
    expect(
      analysis.sequence.includes(snapAttR4) ||
        analysis.sequence.includes(reverseComplement(snapAttR4)),
    ).toBe(true)
    expect(
      analysis.sequence.includes(snapAttR3) ||
        analysis.sequence.includes(reverseComplement(snapAttR3)),
    ).toBe(true)
    expect(analysis.features.find((f) => f.name === 'attR4')).toBeTruthy()
    expect(analysis.features.find((f) => f.name === 'attR3')).toBeTruthy()
  })

  it('clones classic pDONR221 with SnapGene-compatible attL1/attL2 cores', () => {
    const donorRecord = loadDonorJson('pDONR221.json')
    const gene = uniqueGene(900)
    const template = makeRecord(gene, 'ORF.dna')
    const designed = designGatewayAttBPrimers({
      insertRecord: template,
      amplifyRange: { start: 0, end: gene.length },
      options: {
        method: 'bp',
        geneTmC: 60,
        siteOrientation: 'forward',
        useAdapterPrimers: false,
        leftSubtype: '1',
        rightSubtype: '2',
      },
    })
    expect(designed).not.toBeNull()
    const insert = resolveGatewayInsert({
      ...defaultGatewayInsertConfig(template),
      mode: 'pcr',
      forwardPrimer: designed!.insertForward,
      reversePrimer: designed!.insertReverse,
      selectedRange: { start: 0, end: gene.length },
    })
    const donor = resolveGatewayDonor(
      { source: 'custom', standardId: null, customRecord: donorRecord },
      null,
    )
    const analysis = analyzeGatewayAssembly(insert, donor, 'bp')
    expect(analysis.ready).toBe(true)
    expect(analysis.features.map((f) => f.name)).toEqual(
      expect.arrayContaining(['attL1', 'attL2']),
    )
    // Must keep P-derived C (CAACTTT), not B-derived A (CAAGTTT).
    expect(analysis.sequence).toContain('GCCAACTTTGTACAAAAAAGCAGGCT')
    expect(analysis.sequence).not.toContain('GCCAAGTTTGTACAAAAAAGCAGGCT')
    expect(analysis.sequence).toContain('ACCCAGCTTTCTTGTACAAAGTTGGCATT')
    expect(analysis.sequence).not.toContain('ACCCAGCTTTCTTGTACAAAGTGGGCATT')
    // Donor origin preserved: attL1 stays near former attP1 (~569), as in SnapGene.
    const attL1 = analysis.features.find((f) => f.name === 'attL1')
    expect(attL1).toBeTruthy()
    expect(attL1!.locations[0]!.start).toBeGreaterThan(500)
    expect(attL1!.locations[0]!.start).toBeLessThan(700)
    expect(analysis.productLength).toBe(analysis.sequence.length)
  })

  it('clones into P5-P2 yielding SnapGene-compatible attL5/attL2 DNA', () => {
    const donorRecord = loadDonorJson('pDONR221 P5-P2.json')
    const gene = uniqueGene(900)
    const template = makeRecord(gene, 'ORF.dna')
    const designed = designGatewayAttBPrimers({
      insertRecord: template,
      amplifyRange: { start: 0, end: gene.length },
      options: {
        method: 'bp',
        geneTmC: 60,
        siteOrientation: 'forward',
        useAdapterPrimers: false,
        leftSubtype: '5',
        rightSubtype: '2',
      },
    })
    expect(designed).not.toBeNull()
    const insert = resolveGatewayInsert({
      ...defaultGatewayInsertConfig(template),
      mode: 'pcr',
      forwardPrimer: designed!.insertForward,
      reversePrimer: designed!.insertReverse,
      selectedRange: { start: 0, end: gene.length },
      attBLeftSubtype: '5',
      attBRightSubtype: '2',
    })
    // Simulate template annotations that spill into the attB remnants (as on real ORFs
    // annotated through primer/anneal flanks). BP must not keep those stubs on attL.
    const leftB = insert.attSites[0]!
    const rightB = insert.attSites[insert.attSites.length - 1]!
    insert.features = [
      ...insert.features,
      {
        id: createId('feature'),
        name: 'SpillIntoLeftAttB',
        type: 'CDS',
        color: '#00aa00',
        locations: [{ start: leftB.start, end: leftB.end + 40, strand: 'forward' }],
      },
      {
        id: createId('feature'),
        name: 'SpillIntoRightAttB',
        type: 'misc_feature',
        color: '#0000aa',
        locations: [{ start: rightB.start - 40, end: rightB.end, strand: 'forward' }],
      },
    ]
    const donor = resolveGatewayDonor(
      { source: 'custom', standardId: null, customRecord: donorRecord },
      null,
    )
    const analysis = analyzeGatewayAssembly(insert, donor, 'bp')
    expect(analysis.ready).toBe(true)
    expect(analysis.leftSite).toBe('attL5')
    expect(analysis.rightSite).toBe('attL2')
    expect(analysis.features.map((f) => f.name)).toEqual(
      expect.arrayContaining(['attL5', 'attL2']),
    )
    expect(analysis.sequence).toContain('CAACTTTGTATACAAAAGTTG')
    // attL2 often lies on the reverse strand; accept motif or its RC.
    const attL2Core = 'CTTTGTACAAGAAAGCTGGGT'
    expect(
      analysis.sequence.includes(attL2Core) ||
        analysis.sequence.includes(reverseComplement(attL2Core)),
    ).toBe(true)

    const attSpans = analysis.features
      .filter((f) => /^att[LR]/i.test(f.name))
      .flatMap((f) => f.locations.map((l) => ({ name: f.name, start: l.start, end: l.end })))
    for (const feature of analysis.features) {
      if (/^att[LR]/i.test(feature.name)) continue
      for (const loc of feature.locations) {
        for (const att of attSpans) {
          const overlap = loc.start < att.end && att.start < loc.end
          expect(
            overlap,
            `${feature.name} [${loc.start},${loc.end}) overlaps ${att.name}`,
          ).toBe(false)
        }
      }
    }
  })

  it('designs attB primers and assembles an entry clone with a donor JSON', () => {
    const donorRecord = loadDonorJson('pDONR207.json')

    const gene = uniqueGene(900)
    const template = makeRecord(gene, 'ORF.dna')
    const designed = designGatewayAttBPrimers({
      insertRecord: template,
      amplifyRange: { start: 0, end: gene.length },
      options: {
        method: 'bp',
        geneTmC: 60,
        siteOrientation: 'forward',
        useAdapterPrimers: false,
        leftSubtype: '1',
        rightSubtype: '2',
      },
    })
    expect(designed).not.toBeNull()
    expect(designed!.insertForward.sequence.startsWith(ATTB_MOTIFS['1']!)).toBe(true)
    expect(designed!.insertReverse.sequence.startsWith(ATTB_MOTIFS['2']!)).toBe(true)

    const insert = resolveGatewayInsert({
      ...defaultGatewayInsertConfig(template),
      mode: 'pcr',
      forwardPrimer: designed!.insertForward,
      reversePrimer: designed!.insertReverse,
      selectedRange: { start: 0, end: gene.length },
    })
    expect(insert.ready).toBe(true)
    expect(insert.attSites.length).toBeGreaterThanOrEqual(2)

    const donor = resolveGatewayDonor(
      { source: 'custom', standardId: null, customRecord: donorRecord },
      null,
    )
    expect(donor.ready).toBe(true)

    const analysis = analyzeGatewayAssembly(insert, donor, 'bp')
    expect(analysis.ready).toBe(true)
    expect(analysis.productLength).toBeGreaterThan(1000)
    expect(analysis.leftSite).toMatch(/attL/)
    expect(analysis.rightSite).toMatch(/attL/)

    const product = assembleGatewayProduct({
      insert,
      donor,
      analysis,
      productName: 'Entry Clone.dna',
    })
    expect(product.topology).toBe('circular')
    expect(product.sequence.length).toBe(analysis.productLength)
    expect(product.history?.operation).toBe('gatewayBp')
    expect(product.primers.length).toBeGreaterThanOrEqual(2)
    expect(product.primers.some((primer) => /attB|_F|_R|FOR|REV/i.test(primer.name))).toBe(true)
    expect(product.primers.every((primer) => (primer.bindings?.length ?? 0) > 0)).toBe(true)
  })

  it('assembles classic LR Expression Clone from entry × destination', () => {
    const entryRecord = loadDonorJson('pDONR221.json')
    const gene = uniqueGene(300)
    const template = makeRecord(gene, 'ORF.dna')
    const designed = designGatewayAttBPrimers({
      insertRecord: template,
      amplifyRange: { start: 0, end: gene.length },
      options: {
        method: 'bp',
        geneTmC: 60,
        siteOrientation: 'forward',
        useAdapterPrimers: false,
        leftSubtype: '1',
        rightSubtype: '2',
      },
    })
    expect(designed).not.toBeNull()
    const insert = resolveGatewayInsert({
      ...defaultGatewayInsertConfig(template),
      mode: 'pcr',
      forwardPrimer: designed!.insertForward,
      reversePrimer: designed!.insertReverse,
      selectedRange: { start: 0, end: gene.length },
    })
    const donor = resolveGatewayDonor(
      { source: 'custom', standardId: null, customRecord: entryRecord },
      null,
    )
    const bp = analyzeGatewayAssembly(insert, donor, 'bp')
    expect(bp.ready).toBe(true)
    const entryClone = assembleGatewayProduct({
      insert,
      donor,
      analysis: bp,
      productName: 'Entry.dna',
    })

    const destJson = JSON.parse(
      readFileSync(join('public', 'gateway-vectors', 'destination', 'pDEST14.json'), 'utf8'),
    ) as {
      name: string
      sequence: string
      features: SequenceRecord['features']
      topology: SequenceRecord['topology']
    }
    const destRecord = {
      ...makeRecord(destJson.sequence, destJson.name),
      topology: destJson.topology || 'circular',
      features: destJson.features || [],
    }
    const resolvedEntry = resolveGatewayEntry({ record: entryClone }, 0)
    const resolvedDest = resolveGatewayDestination(
      { source: 'custom', standardId: null, customRecord: destRecord },
      null,
    )
    expect(resolvedEntry.ready).toBe(true)
    expect(resolvedDest.ready).toBe(true)
    const lr = analyzeGatewayLrAssembly([resolvedEntry], resolvedDest)
    expect(lr.ready).toBe(true)
    expect(lr.productLength).toBeGreaterThan(1000)
    expect(lr.features.map((f) => f.name)).toEqual(expect.arrayContaining(['attB1', 'attB2']))
    const product = assembleGatewayLrProduct({
      entries: [resolvedEntry],
      destination: resolvedDest,
      analysis: lr,
      productName: 'Expression Clone.dna',
    })
    expect(product.topology).toBe('circular')
    expect(product.sequence.length).toBe(lr.productLength)
  })

  it('builds SnapGene-style LR ends duplex for entry and destination', () => {
    const entryRecord = loadDonorJson('pDONR221.json')
    const gene = uniqueGene(300)
    const template = makeRecord(gene, 'ORF.dna')
    const designed = designGatewayAttBPrimers({
      insertRecord: template,
      amplifyRange: { start: 0, end: gene.length },
      options: {
        method: 'bp',
        geneTmC: 60,
        siteOrientation: 'forward',
        useAdapterPrimers: false,
        leftSubtype: '1',
        rightSubtype: '2',
      },
    })
    expect(designed).not.toBeNull()
    const insert = resolveGatewayInsert({
      ...defaultGatewayInsertConfig(template),
      mode: 'pcr',
      forwardPrimer: designed!.insertForward,
      reversePrimer: designed!.insertReverse,
      selectedRange: { start: 0, end: gene.length },
    })
    const donor = resolveGatewayDonor(
      { source: 'custom', standardId: null, customRecord: entryRecord },
      null,
    )
    const bp = analyzeGatewayAssembly(insert, donor, 'bp')
    const entryClone = assembleGatewayProduct({
      insert,
      donor,
      analysis: bp,
      productName: 'Entry.dna',
    })
    const destJson = JSON.parse(
      readFileSync(join('public', 'gateway-vectors', 'destination', 'pDEST14.json'), 'utf8'),
    ) as {
      name: string
      sequence: string
      features: SequenceRecord['features']
      topology: SequenceRecord['topology']
    }
    const destRecord = {
      ...makeRecord(destJson.sequence, destJson.name),
      topology: destJson.topology || 'circular',
      features: destJson.features || [],
    }
    const resolvedEntry = resolveGatewayEntry({ record: entryClone }, 0)
    const resolvedDest = resolveGatewayDestination(
      { source: 'custom', standardId: null, customRecord: destRecord },
      null,
    )

    const entryEnds = buildGatewayLrEndsDuplex(resolvedEntry)
    expect(entryEnds.ready).toBe(true)
    expect(entryEnds.centerLabel).toBe('(To Be Inserted)')
    expect(entryEnds.leftLabel).toMatch(/attL1/i)
    expect(entryEnds.rightLabel).toMatch(/attL2/i)
    expect(entryEnds.top.some((segment) => segment.role === 'insert')).toBe(true)
    expect(entryEnds.top.some((segment) => segment.role === 'flank')).toBe(true)

    const destEnds = buildGatewayLrEndsDuplex(resolvedDest)
    expect(destEnds.ready).toBe(true)
    expect(destEnds.centerLabel).toBe('(To Be Replaced)')
    expect(destEnds.leftLabel).toMatch(/attR/i)

    const matched = buildGatewayLrAssemblyDiagram([resolvedEntry], resolvedDest)
    expect(matched.ready).toBe(true)
    expect(matched.allMatched).toBe(true)
    expect(matched.junctions.every((junction) => junction.compatible)).toBe(true)
    expect(matched.fragments[0]?.matched).toBe(true)
    expect(matched.productSiteLabels).toEqual(expect.arrayContaining(['attB1', 'attB2']))
  })

  it('omits crossovers in LR assembly diagram when entry sites do not match destination', () => {
    const entryRecord = loadDonorJson('pDONR221.json')
    const gene = uniqueGene(240)
    const template = makeRecord(gene, 'ORF.dna')
    const designed = designGatewayAttBPrimers({
      insertRecord: template,
      amplifyRange: { start: 0, end: gene.length },
      options: {
        method: 'bp',
        geneTmC: 60,
        siteOrientation: 'forward',
        useAdapterPrimers: false,
        leftSubtype: '1',
        rightSubtype: '2',
      },
    })
    const insert = resolveGatewayInsert({
      ...defaultGatewayInsertConfig(template),
      mode: 'pcr',
      forwardPrimer: designed!.insertForward,
      reversePrimer: designed!.insertReverse,
      selectedRange: { start: 0, end: gene.length },
    })
    const donor = resolveGatewayDonor(
      { source: 'custom', standardId: null, customRecord: entryRecord },
      null,
    )
    const bp = analyzeGatewayAssembly(insert, donor, 'bp')
    const entryClone = assembleGatewayProduct({
      insert,
      donor,
      analysis: bp,
      productName: 'Entry.dna',
    })
    // Destination that prefers a non-L1/L2 R pair would be ideal; simulate mismatch by
    // pairing a classic L1/L2 entry against a destination whose resolved sites still
    // exist, then force a second "wrong" entry copy with flipped subtype labels via diagram
    // using two identical entries (adjacent L2×L1 fail).
    const destJson = JSON.parse(
      readFileSync(join('public', 'gateway-vectors', 'destination', 'pDEST14.json'), 'utf8'),
    ) as {
      name: string
      sequence: string
      features: SequenceRecord['features']
      topology: SequenceRecord['topology']
    }
    const destRecord = {
      ...makeRecord(destJson.sequence, destJson.name),
      topology: destJson.topology || 'circular',
      features: destJson.features || [],
    }
    const e1 = resolveGatewayEntry({ record: entryClone }, 0)
    const e2 = resolveGatewayEntry({ record: entryClone }, 1)
    const dest = resolveGatewayDestination(
      { source: 'custom', standardId: null, customRecord: destRecord },
      null,
    )
    const diagram = buildGatewayLrAssemblyDiagram([e1, e2], dest)
    expect(diagram.ready).toBe(true)
    expect(diagram.allMatched).toBe(false)
    expect(diagram.junctions.some((junction) => !junction.compatible)).toBe(true)
    expect(diagram.productSiteLabels).toHaveLength(0)
  })

  it('routes analyzeGatewayAssembly(lr) toward the dedicated LR path', () => {
    const insert = resolveGatewayInsert(defaultGatewayInsertConfig(null))
    const donor = resolveGatewayDonor(defaultGatewayVectorConfig(), null)
    const analysis = analyzeGatewayAssembly(insert, donor, 'lr')
    expect(analysis.ready).toBe(false)
    expect(analysis.message).toMatch(/analyzeGatewayLrAssembly/i)
  })
})
