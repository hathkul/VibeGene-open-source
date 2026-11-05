// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { cloneFixture } from './domain/fixtures'
import { createSgRNAFeatures, findSgRNATargets, SGRNA_PRESETS } from './domain/sgrna'
import type { TraceFileRecord, TraceTemplateAlignment } from './domain/traceTypes'
import type { AlleleFit } from './domain/sangerAlleles/fit'

vi.mock('./domain/sangerAlleles/peaks', () => ({ prepareEvidenceTrace: (_reference: string, _cuts: number[], trace: TraceFileRecord) => ({ name: trace.fileName, orientation: 'forward', onset: null }) }))
vi.mock('./domain/sangerAlleles/fit', () => ({ defaultAlleleCandidateOptions: { localIndels: true, segmentDeletions: true }, fitAlleles: fitMock }))
const { fitMock } = vi.hoisted(() => ({ fitMock: vi.fn((...args: [string, number[], { name: string }[], { localIndels: boolean; segmentDeletions: boolean }]): AlleleFit => ({ fit: 0.95, positions: 100, perRead: args[2].map((read) => ({ name: read.name, fit: 0.95 })), warnings: [], alleles: [{ edit: { start: 0, end: 0, inserted: '', label: 'Reference' }, fraction: 1, ambiguous: false, alternatives: [], alternativesTruncated: false }] })) }))
const { createLibrary } = vi.hoisted(() => ({ createLibrary: vi.fn() }))
vi.mock('./application/sangerAlleles/library', () => ({ createAlleleLibrary: (...args: unknown[]) => createLibrary(...args) }))
import { SangerAllelesDialog } from './SangerAllelesDialog'

describe('Sanger allele dialog', () => {
  it('opens contextual help and returns to the existing setup on Escape', async () => {
    const record = { ...cloneFixture(), topology: 'linear' as const }
    const trace = { id: 'trace', fileName: 'read.ab1', sequence: '', chromatogram: { aTrace: [], cTrace: [], gTrace: [], tTrace: [], baseCalls: [], basePos: [] }, alignment: null, enabled: true, expanded: false, showAnnotations: false }
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const onCancel = vi.fn()
    await act(async () => root.render(<SangerAllelesDialog record={record} traces={[trace]} onCancel={onCancel} onOpenLibrary={vi.fn()} />))
    const traceCheckbox = host.querySelector<HTMLInputElement>('.sanger-alleles-trace input[type=checkbox]')!
    const help = host.querySelector<HTMLButtonElement>('[aria-label="Help: Alleles from Sanger data"]')!
    act(() => { traceCheckbox.click(); help.click() })
    const dialog = host.querySelector<HTMLElement>('.sanger-alleles-help-dialog')!
    expect(dialog.textContent).toContain('How deconvolution helps')
    expect(host.querySelector('.sanger-alleles-dialog')?.hasAttribute('inert')).toBe(true)
    act(() => dialog.querySelector('button')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(host.querySelector('.sanger-alleles-help-dialog')).toBeNull()
    expect(traceCheckbox.checked).toBe(true)
    expect(document.activeElement).toBe(help)
    expect(onCancel).not.toHaveBeenCalled()
    act(() => root.unmount())
    host.remove()
  })

  it('restores saved results and choices, and can discard them or block export after reference edits', async () => {
    const source = { ...cloneFixture(), topology: 'linear' as const }
    const saved = { version: 1 as const, referenceSequence: source.sequence, selectedGroups: ['clone'], variantSelections: { clone: { 0: [1] } }, results: [{ label: 'clone', traceNames: ['read.ab1'], result: { fit: 0.95, positions: 10, perRead: [{ name: 'read.ab1', fit: 0.95 }], warnings: [], alleles: [{ edit: { start: 1, end: 2, inserted: '', label: 'deletion' }, fraction: 1, ambiguous: true, alternatives: [{ edit: { start: 2, end: 3, inserted: '', label: 'alternative' }, reason: 'similar-fit' as const }], alternativesTruncated: false }] } }] }
    const record = { ...source, dna: { ...source.dna, sangerAlleleAnalysis: saved } }
    const host = document.createElement('div')
    document.body.append(host)
    let root = createRoot(host)
    const onAnalysisChange = vi.fn()
    await act(async () => root.render(<SangerAllelesDialog record={record} traces={[]} onCancel={vi.fn()} onAnalysisChange={onAnalysisChange} onOpenLibrary={vi.fn()} />))
    expect(host.querySelector('[role=tab][aria-selected=true]')?.textContent).toBe('Results')
    expect(host.textContent).toContain('clone: read.ab1')
    expect(host.querySelector('.sanger-alleles-below-threshold')).toBeNull()
    expect([...host.querySelectorAll<HTMLInputElement>('.sanger-alleles-alternatives input')].map((input) => input.checked)).toEqual([false, true])
    act(() => host.querySelector<HTMLInputElement>('[aria-label="Select group clone"]')!.click())
    expect(onAnalysisChange.mock.calls.at(-1)?.[0]).toMatchObject({ selectedGroups: [], variantSelections: { clone: { 0: [1] } } })
    act(() => [...host.querySelectorAll('button')].find((button) => button.textContent === 'Analyze again')!.click())
    expect(onAnalysisChange).toHaveBeenLastCalledWith(undefined)
    expect(host.querySelector('[role=tab][aria-selected=true]')?.textContent).toBe('Setup')
    act(() => root.unmount())
    root = createRoot(host)
    await act(async () => root.render(<SangerAllelesDialog record={{ ...record, sequence: `${record.sequence}A` }} traces={[]} onCancel={vi.fn()} onOpenLibrary={vi.fn()} />))
    expect(host.textContent).toContain('reference sequence has changed')
    expect([...host.querySelectorAll<HTMLButtonElement>('.sanger-alleles-results button')].every((button) => button.disabled)).toBe(true)
    const lowFit = { ...saved, results: [{ ...saved.results[0]!, result: { ...saved.results[0]!.result, perRead: [{ name: 'read.ab1', fit: 0.75 }] } }] }
    await act(async () => root.render(<SangerAllelesDialog key="low-fit" record={{ ...record, dna: { ...record.dna, sangerAlleleAnalysis: lowFit } }} traces={[]} onCancel={vi.fn()} onOpenLibrary={vi.fn()} />))
    expect(host.querySelector('.sanger-alleles-below-threshold')?.textContent).toContain('Peak-fit similarity: 95.0% over 10 positions. Below export threshold.')
    expect(host.textContent).toContain('At least one read has a peak fit below the 80% export threshold.')
    act(() => root.unmount())
    host.remove()
  })

  it('groups at most two traces, analyzes each group, and opens one library', async () => {
    const spacer = 'ACGTACGTACGTACGTACGA'
    const sequence = `TTT${spacer}AGG${'T'.repeat(80)}`
    const features = createSgRNAFeatures(findSgRNATargets(sequence, spacer, 'linear', SGRNA_PRESETS[0]!)[0]!, { name: 'Guide', nuclease: 'SpCas9', pamMotif: 'NGG', pamSide: '3prime', spacer })
    const record = { ...cloneFixture(), sequence, features, topology: 'linear' as const }
    const traces = [0, 1, 2].map((index) => ({ id: `t${index}`, fileName: `read${index}.ab1`, sequence, chromatogram: { aTrace: [], cTrace: [], gTrace: [], tTrace: [], baseCalls: [], basePos: [] }, alignment: { orientation: 'forward' } as TraceTemplateAlignment, enabled: true, expanded: false, showAnnotations: false }))
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const onOpenLibrary = vi.fn(async (prepare: () => Promise<unknown>) => { await prepare() })
    await act(async () => root.render(<SangerAllelesDialog record={record} traces={traces} onCancel={vi.fn()} onOpenLibrary={onOpenLibrary} />))
    const guide = host.querySelector<HTMLInputElement>('fieldset input[type=checkbox]')!
    const selectAll = host.querySelector<HTMLInputElement>('.sanger-alleles-check-all input')!
    act(() => { guide.click(); selectAll.click() })
    expect([...host.querySelectorAll<HTMLInputElement>('.sanger-alleles-trace input[type=checkbox]')].every((input) => input.checked)).toBe(true)
    const firstTrace = host.querySelector<HTMLInputElement>('.sanger-alleles-trace input[type=checkbox]')!
    act(() => firstTrace.click())
    expect(selectAll.indeterminate).toBe(true)
    act(() => selectAll.click())
    let inputs = [...host.querySelectorAll<HTMLInputElement>('.sanger-alleles-trace input[type=text]')]
    const setName = (input: HTMLInputElement, value: string) => act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(inputs.map((input) => input.value)).toEqual(['read0.ab1', 'read1.ab1', 'read2.ab1'])
    expect(host.querySelectorAll('datalist option')).toHaveLength(0)
    const analyzeDefaults = [...host.querySelectorAll('button')].find((button) => button.textContent === 'Analyze')!
    expect(analyzeDefaults.disabled).toBe(false)
    await act(async () => { analyzeDefaults.click(); await new Promise((resolve) => setTimeout(resolve, 10)) })
    expect(host.textContent).toContain('read0.ab1: read0.ab1')
    expect(host.textContent).toContain('read1.ab1: read1.ab1')
    const defaultResult = [...host.querySelectorAll('.sanger-alleles-results section')].find((section) => section.textContent?.includes('read0.ab1: read0.ab1'))!
    createLibrary.mockResolvedValueOnce(record)
    await act(async () => defaultResult.querySelector<HTMLButtonElement>('button')!.click())
    expect(createLibrary.mock.calls.at(-1)?.[1]).toEqual([expect.objectContaining({ label: 'read0.ab1', traceNames: ['read0.ab1'] })])
    onOpenLibrary.mockClear()
    act(() => [...host.querySelectorAll<HTMLButtonElement>('[role=tab]')].find((tab) => tab.textContent === 'Setup')!.click())
    inputs = [...host.querySelectorAll<HTMLInputElement>('.sanger-alleles-trace input[type=text]')]
    act(() => inputs[0]!.focus())
    expect(inputs[0]!.value).toBe('')
    expect(host.textContent).toContain('read0.ab1')
    expect(host.textContent).not.toContain('Enter a group name for each selected trace')
    act(() => inputs[0]!.blur())
    expect(inputs[0]!.value).toBe('read0.ab1')
    setName(inputs[0]!, '')
    expect(host.textContent).toContain('Enter a group name for each selected trace')
    setName(inputs[1]!, 'read0.ab1')
    expect(host.querySelectorAll('datalist option')).toHaveLength(0)
    setName(inputs[1]!, 'read1.ab1')
    setName(inputs[0]!, ' Sample A ')
    act(() => inputs[0]!.focus())
    expect(inputs[0]!.value).toBe(' Sample A ')
    act(() => inputs[0]!.blur())
    expect([...host.querySelectorAll('datalist option')].map((option) => option.getAttribute('value'))).toContain('Sample A')
    setName(inputs[1]!, 'Sample A')
    setName(inputs[2]!, 'Sample A')
    expect(host.textContent).toContain('Each group can contain at most two traces')
    setName(inputs[2]!, 'constructor')
    const constructorGroup = [...host.querySelectorAll('fieldset')].find((fieldset) => fieldset.querySelector('legend')?.textContent === 'constructor')!
    expect(constructorGroup.querySelector<HTMLInputElement>('input[type=checkbox]')!.checked).toBe(true)
    setName(inputs[2]!, 'Sample B')
    const groupFieldset = (name: string) => [...host.querySelectorAll('fieldset')].find((fieldset) => fieldset.querySelector('legend')?.textContent === name)!
    const groupA = groupFieldset('Sample A')
    const groupB = groupFieldset('Sample B')
    const grouping = host.querySelector('.sanger-alleles-grouping')!
    expect(grouping.querySelector('fieldset legend')?.textContent).toBe('Chromatograms and groups')
    expect(grouping.querySelector('.sanger-alleles-group-options')?.contains(groupA)).toBe(true)
    act(() => groupA.querySelector<HTMLInputElement>('input[type=checkbox]')!.click())
    expect(groupB.querySelector<HTMLInputElement>('input[type=checkbox]')!.checked).toBe(true)
    const analyze = [...host.querySelectorAll('button')].find((button) => button.textContent === 'Analyze')!
    const independent = (_reference: string, _cuts: number[], reads: { name: string }[]) => ({ fit: 0.95, positions: 100, perRead: reads.map((read) => ({ name: read.name, fit: 0.95 })), warnings: [], alleles: [{ edit: { start: 0, end: 0, inserted: '', label: 'Reference' }, fraction: 1, ambiguous: false, alternatives: [], alternativesTruncated: false }] })
    fitMock.mockImplementationOnce(independent).mockImplementationOnce((reference, cuts, reads) => ({ ...independent(reference, cuts, reads), alleles: [{ edit: { start: 2, end: 3, inserted: '', label: 'Read-specific deletion' }, fraction: 1, ambiguous: false, alternatives: [], alternativesTruncated: false }] }))
    fitMock.mockImplementationOnce((_reference, _cuts, reads) => ({ fit: 0.95, positions: 100, perRead: reads.map((read) => ({ name: read.name, fit: 0.95 })), warnings: [], alleles: [
      { edit: { start: 30, end: 40, inserted: '', label: 'Local indel: −10 bp at 31' }, fraction: 1, ambiguous: true, alternatives: [
        { edit: { start: 31, end: 40, inserted: '', label: 'Local indel: −9 bp at 32' }, reason: 'same-profile' },
        { edit: { start: 29, end: 40, inserted: '', label: 'Local indel: −11 bp at 30' }, reason: 'similar-fit' },
      ], alternativesTruncated: false },
    ] }))
    await act(async () => { analyze.click(); await new Promise((resolve) => setTimeout(resolve, 10)) })
    expect(fitMock).toHaveBeenCalledWith(expect.any(String), expect.any(Array), expect.any(Array), { localIndels: false, segmentDeletions: true })
    expect(fitMock).toHaveBeenCalledWith(expect.any(String), expect.any(Array), expect.any(Array), { localIndels: true, segmentDeletions: true })
    expect(host.querySelector('[role=tab][aria-selected=true]')?.textContent).toBe('Results')
    expect(host.textContent).toContain('Sample A: read0.ab1 + read1.ab1')
    expect(host.textContent).toContain('Sample B: read2.ab1')
    expect(host.textContent).toContain('Warning: independently fitted reads report different candidate sequences')
    expect(host.textContent).toContain('Read-specific deletion')
    expect(host.textContent).toContain('deleted reference bases 32–40')
    expect(host.textContent).toContain('same predicted bases at the measured positions')
    expect(host.textContent).toContain('similar fit after refitting the mixture')
    expect(host.textContent).toContain('not additional inferred alleles')
    const ambiguousResult = [...host.querySelectorAll('.sanger-alleles-results section')].find((section) => section.textContent?.includes('Sample A:'))!
    const selectGroups = [...host.querySelectorAll<HTMLInputElement>('.sanger-alleles-results > label input')][0]!
    const groupSelections = [...host.querySelectorAll<HTMLInputElement>('.sanger-alleles-results section > label input')]
    const openSelected = [...host.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === 'Open library for selected groups')!
    expect(groupSelections.map((input) => input.checked)).toEqual([true, true])
    act(() => groupSelections[1]!.click())
    expect(selectGroups.indeterminate).toBe(true)
    createLibrary.mockResolvedValueOnce(record)
    await act(async () => openSelected.click())
    expect(createLibrary.mock.calls.at(-1)?.[1]).toEqual([expect.objectContaining({ label: 'Sample A' })])
    act(() => selectGroups.click())
    createLibrary.mockResolvedValueOnce(record)
    await act(async () => openSelected.click())
    expect(createLibrary.mock.calls.at(-1)?.[1]).toEqual([expect.objectContaining({ label: 'Sample A' }), expect.objectContaining({ label: 'Sample B' })])
    expect(createLibrary.mock.calls.at(-1)?.[3]).toEqual(new Map([['Sample A', { 0: [0, 1, 2] }], ['Sample B', { 0: [0] }]]))
    act(() => selectGroups.click())
    expect(openSelected.disabled).toBe(true)
    act(() => selectGroups.click())
    onOpenLibrary.mockClear()
    const variants = [...ambiguousResult.querySelectorAll<HTMLInputElement>('.sanger-alleles-alternatives input[type=checkbox]')]
    const openAmbiguous = ambiguousResult.querySelector<HTMLButtonElement>('button')!
    expect(variants.map((input) => input.checked)).toEqual([true, true, true])
    act(() => { for (const variant of variants) variant.click() })
    expect(openAmbiguous.disabled).toBe(true)
    expect(openSelected.disabled).toBe(true)
    expect(ambiguousResult.textContent).toContain('Select at least one variant')
    act(() => variants[1]!.click())
    expect(openAmbiguous.disabled).toBe(false)
    createLibrary.mockResolvedValueOnce(record)
    await act(async () => openAmbiguous.click())
    expect(createLibrary.mock.calls.at(-1)?.[3]).toEqual(new Map([['Sample A', { 0: [1] }]]))
    onOpenLibrary.mockClear()
    act(() => [...host.querySelectorAll<HTMLButtonElement>('[role=tab]')].find((tab) => tab.textContent === 'Setup')!.click())
    const localOption = groupFieldset('Candidate edits for all groups').querySelector<HTMLInputElement>('input[type=checkbox]')!
    act(() => { localOption.click(); localOption.click() })
    expect(groupFieldset('Sample A').querySelector<HTMLInputElement>('input[type=checkbox]')!.checked).toBe(true)
    expect(groupFieldset('Sample B').querySelector<HTMLInputElement>('input[type=checkbox]')!.checked).toBe(true)
    expect(host.textContent).not.toContain('Candidate results')
    expect([...host.querySelectorAll<HTMLButtonElement>('[role=tab]')].find((tab) => tab.textContent === 'Results')!.disabled).toBe(true)
    const analyzeAgain = [...host.querySelectorAll('button')].find((button) => button.textContent === 'Analyze')!
    fitMock.mockImplementationOnce(independent).mockImplementationOnce(independent).mockImplementationOnce(() => { throw new Error('Bad trace') })
    await act(async () => { analyzeAgain.click(); await new Promise((resolve) => setTimeout(resolve, 10)) })
    expect(fitMock).toHaveBeenLastCalledWith(expect.any(String), expect.any(Array), expect.any(Array), { localIndels: true, segmentDeletions: true })
    const groupAResult = [...host.querySelectorAll('.sanger-alleles-results section')].find((section) => section.textContent?.includes('Sample A:'))!
    expect(groupAResult.querySelector<HTMLButtonElement>('button')!.disabled).toBe(true)
    expect(groupAResult.querySelector<HTMLInputElement>(':scope > label input')!.disabled).toBe(true)
    expect(groupAResult.textContent).toContain('Bad trace')
    expect(groupAResult.textContent).toContain('No successful analysis is available')
    const groupBResult = [...host.querySelectorAll('.sanger-alleles-results section')].find((section) => section.textContent?.includes('Sample B:'))!
    const open = groupBResult.querySelector<HTMLButtonElement>('button')!
    expect(open.disabled).toBe(false)
    onOpenLibrary.mockRejectedValueOnce(new Error('The new tab was blocked.'))
    await act(async () => open.click())
    expect(host.textContent).toContain('The new tab was blocked.')
    expect(open.disabled).toBe(false)
    let finish!: (value: unknown) => void
    createLibrary.mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
    act(() => open.click())
    expect(createLibrary.mock.calls.at(-1)?.[1]).toEqual([
      expect.objectContaining({ label: 'Sample B', traceNames: ['read2.ab1'] }),
    ])
    expect(host.textContent).toContain('Preparing library…')
    expect(open.disabled).toBe(true)
    expect(onOpenLibrary).toHaveBeenCalledTimes(2)
    await act(async () => finish(record))
    expect(onOpenLibrary).toHaveBeenCalledTimes(2)
    act(() => root.unmount())
    host.remove()
  })
})
