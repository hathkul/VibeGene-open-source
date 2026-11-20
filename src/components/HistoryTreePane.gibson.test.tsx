// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { enzymes, findRestrictionSites } from '../domain/enzymes'
import { analyzeGibsonAssembly, assembleGibsonProduct, defaultGibsonPartConfig, resolveGibsonPart } from '../domain/gibsonAssembly'
import { contributionGeometry, digestEnzymeNamesFromHistorySummary } from '../domain/historyContribution'
import { exportSnapGene, parseFasta, parseSnapGene } from '../domain/parsers'
import { reverseComplement } from '../domain/sequence'
import { initSnapGeneLzma } from '../domain/snapgeneLzma'
import { gibsonHistoryForDisplay } from '../domain/gibsonHistoryDisplay'
import { HistoryTreePane } from './HistoryTreePane'

function assembledProduct() {
  let state = 7741
  const randomDna = (length: number) => Array.from({ length }, () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return 'ACGT'[(state >>> 24) & 3]!
  }).join('')
  const source = (name: string, sequence: string) => parseFasta(`>${name}\n${sequence}`, `${name}.fasta`)

  const digestSource = source('digest-source', `GAATTC${randomDna(200)}GGATCC`)
  const sites = findRestrictionSites(digestSource.sequence, enzymes.filter((enzyme) => ['EcoRI', 'BamHI'].includes(enzyme.name)), { topology: 'linear' })
  const digestConfig = defaultGibsonPartConfig('fragment', digestSource)
  digestConfig.linearizationMode = 'restriction'
  digestConfig.leftCut = { ...digestConfig.leftCut, enzymeName: 'EcoRI', site: sites.find((site) => site.enzyme.name === 'EcoRI')! }
  digestConfig.rightCut = { ...digestConfig.rightCut, enzymeName: 'BamHI', site: sites.find((site) => site.enzyme.name === 'BamHI')! }
  const digest = resolveGibsonPart(digestConfig, 2, 1)

  const overlap = randomDna(25)
  const pcrSequence = overlap + randomDna(200) + digest.sequence.slice(0, 25)
  const pcrConfig = defaultGibsonPartConfig('fragment', source('pcr-source', pcrSequence))
  pcrConfig.linearizationMode = 'pcr'
  pcrConfig.forwardPrimer = { name: 'Forward & primer', sequence: pcrSequence.slice(0, 25), sourcePrimerId: null, phosphorylated: false }
  pcrConfig.reversePrimer = { name: 'Reverse primer', sequence: reverseComplement(pcrSequence.slice(-25)), sourcePrimerId: null, phosphorylated: false }
  const pcr = resolveGibsonPart(pcrConfig, 1, 0)
  const direct = resolveGibsonPart(defaultGibsonPartConfig('vector', source('direct-source', randomDna(200) + overlap)), 0)
  const parts = [direct, pcr, digest]
  expect(parts.map((part) => part.ready)).toEqual([true, true, true])
  const analysis = analyzeGibsonAssembly(parts, { mode: 'linear', minOverlap: 15 })
  expect(analysis.ready).toBe(true)
  return assembleGibsonProduct({ parts, analysis, productName: 'History test' })
}

let host: HTMLDivElement | undefined
let root: ReturnType<typeof createRoot> | undefined

beforeAll(async () => { await initSnapGeneLzma() })

afterEach(() => {
  if (root) act(() => root!.unmount())
  host?.remove()
  root = undefined
  host = undefined
})

describe('homology assembly history', () => {
  it('saves and reopens preparation details for each ordered input', () => {
    const product = assembledProduct()
    const reopened = parseSnapGene(exportSnapGene(product), 'test.dna')
    const reopenedAgain = parseSnapGene(exportSnapGene(reopened), 'test.dna')
    for (const record of [product, reopened, reopenedAgain]) {
      const summaries = record.history!.inputSummaries
      expect(summaries.map((summary) => summary.assemblyPart?.linearization.method)).toEqual(['direct', 'pcr', 'restriction'])
      expect(summaries[1]?.assemblyPart?.linearization).toMatchObject({
        forwardPrimer: { name: 'Forward & primer' }, reversePrimer: { name: 'Reverse primer' }, polymerase: 'blunt',
      })
      expect(summaries[2]?.assemblyPart?.linearization).toEqual({ method: 'restriction', leftEnzyme: 'EcoRI', rightEnzyme: 'BamHI' })
      expect(record.history!.children.map((child) => child.name)).toEqual(['direct-source.dna', 'Fragment 2.dna', 'Fragment 3.dna'])
      expect(record.history!.children[1]?.children[0]?.name).toBe('pcr-source.dna')
      expect(record.history!.children[2]?.children[0]?.name).toBe('digest-source.dna')
      expect(record.history!.children[1]?.sequence).toBeTruthy()
      expect(record.history!.children[2]?.sequence).toBeTruthy()
      expect(record.history!.children[1]?.oligos.map((oligo) => oligo.name)).toEqual(['Forward & primer', 'Reverse primer'])
      expect(record.history!.children[1]?.sequence).toBe(product.history!.children[1]?.sequence)
      expect(record.history!.children[2]?.sequence).toBe(product.history!.children[2]?.sequence)
    }
    const assembly = product.history!
    const edited = {
      ...product,
      history: {
        ...assembly,
        id: 'later-edit',
        operation: 'insert',
        inputSummaries: [{ manipulation: 'insertAt', val1: '1' }],
        children: [assembly],
      },
    }
    const reopenedEdited = parseSnapGene(exportSnapGene(edited), 'edited.dna')
    expect(reopenedEdited.history?.children[0]?.inputSummaries.map((summary) => summary.assemblyPart?.linearization.method))
      .toEqual(['direct', 'pcr', 'restriction'])
  })

  it('shows each input method and opens its primer and enzyme details', async () => {
    const savedHistory = parseSnapGene(exportSnapGene(assembledProduct()), 'test.dna').history!
    // Multiple assembly parts may come from the same source history node.
    const history = savedHistory
    const onInspectPrimer = vi.fn()
    const onInspectEnzyme = vi.fn()
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => root!.render(<HistoryTreePane root={history} onOpenConstruct={vi.fn()} onInspectPrimer={onInspectPrimer} onInspectEnzyme={onInspectEnzyme} />))
    const labels = [...host.querySelectorAll<HTMLElement>('.hedge-parent')]
    expect(labels).toHaveLength(5)
    expect(labels[0]?.textContent).toContain('Used directly')
    expect(host.textContent).toContain('PCR amplification')
    expect(host.textContent).toContain('Fragment 2.dna')
    const primer = [...host.querySelectorAll<HTMLButtonElement>('.hop-primer')].find((button) => button.textContent === 'Forward & primer')!
    const enzyme = [...host.querySelectorAll<HTMLButtonElement>('.hedge-parent-site.is-enzyme')].find((button) => button.textContent === 'EcoRI')!
    await act(async () => primer.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })))
    expect(onInspectPrimer).toHaveBeenCalledWith(expect.objectContaining({ name: 'Forward & primer' }))
    await act(async () => enzyme.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })))
    expect(onInspectEnzyme).toHaveBeenCalledWith('EcoRI')
  })

  it('does not mistake legacy assembly part numbers and names for cut sites', () => {
    const summary = { manipulation: 'gibson', name1: 'source construct', val1: '1', val2: 'forward' }
    expect(contributionGeometry(summary, 1000)).toEqual({ sites: [], region: null, role: null })
    expect(digestEnzymeNamesFromHistorySummary(summary)).toEqual([])
  })

  it('presents older flat histories without inventing fragment sequences or mutating saved history', () => {
    const original = assembledProduct().history!
    const flat = { ...original, children: original.children.map((child) => child.children[0] ?? child) }
    const displayed = gibsonHistoryForDisplay(flat)
    expect(displayed.children[1]?.name).toContain('sequence unavailable')
    expect(displayed.children[1]?.sequence).toBeUndefined()
    expect(displayed.children[1]?.oligos[0]?.name).toBe('Forward & primer')
    expect(displayed.children[1]?.children[0]).toEqual(flat.children[1])
    expect(flat.children[1]?.operation).not.toBe('amplifyFragment')
  })
})
