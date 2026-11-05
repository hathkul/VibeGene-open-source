import { describe, expect, it, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { exportProjectJson, exportSnapGene, parseProjectJson, parseSequenceBytes, parseSnapGene } from '../src/domain/parsers'
import { hydrateSnapGeneTraceAlignments } from '../src/domain/snapgeneDnaComparison'
import { parseSnapGeneAttachments } from '../src/domain/snapgeneAttachments'
import { alignTraceToTemplate } from '../src/domain/traceAlignment'
import { resolveDisplayablePrimerSites } from '../src/domain/primerSequenceLayout'
import { encodeSnapGeneZtr, parseSnapGeneZtr } from '../src/domain/snapgeneZtr'
import {
  collectSnapGeneTraceBlocks,
  encodeSnapGeneAlignmentPackets,
  parseSnapGeneTracesAsync,
  parseSnapGeneTraceContainers,
} from '../src/domain/snapgeneTraces'
import { defaultConstructProperties } from '../src/domain/constructProperties'
import { defaultSnapGeneExportOptions } from '../src/domain/snapgeneEnzymeExport'
import type { Primer, SequenceRecord } from '../src/domain/types'
import type { TraceFileRecord } from '../src/domain/traceTypes'
import { parseFeatureQualifiers } from '../src/domain/featureQualifiers'

function readSnapGenePacket(bytes: Uint8Array, targetType: number) {
  let offset = 0
  while (offset + 5 <= bytes.length) {
    const type = bytes[offset]!
    const length = new DataView(bytes.buffer, bytes.byteOffset + offset + 1, 4).getUint32(0, false)
    const start = offset + 5
    const end = start + length
    if (end > bytes.length) break
    if (type === targetType) return bytes.slice(start, end)
    offset = end
  }
  return null
}

function makeRecord(sequence: string, primers: Primer[] = [], traceFiles?: TraceFileRecord[]): SequenceRecord {
  return {
    id: 'seq-1',
    name: 'test',
    description: 'test',
    molecule: 'dna',
    topology: 'circular',
    sequence,
    features: [],
    primers,
    traceFiles,
    operations: [],
    construct: defaultConstructProperties,
    createdAt: '',
    updatedAt: '',
  }
}

function makeTrace(overrides: Partial<TraceFileRecord> & Pick<TraceFileRecord, 'fileName' | 'sequence'>): TraceFileRecord {
  return {
    id: overrides.id ?? `trace-${overrides.fileName}`,
    fileName: overrides.fileName,
    sequence: overrides.sequence,
    chromatogram: overrides.chromatogram ?? {
      aTrace: [],
      tTrace: [],
      gTrace: [],
      cTrace: [],
      basePos: [],
      baseCalls: overrides.sequence.split(''),
    },
    enabled: overrides.enabled ?? true,
    expanded: false,
    showAnnotations: false,
    alignment: overrides.alignment ?? null,
    alignmentPurpose: overrides.alignmentPurpose,
    parseError: overrides.parseError,
  }
}

describe('SnapGene export', () => {
  // @vitest-environment jsdom
  beforeAll(async () => {
    const { initSnapGeneLzma } = await import('../src/domain/snapgeneLzma')
    await initSnapGeneLzma()
  })

  it('preserves explicit block 8 provenance and leaves absent end properties unknown', () => {
    const source = makeRecord('ACGTAAAAGGTT')
    source.topology = 'linear'
    source.dnaEnds = {
      upstream: { modification: 'unmodified', stickiness: 4 },
      downstream: { modification: 'fivePrimePhosphorylated', stickiness: -4 },
    }
    const withBlock = parseSnapGene(exportSnapGene(source, defaultSnapGeneExportOptions()))
    expect(withBlock.dnaEndsProvenance).toBe('snapgene-block8')
    expect(withBlock.dnaEnds).toEqual(source.dnaEnds)
    expect(parseProjectJson(exportProjectJson(withBlock)).record.dnaEndsProvenance).toBe('snapgene-block8')

    const withoutBlock = parseSnapGene(exportSnapGene(source, { enzymeBlocks: false }))
    expect(withoutBlock.dnaEnds).toMatchObject({ upstream: { stickiness: 0 }, downstream: { stickiness: 0 } })
    expect(withoutBlock.dnaEndsProvenance).toBeUndefined()
    expect(parseProjectJson(exportProjectJson(withoutBlock)).record.dnaEndsProvenance).toBeUndefined()
    const savedAgain = exportSnapGene(withoutBlock, defaultSnapGeneExportOptions())
    expect(readSnapGenePacket(savedAgain, 0x08)).toBeNull()
    expect(parseSnapGene(savedAgain).dnaEndsProvenance).toBeUndefined()
  })

  it('recognizes nondefault end properties in legacy project JSON without treating defaults as recorded', () => {
    const legacy = makeRecord('ACGTAAAAGGTT')
    legacy.topology = 'linear'
    legacy.dnaEnds = {
      upstream: { modification: 'unmodified', stickiness: 4 },
      downstream: { modification: 'fivePrimePhosphorylated', stickiness: 0 },
    }
    expect(parseProjectJson(exportProjectJson(legacy)).record.dnaEndsProvenance).toBe('legacy-defined')
    legacy.dnaEnds = {
      upstream: { modification: 'fivePrimePhosphorylated', stickiness: 0 },
      downstream: { modification: 'fivePrimePhosphorylated', stickiness: 0 },
    }
    expect(parseProjectJson(exportProjectJson(legacy)).record.dnaEndsProvenance).toBeUndefined()
  })

  it('does not export synthetic primer_bind features created during SnapGene import', () => {
    const primer: Primer = {
      id: 'p1',
      name: 'Example R',
      sequence: 'GTAATCATGGTCAT',
      color: '#db2777',
      bindings: [
        {
          strand: 'reverse',
          templateStart: 4,
          templateEnd: 18,
          components: [{ primerBases: 'ATGACCATGATTAC', templateStart: 4, templateEnd: 18 }],
        },
      ],
    }
    const record = makeRecord('AAAATGACCATGATTACGCCAAGAAA', [primer])
    record.features.push({
      id: 'f1',
      name: 'Example R',
      type: 'primer_bind',
      color: '#ec4899',
      notes: 'Imported from SnapGene primer binding site',
      locations: [{ start: 4, end: 18, strand: 'reverse' }],
    })

    const bytes = exportSnapGene(record, defaultSnapGeneExportOptions())
    const featuresPacket = readSnapGenePacket(bytes, 0x0a)
    expect(featuresPacket).not.toBeNull()
    const featuresXml = new TextDecoder().decode(featuresPacket!)
    expect(featuresXml).not.toContain('primer_bind')
    expect(featuresXml).not.toContain('Imported from SnapGene primer binding site')

    const primersPacket = readSnapGenePacket(bytes, 0x05)
    expect(new TextDecoder().decode(primersPacket!)).toContain('<Primer ')
  })

  it('includes primer BindingSite/Component hybridization layouts when present', () => {
    const primer: Primer = {
      id: 'p1',
      name: 'Example R',
      sequence: 'GTAATCATGGTCAT',
      color: '#db2777',
      bindings: [
        {
          strand: 'reverse',
          templateStart: 4,
          templateEnd: 18,
          components: [
            { primerBases: 'AT' },
            { primerBases: 'ATGACCATGATTAC', templateStart: 4, templateEnd: 18 },
          ],
        },
      ],
    }
    const bytes = exportSnapGene(makeRecord('AAAATGACCATGATTACGCCAAGAAA', [primer]))
    const primersPacket = readSnapGenePacket(bytes, 0x05)
    expect(primersPacket).not.toBeNull()
    const xml = new TextDecoder().decode(primersPacket!)
    expect(xml).toContain('<Primer ')
    expect(xml).toContain('<BindingSite ')
    expect(xml).toContain('boundStrand="1"')
    expect(xml).toContain('location="4-17"')
    expect(xml).toContain('<Component bases="AT"/>')
    expect(xml).toContain('hybridizedRange="4-17"')
  })

  it('round-trips formatted SnapGene feature notes including links', () => {
    const html = '<html><body><b>packaging </b><b><a href="https://vibe-gene.com">signal</b></a><b><sup>of</b></sup><b><i>virus</b></i></body></html>'
    const record = makeRecord('ACGTACGT')
    record.features = [{ id: 'feature', name: 'HIV-1 Ψ', type: 'misc_feature', color: '#ffe4c4', locations: [{ start: 0, end: 4, strand: 'forward' }], notes: `note: ${html}` }]
    const reimported = parseSnapGene(exportSnapGene(record), 'formatted.dna')
    expect(parseFeatureQualifiers(reimported.features[0]?.notes).note).toBe(html)
  })

  it('round-trips added alignment sequences through .dna export', () => {
    const traces = [
      makeTrace({
        fileName: 'added-one.seq',
        sequence: 'ATGCGTACGT',
        alignmentPurpose: 'comparative',
      }),
      makeTrace({
        fileName: 'trace-with-peaks.ab1',
        sequence: 'ACGT',
        enabled: false,
        chromatogram: {
          aTrace: [10, 20, 30, 5],
          cTrace: [1, 2, 3, 4],
          gTrace: [0, 1, 0, 1],
          tTrace: [4, 3, 2, 1],
          basePos: [0, 1, 2, 3],
          baseCalls: ['A', 'C', 'G', 'T'],
        },
      }),
      makeTrace({ fileName: 'removed-later.seq', sequence: 'GGGGCCCC', enabled: false }),
    ]

    const bytes = exportSnapGene(makeRecord('ATGCGTACGTAAAA', [], traces))
    const { containers, alignableXml } = collectSnapGeneTraceBlocks(bytes)
    expect(alignableXml).toContain('added-one.seq')
    expect(alignableXml).toContain('vibegenePurpose="comparative"')
    expect(alignableXml).toContain('trace-with-peaks.ab1')
    expect(alignableXml).toContain('removed-later.seq')
    expect(containers).toHaveLength(3)

    const reimported = parseSnapGeneTraceContainers(containers, alignableXml)
    expect(reimported.map((trace) => trace.fileName)).toEqual([
      'added-one.seq',
      'trace-with-peaks.ab1',
      'removed-later.seq',
    ])
    expect(reimported.map((trace) => trace.sequence)).toEqual(['ATGCGTACGT', 'ACGT', 'GGGGCCCC'])
    expect(reimported[0]?.alignmentPurpose).toBe('comparative')
    expect(reimported[1]?.alignmentPurpose).toBeUndefined()
    expect(reimported[1]?.chromatogram.aTrace.length).toBe(4)
    expect(reimported[1]?.enabled).toBe(false)
    expect(reimported[2]?.enabled).toBe(false)

    // Removing an alignment and re-exporting should drop it from the .dna.
    const withoutRemoved = exportSnapGene(makeRecord('ATGCGTACGTAAAA', [], traces.slice(0, 2)))
    const again = collectSnapGeneTraceBlocks(withoutRemoved)
    expect(again.containers).toHaveLength(2)
    expect(again.alignableXml).not.toContain('removed-later.seq')
  })

  it('round-trips dedicated DNA comparative sources and cached results through .dna export', () => {
    const record = makeRecord('ATGCGTACGTAAAA')
    record.dna = {
      comparisonSources: [{ id: 'comparison-1', name: 'Homolog', sequence: 'ATGCGTACGT', enabled: true }],
      comparisonAlignmentCache: [{
        sourceId: 'comparison-1',
        signature: 'dna-reference-guided-v1:test',
        alignment: null,
      }],
    }
    const reimported = parseSequenceBytes(exportSnapGene(record), 'comparison.dna')
    expect(reimported.dna?.comparisonSources).toEqual(record.dna.comparisonSources)
    expect(reimported.dna?.comparisonAlignmentCache).toEqual(record.dna.comparisonAlignmentCache)
    expect(reimported.traceFiles).toBeUndefined()
  })

  it('round-trips library member coordinates as optional .dna attachments', async () => {
    const consensus = 'ATGCGTACGTAAAA'
    const first = makeTrace({ fileName: 'first.seq', sequence: consensus })
    const second = makeTrace({ fileName: 'second.seq', sequence: 'ATGCGTACGTAAAT' })
    const reverse = makeTrace({ fileName: 'reverse.seq', sequence: 'TTTTACGTACGCAT' })
    first.alignment = alignTraceToTemplate(first.sequence, consensus)
    second.alignment = alignTraceToTemplate(second.sequence, consensus)
    reverse.alignment = alignTraceToTemplate(reverse.sequence, consensus)
    expect(first.alignment).not.toBeNull()
    expect(second.alignment).not.toBeNull()
    expect(reverse.alignment?.orientation).toBe('reverse')
    const record = makeRecord(consensus, [], [first, second, reverse])
    record.dna = { documentRole: 'library' }

    const bytes = exportSnapGene(record)
    const packets = collectSnapGeneTraceBlocks(bytes)
    const attachments = parseSnapGeneAttachments(packets.attachmentBlocks)
    expect(attachments.map((attachment) => attachment.name)).toEqual([
      'vibegene.json.zlib',
      'vibegene-alignments.json.zlib',
    ])
    expect(packets.containers).toHaveLength(3)

    const reopened = parseSequenceBytes(bytes, 'library.dna')
    expect(reopened.molecule).toBe('dna')
    expect(reopened.sequence).toBe(consensus)
    expect(reopened.traceFiles?.map((trace) => trace.sequence)).toEqual([first.sequence, second.sequence, reverse.sequence])
    expect(reopened.traceFiles?.map((trace) => trace.alignment)).toEqual([first.alignment, second.alignment, reverse.alignment])
    expect((await parseSnapGeneTracesAsync(bytes, consensus, record.topology)).map((trace) => trace.alignment))
      .toEqual([first.alignment, second.alignment, reverse.alignment])

    // The metadata is optional: ignoring it still leaves a normal DNA record and traces.
    const withoutCache = exportSnapGene({ ...record, traceFiles: [
      { ...first, alignment: null },
      { ...second, alignment: null },
      { ...reverse, alignment: null },
    ] })
    expect(parseSequenceBytes(withoutCache, 'library.dna').traceFiles?.map((trace) => trace.alignment))
      .toEqual([null, null, null])

    const withoutTraces = exportSnapGene(record, { includeTraces: false })
    expect(parseSequenceBytes(withoutTraces, 'library.dna').traceFiles).toBeUndefined()
    expect(parseSnapGeneAttachments(collectSnapGeneTraceBlocks(withoutTraces).attachmentBlocks)
      .some((attachment) => attachment.name === 'vibegene-alignments.json.zlib')).toBe(false)
  })

  it('restores every member feature through the split .dna open path', async () => {
    const consensus = 'ATGCGTACGTAAAA'
    const first = makeTrace({ fileName: 'first.seq', sequence: consensus })
    const second = makeTrace({ fileName: 'second.seq', sequence: 'ATGCGTACGTAAAT' })
    first.features = [{
      id: 'first-feature',
      name: 'First member feature',
      type: 'misc_feature',
      color: '#64748b',
      locations: [{ start: 1, end: 5, strand: 'forward' }],
    }]
    second.features = [{
      id: 'second-feature',
      name: 'Second member feature',
      type: 'misc_feature',
      color: '#64748b',
      locations: [{ start: 6, end: 10, strand: 'reverse' }],
    }]
    const record = makeRecord(consensus, [], [first, second])
    record.dna = { documentRole: 'library' }
    const bytes = exportSnapGene(record)

    const parsed = parseSnapGene(bytes, 'library.dna', { skipTraces: true })
    expect(parsed.traceFiles).toBeUndefined()
    expect(parsed.dna?.libraryMemberFeatures).toHaveLength(2)
    const traces = await parseSnapGeneTracesAsync(bytes, parsed.sequence, parsed.topology, parsed)
    expect(traces.map((trace) => trace.features?.map((feature) => feature.id))).toEqual([
      ['first-feature'],
      ['second-feature'],
    ])
    expect(traces.map((trace) => trace.features?.[0]?.locations)).toEqual([
      first.features[0]!.locations,
      second.features[0]!.locations,
    ])

    const resaved = parseSequenceBytes(exportSnapGene({ ...parsed, traceFiles: traces }), 'resaved.dna')
    expect(resaved.traceFiles?.map((trace) => trace.features?.[0]?.id)).toEqual([
      'first-feature',
      'second-feature',
    ])
  })

  it('rejects cached coordinates when the consensus or member sequence differs', () => {
    const consensus = 'ATGCGTACGTAAAA'
    const trace = makeTrace({ fileName: 'first.seq', sequence: consensus })
    trace.alignment = alignTraceToTemplate(trace.sequence, consensus)
    const record = makeRecord(consensus, [], [trace])
    record.dna = { documentRole: 'library' }
    const { attachmentBlocks } = collectSnapGeneTraceBlocks(exportSnapGene(record))
    const unloaded = [{ ...trace, alignment: null }]

    expect(hydrateSnapGeneTraceAlignments(unloaded, 'ATGCGTACGTAAAT', record.topology, attachmentBlocks)[0]?.alignment).toBeNull()
    expect(hydrateSnapGeneTraceAlignments(unloaded, consensus, 'linear', attachmentBlocks)[0]?.alignment).toBeNull()
    expect(hydrateSnapGeneTraceAlignments(
      [{ ...unloaded[0]!, sequence: 'ATGCGTACGTAAAT' }],
      consensus,
      record.topology,
      attachmentBlocks,
    )[0]?.alignment).toBeNull()
  })

  it('round-trips complex SnapGene primer coordinates from pLCMV fixture', async () => {
    const { initSnapGeneLzma } = await import('../src/domain/snapgeneLzma')
    await initSnapGeneLzma()
    const bytes = readFileSync('tests/fixtures/pLCMV-FAP-puro2.dna')
    const record = parseSequenceBytes(bytes, 'pLCMV-FAP-puro2.dna')
    const primerNames = ['NHE NP primer rev', 'min plasmid PCR reverse', 'min plasmid PCR direct', 'FAPco BamHI rev', 'FAPco Xba dir']
    for (const name of primerNames) {
      const primer = record.primers.find((entry) => entry.name === name)
      expect(primer, name).toBeDefined()
      const displays = resolveDisplayablePrimerSites({ ...record, primers: [primer!] }).displays
      expect(displays.length, `${name} should be displayable`).toBeGreaterThan(0)
    }

    const fapcoXba = record.primers.find((entry) => entry.name === 'FAPco Xba dir')!
    const fapcoDisplays = resolveDisplayablePrimerSites({ ...record, primers: [fapcoXba] }).displays
    const fapcoAnnealed = fapcoDisplays[0]!.glyphs.filter((glyph) => glyph.kind === 'annealed').length
    const fapcoOverhang = fapcoDisplays[0]!.glyphs.filter((glyph) => glyph.kind === 'overhang').length
    // Soft anneal used to keep only a ~15 bp 3′ stub; SnapGene stores ~110 annealed bases.
    expect(fapcoAnnealed).toBeGreaterThan(80)
    expect(fapcoAnnealed).toBeGreaterThan(fapcoOverhang)

    // Same oligo designed in Vibegene (no stored BindingSite) must recover the long duplex.
    const designedDisplays = resolveDisplayablePrimerSites({
      ...record,
      primers: [{ ...fapcoXba, id: 'designed-fapco-xba', bindings: undefined }],
    }).displays
    const designedAnnealed = designedDisplays[0]!.glyphs.filter((glyph) => glyph.kind === 'annealed').length
    expect(designedAnnealed).toBeGreaterThan(80)

    const roundTrip = parseSequenceBytes(exportSnapGene(record, defaultSnapGeneExportOptions()), 'round.dna')
    for (const name of primerNames) {
      const primer = roundTrip.primers.find((entry) => entry.name === name)
      expect(primer, name).toBeDefined()
      const displays = resolveDisplayablePrimerSites({ ...roundTrip, primers: [primer!] }).displays
      expect(displays.length, `${name} should survive export`).toBeGreaterThan(0)
    }

    const nhe = roundTrip.primers.find((entry) => entry.name === 'NHE NP primer rev')!
    const anneal = nhe.bindings?.[0]?.components.find((component) => component.templateStart !== undefined)
    expect(anneal?.templateStart).toBe(5160)
    expect(anneal?.templateEnd).toBe(5179)
  })

  it('exports primer binding sites with melting temperatures in modern format', () => {
    const primer: Primer = {
      id: 'p1',
      name: 'M13 Reverse',
      sequence: 'CAGGAAACAGCTATGAC',
      color: '#0891b2',
    }
    const sequence = `${'a'.repeat(120)}caggaaacagctatgac${'t'.repeat(100)}`
    const record = makeRecord(sequence, [primer])
    const bytes = exportSnapGene(record, defaultSnapGeneExportOptions())
    const primersXml = new TextDecoder().decode(readSnapGenePacket(bytes, 0x05)!)
    expect(primersXml).toContain('location="120-136"')
    expect(primersXml).toContain('meltingTemperature="')
    expect(primersXml).toContain('simplified="1"')
  })

  it('round-trips linear topology through .dna save/open', () => {
    const linear: SequenceRecord = {
      ...makeRecord('ATGCGTACGTAAAA'),
      topology: 'linear',
    }
    const bytes = exportSnapGene(linear, defaultSnapGeneExportOptions())
    const dnaPacket = readSnapGenePacket(bytes, 0x00)
    // Linear clears the circular bit (0x01); ds + default methylation remain.
    expect(dnaPacket?.[0]).toBe(0x1e)
    expect(parseSnapGene(bytes, 'linear-test.dna').topology).toBe('linear')
  })

  it('preserves mixed sequence case through .dna save/open', () => {
    const mixed: SequenceRecord = {
      ...makeRecord('atgcGTACGTAAAA'),
      topology: 'linear',
    }
    const bytes = exportSnapGene(mixed, defaultSnapGeneExportOptions())
    const dnaPacket = readSnapGenePacket(bytes, 0x00)
    expect(new TextDecoder().decode(dnaPacket!.slice(1))).toBe('atgcGTACGTAAAA')
    expect(parseSnapGene(bytes, 'mixed-case.dna').sequence).toBe('atgcGTACGTAAAA')
  })

  it('exports modern SnapGene 8.x layout by default', () => {
    const bytes = exportSnapGene(makeRecord('ATGCGTACGTAAAA'), defaultSnapGeneExportOptions())
    const dnaPacket = readSnapGenePacket(bytes, 0x00)
    // Circular + ds + default methylation → same flag byte as the former hard-coded 0x1f.
    expect(dnaPacket?.[0]).toBe(0x1f)
    // Default export preserves case (uppercase input stays uppercase).
    expect(new TextDecoder().decode(dnaPacket!.slice(1))).toBe('ATGCGTACGTAAAA')

    // Do not emit synthetic enzyme block 2 — it makes SnapGene Gateway treat circular DNA as linear.
    expect(readSnapGenePacket(bytes, 0x02)).toBeNull()
    expect(readSnapGenePacket(bytes, 0x03)).toBeNull()

    const cookiePacket = readSnapGenePacket(bytes, 0x09)
    expect(cookiePacket?.[10]).toBe(0)
    expect(cookiePacket?.[11]).toBe(15)
    expect(cookiePacket?.[12]).toBe(0)
    expect(cookiePacket?.[13]).toBe(19)

    const featuresXml = new TextDecoder().decode(readSnapGenePacket(bytes, 0x0a)!)
    expect(featuresXml).toContain('<?xml version="1.0"?>')
    expect(featuresXml).toContain('nextValidID=')
    expect(featuresXml).not.toContain('[object Object]')

    const primersXml = new TextDecoder().decode(readSnapGenePacket(bytes, 0x05)!)
    expect(primersXml).toContain('HybridizationParams')
    expect(primersXml).toContain('showAdditionalFivePrimeMatches')

    const notesXml = new TextDecoder().decode(readSnapGenePacket(bytes, 0x06)!)
    expect(notesXml).toContain('<UUID>')
    expect(notesXml).toContain('<SequenceClass>UNA</SequenceClass>')

    const alignableXml = new TextDecoder().decode(readSnapGenePacket(bytes, 0x11)!)
    expect(alignableXml).toContain('<AlignableSequences trimStringency="Medium"/>')

    const block13 = readSnapGenePacket(bytes, 0x0d)
    expect(block13).not.toBeNull()
    expect(block13!.length).toBe(345)
    expect(new TextDecoder().decode(block13!)).toContain('Unique 6+ Cutters')

    expect(readSnapGenePacket(bytes, 0x0e)).toBeNull()
    expect(new TextDecoder().decode(readSnapGenePacket(bytes, 0x1c)!)).toContain('EnzymeVisibilities')

    const blockOrder: number[] = []
    let offset = 0
    while (offset + 5 <= bytes.length) {
      blockOrder.push(bytes[offset]!)
      const length = new DataView(bytes.buffer, bytes.byteOffset + offset + 1, 4).getUint32(0, false)
      offset += 5 + length
    }
    expect(blockOrder.slice(0, 9)).toEqual([0x09, 0x00, 0x11, 0x08, 0x0a, 0x05, 0x06, 0x0d, 0x1c])
  })

  it('round-trips imported enzyme block 2 when present on the record', () => {
    const fakeBlock2 = new Uint8Array([1, 2, 3, 4, 5])
    const record = {
      ...makeRecord('ATGCGTACGTAAAA'),
      snapGeneEnzymes: {
        block2: fakeBlock2,
        block3: new Uint8Array(8136),
        cachedSequenceLength: 14,
      },
    }
    const bytes = exportSnapGene(record, {
      ...defaultSnapGeneExportOptions(),
      enzymeCache: 'round-trip',
    })
    expect(Array.from(readSnapGenePacket(bytes, 0x02)!)).toEqual([1, 2, 3, 4, 5])
  })

  it('exports enzyme cache blocks when requested', async () => {
    const { initSnapGeneLzma } = await import('../src/domain/snapgeneLzma')
    await initSnapGeneLzma()
    const bytes = exportSnapGene(makeRecord('ATGCGTACGTAAAA'), { enzymeCache: 'pdemo-blocks-2-3' })
    expect(readSnapGenePacket(bytes, 0x02)?.length).toBe(3353)
    expect(readSnapGenePacket(bytes, 0x03)?.length).toBe(8136)
    const blockOrder: number[] = []
    let offset = 0
    while (offset + 5 <= bytes.length) {
      blockOrder.push(bytes[offset]!)
      const length = new DataView(bytes.buffer, bytes.byteOffset + offset + 1, 4).getUint32(0, false)
      offset += 5 + length
    }
    expect(blockOrder.slice(0, 6)).toEqual([0x09, 0x00, 0x02, 0x03, 0x06, 0x0a])
  })

  it('uses SnapGene packet order when snapGenePacketOrder is set', async () => {
    const { initSnapGeneLzma } = await import('../src/domain/snapgeneLzma')
    await initSnapGeneLzma()
    const bytes = exportSnapGene(makeRecord('ATGCGTACGTAAAA'), {
      enzymeCache: 'pdemo-block-3',
      snapGenePacketOrder: true,
      snapGeneModernFormat: false,
      omitEnzymeAuxBlocks: true,
    })
    const blockOrder: number[] = []
    let offset = 0
    while (offset + 5 <= bytes.length) {
      blockOrder.push(bytes[offset]!)
      const length = new DataView(bytes.buffer, bytes.byteOffset + offset + 1, 4).getUint32(0, false)
      offset += 5 + length
    }
    expect(blockOrder.slice(0, 8)).toEqual([0x09, 0x00, 0x03, 0x08, 0x0a, 0x05, 0x06, 0x0d])
    expect(blockOrder).not.toContain(0x0e)
    expect(blockOrder).not.toContain(0x1c)
  })
  it('imports SnapGene Notes metadata into the description pane fields', () => {
    const bytes = new Uint8Array(readFileSync('tests/fixtures/LDLR.dna'))
    const record = parseSequenceBytes(bytes.buffer, 'LDLR.dna')
    expect(record.construct.syntheticDna).toBe(false)
    expect(record.construct.sourceOrganism).toBe('homo-sapiens')
    expect(record.construct.sequenceClass).toBe('PRI')
    expect(record.construct.accessionNumber).toBe('NM_000527')
    expect(record.description).toMatch(/low density lipoprotein receptor/i)
    expect(record.construct.comments.length).toBeGreaterThan(50)
    expect(record.construct.references).toContain('PMID:')
    expect(record.construct.references).toContain('Goldstein')
  })

  it('round-trips synthetic/natural Notes fields on SnapGene export', () => {
    const natural = {
      ...makeRecord('ATGCGTACGTAAAA'),
      description: 'Natural test sequence',
      construct: {
        ...defaultConstructProperties,
        syntheticDna: false,
        sourceOrganism: 'homo-sapiens',
        sequenceClass: 'PRI',
        accessionNumber: 'NM_000527',
        codeNumber: 'CODE-1',
        sequenceAuthor: 'Tester',
        comments: 'Comment line',
        references: 'Authors. "Title here". Journal 1. PMID: 12345',
      },
    }
    const bytes = exportSnapGene(natural, defaultSnapGeneExportOptions())
    const notesXml = new TextDecoder().decode(readSnapGenePacket(bytes, 0x06)!)
    expect(notesXml).toContain('<Type>Natural</Type>')
    expect(notesXml).toContain('<SequenceClass>PRI</SequenceClass>')
    expect(notesXml).toContain('<AccessionNumber>NM_000527</AccessionNumber>')
    expect(notesXml).toContain('<CodeNumber>CODE-1</CodeNumber>')
    expect(notesXml).toContain('<CreatedBy>Tester</CreatedBy>')
    expect(notesXml).toContain('<Organism>Homo sapiens</Organism>')
    expect(notesXml).toContain('pubMedID="12345"')
  })
})

describe('encodeSnapGeneZtr', () => {
  it('writes uncompressed BASE chunks that parseSnapGeneZtr can read', () => {
    const bytes = encodeSnapGeneZtr({ bases: 'ATGCNT' })
    const parsed = parseSnapGeneZtr(bytes)
    expect(parsed?.bases).toBe('ATGCNT')
    expect(parsed?.samples.A.length).toBe(0)
  })
})

describe('encodeSnapGeneAlignmentPackets', () => {
  it('returns no packets when there are no exportable traces', () => {
    expect(encodeSnapGeneAlignmentPackets([])).toEqual([])
    expect(
      encodeSnapGeneAlignmentPackets([makeTrace({ fileName: 'broken', sequence: '', parseError: 'fail' })]),
    ).toEqual([])
  })
})
