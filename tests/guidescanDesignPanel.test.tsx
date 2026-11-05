// @vitest-environment jsdom
import { act, StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GuideScanDesignDialog } from '../src/GuideScanDesignDialog'
import { GuideScanDesignPanel } from '../src/GuideScanDesignPanel'
import { SgRnaDialog } from '../src/SgRnaDialog'
import { SgRnaGuideScanValidation } from '../src/SgRnaGuideScanValidation'
import {
  buildGuideScanDesignCacheEntry,
  evidenceFromDesignCandidate,
  mapSgRnaPresetToGuideScanEnzyme,
  type GuideScanDesignCacheEntry,
} from '../src/domain/guidescan'
import * as guidescanGene from '../src/domain/guidescan/gene'
import { createSgRNAFeatures, findSgRNATargets, groupSgRNAFeatures } from '../src/domain/sgrna'
import { createId } from '../src/domain/sequence'
import type { SequenceRecord } from '../src/domain/types'
import { withGenomicAnchor } from '../src/domain/guidescan'

const catalog = {
  version: '1',
  'cli-version': 'v2',
  available: [{ organism: 'hg38', enzyme: 'cas9' }],
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function radioByLabel(container: ParentNode, label: string) {
  return Array.from(container.querySelectorAll<HTMLInputElement>('input[name="guidescan-input-mode"]'))
    .find((input) => input.closest('label')?.textContent?.includes(label))
}

function footerAddButton(container: ParentNode) {
  return container.querySelector<HTMLButtonElement>('button.guidescan-add-selected')
}

function clickFooterAdd(container: ParentNode) {
  const button = footerAddButton(container)
  if (!button) throw new Error('GuideScan footer Add button not found')
  act(() => button.click())
}

function geneSuggestInput(container: ParentNode) {
  return container.querySelector<HTMLInputElement>('input[list="guidescan-gene-suggestions"]')!
}

function typeGeneQuery(container: ParentNode, value: string) {
  const geneInput = geneSuggestInput(container)
  const setNativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setNativeValue.call(geneInput, value)
    geneInput.dispatchEvent(new Event('input', { bubbles: true }))
  })
  return geneInput
}

function geneSuggestStatusEl(container: ParentNode) {
  return container.querySelector('.guidescan-gene-suggest-status')
}

function ensemblAutocompleteFetchMock(options: {
  xrefs?: (url: string) => Promise<Response> | Response
  onXrefsCall?: () => void
}) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/info/supported')) return jsonResponse(catalog)
    if (url.includes('/xrefs/symbol/')) {
      options.onXrefsCall?.()
      return options.xrefs ? options.xrefs(url) : jsonResponse([{ id: 'ENSG1', display_id: 'BRCA1' }])
    }
    if (url.includes('/lookup/id/')) {
      return jsonResponse({
        id: 'ENSG1',
        display_name: 'BRCA1',
        description: 'BRCA1 DNA repair associated',
        object_type: 'Gene',
        species: 'homo_sapiens',
      })
    }
    throw new Error(url)
  })
}

function plasmidRecord(): SequenceRecord {
  const sequence = `${'A'.repeat(50)}ACTGCCCTTGCACACTGGGGAGG${'T'.repeat(80)}`
  return {
    id: createId('seq'),
    name: 'pTarget plasmid',
    description: '',
    molecule: 'dna',
    topology: 'linear',
    sequence,
    features: [],
    primers: [],
    operations: [],
    construct: {
      syntheticDna: true,
      confirmedExperimentally: false,
      laboratoryHostOrganism: null,
      sourceOrganism: null,
      bacterialTransformationStrain: null,
      hostMethylation: 'unknown',
      sequenceClass: 'SYN',
      accessionNumber: '',
      codeNumber: '',
      sequenceAuthor: '',
      comments: '',
      references: '',
    },
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  }
}

function eligibleEnsemblRecord(): SequenceRecord {
  return withGenomicAnchor({
    ...plasmidRecord(),
    name: 'BRCA2',
    externalSource: {
      provider: 'ensembl',
      accession: 'ENSG00000139618',
      assembly: 'GRCh38',
      retrievedAt: new Date(0).toISOString(),
      sourceUrl: 'https://www.ensembl.org/id/ENSG00000139618',
      database: 'Ensembl',
    },
  }, {
    organism: 'hg38',
    chromosome: 'chr17',
    start: 100,
    end: 100 + plasmidRecord().sequence.length - 1,
    strand: 'forward',
  })
}

function baseRecord(): SequenceRecord {
  return eligibleEnsemblRecord()
}

function fillerGeneFeatures(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `f-${index}`,
    name: `exon-${index}`,
    type: 'exon',
    color: '#888',
    notes: '',
    locations: [{ start: 0, end: 1, strand: 'forward' as const }],
  }))
}

function withGuideAt(seq: string, index: number, spacer: string): string {
  const patch = `${spacer}AGG`
  return seq.slice(0, index) + patch + seq.slice(index + patch.length)
}

function refSeqGeneRecordWithManyFeaturesAndOneSgRna() {
  const existingSpacer = 'GTGTGTGTGTGTGTGTGTGT'
  const designSpacers = [
    'ACTGCCCTTGCACACTGGGG',
    'GGGGGGGGGGGGGGGGGGGG',
    'TTTTTTTTTTTTTTTTTTTT',
    'CCCCCCCCCCCCCCCCCCCC',
  ]
  const designIndices = [50, 90, 130, 170]
  let sequence = 'A'.repeat(300)
  sequence = withGuideAt(sequence, 10, existingSpacer)
  for (let index = 0; index < designSpacers.length; index += 1) {
    sequence = withGuideAt(sequence, designIndices[index]!, designSpacers[index]!)
  }
  const existingHit = findSgRNATargets(sequence, existingSpacer, 'linear', {
    pamMotif: 'NGG',
    pamSide: '3prime',
    guideMinLength: 20,
    guideMaxLength: 20,
  })[0]!
  const sgRnaFeatures = createSgRNAFeatures(existingHit, {
    name: 'sgRNA 1 (TP53)',
    nuclease: 'SpCas9',
    pamMotif: 'NGG',
    pamSide: '3prime',
    spacer: existingSpacer,
    id: 'existing-sgrna',
  })
  const anchor = {
    organism: 'hg38' as const,
    chromosome: 'chr17',
    start: 100,
    end: 100 + sequence.length - 1,
    strand: 'forward' as const,
  }
  return {
    anchor,
    designIndices,
    designSpacers,
    record: withGenomicAnchor({
      ...eligibleEnsemblRecord(),
      name: 'TP53 RefSeqGene',
      sequence,
      features: [...fillerGeneFeatures(225), ...sgRnaFeatures],
    }, anchor),
  }
}

function designedSgRnaEditFixture() {
  const guide = 'ACTGCCCTTGCACACTGGGG'
  const sequence = `TTT${guide}AGGTTT`
  const hit = findSgRNATargets(sequence, guide, 'linear', {
    pamMotif: 'NGG',
    pamSide: '3prime',
    guideMinLength: 20,
    guideMaxLength: 20,
  })[0]!
  const pair = createSgRNAFeatures(hit, {
    name: 'sgBRCA2',
    nuclease: 'SpCas9',
    pamMotif: 'NGG',
    pamSide: '3prime',
    spacer: guide,
    id: 'edit-1',
    guideScanEvidence: evidenceFromDesignCandidate({
      id: 'c1',
      rank: 3,
      regionName: 'BRCA2',
      organism: 'hg38',
      enzyme: 'cas9',
      chromosome: 'chr17',
      start: 150,
      end: 172,
      strand: 'forward',
      sequence: `${guide}NGG`,
      spacer: guide,
      pam: 'NGG',
      specificity: 0.4,
      cuttingEfficiency: 0.2,
      annotations: [],
      offTargetCounts: { distance0: 0, distance1: 0, distance2: 0, distance3: 0, distance4: 0 },
      offTargets: [],
    }, { jobId: 'job-design' }),
  })
  return {
    guide,
    record: { ...baseRecord(), sequence, features: pair },
    editing: groupSgRNAFeatures(pair)[0]!,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  document.body.replaceChildren()
})

describe('GuideScan design panel', () => {
  it('defaults candidate count to 20 and selects autocomplete gene symbols', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/info/supported')) return jsonResponse(catalog)
      if (url.includes('/xrefs/symbol/')) {
        return jsonResponse([{ id: 'ENSG1', display_id: 'BRCA1' }])
      }
      if (url.includes('/lookup/id/ENSG1')) {
        return jsonResponse({
          id: 'ENSG1',
          display_name: 'BRCA1',
          description: 'BRCA1 DNA repair associated',
          object_type: 'Gene',
          species: 'homo_sapiens',
        })
      }
      throw new Error(url)
    })
    vi.stubGlobal('fetch', fetchMock)

    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    act(() => root.render(
      <GuideScanDesignPanel record={baseRecord()} onAddSelected={() => undefined} />,
    ))

    await act(async () => {
      await Promise.resolve()
    })

    const topNInput = container.querySelector<HTMLInputElement>('input[type="number"]')!
    expect(topNInput.value).toBe('20')

    const geneInput = container.querySelector<HTMLInputElement>('input[list="guidescan-gene-suggestions"]')!
    const setNativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    act(() => {
      setNativeValue.call(geneInput, 'BRCA1')
      geneInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      vi.advanceTimersByTime(300)
      await Promise.resolve()
    })
    const suggestion = container.querySelector<HTMLButtonElement>('.guidescan-gene-suggest-list button')!
    expect(suggestion.textContent).toBe('BRCA1')
    act(() => suggestion.click())
    expect(geneInput.value).toBe('BRCA1')
    act(() => root.unmount())
  })

  it('shows Searching… while gene autocomplete is pending', async () => {
    vi.useFakeTimers()
    let resolveXrefs: () => void = () => undefined
    const xrefsGate = new Promise<void>((resolve) => {
      resolveXrefs = resolve
    })
    vi.stubGlobal('fetch', ensemblAutocompleteFetchMock({
      xrefs: async () => {
        await xrefsGate
        return jsonResponse([{ id: 'ENSG1', display_id: 'BRCA1' }])
      },
    }))

    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    act(() => root.render(
      <GuideScanDesignPanel record={baseRecord()} onAddSelected={() => undefined} />,
    ))
    await act(async () => {
      await Promise.resolve()
    })

    typeGeneQuery(container, 'BRCA1')
    expect(geneSuggestStatusEl(container)?.textContent).toBe('Searching Ensembl for "BRCA1"…')

    await act(async () => {
      vi.advanceTimersByTime(300)
      await Promise.resolve()
    })
    expect(geneSuggestStatusEl(container)?.textContent).toBe('Searching Ensembl for "BRCA1"…')

    await act(async () => {
      resolveXrefs()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(geneSuggestStatusEl(container)).toBeNull()
    act(() => root.unmount())
  })

  it('shows No matching genes when autocomplete returns no hits', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', ensemblAutocompleteFetchMock({
      xrefs: () => jsonResponse([]),
    }))

    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    act(() => root.render(
      <GuideScanDesignPanel record={baseRecord()} onAddSelected={() => undefined} />,
    ))
    await act(async () => {
      await Promise.resolve()
    })

    typeGeneQuery(container, 'ZZZZZ')
    await act(async () => {
      vi.advanceTimersByTime(300)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(geneSuggestStatusEl(container)?.textContent).toBe('No genes named "ZZZZZ" found for Human (hg38)')
    act(() => root.unmount())
  })

  it('shows NCBI suggestions with a source note when Ensembl autocomplete fails', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const requested = new URL(String(input))
      if (requested.pathname.endsWith('/info/supported')) return jsonResponse(catalog)
      if (requested.host.includes('rest.ensembl.org')) {
        return new Response('Internal Server Error', { status: 500 })
      }
      if (requested.pathname.endsWith('/esearch.fcgi') && requested.searchParams.get('db') === 'gene') {
        return jsonResponse({ esearchresult: { count: '1', idlist: ['672'] } })
      }
      if (requested.pathname.endsWith('/esummary.fcgi') && requested.searchParams.get('db') === 'gene') {
        return jsonResponse({
          result: {
            uids: ['672'],
            672: {
              uid: '672',
              name: 'BRCA1',
              description: 'BRCA1 DNA repair associated',
              organism: { scientificname: 'Homo sapiens', taxid: 9606 },
            },
          },
        })
      }
      throw new Error(String(input))
    }))

    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    act(() => root.render(
      <GuideScanDesignPanel record={baseRecord()} onAddSelected={() => undefined} />,
    ))
    await act(async () => {
      await Promise.resolve()
    })

    typeGeneQuery(container, 'BRCA1')
    await act(async () => {
      vi.advanceTimersByTime(300)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.querySelector('.guidescan-gene-suggest-list button')?.textContent).toBe('BRCA1')
    expect(container.querySelector('.guidescan-gene-suggest-note')?.textContent).toMatch(
      /Ensembl unavailable \(.*\); showing NCBI Gene results/,
    )
    act(() => root.unmount())
  })

  it('shows Suggestions failed when Ensembl and NCBI autocomplete fail', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const requested = new URL(String(input))
      if (requested.pathname.endsWith('/info/supported')) return jsonResponse(catalog)
      if (requested.host.includes('rest.ensembl.org')) {
        return new Response('Internal Server Error', { status: 500 })
      }
      if (requested.pathname.endsWith('/esearch.fcgi')) {
        return Promise.reject(new Error('NCBI offline'))
      }
      throw new Error(String(input))
    }))

    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    act(() => root.render(
      <GuideScanDesignPanel record={baseRecord()} onAddSelected={() => undefined} />,
    ))
    await act(async () => {
      await Promise.resolve()
    })

    typeGeneQuery(container, 'BRCA1')
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 3500))
    })

    const status = geneSuggestStatusEl(container)
    expect(status?.textContent).toMatch(/^Gene suggestions failed — Ensembl: .+; NCBI: .+\. You can still/)
    expect(status?.className).toContain('is-error')
    expect(status?.textContent).toContain('You can still enter an exact symbol or Entrez ID and press Design.')
    act(() => root.unmount())
  })

  it('hides previous suggestion chips while a new query is searching', async () => {
    vi.useFakeTimers()
    let resolveBrca2: () => void = () => undefined
    const brca2Gate = new Promise<void>((resolve) => {
      resolveBrca2 = resolve
    })
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/info/supported')) return jsonResponse(catalog)
      if (url.includes('/xrefs/symbol/')) {
        if (url.includes('BRCA1')) return jsonResponse([{ id: 'ENSG1', display_id: 'BRCA1' }])
        if (url.includes('BRCA2')) {
          await brca2Gate
          return jsonResponse([{ id: 'ENSG2', display_id: 'BRCA2' }])
        }
      }
      if (url.includes('/lookup/id/ENSG1')) {
        return jsonResponse({
          id: 'ENSG1',
          display_name: 'BRCA1',
          description: 'BRCA1 DNA repair associated',
          object_type: 'Gene',
          species: 'homo_sapiens',
        })
      }
      if (url.includes('/lookup/id/ENSG2')) {
        return jsonResponse({
          id: 'ENSG2',
          display_name: 'BRCA2',
          description: 'BRCA2 DNA repair associated',
          object_type: 'Gene',
          species: 'homo_sapiens',
        })
      }
      throw new Error(url)
    }))

    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    act(() => root.render(
      <GuideScanDesignPanel record={baseRecord()} onAddSelected={() => undefined} />,
    ))
    await act(async () => {
      await Promise.resolve()
    })

    typeGeneQuery(container, 'BRCA1')
    await act(async () => {
      vi.advanceTimersByTime(300)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(container.querySelector('.guidescan-gene-suggest-list button')?.textContent).toBe('BRCA1')

    typeGeneQuery(container, 'BRCA2')
    expect(geneSuggestStatusEl(container)?.textContent).toBe('Searching Ensembl for "BRCA2"…')
    expect(container.querySelector('.guidescan-gene-suggest-list')).toBeNull()

    await act(async () => {
      vi.advanceTimersByTime(300)
      await Promise.resolve()
    })
    expect(geneSuggestStatusEl(container)?.textContent).toBe('Searching Ensembl for "BRCA2"…')
    expect(container.querySelector('.guidescan-gene-suggest-list')).toBeNull()

    await act(async () => {
      resolveBrca2()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(container.querySelector('.guidescan-gene-suggest-list button')?.textContent).toBe('BRCA2')
    act(() => root.unmount())
  })

  it('does not refetch autocomplete after picking a suggestion', async () => {
    vi.useFakeTimers()
    let xrefsCalls = 0
    vi.stubGlobal('fetch', ensemblAutocompleteFetchMock({
      onXrefsCall: () => {
        xrefsCalls += 1
      },
    }))

    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    act(() => root.render(
      <GuideScanDesignPanel record={baseRecord()} onAddSelected={() => undefined} />,
    ))
    await act(async () => {
      await Promise.resolve()
    })

    typeGeneQuery(container, 'BRCA1')
    await act(async () => {
      vi.advanceTimersByTime(300)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(xrefsCalls).toBe(1)

    act(() => container.querySelector<HTMLButtonElement>('.guidescan-gene-suggest-list button')!.click())
    await act(async () => {
      vi.advanceTimersByTime(300)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(xrefsCalls).toBe(1)
    expect(geneSuggestStatusEl(container)).toBeNull()
    act(() => root.unmount())
  })

  it('shows design status after picking a TP53 suggestion for numeric Entrez input', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url
      if (url.includes('/info/supported')) return jsonResponse(catalog)
      if (url.includes('/xrefs/symbol/')) {
        return jsonResponse([{ id: 'ENSG00000141510', display_id: 'TP53' }])
      }
      if (url.includes('/lookup/id/')) {
        return jsonResponse({
          id: 'ENSG00000141510',
          display_name: 'TP53',
          object_type: 'Gene',
          species: 'homo_sapiens',
        })
      }
      if (url.endsWith('/query') && init?.method === 'POST') {
        return new Response('', { status: 502 })
      }
      if (url.includes('eutils.ncbi.nlm.nih.gov')) {
        const requested = new URL(url)
        if (requested.pathname.endsWith('/esearch.fcgi') && requested.searchParams.get('db') === 'gene') {
          return jsonResponse({ esearchresult: { count: '1', idlist: ['7157'] } })
        }
        if (requested.pathname.endsWith('/esummary.fcgi') && requested.searchParams.get('db') === 'gene') {
          return jsonResponse({
            result: {
              uids: ['7157'],
              7157: {
                uid: '7157',
                name: 'TP53',
                description: 'tumor protein p53',
                organism: { scientificname: 'Homo sapiens', taxid: 9606 },
              },
            },
          })
        }
      }
      throw new Error(url)
    })
    vi.stubGlobal('fetch', fetchMock)

    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    act(() => root.render(
      <GuideScanDesignPanel record={baseRecord()} onAddSelected={() => undefined} />,
    ))
    await act(async () => {
      await Promise.resolve()
    })

    const geneInput = typeGeneQuery(container, '7157')
    await act(async () => {
      vi.advanceTimersByTime(300)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(container.querySelector('.guidescan-gene-suggest-list button')?.textContent).toBe('TP53')
    act(() => container.querySelector<HTMLButtonElement>('.guidescan-gene-suggest-list button')!.click())
    expect(geneInput.value).toBe('7157')

    await act(async () => {
      Array.from(container.querySelectorAll('button'))
        .find((button) => button.textContent?.includes('GuideScan2'))!.click()
      await vi.runAllTimersAsync()
    })

    expect(container.querySelector('.guidescan-design-error')?.textContent).toBe('GuideScan returned HTTP 502.')
    expect(container.querySelector('.guidescan-design-run-log li.is-error')).toBeTruthy()
    expect(container.querySelector('.guidescan-design-run-log')?.textContent).toContain('GuideScan returned HTTP 502.')
    act(() => root.unmount())
  })

  it('chip-picked Entrez flow does not re-query Ensembl during design', async () => {
    vi.useFakeTimers()
    let xrefsCalls = 0
    let statusCalls = 0
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/info/supported')) return jsonResponse(catalog)
      if (url.includes('/xrefs/symbol/')) {
        xrefsCalls += 1
        return jsonResponse([{ id: 'ENSG00000160182', display_id: 'VLDLR' }])
      }
      if (url.includes('/lookup/id/')) {
        return jsonResponse({
          id: 'ENSG00000160182',
          display_name: 'VLDLR',
          object_type: 'Gene',
          species: 'homo_sapiens',
          assembly_name: 'GRCh38',
          seq_region_name: '1',
          start: 100,
          end: 192,
          strand: 1,
        })
      }
      if (url.includes('/sequence/id/')) {
        return jsonResponse({ id: 'ENSG00000160182', seq: baseRecord().sequence, molecule: 'dna' })
      }
      if (url.includes('eutils.ncbi.nlm.nih.gov')) {
        const requested = new URL(url)
        if (requested.pathname.endsWith('/esearch.fcgi') && requested.searchParams.get('db') === 'gene') {
          return jsonResponse({ esearchresult: { count: '1', idlist: ['7436'] } })
        }
        if (requested.pathname.endsWith('/esummary.fcgi') && requested.searchParams.get('db') === 'gene') {
          const geneId = requested.searchParams.get('id') ?? '7436'
          const sequence = baseRecord().sequence
          const chrstart = 99
          const chrstop = chrstart + sequence.length - 1
          return jsonResponse({
            result: {
              uids: [geneId],
              [geneId]: {
                uid: geneId,
                name: 'VLDLR',
                description: 'very low density lipoprotein receptor',
                organism: { scientificname: 'Homo sapiens', taxid: 9606 },
                genomicinfo: [{
                  chraccver: 'NC_000017.11',
                  chrstart,
                  chrstop,
                  assemblyaccver: 'GRCh38',
                }],
              },
            },
          })
        }
        if (requested.pathname.endsWith('/efetch.fcgi') && requested.searchParams.get('db') === 'nuccore') {
          const sequence = baseRecord().sequence
          const lines = sequence.match(/.{1,60}/g) ?? []
          const origin = lines.map((chunk, index) => `${String(index * 60 + 1).padStart(9)} ${chunk.toLowerCase()}`).join('\n')
          return new Response(`LOCUS       REGION    ${sequence.length} bp    DNA     linear\nORIGIN\n${origin}\n//\n`, {
            status: 200,
            headers: { 'content-type': 'text/plain' },
          })
        }
        if (requested.pathname.endsWith('/elink.fcgi')) {
          return jsonResponse({ linksets: [{ linksetdbs: [] }] })
        }
      }
      if (url.endsWith('/query') && init?.method === 'POST') {
        return jsonResponse({ 'job-id': 'job-vldlr' })
      }
      if (url.includes('/job/status/job-vldlr')) {
        statusCalls += 1
        if (statusCalls < 2) return jsonResponse({ 'job-status': 'pending', failure: null })
        return jsonResponse({ 'job-status': 'completed', 'result-type': 'standard', failure: null })
      }
      if (url.includes('/job/result/json/job-vldlr')) {
        return jsonResponse([[
          {
            'region-name': 'chr17:110-129',
            'chromosome-name': 'chr17',
            coords: ['chr17', 110, 129],
            organism: 'hg38',
          },
          [{
            sequence: 'ACTGCCCTTGCACACTGGGGNGG',
            start: 150,
            end: 172,
            direction: 'positive',
            specificity: 0.4,
            'cutting-efficiency': 0.2,
            annotations: [],
            'distance-0-off-targets': 0,
            'distance-1-off-targets': 0,
            'distance-2-off-targets': 0,
            'distance-3-off-targets': 0,
            'distance-4-off-targets': 0,
            'off-targets': [],
          }],
        ]])
      }
      throw new Error(url)
    })
    vi.stubGlobal('fetch', fetchMock)

    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    act(() => root.render(
      <GuideScanDesignPanel record={baseRecord()} onAddSelected={() => undefined} />,
    ))
    await act(async () => {
      await Promise.resolve()
    })

    typeGeneQuery(container, '7436')
    await act(async () => {
      vi.advanceTimersByTime(300)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(container.querySelector('.guidescan-gene-suggest-list button')?.textContent).toBe('VLDLR')
    act(() => container.querySelector<HTMLButtonElement>('.guidescan-gene-suggest-list button')!.click())

    const xrefsAfterSuggest = xrefsCalls
    await act(async () => {
      Array.from(container.querySelectorAll('button'))
        .find((button) => button.textContent?.includes('GuideScan2'))!.click()
      await vi.runAllTimersAsync()
    })

    expect(xrefsCalls).toBe(xrefsAfterSuggest)
    expect(container.querySelector('.guidescan-results-table')).toBeTruthy()
    expect(
      Array.from(container.querySelectorAll('.guidescan-design-pane-tabs [role="tab"]'))
        .find((tab) => tab.textContent?.startsWith('Results'))
        ?.getAttribute('aria-selected'),
    ).toBe('true')
    act(() => {
      Array.from(container.querySelectorAll('.guidescan-design-pane-tabs [role="tab"]'))
        .find((tab) => tab.textContent?.startsWith('Configure'))!
        .click()
    })
    expect(container.querySelector('.guidescan-results-table')).toBeNull()
    expect(container.querySelector('.guidescan-design-run-log')?.textContent).toContain('skipping lookup')
    act(() => root.unmount())
  })

  it('auto-locks an exact case-insensitive symbol match and skips further autocomplete', async () => {
    vi.useFakeTimers()
    let xrefsCalls = 0
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/info/supported')) return jsonResponse(catalog)
      if (url.includes('/xrefs/symbol/')) {
        xrefsCalls += 1
        return jsonResponse([{ id: 'ENSG1', display_id: 'TP53' }])
      }
      if (url.includes('/lookup/id/ENSG1')) {
        return jsonResponse({
          id: 'ENSG1',
          display_name: 'TP53',
          description: 'tumor protein p53',
          object_type: 'Gene',
          species: 'homo_sapiens',
        })
      }
      throw new Error(url)
    }))

    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    act(() => root.render(
      <GuideScanDesignPanel record={baseRecord()} onAddSelected={() => undefined} />,
    ))
    await act(async () => {
      await Promise.resolve()
    })

    const geneInput = typeGeneQuery(container, 'tp53')
    await act(async () => {
      vi.advanceTimersByTime(300)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(geneInput.value).toBe('TP53')
    expect(xrefsCalls).toBe(1)
    expect(container.querySelector('.guidescan-gene-suggest-list button.is-active')?.textContent).toBe('TP53')

    await act(async () => {
      vi.advanceTimersByTime(300)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(xrefsCalls).toBe(1)
    act(() => root.unmount())
  })

  it('does not auto-lock when multiple genes share a prefix', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/info/supported')) return jsonResponse(catalog)
      if (url.includes('/xrefs/symbol/')) {
        return jsonResponse([{ id: 'ENSG1' }, { id: 'ENSG2' }])
      }
      if (url.includes('/lookup/id/ENSG1')) {
        return jsonResponse({
          id: 'ENSG1',
          display_name: 'BRCA1',
          description: 'BRCA1 DNA repair associated',
          object_type: 'Gene',
          species: 'homo_sapiens',
        })
      }
      if (url.includes('/lookup/id/ENSG2')) {
        return jsonResponse({
          id: 'ENSG2',
          display_name: 'BRCA2',
          description: 'BRCA2 DNA repair associated',
          object_type: 'Gene',
          species: 'homo_sapiens',
        })
      }
      throw new Error(url)
    }))

    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    act(() => root.render(
      <GuideScanDesignPanel record={baseRecord()} onAddSelected={() => undefined} />,
    ))
    await act(async () => {
      await Promise.resolve()
    })

    const geneInput = typeGeneQuery(container, 'brca')
    await act(async () => {
      vi.advanceTimersByTime(300)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(geneInput.value).toBe('brca')
    expect(container.querySelector('.guidescan-gene-suggest-list button.is-active')).toBeNull()
    act(() => root.unmount())
  })

  it('select-all adds mapped guides through the callback in gene-input mode', async () => {
    vi.useFakeTimers()
    let statusCalls = 0
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/info/supported')) return jsonResponse(catalog)
      if (url.includes('/xrefs/symbol/')) return jsonResponse([{ id: 'ENSG00000139618' }])
      if (url.includes('/lookup/id/')) {
        return jsonResponse({
          id: 'ENSG00000139618',
          display_name: 'BRCA2',
          object_type: 'Gene',
          species: 'homo_sapiens',
          assembly_name: 'GRCh38',
          seq_region_name: '13',
          start: 100,
          end: 192,
          strand: 1,
        })
      }
      if (url.includes('/sequence/id/')) {
        return jsonResponse({ id: 'ENSG00000139618', seq: baseRecord().sequence, molecule: 'dna' })
      }
      if (url.endsWith('/query') && init?.method === 'POST') {
        return jsonResponse({ 'job-id': 'job-ui' })
      }
      if (url.includes('/job/status/job-ui')) {
        statusCalls += 1
        if (statusCalls < 2) return jsonResponse({ 'job-status': 'pending', failure: null })
        return jsonResponse({ 'job-status': 'completed', 'result-type': 'standard', failure: null })
      }
      if (url.includes('/job/result/json/job-ui')) {
        return jsonResponse([[
          {
            'region-name': 'chr17:110-129',
            'chromosome-name': 'chr17',
            coords: ['chr17', 110, 129],
            organism: 'hg38',
          },
          [{
            sequence: 'ACTGCCCTTGCACACTGGGGNGG',
            start: 150,
            end: 172,
            direction: 'positive',
            specificity: 0.4,
            'cutting-efficiency': 0.2,
            annotations: [],
            'distance-0-off-targets': 0,
            'distance-1-off-targets': 0,
            'distance-2-off-targets': 0,
            'distance-3-off-targets': 0,
            'distance-4-off-targets': 0,
            'off-targets': [],
          }],
        ]])
      }
      throw new Error(url)
    })
    vi.stubGlobal('fetch', fetchMock)

    const onAddSelected = vi.fn()
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    act(() => root.render(
      <GuideScanDesignPanel record={baseRecord()} onAddSelected={onAddSelected} />,
    ))

    const geneInput = container.querySelector<HTMLInputElement>('input[list="guidescan-gene-suggestions"]')!
    const setNativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    act(() => {
      setNativeValue.call(geneInput, 'BRCA2')
      geneInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      vi.advanceTimersByTime(300)
      await Promise.resolve()
    })
    act(() => container.querySelector<HTMLButtonElement>('.guidescan-gene-suggest-list button')!.click())

    await act(async () => {
      Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('GuideScan2'))!.click()
      await vi.runAllTimersAsync()
    })

    const selectAll = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Select all')
    expect(selectAll).toBeTruthy()
    expect(container.querySelector('.guidescan-design-dialog-actions')).toBeTruthy()
    act(() => selectAll!.click())
    expect(footerAddButton(container)?.textContent).toMatch(/Open BRCA2 and add 1 selected/)
    clickFooterAdd(container)
    expect(onAddSelected).toHaveBeenCalledTimes(1)
    expect(onAddSelected.mock.calls[0]?.[0].drafts).toHaveLength(1)
    expect(onAddSelected.mock.calls[0]?.[0].drafts[0]?.hit.guideStart).toBe(50)
    expect(onAddSelected.mock.calls[0]?.[0].drafts[0]?.guideScanEvidence).toMatchObject({
      source: 'design',
      organism: 'hg38',
      enzyme: 'cas9',
      jobId: 'job-ui',
      specificity: 0.4,
      cuttingEfficiency: 0.2,
      chromosome: 'chr17',
      outcome: 'found',
    })
    act(() => root.unmount())
  })

  it('retains downloaded gene record until Add selected (no early open callback)', async () => {
    vi.useFakeTimers()
    let statusCalls = 0
    const plasmid = plasmidRecord()
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/info/supported')) return jsonResponse(catalog)
      if (url.includes('/xrefs/symbol/')) return jsonResponse([{ id: 'ENSG00000139618' }])
      if (url.includes('/lookup/id/')) {
        return jsonResponse({
          id: 'ENSG00000139618',
          display_name: 'BRCA2',
          object_type: 'Gene',
          species: 'homo_sapiens',
          assembly_name: 'GRCh38',
          seq_region_name: '13',
          start: 100,
          end: 192,
          strand: 1,
        })
      }
      if (url.includes('/sequence/id/')) {
        return jsonResponse({ id: 'ENSG00000139618', seq: baseRecord().sequence, molecule: 'dna' })
      }
      if (url.endsWith('/query') && init?.method === 'POST') {
        return jsonResponse({ 'job-id': 'job-gene' })
      }
      if (url.includes('/job/status/job-gene')) {
        statusCalls += 1
        if (statusCalls < 2) return jsonResponse({ 'job-status': 'pending', failure: null })
        return jsonResponse({ 'job-status': 'completed', 'result-type': 'standard', failure: null })
      }
      if (url.includes('/job/result/json/job-gene')) {
        return jsonResponse([[
          { 'region-name': 'BRCA2', 'chromosome-name': 'chr13', coords: ['chr13', 100, 192], organism: 'hg38' },
          [{
            sequence: 'ACTGCCCTTGCACACTGGGGNGG',
            start: 150,
            end: 172,
            direction: 'positive',
            'distance-0-off-targets': 0,
            'distance-1-off-targets': 0,
            'distance-2-off-targets': 0,
            'distance-3-off-targets': 0,
            'distance-4-off-targets': 0,
            'off-targets': [],
          }],
        ]])
      }
      throw new Error(url)
    })
    vi.stubGlobal('fetch', fetchMock)

    const onAddSelected = vi.fn()
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    act(() => root.render(
      <GuideScanDesignPanel record={plasmid} onAddSelected={onAddSelected} />,
    ))

    const geneInput = container.querySelector<HTMLInputElement>('input[list="guidescan-gene-suggestions"]')!
    const setNativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    act(() => {
      setNativeValue.call(geneInput, 'BRCA2')
      geneInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      vi.advanceTimersByTime(300)
      await Promise.resolve()
    })
    act(() => container.querySelector<HTMLButtonElement>('.guidescan-gene-suggest-list button')!.click())

    await act(async () => {
      Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('GuideScan2'))!.click()
      await vi.runAllTimersAsync()
    })

    expect(onAddSelected).not.toHaveBeenCalled()
    expect(container.textContent).toMatch(/opens the gene sequence in this window with the selected guides/i)

    act(() => Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Select all')!.click())
    clickFooterAdd(container)

    expect(onAddSelected).toHaveBeenCalledTimes(1)
    const payload = onAddSelected.mock.calls[0]?.[0]
    expect(payload?.annotationRecord.name).toBe('BRCA2')
    expect(payload?.annotationRecord.id).not.toBe(plasmid.id)
    act(() => root.unmount())
  })

  it('keeps gene-mode results after alias input resolves to a canonical symbol', async () => {
    vi.useFakeTimers()
    let statusCalls = 0
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/info/supported')) return jsonResponse(catalog)
      if (url.includes('/xrefs/symbol/')) return jsonResponse([{ id: 'ENSG00000139618' }])
      if (url.includes('/lookup/id/')) {
        return jsonResponse({
          id: 'ENSG00000139618',
          display_name: 'BRCA2',
          object_type: 'Gene',
          species: 'homo_sapiens',
          assembly_name: 'GRCh38',
          seq_region_name: '13',
          start: 100,
          end: 192,
          strand: 1,
        })
      }
      if (url.includes('/sequence/id/')) {
        return jsonResponse({ id: 'ENSG00000139618', seq: baseRecord().sequence, molecule: 'dna' })
      }
      if (url.endsWith('/query') && init?.method === 'POST') {
        return jsonResponse({ 'job-id': 'job-alias' })
      }
      if (url.includes('/job/status/job-alias')) {
        statusCalls += 1
        if (statusCalls < 2) return jsonResponse({ 'job-status': 'pending', failure: null })
        return jsonResponse({ 'job-status': 'completed', 'result-type': 'standard', failure: null })
      }
      if (url.includes('/job/result/json/job-alias')) {
        return jsonResponse([[
          { 'region-name': 'BRCA2', 'chromosome-name': 'chr13', coords: ['chr13', 100, 192], organism: 'hg38' },
          [{
            sequence: 'ACTGCCCTTGCACACTGGGGNGG',
            start: 150,
            end: 172,
            direction: 'positive',
            'distance-0-off-targets': 0,
            'distance-1-off-targets': 0,
            'distance-2-off-targets': 0,
            'distance-3-off-targets': 0,
            'distance-4-off-targets': 0,
            'off-targets': [],
          }],
        ]])
      }
      throw new Error(url)
    })
    vi.stubGlobal('fetch', fetchMock)

    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    act(() => root.render(
      <GuideScanDesignPanel record={baseRecord()} onAddSelected={() => undefined} />,
    ))

    const geneInput = container.querySelector<HTMLInputElement>('input[list="guidescan-gene-suggestions"]')!
    const setNativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    act(() => {
      setNativeValue.call(geneInput, 'FANCS')
      geneInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    await act(async () => {
      Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('GuideScan2'))!.click()
      await vi.runAllTimersAsync()
    })

    expect(geneInput.value).toBe('FANCS')
    expect(container.querySelector('.guidescan-results-table')).toBeTruthy()
    expect(container.textContent).toMatch(/BRCA2/)
    act(() => root.unmount())
  })

  it('disables Use current sequence when reference genome cannot be inferred', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/info/supported')) return jsonResponse(catalog)
      throw new Error(String(input))
    }))

    const record = {
      ...plasmidRecord(),
      name: 'BRCA1',
      externalSource: {
        provider: 'ncbi',
        accession: '672',
        database: 'gene',
        retrievedAt: new Date(0).toISOString(),
        sourceUrl: 'https://www.ncbi.nlm.nih.gov/gene/672',
      },
    }

    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    act(() => root.render(
      <GuideScanDesignPanel record={record} onAddSelected={() => undefined} />,
    ))
    await act(async () => {
      await Promise.resolve()
    })

    const currentRadio = radioByLabel(container, 'Use current sequence')!
    expect(currentRadio.disabled).toBe(true)
    expect(container.textContent).toMatch(/reference genome cannot be determined/i)
    act(() => root.unmount())
  })

  it('disables Use current sequence on plasmids without gene identity', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/info/supported')) return jsonResponse(catalog)
      throw new Error(String(input))
    }))

    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    act(() => root.render(
      <GuideScanDesignPanel record={plasmidRecord()} onAddSelected={() => undefined} />,
    ))
    await act(async () => {
      await Promise.resolve()
    })

    const currentRadio = radioByLabel(container, 'Use current sequence')!
    expect(currentRadio.disabled).toBe(true)
    expect(container.textContent).toMatch(/no external database accession|Ensembl gene ID|Entrez/i)
    act(() => root.unmount())
  })

  it('numbers added guides from existing sgRNA count and selected order', async () => {
    vi.useFakeTimers()
    let statusCalls = 0
    const { anchor, designIndices, designSpacers, record } = refSeqGeneRecordWithManyFeaturesAndOneSgRna()
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/info/supported')) return jsonResponse(catalog)
      if (url.endsWith('/query') && init?.method === 'POST') {
        return jsonResponse({ 'job-id': 'job-sgrna-names' })
      }
      if (url.includes('/job/status/job-sgrna-names')) {
        statusCalls += 1
        if (statusCalls < 2) return jsonResponse({ 'job-status': 'pending', failure: null })
        return jsonResponse({ 'job-status': 'completed', 'result-type': 'standard', failure: null })
      }
      if (url.includes('/job/result/json/job-sgrna-names')) {
        const guides = designSpacers.map((spacer, index) => {
          const genomicStart = anchor.start + designIndices[index]!
          return {
            sequence: `${spacer}NGG`,
            start: genomicStart,
            end: genomicStart + 22,
            direction: 'positive',
            specificity: 0.4,
            'cutting-efficiency': 0.2,
            annotations: [],
            'distance-0-off-targets': 0,
            'distance-1-off-targets': 0,
            'distance-2-off-targets': 0,
            'distance-3-off-targets': 0,
            'distance-4-off-targets': 0,
            'off-targets': [],
          }
        })
        return jsonResponse([[
          { 'region-name': 'TP53', 'chromosome-name': 'chr17', coords: ['chr17', anchor.start, anchor.end], organism: 'hg38' },
          guides,
        ]])
      }
      throw new Error(url)
    })
    vi.stubGlobal('fetch', fetchMock)

    const onAddSelected = vi.fn()
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    act(() => root.render(
      <GuideScanDesignPanel record={record} onAddSelected={onAddSelected} />,
    ))
    await act(async () => {
      await Promise.resolve()
    })
    act(() => radioByLabel(container, 'Use current sequence')!.click())

    await act(async () => {
      Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('GuideScan2'))!.click()
      await vi.runAllTimersAsync()
    })

    expect(container.textContent).toMatch(/4 of 4 candidates map/)
    act(() => container.querySelector<HTMLInputElement>('input[aria-label="Select guide rank 2"]')!.click())
    act(() => container.querySelector<HTMLInputElement>('input[aria-label="Select guide rank 4"]')!.click())
    clickFooterAdd(container)

    expect(onAddSelected).toHaveBeenCalledTimes(1)
    const drafts = onAddSelected.mock.calls[0]?.[0].drafts
    expect(drafts).toHaveLength(2)
    expect(drafts?.[0]?.name).toBe('sgRNA 2 (TP53, SpCas9)')
    expect(drafts?.[1]?.name).toBe('sgRNA 3 (TP53, SpCas9)')
    act(() => root.unmount())
  })

  it('enables Use current sequence for eligible Ensembl records and adds to the opened record', async () => {
    vi.useFakeTimers()
    let statusCalls = 0
    let sequenceDownloads = 0
    const opened = eligibleEnsemblRecord()
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/info/supported')) return jsonResponse(catalog)
      if (url.includes('/sequence/id/')) {
        sequenceDownloads += 1
        throw new Error('gene sequence download should not run in current-record mode')
      }
      if (url.endsWith('/query') && init?.method === 'POST') {
        return jsonResponse({ 'job-id': 'job-current' })
      }
      if (url.includes('/job/status/job-current')) {
        statusCalls += 1
        if (statusCalls < 2) return jsonResponse({ 'job-status': 'pending', failure: null })
        return jsonResponse({ 'job-status': 'completed', 'result-type': 'standard', failure: null })
      }
      if (url.includes('/job/result/json/job-current')) {
        return jsonResponse([[
          { 'region-name': 'BRCA2', 'chromosome-name': 'chr17', coords: ['chr17', 100, 200], organism: 'hg38' },
          [{
            sequence: 'ACTGCCCTTGCACACTGGGGNGG',
            start: 150,
            end: 172,
            direction: 'positive',
            'distance-0-off-targets': 0,
            'distance-1-off-targets': 0,
            'distance-2-off-targets': 0,
            'distance-3-off-targets': 0,
            'distance-4-off-targets': 0,
            'off-targets': [],
          }],
        ]])
      }
      if (url.includes('/xrefs/symbol/') || url.includes('/lookup/id/')) throw new Error(url)
      throw new Error(url)
    })
    vi.stubGlobal('fetch', fetchMock)

    const onAddSelected = vi.fn()
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    act(() => root.render(
      <GuideScanDesignPanel record={opened} onAddSelected={onAddSelected} />,
    ))
    await act(async () => {
      await Promise.resolve()
    })

    const currentRadio = radioByLabel(container, 'Use current sequence')!
    expect(currentRadio.disabled).toBe(false)
    act(() => currentRadio.click())

    await act(async () => {
      Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('GuideScan2'))!.click()
      await vi.runAllTimersAsync()
    })

    expect(sequenceDownloads).toBe(0)
    act(() => Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Select all')!.click())
    clickFooterAdd(container)
    expect(onAddSelected).toHaveBeenCalledTimes(1)
    expect(onAddSelected.mock.calls[0]?.[0].annotationRecord.id).toBe(opened.id)
    act(() => root.unmount())
  })

  it('enables Use current sequence for NCBI RefSeqGene records with a GeneID qualifier', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/info/supported')) return jsonResponse(catalog)
      throw new Error(String(input))
    }))

    const record: SequenceRecord = {
      ...plasmidRecord(),
      name: 'NG_016444.2',
      description: 'Homo sapiens LDL receptor related protein 1 (LRP1), RefSeqGene on chromosome 12',
      construct: {
        ...plasmidRecord().construct,
        sourceOrganism: 'homo-sapiens',
      },
      externalSource: {
        provider: 'ncbi',
        accession: 'NG_016444.2',
        database: 'nuccore',
        retrievedAt: new Date(0).toISOString(),
        sourceUrl: 'https://www.ncbi.nlm.nih.gov/nuccore/NG_016444.2',
      },
      features: [
        {
          id: 'src',
          name: 'source',
          type: 'source',
          color: '#888',
          notes: '/organism="Homo sapiens" /db_xref="taxon:9606"',
          locations: [{ start: 0, end: 4, strand: 'forward' }],
        },
        {
          id: 'gene',
          name: 'LRP1',
          type: 'gene',
          color: '#00f',
          notes: '/gene="LRP1" /db_xref="GeneID:4035" /db_xref="HGNC:HGNC:6692"',
          locations: [{ start: 0, end: 4, strand: 'forward' }],
        },
      ],
    }

    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    act(() => root.render(
      <GuideScanDesignPanel record={record} onAddSelected={() => undefined} />,
    ))
    await act(async () => {
      await Promise.resolve()
    })

    const currentRadio = radioByLabel(container, 'Use current sequence')!
    expect(currentRadio.disabled).toBe(false)
    expect(currentRadio.closest('label')?.getAttribute('title')).toMatch(/LRP1/)
    expect(currentRadio.closest('label')?.getAttribute('title')).toMatch(/4035/)
    act(() => currentRadio.click())
    expect(container.textContent).toMatch(/Designing for LRP1/)
    expect(container.textContent).toMatch(/4035/)
    act(() => root.unmount())
  })

  it('explains when GuideScan candidates cannot map onto the opened sequence', async () => {
    vi.useFakeTimers()
    let statusCalls = 0
    const opened = eligibleEnsemblRecord()
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/info/supported')) return jsonResponse(catalog)
      if (url.endsWith('/query') && init?.method === 'POST') {
        return jsonResponse({ 'job-id': 'job-unmapped' })
      }
      if (url.includes('/job/status/job-unmapped')) {
        statusCalls += 1
        if (statusCalls < 2) return jsonResponse({ 'job-status': 'pending', failure: null })
        return jsonResponse({ 'job-status': 'completed', 'result-type': 'standard', failure: null })
      }
      if (url.includes('/job/result/json/job-unmapped')) {
        return jsonResponse([[
          { 'region-name': 'C1D', 'chromosome-name': 'chr2', coords: ['chr2', 6804000, 6805000], organism: 'hg38' },
          Array.from({ length: 20 }, (_, index) => ({
            sequence: 'TTTTTTTTTTTTTTTTTTTTNGG',
            start: 6804000 + index,
            end: 6804022 + index,
            direction: 'positive',
            'distance-0-off-targets': 0,
            'distance-1-off-targets': 0,
            'distance-2-off-targets': 0,
            'distance-3-off-targets': 0,
            'distance-4-off-targets': 0,
            'off-targets': [],
          })),
        ]])
      }
      throw new Error(url)
    }))

    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    act(() => root.render(
      <GuideScanDesignPanel record={opened} onAddSelected={() => undefined} />,
    ))
    await act(async () => {
      await Promise.resolve()
    })
    act(() => radioByLabel(container, 'Use current sequence')!.click())

    await act(async () => {
      Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('GuideScan2'))!.click()
      await vi.runAllTimersAsync()
    })

    expect(container.textContent).toMatch(/0 of 20 candidates map to BRCA2/)
    const checkboxes = Array.from(container.querySelectorAll<HTMLInputElement>('.guidescan-results-table input[type="checkbox"]'))
    expect(checkboxes).toHaveLength(20)
    expect(checkboxes.every((input) => input.disabled)).toBe(true)
    expect(container.textContent).toMatch(/unmapped/)
    act(() => root.unmount())
  })

  it('does not re-hydrate after persisting a fresh gene-mode run cache', async () => {
    vi.useFakeTimers()
    let statusCalls = 0
    const host = plasmidRecord()
    let geneSequenceFetchCalls = 0
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/info/supported')) return jsonResponse(catalog)
      if (url.includes('/xrefs/symbol/')) return jsonResponse([{ id: 'ENSG00000141510' }])
      if (url.includes('/lookup/id/')) {
        return jsonResponse({
          id: 'ENSG00000141510',
          display_name: 'TP53',
          object_type: 'Gene',
          species: 'homo_sapiens',
          assembly_name: 'GRCh38',
          seq_region_name: '17',
          start: 100,
          end: 192,
          strand: 1,
        })
      }
      if (url.includes('/sequence/id/')) {
        geneSequenceFetchCalls += 1
        return jsonResponse({ id: 'ENSG00000141510', seq: baseRecord().sequence, molecule: 'dna' })
      }
      if (url.endsWith('/query') && init?.method === 'POST') {
        return jsonResponse({ 'job-id': 'job-persist' })
      }
      if (url.includes('/job/status/job-persist')) {
        statusCalls += 1
        if (statusCalls < 2) return jsonResponse({ 'job-status': 'pending', failure: null })
        return jsonResponse({ 'job-status': 'completed', 'result-type': 'standard', failure: null })
      }
      if (url.includes('/job/result/json/job-persist')) {
        return jsonResponse([[
          { 'region-name': 'TP53', 'chromosome-name': 'chr17', coords: ['chr17', 100, 192], organism: 'hg38' },
          Array.from({ length: 20 }, (_, index) => ({
            sequence: 'ACTGCCCTTGCACACTGGGGNGG',
            start: 150 + index,
            end: 172 + index,
            direction: 'positive',
            specificity: 0.4,
            'cutting-efficiency': 0.2,
            'distance-0-off-targets': 0,
            'distance-1-off-targets': 0,
            'distance-2-off-targets': 0,
            'distance-3-off-targets': 0,
            'distance-4-off-targets': 0,
            'off-targets': [],
          })),
        ]])
      }
      throw new Error(url)
    })
    vi.stubGlobal('fetch', fetchMock)

    function PersistHarness() {
      const [persistedCache, setPersistedCache] = useState<GuideScanDesignCacheEntry | undefined>()
      return (
        <GuideScanDesignPanel
          record={host}
          persistedCache={persistedCache}
          onPersistDesignCache={setPersistedCache}
          onAddSelected={() => undefined}
        />
      )
    }

    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    act(() => root.render(<PersistHarness />))

    const geneInput = container.querySelector<HTMLInputElement>('input[list="guidescan-gene-suggestions"]')!
    const setNativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    act(() => {
      setNativeValue.call(geneInput, 'TP53')
      geneInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      vi.advanceTimersByTime(300)
      await Promise.resolve()
    })
    act(() => container.querySelector<HTMLButtonElement>('.guidescan-gene-suggest-list button')!.click())

    await act(async () => {
      Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('GuideScan2'))!.click()
      await vi.runAllTimersAsync()
    })

    expect(geneSequenceFetchCalls).toBe(1)
    expect(container.textContent).toMatch(/20 of 20 candidates map to TP53/)
    expect(container.textContent).not.toMatch(/Restoring previous results/)

    await act(async () => {
      await vi.runAllTimersAsync()
    })

    expect(geneSequenceFetchCalls).toBe(1)
    expect(container.textContent).not.toMatch(/Restoring previous results/)
    expect(container.textContent).not.toMatch(/fetching TP53 sequence for mapping/)
    act(() => root.unmount())
  })

  it('refetches gene sequence when restoring gene-mode design cache', async () => {
    vi.useFakeTimers()
    const host = plasmidRecord()
    const geneHost = eligibleEnsemblRecord()
    const cachedGuide = {
      id: 'BRCA2.1:17:150-172:forward',
      rank: 1,
      regionName: 'BRCA2',
      organism: 'hg38',
      enzyme: 'cas9',
      chromosome: 'chr17',
      start: 150,
      end: 172,
      strand: 'forward' as const,
      sequence: 'ACTGCCCTTGCACACTGGGGNGG',
      spacer: 'ACTGCCCTTGCACACTGGGG',
      pam: 'NGG',
      specificity: 0.4,
      cuttingEfficiency: 0.2,
      annotations: [],
      offTargetCounts: { distance0: 0, distance1: 0, distance2: 0, distance3: 0, distance4: 0 },
      offTargets: [],
    }
    const persistedCache = buildGuideScanDesignCacheEntry({
      record: host,
      inputMode: 'gene',
      queryText: 'BRCA2',
      organism: 'hg38',
      enzyme: 'cas9',
      topN: 20,
      resolvedGene: {
        symbol: 'BRCA2',
        ensemblId: 'ENSG00000139618',
        description: 'BRCA2 DNA repair associated',
        species: 'homo_sapiens',
        exactSymbolMatch: true,
      },
      statusMessage: '19 of 20 candidates map to BRCA2. "Open BRCA2 and add…" opens the gene sequence in this window with the selected guides.',
      designResult: {
        jobId: 'job-cached',
        resultType: 'standard',
        organism: 'hg38',
        enzyme: 'cas9',
        regions: [],
        guides: [cachedGuide],
      },
    })
    let geneSequenceFetchCalls = 0
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/info/supported')) return jsonResponse(catalog)
      if (url.includes('/xrefs/symbol/')) return jsonResponse([{ id: 'ENSG00000139618' }])
      if (url.includes('/lookup/id/')) {
        return jsonResponse({
          id: 'ENSG00000139618',
          display_name: 'BRCA2',
          object_type: 'Gene',
          species: 'homo_sapiens',
          assembly_name: 'GRCh38',
          seq_region_name: '17',
          start: 100,
          end: 100 + geneHost.sequence.length - 1,
          strand: 1,
        })
      }
      if (url.includes('/sequence/id/')) {
        geneSequenceFetchCalls += 1
        return jsonResponse({ id: 'ENSG00000139618', seq: geneHost.sequence, molecule: 'dna' })
      }
      throw new Error(url)
    }))

    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    act(() => root.render(
      <GuideScanDesignPanel
        record={host}
        persistedCache={persistedCache}
        onAddSelected={() => undefined}
      />,
    ))
    await act(async () => {
      await vi.runAllTimersAsync()
    })

    expect(geneSequenceFetchCalls).toBe(1)
    expect(container.textContent).toMatch(/1 of 1 candidates map to BRCA2/)
    expect(container.textContent).not.toMatch(/0 of 1 candidates map to pTarget plasmid/)
    expect(container.textContent).not.toMatch(/19 of 20 candidates map/)
    expect(container.textContent).not.toMatch(/fetching BRCA2 sequence for mapping/)
    expect(container.textContent).not.toMatch(/awaiting gene sequence for mapping/)
    const checkbox = container.querySelector<HTMLInputElement>('.guidescan-results-table input[type="checkbox"]')!
    expect(checkbox.disabled).toBe(false)

    act(() => root.render(
      <GuideScanDesignPanel
        record={{ ...host }}
        persistedCache={{ ...persistedCache }}
        onPersistDesignCache={() => undefined}
        onAddSelected={() => undefined}
      />,
    ))
    await act(async () => {
      await vi.runAllTimersAsync()
    })

    expect(geneSequenceFetchCalls).toBe(1)
    expect(container.textContent).toMatch(/1 of 1 candidates map to BRCA2/)
    expect(container.textContent).not.toMatch(/fetching BRCA2 sequence for mapping/)
    expect(container.textContent).not.toMatch(/awaiting gene sequence for mapping/)
    act(() => root.unmount())
  })

  it('explains when restored gene-mode cache cannot reload gene sequence', async () => {
    vi.useFakeTimers()
    const host = plasmidRecord()
    const persistedCache = buildGuideScanDesignCacheEntry({
      record: host,
      inputMode: 'gene',
      queryText: 'CCR5',
      organism: 'hg38',
      enzyme: 'cas9',
      topN: 20,
      resolvedGene: {
        symbol: 'CCR5',
        ensemblId: 'ENSG00000160791',
        description: 'CCR5',
        species: 'homo_sapiens',
        exactSymbolMatch: true,
      },
      statusMessage: '19 of 20 candidates map to CCR5. "Open CCR5 and add…" opens the gene sequence in this window with the selected guides.',
      designResult: {
        jobId: 'job-cached-ccr5',
        resultType: 'standard',
        organism: 'hg38',
        enzyme: 'cas9',
        regions: [],
        guides: [{
          id: 'CCR5.1',
          rank: 1,
          regionName: 'CCR5',
          organism: 'hg38',
          enzyme: 'cas9',
          chromosome: 'chr3',
          start: 1,
          end: 23,
          strand: 'forward' as const,
          sequence: 'TTTTTTTTTTTTTTTTTTTTNGG',
          spacer: 'TTTTTTTTTTTTTTTTTTTT',
          pam: 'NGG',
          specificity: 0.1,
          cuttingEfficiency: 0.1,
          annotations: [],
          offTargetCounts: { distance0: 0, distance1: 0, distance2: 0, distance3: 0, distance4: 0 },
          offTargets: [],
        }],
      },
    })
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/info/supported')) return jsonResponse(catalog)
      throw new Error('network down')
    }))

    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    act(() => root.render(
      <GuideScanDesignPanel record={host} persistedCache={persistedCache} onAddSelected={() => undefined} />,
    ))
    await act(async () => {
      await vi.runAllTimersAsync()
    })

    expect(container.textContent).toMatch(/gene sequence could not be loaded for mapping/)
    expect(container.textContent).toMatch(/Run again to retry/)
    expect(container.textContent).not.toMatch(/19 of 20 candidates map/)
    expect(container.textContent).toMatch(/CCR5 — awaiting gene sequence for mapping/)
    act(() => root.unmount())
  })

  it('selection mode with stored anchor submits chr:start-end to GuideScan2', async () => {
    vi.useFakeTimers()
    let statusCalls = 0
    let submittedQuery = ''
    const opened = eligibleEnsemblRecord()
    const designSelection = { kind: 'range' as const, start: 50, end: 100, label: '51..100 (50 bp)' }
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/info/supported')) return jsonResponse(catalog)
      if (url.endsWith('/query') && init?.method === 'POST') {
        const body = init.body as FormData
        submittedQuery = String(body.get('query-text') ?? '')
        return jsonResponse({ 'job-id': 'job-selection-anchor' })
      }
      if (url.includes('/job/status/job-selection-anchor')) {
        statusCalls += 1
        if (statusCalls < 2) return jsonResponse({ 'job-status': 'pending', failure: null })
        return jsonResponse({ 'job-status': 'completed', 'result-type': 'standard', failure: null })
      }
      if (url.includes('/job/result/json/job-selection-anchor')) {
        return jsonResponse([[
          { 'region-name': 'chr17:150-172', 'chromosome-name': 'chr17', coords: ['chr17', 150, 172], organism: 'hg38' },
          [{
            sequence: 'ACTGCCCTTGCACACTGGGGNGG',
            start: 150,
            end: 172,
            direction: 'positive',
            'distance-0-off-targets': 0,
            'distance-1-off-targets': 0,
            'distance-2-off-targets': 0,
            'distance-3-off-targets': 0,
            'distance-4-off-targets': 0,
            'off-targets': [],
          }],
        ]])
      }
      throw new Error(url)
    })
    vi.stubGlobal('fetch', fetchMock)

    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    act(() => root.render(
      <GuideScanDesignPanel
        record={opened}
        designSelection={designSelection}
        onAddSelected={() => undefined}
      />,
    ))
    await act(async () => {
      await Promise.resolve()
    })
    act(() => radioByLabel(container, 'Selected region')!.click())
    await act(async () => {
      Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('GuideScan2'))!.click()
      await vi.runAllTimersAsync()
    })

    expect(submittedQuery).toMatch(/^chr17:\d+-\d+$/)
    act(() => {
      Array.from(container.querySelectorAll('.guidescan-design-pane-tabs [role="tab"]'))
        .find((tab) => tab.textContent?.startsWith('Configure'))!
        .click()
    })
    expect(container.textContent).toMatch(/Using stored genome coordinates/)
    expect(container.querySelector('.guidescan-design-dialog-actions')).toBeTruthy()
    act(() => root.unmount())
  })

  it('selection mode without anchor or gene identity shows explicit failure and skips GuideScan', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/info/supported')) return jsonResponse(catalog)
      throw new Error(String(input))
    }))
    const designSelection = { kind: 'range' as const, start: 10, end: 40, label: '11..40 (30 bp)' }
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    act(() => root.render(
      <GuideScanDesignPanel
        record={plasmidRecord()}
        designSelection={designSelection}
        onAddSelected={() => undefined}
      />,
    ))
    await act(async () => {
      await Promise.resolve()
    })
    expect(radioByLabel(container, 'Selected region')!.checked).toBe(true)
    expect(container.textContent).toMatch(/can't be used as a GuideScan target/)
    expect(container.textContent).toMatch(/switch Target to "Gene \/ Entrez ID"/)
    const designButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('GuideScan2'))!
    expect(designButton.disabled).toBe(true)
    act(() => root.unmount())
  })

  it('selection mode with Entrez RefSeqGene resolves placement via NCBI before submitting coordinates', async () => {
    vi.useFakeTimers()
    let statusCalls = 0
    let submittedQuery = ''
    const sequence = baseRecord().sequence
    const refSeqRecord: SequenceRecord = {
      ...plasmidRecord(),
      sequence,
      name: 'NG_012741.2',
      description: 'Homo sapiens very low density lipoprotein receptor (VLDLR), RefSeqGene on chromosome 19.',
      construct: {
        ...plasmidRecord().construct,
        sourceOrganism: 'homo-sapiens',
      },
      externalSource: {
        provider: 'ncbi',
        accession: 'NG_012741.2',
        database: 'nuccore',
        retrievedAt: new Date(0).toISOString(),
        sourceUrl: 'https://www.ncbi.nlm.nih.gov/nuccore/NG_012741.2',
      },
      features: [{
        id: 'gene-vldlr',
        name: 'VLDLR',
        type: 'gene',
        color: '#00f',
        notes: '/gene="VLDLR" /db_xref="GeneID:7436"',
        locations: [{ start: 0, end: sequence.length, strand: 'forward' }],
      }],
    }
    const designSelection = { kind: 'range' as const, start: 50, end: 120, label: '51..120 (70 bp)' }
    vi.spyOn(guidescanGene, 'anchorRefSeqGeneOnReference').mockResolvedValue({
      organism: 'hg38',
      chromosome: 'chr17',
      start: 100,
      end: 100 + sequence.length - 1,
      strand: 'forward',
    })
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/info/supported')) return jsonResponse(catalog)
      if (url.includes('eutils.ncbi.nlm.nih.gov')) {
        const requested = new URL(url)
        if (requested.pathname.endsWith('/esummary.fcgi') && requested.searchParams.get('db') === 'gene') {
          const geneId = requested.searchParams.get('id') ?? '7436'
          const chrstart = 99
          const chrstop = chrstart + sequence.length - 1
          return jsonResponse({
            result: {
              uids: [geneId],
              [geneId]: {
                uid: geneId,
                name: 'VLDLR',
                description: 'very low density lipoprotein receptor',
                organism: { scientificname: 'Homo sapiens', taxid: 9606 },
                genomicinfo: [{
                  chraccver: 'NC_000017.11',
                  chrstart,
                  chrstop,
                  assemblyaccver: 'GRCh38',
                }],
              },
            },
          })
        }
        if (requested.pathname.endsWith('/elink.fcgi')) {
          return jsonResponse({ linksets: [{ linksetdbs: [] }] })
        }
      }
      if (url.endsWith('/query') && init?.method === 'POST') {
        const body = init.body as FormData
        submittedQuery = String(body.get('query-text') ?? '')
        return jsonResponse({ 'job-id': 'job-selection-ncbi' })
      }
      if (url.includes('/job/status/job-selection-ncbi')) {
        statusCalls += 1
        if (statusCalls < 2) return jsonResponse({ 'job-status': 'pending', failure: null })
        return jsonResponse({ 'job-status': 'completed', 'result-type': 'standard', failure: null })
      }
      if (url.includes('/job/result/json/job-selection-ncbi')) {
        return jsonResponse([[
          { 'region-name': 'chr17:150-172', 'chromosome-name': 'chr17', coords: ['chr17', 150, 172], organism: 'hg38' },
          [{
            sequence: 'ACTGCCCTTGCACACTGGGGNGG',
            start: 150,
            end: 172,
            direction: 'positive',
            'distance-0-off-targets': 0,
            'distance-1-off-targets': 0,
            'distance-2-off-targets': 0,
            'distance-3-off-targets': 0,
            'distance-4-off-targets': 0,
            'off-targets': [],
          }],
        ]])
      }
      throw new Error(url)
    })
    vi.stubGlobal('fetch', fetchMock)

    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    act(() => root.render(
      <GuideScanDesignPanel
        record={refSeqRecord}
        designSelection={designSelection}
        onAddSelected={() => undefined}
      />,
    ))
    await act(async () => {
      await Promise.resolve()
    })
    act(() => radioByLabel(container, 'Selected region')!.click())
    await act(async () => {
      Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('GuideScan2'))!.click()
      await vi.runAllTimersAsync()
    })

    expect(submittedQuery).toMatch(/^chr17:\d+-\d+$/)
    act(() => {
      Array.from(container.querySelectorAll('.guidescan-design-pane-tabs [role="tab"]'))
        .find((tab) => tab.textContent?.startsWith('Configure'))!
        .click()
    })
    expect(container.textContent).toMatch(/Locating NG_012741\.2 on/i)
    expect(container.textContent).toMatch(/Located NG_012741\.2 on/i)
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/esummary.fcgi'))).toBe(true)
    act(() => root.unmount())
  })
})

describe('GuideScan design dialog shell', () => {
  it('renders the standalone dialog title and panel', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/info/supported')) return jsonResponse(catalog)
      throw new Error(String(input))
    }))
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    act(() => root.render(
      <GuideScanDesignDialog
        record={baseRecord()}
        onCancel={() => undefined}
        onAddSelected={() => undefined}
      />,
    ))
    await act(async () => {
      await Promise.resolve()
    })
    expect(container.textContent).toContain('Design sgRNA with GuideScan2')
    expect(container.querySelector('.guidescan-design-panel')).toBeTruthy()
    expect(container.querySelector('.guidescan-design-pane-tabs')).toBeTruthy()
    expect(container.querySelector('.dialog-resize-grip')).toBeTruthy()
    expect(container.querySelector('.guidescan-design-dialog-actions')).toBeTruthy()
    const paneTab = (label: string) =>
      [...container.querySelectorAll('.guidescan-design-pane-tabs [role="tab"]')].find((tab) =>
        tab.textContent?.startsWith(label),
      ) as HTMLButtonElement
    expect(paneTab('Configure').getAttribute('aria-selected')).toBe('true')
    act(() => paneTab('Results').click())
    expect(paneTab('Results').getAttribute('aria-selected')).toBe('true')
    expect(container.querySelector('.guidescan-design-results-empty')?.textContent).toMatch(/No results yet/)
    act(() => paneTab('Configure').click())
    expect(container.querySelector('.guidescan-design-configure-pane')).toBeTruthy()
    act(() => root.unmount())
  })
})

describe('SgRna manual dialog GuideScan validation', () => {
  it('shows the validation action in add and edit flows', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/info/supported')) return jsonResponse(catalog)
      throw new Error(String(input))
    }))
    const record = baseRecord()
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    act(() => root.render(
      <SgRnaDialog record={record} selection={null} onCancel={() => undefined} onSave={() => undefined} />,
    ))
    await act(async () => {
      await Promise.resolve()
    })
    expect(container.textContent).toContain('Validate with GuideScan2')
    expect(container.textContent).not.toContain('GuideScan2 design')
    act(() => root.unmount())
  })

  it('defaults manual add name from sgRNA annotation count, not total features', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/info/supported')) return jsonResponse(catalog)
      throw new Error(String(input))
    }))
    const { record } = refSeqGeneRecordWithManyFeaturesAndOneSgRna()
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    act(() => root.render(
      <SgRnaDialog record={record} selection={null} onCancel={() => undefined} onSave={() => undefined} />,
    ))
    await act(async () => {
      await Promise.resolve()
    })
    const nameInput = Array.from(container.querySelectorAll('label'))
      .find((label) => label.textContent?.startsWith('Name'))
      ?.querySelector('input') as HTMLInputElement
    expect(nameInput.value).toBe('sgRNA 2')
    act(() => root.unmount())
  })

  it('keeps persisted designed evidence under StrictMode and clears it after a spacer edit', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/info/supported')) return jsonResponse(catalog)
      throw new Error(String(input))
    }))
    const { record, editing } = designedSgRnaEditFixture()
    const onSave = vi.fn()
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    act(() => root.render(
      <StrictMode>
        <SgRnaDialog record={record} selection={null} editing={editing} onCancel={() => undefined} onSave={onSave} />
      </StrictMode>,
    ))
    await act(async () => {
      await Promise.resolve()
    })
    expect(container.textContent).toContain('Designed')
    expect(container.textContent).toContain('0.40')
    expect(container.textContent).toContain('0.20')

    act(() => Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Save sgRNA')!.click())
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0]?.[0].guideScanEvidence).toMatchObject({
      source: 'design',
      specificity: 0.4,
      cuttingEfficiency: 0.2,
      jobId: 'job-design',
    })

    const spacerInput = Array.from(container.querySelectorAll('label')).find((label) => label.textContent?.includes('Guide (5′→3′, no PAM)'))?.querySelector('input')
    expect(spacerInput).toBeTruthy()
    const setNativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    act(() => {
      setNativeValue.call(spacerInput, `${editing.spacer}A`)
      spacerInput!.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(container.textContent).not.toContain('0.40')
    expect(container.textContent).not.toContain('0.20')
    act(() => root.unmount())
  })

  it('shows persisted Designed evidence and reports validation evidence to the dialog', async () => {
    vi.useFakeTimers()
    let statusCalls = 0
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/info/supported')) return jsonResponse(catalog)
      if (url.endsWith('/query') && init?.method === 'POST') return jsonResponse({ 'job-id': 'job-dialog-val' })
      if (url.includes('/job/status/job-dialog-val')) {
        statusCalls += 1
        if (statusCalls < 2) return jsonResponse({ 'job-status': 'pending', failure: null })
        return jsonResponse({ 'job-status': 'completed', 'result-type': 'grna', failure: null })
      }
      if (url.includes('/job/result/json/job-dialog-val')) {
        return jsonResponse([{
          sequence: 'ACTGCCCTTGCACACTGGGGNGG',
          start: 150,
          end: 172,
          direction: 'positive',
          specificity: 0.66,
          'cutting-efficiency': 0.33,
          annotations: [],
          'distance-0-off-targets': 0,
          'distance-1-off-targets': 0,
          'distance-2-off-targets': 0,
          'distance-3-off-targets': 0,
          'distance-4-off-targets': 0,
          'off-targets': [],
          'genomic-region': {
            'region-name': 'hit',
            'chromosome-name': 'chr17',
            coords: ['chr17', 150, 172],
            organism: 'hg38',
          },
        }])
      }
      throw new Error(url)
    }))

    const { record, editing } = designedSgRnaEditFixture()
    const onSave = vi.fn()
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    act(() => root.render(
      <StrictMode>
        <SgRnaDialog record={record} selection={null} editing={editing} onCancel={() => undefined} onSave={onSave} />
      </StrictMode>,
    ))
    await act(async () => {
      await Promise.resolve()
    })
    expect(container.textContent).toContain('Designed')
    expect(container.textContent).toContain('0.40')

    act(() => Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Validate with GuideScan2')!.click())
    await act(async () => {
      await vi.runAllTimersAsync()
    })
    expect(container.textContent).toContain('Validated')
    expect(container.textContent).toContain('0.66')

    act(() => Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Save sgRNA')!.click())
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0]?.[0].guideScanEvidence).toMatchObject({
      source: 'validation',
      outcome: 'found',
      specificity: 0.66,
      jobId: 'job-dialog-val',
    })
    act(() => root.unmount())
  })
})

describe('GuideScan validation precheck', () => {
  it('maps supported Cas presets and disables unsupported nucleases', () => {
    expect(mapSgRnaPresetToGuideScanEnzyme('SpCas9')).toEqual({ ok: true, enzyme: 'cas9' })
    expect(mapSgRnaPresetToGuideScanEnzyme('Cas12a')).toEqual({ ok: true, enzyme: 'cpf1' })
    expect(mapSgRnaPresetToGuideScanEnzyme('SaCas9')).toMatchObject({ ok: false })
    expect(mapSgRnaPresetToGuideScanEnzyme('custom')).toMatchObject({ ok: false })
  })

  it('disables validation for short guides and renders found vs not-found results', async () => {
    vi.useFakeTimers()
    let statusCalls = 0
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/info/supported')) return jsonResponse(catalog)
      if (url.endsWith('/query') && init?.method === 'POST') {
        return jsonResponse({ 'job-id': 'job-validate' })
      }
      if (url.includes('/job/status/job-validate')) {
        statusCalls += 1
        if (statusCalls < 2) return jsonResponse({ 'job-status': 'pending', failure: null })
        return jsonResponse({ 'job-status': 'completed', 'result-type': 'grna', failure: null })
      }
      if (url.includes('/job/result/json/job-validate')) {
        return jsonResponse([{
          sequence: `${'A'.repeat(20)}NGG`,
          start: 150,
          end: 172,
          direction: 'positive',
          specificity: 0.88,
          'cutting-efficiency': 0.55,
          annotations: ['exon'],
          'distance-0-off-targets': 0,
          'distance-1-off-targets': 1,
          'distance-2-off-targets': 0,
          'distance-3-off-targets': 0,
          'distance-4-off-targets': 0,
          'off-targets': [],
          'genomic-region': {
            'region-name': 'hit',
            'chromosome-name': 'chr17',
            coords: ['chr17', 150, 172],
            organism: 'hg38',
          },
        }])
      }
      throw new Error(url)
    })
    vi.stubGlobal('fetch', fetchMock)

    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    act(() => root.render(
      <SgRnaGuideScanValidation record={baseRecord()} presetId="SpCas9" spacer={'A'.repeat(19)} />,
    ))
    await act(async () => {
      await Promise.resolve()
    })
    const validateButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Validate with GuideScan2')!
    expect(validateButton.disabled).toBe(true)
    expect(container.textContent).toMatch(/20–23 nt/)

    act(() => root.render(
      <SgRnaGuideScanValidation record={baseRecord()} presetId="SpCas9" spacer={`${'A'.repeat(20)}`} />,
    ))
    await act(async () => {
      await Promise.resolve()
    })
    const enabledButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Validate with GuideScan2')!
    expect(enabledButton.disabled).toBe(false)
    act(() => enabledButton.click())
    await act(async () => {
      await vi.runAllTimersAsync()
    })
    expect(container.textContent).toContain('Found')
    expect(container.textContent).toContain('0.88')

    statusCalls = 0
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/info/supported')) return jsonResponse(catalog)
      if (url.endsWith('/query') && init?.method === 'POST') return jsonResponse({ 'job-id': 'job-miss' })
      if (url.includes('/job/status/job-miss')) {
        statusCalls += 1
        if (statusCalls < 2) return jsonResponse({ 'job-status': 'pending', failure: null })
        return jsonResponse({ 'job-status': 'completed', 'result-type': 'grna', failure: null })
      }
      if (url.includes('/job/result/json/job-miss')) {
        return jsonResponse([{ error: { message: 'Guide not found in GuideScan2 database.' }, grna: `${'A'.repeat(20)}` }])
      }
      throw new Error(url)
    }))

    act(() => root.render(
      <SgRnaGuideScanValidation record={baseRecord()} presetId="SpCas9" spacer={`${'A'.repeat(20)}`} />,
    ))
    await act(async () => {
      await Promise.resolve()
    })
    act(() => Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Validate with GuideScan2')!.click())
    await act(async () => {
      await vi.runAllTimersAsync()
    })
    expect(container.textContent).toContain('Not found')
    act(() => root.unmount())
  })

  it('clears validation status and results when the guide spacer changes after success', async () => {
    vi.useFakeTimers()
    let statusCalls = 0
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/info/supported')) return jsonResponse(catalog)
      if (url.endsWith('/query') && init?.method === 'POST') {
        return jsonResponse({ 'job-id': 'job-validate-spacer' })
      }
      if (url.includes('/job/status/job-validate-spacer')) {
        statusCalls += 1
        if (statusCalls < 2) return jsonResponse({ 'job-status': 'pending', failure: null })
        return jsonResponse({ 'job-status': 'completed', 'result-type': 'grna', failure: null })
      }
      if (url.includes('/job/result/json/job-validate-spacer')) {
        return jsonResponse([{
          sequence: `${'A'.repeat(20)}NGG`,
          start: 150,
          end: 172,
          direction: 'positive',
          specificity: 0.88,
          'cutting-efficiency': 0.55,
          annotations: [],
          'distance-0-off-targets': 0,
          'distance-1-off-targets': 0,
          'distance-2-off-targets': 0,
          'distance-3-off-targets': 0,
          'distance-4-off-targets': 0,
          'off-targets': [],
          'genomic-region': {
            'region-name': 'hit',
            'chromosome-name': 'chr17',
            coords: ['chr17', 150, 172],
            organism: 'hg38',
          },
        }])
      }
      throw new Error(url)
    })
    vi.stubGlobal('fetch', fetchMock)

    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    const initialSpacer = 'A'.repeat(20)
    act(() => root.render(
      <SgRnaGuideScanValidation record={baseRecord()} presetId="SpCas9" spacer={initialSpacer} />,
    ))
    await act(async () => {
      await Promise.resolve()
    })
    act(() => Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Validate with GuideScan2')!.click())
    await act(async () => {
      await vi.runAllTimersAsync()
    })
    expect(container.textContent).toContain('Guide found in GuideScan2.')
    expect(container.textContent).toContain('Found')

    act(() => root.render(
      <SgRnaGuideScanValidation record={baseRecord()} presetId="SpCas9" spacer={`${'C'.repeat(20)}`} />,
    ))
    await act(async () => {
      await Promise.resolve()
    })
    expect(container.textContent).not.toContain('Guide found in GuideScan2.')
    expect(container.querySelector('.guidescan-validate-results')).toBeNull()
    act(() => root.unmount())
  })
})
