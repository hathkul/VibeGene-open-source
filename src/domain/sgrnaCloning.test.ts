import { themeFixturePalette } from '../test-support/themeFixturePalette'
// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest'
import crisprReferences from '../data/crisprReferences.json'
import { defaultConstructProperties } from './constructProperties'
import { enzymes, findRestrictionSites } from './enzymes'
import { flipRecord } from './flipRecord'
import { exportProjectJson, exportSnapGene, parseProjectJson, parseSnapGene } from './parsers'
import { createRestrictionCloningProductLibrary } from './restrictionCloningBatch'
import { sequenceRecordFromLibraryMember } from './libraryMemberRecord'
import { buildPrimerPaneEntries, sgRnaPrimerPaneFields } from './primerPaneEntries'
import { defaultPrimerHybridizationParams } from './primerHybridization'
import { groupSgRNAFeatures, type SgRNAAnnotation } from './sgrna'
import { annealComplementaryOligos } from './annealedOligos'
import { listSgRnaCloningChoices, planSgRnaCloning, sgRnaHistoryOligosTsv, withSgRnaCloningLibraryHistory, type SgRnaCloningChoice } from './sgrnaCloning'
import type { SequenceFeature, SequenceRecord } from './types'

const scaffold = crisprReferences.scaffolds.find((entry) => entry.name === 'SpCas9 standard sgRNA scaffold')!.sequence
const target = 'ACGTACGTACGTACGTACGT'

beforeAll(async () => {
  const { initSnapGeneLzma } = await import('./snapgeneLzma')
  await initSnapGeneLzma()
})

function vector(sequence: string, features: SequenceFeature[], topology: SequenceRecord['topology'] = 'circular'): SequenceRecord {
  return {
    id: 'vector', name: 'Test guide vector', description: '', molecule: 'dna', topology, sequence, features,
    primers: [], operations: [], construct: defaultConstructProperties,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function guide(id = 'g1', spacer = target, nuclease = 'SpCas9'): SgRNAAnnotation {
  return {
    id, guide: { id, name: `guide ${id}`, type: 'misc_feature', color: themeFixturePalette.greenPrimary, locations: [] },
    nuclease, pamMotif: nuclease === 'SaCas9' ? 'NNGRRT' : 'NGG', pamSide: '3prime', spacer,
    observedPam: nuclease === 'SaCas9' ? 'AAGGAT' : 'TGG',
  }
}

function pairedBbsIVector(): SequenceRecord {
  const promoter = `${'A'.repeat(96)}CACC`
  const prefix = 'C'.repeat(40)
  // The two oppositely oriented BbsI sites and their cleavage offsets match pX330.
  const gap = 'GGGTCTTCGAGAAGACCT'
  const sequence = `${prefix}${promoter}${gap}${scaffold}${'C'.repeat(100)}`
  return vector(sequence, [
    { id: 'u6', name: 'U6 promoter', type: 'promoter', color: themeFixturePalette.gray, locations: [{ start: prefix.length, end: prefix.length + promoter.length, strand: 'forward' }] },
    { id: 'scaffold', name: 'gRNA scaffold', type: 'misc_RNA', color: themeFixturePalette.gray, locations: [{ start: prefix.length + promoter.length + gap.length, end: prefix.length + promoter.length + gap.length + scaffold.length, strand: 'forward' }] },
  ])
}

function mixedVector(): SequenceRecord {
  const promoter = 'A'.repeat(100)
  const prefix = 'C'.repeat(25)
  const gap = 'GCGGGATCCACTGGACCAGGCAGCAGCGTCAGAAGACTTTTTTGGAACGTCTC'
  const sequence = `${prefix}${promoter}${gap}${scaffold}${'C'.repeat(50)}`
  return vector(sequence, [
    { id: 'u6', name: 'U6 promoter', type: 'promoter', color: themeFixturePalette.gray, locations: [{ start: prefix.length, end: prefix.length + promoter.length, strand: 'forward' }] },
    { id: 'scaffold', name: 'gRNA scaffold', type: 'misc_RNA', color: themeFixturePalette.gray, locations: [{ start: prefix.length + promoter.length + gap.length, end: prefix.length + promoter.length + gap.length + scaffold.length, strand: 'forward' }] },
  ])
}

function linearizedVector(recorded = true): SequenceRecord {
  const promoter = 'A'.repeat(120)
  const sequence = `GTTT${scaffold.slice(4)}${'C'.repeat(2200)}${promoter}CACC`
  const result = vector(sequence, [
    { id: 'scaffold', name: 'gRNA scaffold', type: 'misc_RNA', color: themeFixturePalette.gray, locations: [{ start: 0, end: scaffold.length, strand: 'forward' }] },
    { id: 'u6', name: 'U6 promoter', type: 'promoter', color: themeFixturePalette.gray, locations: [{ start: sequence.length - promoter.length - 4, end: sequence.length - 4, strand: 'forward' }] },
  ], 'linear')
  result.dnaEnds = {
    upstream: { modification: 'fivePrimePhosphorylated', stickiness: 4 },
    downstream: { modification: 'fivePrimePhosphorylated', stickiness: 4 },
  }
  if (recorded) result.dnaEndsProvenance = 'snapgene-block8'
  return result
}

describe('sgRNA cloning', () => {
  it('clones a guide into a paired BbsI cassette and retains a guide-only feature and oligo list', () => {
    const source = pairedBbsIVector()
    const choices = listSgRnaCloningChoices(source)
    expect(choices.some((choice) => choice.architecture === 'direct-spacer')).toBe(true)
    const plan = planSgRnaCloning({ vector: source, guides: [guide()] })
    const item = plan.items[0]!
    expect(item.issues).toEqual([])
    expect(item.oligos).toMatchObject({ sense: `CACCG${target}`, expressedGuide: `G${target}` })
    const duplex = annealComplementaryOligos(item.oligos!.sense, item.oligos!.antisense)
    expect(duplex?.sequence.toUpperCase()).toBe(item.insert?.sequence.toUpperCase())
    expect(duplex?.upstreamStickiness).toBe(item.insert?.dnaEnds?.upstream.stickiness)
    expect(duplex?.downstreamStickiness).toBe(item.insert?.dnaEnds?.downstream.stickiness)
    expect(item.product?.topology).toBe('circular')
    expect(item.product?.sequence).toContain(`G${target}${scaffold}`)
    expect(item.product?.primers.map((primer) => primer.sequence)).toEqual(expect.arrayContaining([item.oligos!.sense, item.oligos!.antisense]))
    const cloned = groupSgRNAFeatures(item.product!.features)
    expect(cloned).toHaveLength(1)
    expect(cloned[0]?.pam).toBeUndefined()
    expect(cloned[0]?.spacer).toBe(target)
    expect(plan.primerListTsv).toContain(`guide g1_sense [5′ phosphate]\t${item.oligos?.sense}`)
    expect(plan.primerListTsv).toContain(`guide g1_antisense [5′ phosphate]\t${item.oligos?.antisense}`)
  })

  it('restores a scaffold cut by mixed BamHI and BsmBI and makes OriGene-format oligos', () => {
    const source = mixedVector()
    const item = planSgRnaCloning({ vector: source, guides: [guide()] }).items[0]!
    expect(item.issues).toEqual([])
    expect(item.oligos?.sense).toBe(`GATCG${target}G`)
    expect(item.oligos?.antisense).toBe(`AAAAC${'ACGT'.repeat(5)}C`)
    expect(item.product?.sequence).toContain(`G${target}${scaffold}`)
    const mappedScaffold = item.product!.features.find((feature) => feature.name === 'gRNA scaffold')!
    expect(mappedScaffold.locations.map((location) => item.product!.sequence.slice(location.start, location.end)).join('')).toBe(scaffold)
    expect(item.product?.primers.map((primer) => primer.name)).toEqual([
      'guide g1_sense', 'guide g1_antisense',
    ])
    expect(item.product?.primers.every((primer) => primer.description?.includes('[vibegene:sgrna-oligo:v1:'))).toBe(true)
  })

  it('clones multiple guides into a recorded pre-linearized Guide-it vector', () => {
    const source = linearizedVector()
    const other = 'GTCAGTCAGTCAGTCAGTCA'
    const plan = planSgRnaCloning({ vector: source, guides: [guide(), guide('g2', other)] })
    expect(plan.items.map((item) => item.issues)).toEqual([[], []])
    expect(plan.products).toHaveLength(2)
    expect(plan.primers).toHaveLength(4)
    expect(plan.items[0]?.oligos?.sense).toBe(`CACCG${target}`)
    expect(plan.items[1]?.oligos?.sense).toBe(`CACC${other}`)
    expect(plan.products.every((product) => product.topology === 'circular')).toBe(true)
  })

  it('handles a reverse-strand guide cassette in transcriptional orientation', () => {
    const source = flipRecord(pairedBbsIVector())
    const plan = planSgRnaCloning({ vector: source, guides: [guide()] })
    expect(plan.choices[0]?.cassette?.strand).toBe('reverse')
    expect(plan.items[0]?.issues).toEqual([])
    expect(plan.items[0]?.product?.sequence).toContain(`G${target}${scaffold}`)
  })

  it('can use one sticky and one blunt cut when the scaffold restoration is sequence-validated', () => {
    const promoter = 'A'.repeat(100)
    const prefix = 'C'.repeat(25)
    const scaffoldPrefix = 'GCTAGAAATAGCAAGTTAAA'
    const gap = `TGATCA${'C'.repeat(20)}${scaffoldPrefix}ATTTAAAT`
    const suffix = scaffold
    const sequence = `${prefix}${promoter}${gap}${suffix}${'C'.repeat(40)}`
    const scaffoldStart = prefix.length + promoter.length + 'TGATCA'.length + 20
    const source = vector(sequence, [
      { id: 'u6', name: 'U6 promoter', type: 'promoter', color: themeFixturePalette.gray, locations: [{ start: prefix.length, end: prefix.length + promoter.length, strand: 'forward' }] },
      { id: 'scaffold', name: 'gRNA scaffold', type: 'misc_RNA', color: themeFixturePalette.gray, locations: [{ start: scaffoldStart, end: scaffoldStart + scaffoldPrefix.length + 8 + suffix.length, strand: 'forward' }] },
    ])
    const plan = planSgRnaCloning({ vector: source, guides: [guide()] })
    expect(plan.choices.some((choice) => choice.cassette?.cloningPair === 'BclI + SwaI')).toBe(true)
    expect(plan.items[0]?.issues).toEqual([])
    expect(plan.items[0]?.oligos?.note).toContain('Dam methylation')
    expect(plan.items[0]?.product?.sequence).toContain(`G${target}${scaffoldPrefix}ATTTAAAT${suffix}`)
  })

  it('allows an explicit physical site pair while checking it against the vector', () => {
    const source = pairedBbsIVector()
    const bbsI = enzymes.find((enzyme) => enzyme.name === 'BbsI')!
    const sites = findRestrictionSites(source.sequence, [bbsI], { topology: 'circular' }).sort((a, b) => a.start - b.start)
    const manual: SgRnaCloningChoice = {
      id: 'manual', kind: 'manual-sites', label: 'Manual sites', architecture: 'manual',
      promoterSite: sites[0], scaffoldSite: sites[1],
    }
    const plan = planSgRnaCloning({ vector: source, guides: [guide()], choice: manual })
    expect(plan.items[0]?.issues).toEqual([])
    expect(plan.products).toHaveLength(1)
  })

  it('asks for the two distinct sites when one enzyme of a pair is chosen twice', () => {
    const source = pairedBbsIVector()
    const bbsI = enzymes.find((enzyme) => enzyme.name === 'BbsI')!
    const site = findRestrictionSites(source.sequence, [bbsI], { topology: 'circular' })[0]!
    const manual: SgRnaCloningChoice = {
      id: 'manual', kind: 'manual-sites', label: 'Manual sites', architecture: 'manual',
      promoterSite: site, scaffoldSite: { ...site },
    }
    const plan = planSgRnaCloning({ vector: source, guides: [guide()], choice: manual })
    expect(plan.products).toHaveLength(0)
    const message = [...plan.issues, ...plan.items.flatMap((item) => item.issues)].join(' ')
    expect(message).toMatch(/cuts the vector 2 times/)
    expect(message).not.toMatch(/continuous circular backbone/)
  })

  it('linearizes a unique sticky cut chosen for both junctions and inserts the guide', () => {
    const promoter = 'A'.repeat(100)
    const prefix = 'C'.repeat(40)
    const overhang = 'CACC'
    const sequence = `${prefix}${promoter}ACGTGAAGACTG${overhang}${scaffold}${'C'.repeat(80)}`
    const scaffoldStart = prefix.length + promoter.length + 'ACGTGAAGACTG'.length + overhang.length
    const source = vector(sequence, [
      { id: 'u6', name: 'U6 promoter', type: 'promoter', color: themeFixturePalette.gray, locations: [{ start: prefix.length, end: prefix.length + promoter.length, strand: 'forward' }] },
      { id: 'scaffold', name: 'gRNA scaffold', type: 'misc_RNA', color: themeFixturePalette.gray, locations: [{ start: scaffoldStart, end: scaffoldStart + scaffold.length, strand: 'forward' }] },
    ])
    const bbsI = enzymes.find((enzyme) => enzyme.name === 'BbsI')!
    const site = findRestrictionSites(source.sequence, [bbsI], { topology: 'circular' })[0]!
    const manual: SgRnaCloningChoice = {
      id: 'manual', kind: 'manual-sites', label: 'Manual sites', architecture: 'manual',
      promoterSite: site, scaffoldSite: site,
    }
    const plan = planSgRnaCloning({ vector: source, guides: [guide()], choice: manual })
    expect(plan.items[0]?.issues ?? []).toEqual([])
    expect(plan.products).toHaveLength(1)
    expect(plan.items[0]?.oligos?.note).toMatch(/single BbsI cut/)
    expect(plan.items[0]?.oligos?.sense).toBe(`CACCG${target}`)
    const single = annealComplementaryOligos(plan.items[0]!.oligos!.sense, plan.items[0]!.oligos!.antisense)
    expect(single?.sequence.toUpperCase()).toBe(plan.items[0]?.insert?.sequence.toUpperCase())
    expect(single?.upstreamStickiness).toBe(plan.items[0]?.insert?.dnaEnds?.upstream.stickiness)
    expect(single?.downstreamStickiness).toBe(plan.items[0]?.insert?.dnaEnds?.downstream.stickiness)
    // The scaffold-side fragment begins with the 5′ overhang, so that overhang stays between the guide and the scaffold.
    expect(plan.items[0]?.product?.sequence).toContain(`G${target}${overhang}${scaffold}`)
    expect(plan.items[0]?.product?.topology).toBe('circular')
  })

  it('treats two names for one blunt cut as a single linearizing cut', () => {
    const promoter = 'A'.repeat(100)
    const prefix = 'C'.repeat(40)
    const sequence = `${prefix}${promoter}AGTACT${scaffold}${'C'.repeat(80)}`
    const source = vector(sequence, [
      { id: 'u6', name: 'U6 promoter', type: 'promoter', color: themeFixturePalette.gray, locations: [{ start: prefix.length, end: prefix.length + promoter.length, strand: 'forward' }] },
      { id: 'scaffold', name: 'gRNA scaffold', type: 'misc_RNA', color: themeFixturePalette.gray, locations: [{ start: prefix.length + promoter.length + 6, end: prefix.length + promoter.length + 6 + scaffold.length, strand: 'forward' }] },
    ])
    const scaI = enzymes.find((enzyme) => enzyme.name === 'ScaI')!
    const scaIHf = enzymes.find((enzyme) => enzyme.name === 'ScaI-HF')!
    const site = findRestrictionSites(source.sequence, [scaI], { topology: 'circular' })[0]!
    const alias = findRestrictionSites(source.sequence, [scaIHf], { topology: 'circular' })[0]!
    const manual: SgRnaCloningChoice = {
      id: 'manual', kind: 'manual-sites', label: 'Manual sites', architecture: 'manual',
      promoterSite: site, scaffoldSite: alias,
    }
    const plan = planSgRnaCloning({ vector: source, guides: [guide()], choice: manual })
    const message = [...plan.issues, ...plan.items.flatMap((item) => item.issues)].join(' ')
    expect(message).toMatch(/blunt/i)
    expect(message).not.toMatch(/continuous circular backbone/)
  })

  it('warns about a Cas/scaffold mismatch and blocks unrecorded terminal chemistry', () => {
    const mismatch = planSgRnaCloning({ vector: pairedBbsIVector(), guides: [guide('sa', target, 'SaCas9')] })
    expect(mismatch.items[0]?.compatibility.status).toBe('incompatible')
    const unknown = planSgRnaCloning({ vector: linearizedVector(false), guides: [guide()] })
    expect(unknown.products).toHaveLength(0)
    expect(unknown.items[0]?.issues.join(' ')).toMatch(/not recorded/i)
  })

  it('keeps a structured cloning event and orderable oligos through project and SnapGene roundtrips', () => {
    const product = planSgRnaCloning({ vector: pairedBbsIVector(), guides: [guide()] }).products[0]!
    const recipe = product.history?.sgRnaCloning
    expect(product.history?.operation).toBe('cloneSgRNA')
    expect(product.history?.children.length).toBeGreaterThan(0)
    expect(recipe).toMatchObject({
      sourceVector: { id: 'vector', name: 'Test guide vector' },
      guides: [{ sourceGuideId: 'g1', targetSpacer: target, nuclease: 'SpCas9', compatibility: 'compatible' }],
    })
    expect(recipe?.guides[0]?.addedSense5).toBe('CACCG')
    for (const loaded of [parseProjectJson(exportProjectJson(product)).record, parseSnapGene(exportSnapGene(product), 'clone.dna')]) {
      expect(loaded.history?.sgRnaCloning?.guides[0]?.targetSpacer).toBe(target)
      expect(sgRnaHistoryOligosTsv(loaded.history!.sgRnaCloning!)).toContain('[5′ phosphate]')
      expect(loaded.history?.children.length).toBeGreaterThan(0)
    }
  })

  it('repairs a product-named antisense oligo from cloning history when reopening .dna or project JSON', () => {
    const product = planSgRnaCloning({ vector: mixedVector(), guides: [guide()] }).products[0]!
    const antisense = product.primers.find((primer) => primer.name.endsWith('_antisense'))!
    const affected = {
      ...product,
      primers: product.primers.map((primer) => primer.id === antisense.id
        ? { ...primer, name: product.name, description: 'sgRNA cloning antisense oligo, 5′→3′; order with 5′ phosphate' }
        : primer),
    }
    for (const loaded of [parseProjectJson(exportProjectJson(affected)).record, parseSnapGene(exportSnapGene(affected), 'affected.dna')]) {
      expect(loaded.primers.map((primer) => primer.name)).toEqual(['guide g1_sense', 'guide g1_antisense'])
      expect(groupSgRNAFeatures(loaded.features)).toHaveLength(1)
      expect(loaded.primers).toHaveLength(2)
    }
  })

  it('keeps aggregate oligos and member histories after saving and reopening a library', () => {
    const one = guide('first')
    const two = guide('second', 'GTCAGTCAGTCAGTCAGTCA')
    const products = planSgRnaCloning({ vector: pairedBbsIVector(), guides: [one, two] }).products
    const library = withSgRnaCloningLibraryHistory(createRestrictionCloningProductLibrary(products, 'Guide library'), products)
    expect(library.history?.operation).toBe('cloneSgRNALibrary')
    expect(library.history?.sgRnaCloning?.guides).toHaveLength(2)
    for (const loaded of [parseProjectJson(exportProjectJson(library)).record, parseSnapGene(exportSnapGene(library), 'library.dna')]) {
      expect(loaded.history?.sgRnaCloning?.guides.map((entry) => entry.name)).toEqual(['guide first', 'guide second'])
      expect(sgRnaHistoryOligosTsv(loaded.history!.sgRnaCloning!).split('\n')).toHaveLength(4)
      expect(loaded.traceFiles).toHaveLength(2)
      expect(loaded.traceFiles?.every((member) => Boolean(sequenceRecordFromLibraryMember(member, { topology: 'circular' }).history?.sgRnaCloning))).toBe(true)
      expect(loaded.traceFiles?.[0]?.history?.sgRnaCloning?.library?.name).toBe('Guide library')
    }
  })

  it('repairs the affected antisense name within an annotated library member', () => {
    const products = planSgRnaCloning({ vector: mixedVector(), guides: [guide()] }).products
    const library = withSgRnaCloningLibraryHistory(createRestrictionCloningProductLibrary(products, 'Guide library'), products)
    const member = library.traceFiles![0]!
    const affected = {
      ...library,
      traceFiles: [{
        ...member,
        primers: member.primers!.map((primer) => primer.name.endsWith('_antisense')
          ? { ...primer, name: member.fileName }
          : primer),
      }],
    }
    for (const loaded of [parseProjectJson(exportProjectJson(affected)).record, parseSnapGene(exportSnapGene(affected), 'affected-library.dna')]) {
      expect(loaded.traceFiles?.[0]?.primers?.map((primer) => primer.name))
        .toEqual(['guide g1_sense', 'guide g1_antisense'])
    }
  })

  it('shows ordinary primers, both cloning oligos, and a virtual sgRNA in the Primers pane model', () => {
    const source = mixedVector()
    source.primers = [{
      id: 'u6-primer', name: 'U6 seq2 dir', sequence: 'A'.repeat(25), color: themeFixturePalette.purple,
      bindings: [{
        strand: 'forward', templateStart: 35, templateEnd: 60,
        components: [{ primerBases: 'A'.repeat(25), templateStart: 35, templateEnd: 60 }],
      }],
    }]
    const products = planSgRnaCloning({ vector: source, guides: [guide()] }).products
    const product = products[0]!
    const groups = buildPrimerPaneEntries(product, [], {
      hybridization: defaultPrimerHybridizationParams,
      primerSort: { mode: 'name', direction: 'asc' },
      oligoSort: { mode: 'name', direction: 'asc' },
      sgRnaSort: { mode: 'name', direction: 'asc' },
      warningsFor: () => '',
    })
    expect(groups.filter((entry) => entry.kind === 'heading').map((entry) => entry.label))
      .toEqual(['Regular primers (1)', 'sgRNA cloning oligos (2)', 'sgRNAs (1)'])
    expect(groups.filter((entry) => entry.kind === 'primer').map((entry) => entry.row.primer.name))
      .toEqual(['U6 seq2 dir', 'guide g1_antisense', 'guide g1_sense'])
    const guideRow = groups.find((entry) => entry.kind === 'sgrna')
    expect(guideRow?.kind).toBe('sgrna')
    if (guideRow?.kind === 'sgrna') {
      expect(sgRnaPrimerPaneFields(guideRow.annotation)).toMatchObject({
        name: 'guide g1', length: 20, annotatedLength: 21, sequence: target, nuclease: 'SpCas9', pam: 'PAM not cloned', strand: 'forward',
      })
    }

    const library = withSgRnaCloningLibraryHistory(createRestrictionCloningProductLibrary(products, 'Guide library'), products)
    for (const loaded of [library, parseProjectJson(exportProjectJson(library)).record, parseSnapGene(exportSnapGene(library), 'library.dna')]) {
      const member = loaded.traceFiles![0]!
      const memberEntries = buildPrimerPaneEntries(loaded, loaded.traceFiles!, {
        hybridization: defaultPrimerHybridizationParams,
        primerSort: { mode: 'name', direction: 'asc' },
        oligoSort: { mode: 'name', direction: 'asc' },
        sgRnaSort: { mode: 'name', direction: 'asc' },
        warningsFor: () => '',
      })
        .filter((entry) => entry.memberId === member.id)
      expect(memberEntries.filter((entry) => entry.kind === 'heading').map((entry) => entry.label))
        .toEqual([member.fileName, 'Regular primers (1)', 'sgRNA cloning oligos (2)', 'sgRNAs (1)'])
      expect(memberEntries.filter((entry) => entry.kind === 'primer').map((entry) => entry.row.primer.name))
        .toEqual(['U6 seq2 dir', 'guide g1_antisense', 'guide g1_sense'])
    }
  })

  it('deduplicates identical order oligos while preserving first product name', () => {
    const products = planSgRnaCloning({ vector: pairedBbsIVector(), guides: [guide('first'), guide('second')] }).products
    const library = withSgRnaCloningLibraryHistory(createRestrictionCloningProductLibrary(products, 'Repeated guides'), products)
    const orderRows = sgRnaHistoryOligosTsv(library.history!.sgRnaCloning!).split('\n')
    expect(orderRows).toHaveLength(2)
    expect(orderRows[0]).toMatch(/^guide first_sense \[5′ phosphate\]\t/)
  })
})
