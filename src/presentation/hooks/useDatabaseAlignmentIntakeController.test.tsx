// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizeProteinDocumentData } from '../../domain/constructProperties'
import { labPlasmid } from '../../domain/fixtures'
import type { DatabaseAlignmentIntakeConstruct } from '../../application/databaseLibrary/databaseAlignmentIntakePlan'
import { useDatabaseAlignmentIntakeController } from './useDatabaseAlignmentIntakeController'
import type { StoredProject } from '../../application/ports/projectPersistence'

describe('useDatabaseAlignmentIntakeController', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it('appends DNA comparative sources from Database constructs', async () => {
    const updateDnaComparisonSources = vi.fn()
    const setStatus = vi.fn()
    let apply: ReturnType<typeof useDatabaseAlignmentIntakeController>['applyDatabaseConstructsToAlignment'] | undefined
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    function Harness() {
      apply = useDatabaseAlignmentIntakeController({
        getRecord: () => labPlasmid,
        getTraceFiles: () => [],
        dnaAlignmentMode: 'comparative',
        updateDnaComparisonSources,
        updateProteinComparisonSources: vi.fn(),
        onTraceFilesChange: vi.fn(),
        onAlignmentTracesAdded: vi.fn(),
        setStatus,
        getProject: async () => null,
        openProject: vi.fn(),
        requestDocumentExit: vi.fn(),
        alignmentsVisible: true,
      }).applyDatabaseConstructsToAlignment
      return null
    }
    await act(async () => root.render(<Harness />))
    const constructs: DatabaseAlignmentIntakeConstruct[] = [{
      name: 'Insert',
      sequence: 'acgt',
      molecule: 'dna',
    }]
    await act(async () => apply?.('dna', constructs))
    expect(updateDnaComparisonSources).toHaveBeenCalledOnce()
    expect(setStatus).toHaveBeenCalledWith('Added 1 DNA comparison sequence from Database.')
    act(() => root.unmount())
  })

  it('aligns trace-mode DNA constructs and scrolls added traces', async () => {
    const onTraceFilesChange = vi.fn()
    const onAlignmentTracesAdded = vi.fn()
    const setStatus = vi.fn()
    const appendAlignedTracesFromSequences = vi.fn().mockResolvedValue({
      traces: [],
      addedCount: 2,
      addedTraceIds: ['t1', 't2'],
      scrollTemplateIndex: 3,
      scrollToTraceId: 't2',
    })
    let apply: ReturnType<typeof useDatabaseAlignmentIntakeController>['applyDatabaseConstructsToAlignment'] | undefined
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    function Harness() {
      apply = useDatabaseAlignmentIntakeController({
        getRecord: () => labPlasmid,
        getTraceFiles: () => [],
        dnaAlignmentMode: 'trace',
        updateDnaComparisonSources: vi.fn(),
        updateProteinComparisonSources: vi.fn(),
        onTraceFilesChange,
        onAlignmentTracesAdded,
        setStatus,
        appendAlignedTracesFromSequences,
        getProject: async () => null,
        openProject: vi.fn(),
        requestDocumentExit: vi.fn(),
        alignmentsVisible: true,
      }).applyDatabaseConstructsToAlignment
      return null
    }
    await act(async () => root.render(<Harness />))
    await act(async () => apply?.('dna', [{
      name: 'Member',
      sequence: 'ACGTACGT',
      molecule: 'dna',
    }]))
    expect(setStatus).toHaveBeenNthCalledWith(1, 'Aligning 1 Database construct…')
    expect(onTraceFilesChange).toHaveBeenCalledOnce()
    expect(onAlignmentTracesAdded).toHaveBeenCalledWith({ scrollTemplateIndex: 3, scrollToTraceId: 't2' })
    expect(setStatus).toHaveBeenLastCalledWith('Added 2 alignments from Database.')
    act(() => root.unmount())
  })

  it('appends protein comparison sources', async () => {
    const proteinRecord = {
      ...labPlasmid,
      molecule: 'protein' as const,
      protein: normalizeProteinDocumentData({ comparisonSources: [] }, labPlasmid.sequence.length),
    }
    const updateProteinComparisonSources = vi.fn()
    let apply: ReturnType<typeof useDatabaseAlignmentIntakeController>['applyDatabaseConstructsToAlignment'] | undefined
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    function Harness() {
      apply = useDatabaseAlignmentIntakeController({
        getRecord: () => proteinRecord,
        getTraceFiles: () => [],
        dnaAlignmentMode: 'trace',
        updateDnaComparisonSources: vi.fn(),
        updateProteinComparisonSources,
        onTraceFilesChange: vi.fn(),
        onAlignmentTracesAdded: vi.fn(),
        setStatus: vi.fn(),
        getProject: async () => null,
        openProject: vi.fn(),
        requestDocumentExit: vi.fn(),
        alignmentsVisible: true,
      }).applyDatabaseConstructsToAlignment
      return null
    }
    await act(async () => root.render(<Harness />))
    await act(async () => apply?.('protein', [{
      name: 'Query',
      sequence: 'ACDEF',
      molecule: 'protein',
    }]))
    expect(updateProteinComparisonSources).toHaveBeenCalledOnce()
    act(() => root.unmount())
  })

  it('reports missing projects and opens the first dropped project through document exit when alignments are hidden', async () => {
    const setStatus = vi.fn()
    let queuedExit: (() => void | Promise<void>) | undefined
    const requestDocumentExit = vi.fn((action: () => void | Promise<void>) => { queuedExit = action })
    const openResult = Promise.resolve()
    const openProject = vi.fn(() => openResult)
    const project = { id: 'p1', name: 'Stored', record: labPlasmid } as StoredProject
    const getProject = vi.fn(async (id: string) => id === 'p1' ? project : null)
    let drop: ReturnType<typeof useDatabaseAlignmentIntakeController>['handleDatabaseProjectDrop'] | undefined
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    function Harness() {
      drop = useDatabaseAlignmentIntakeController({
        getRecord: () => labPlasmid,
        getTraceFiles: () => [],
        dnaAlignmentMode: 'trace',
        updateDnaComparisonSources: vi.fn(),
        updateProteinComparisonSources: vi.fn(),
        onTraceFilesChange: vi.fn(),
        onAlignmentTracesAdded: vi.fn(),
        setStatus,
        getProject,
        openProject,
        requestDocumentExit,
        alignmentsVisible: false,
      }).handleDatabaseProjectDrop
      return null
    }
    await act(async () => root.render(<Harness />))
    await act(async () => drop?.(['missing']))
    expect(setStatus).toHaveBeenCalledWith('The dropped Database constructs are no longer available.')
    await act(async () => drop?.(['p1']))
    expect(requestDocumentExit).toHaveBeenCalledOnce()
    expect(openProject).not.toHaveBeenCalled()
    expect(setStatus).toHaveBeenLastCalledWith('Loaded Stored from Database.')
    let callbackResult: void | Promise<void> | null = null
    act(() => { callbackResult = queuedExit?.() })
    expect(openProject).toHaveBeenCalledWith(project)
    expect(callbackResult).toBe(openResult)
    act(() => root.unmount())
  })

  it('keeps first missing project behavior for an open route even if a later project exists', async () => {
    const setStatus = vi.fn()
    const project = { id: 'p2', name: 'Later', record: labPlasmid } as StoredProject
    const getProject = vi.fn(async (id: string) => id === 'p2' ? project : null)
    let drop: ReturnType<typeof useDatabaseAlignmentIntakeController>['handleDatabaseProjectDrop'] | undefined
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    function Harness() {
      drop = useDatabaseAlignmentIntakeController({
        getRecord: () => labPlasmid,
        getTraceFiles: () => [],
        dnaAlignmentMode: 'trace',
        updateDnaComparisonSources: vi.fn(),
        updateProteinComparisonSources: vi.fn(),
        onTraceFilesChange: vi.fn(),
        onAlignmentTracesAdded: vi.fn(),
        setStatus,
        getProject,
        openProject: vi.fn(),
        requestDocumentExit: vi.fn(),
        alignmentsVisible: false,
      }).handleDatabaseProjectDrop
      return null
    }
    await act(async () => root.render(<Harness />))
    await act(async () => drop?.(['missing', 'p2']))
    expect(setStatus).toHaveBeenCalledWith('The dropped Database construct is no longer available.')
    act(() => root.unmount())
  })

  it('uses fresh record and project ports when a drop arrives after render', async () => {
    const current = { ...labPlasmid, molecule: 'protein' as const, protein: normalizeProteinDocumentData({ comparisonSources: [] }, labPlasmid.sequence.length) }
    const project = { id: 'p', name: 'Summary title', record: { ...labPlasmid, name: 'Record title' } } as StoredProject
    const getProject = vi.fn(async () => project)
    const updateProteinComparisonSources = vi.fn()
    let getRecord = () => labPlasmid
    let drop: ReturnType<typeof useDatabaseAlignmentIntakeController>['handleDatabaseProjectDrop'] | undefined
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    function Harness() {
      drop = useDatabaseAlignmentIntakeController({
        getRecord,
        getTraceFiles: () => [],
        dnaAlignmentMode: 'trace',
        updateDnaComparisonSources: vi.fn(),
        updateProteinComparisonSources,
        onTraceFilesChange: vi.fn(),
        onAlignmentTracesAdded: vi.fn(),
        setStatus: vi.fn(),
        getProject,
        openProject: vi.fn(),
        requestDocumentExit: vi.fn(),
        alignmentsVisible: true,
      }).handleDatabaseProjectDrop
      return null
    }
    await act(async () => root.render(<Harness />))
    getRecord = () => current
    await act(async () => root.render(<Harness />))
    await act(async () => drop?.(['p']))
    expect(updateProteinComparisonSources).toHaveBeenCalledOnce()
    expect(updateProteinComparisonSources.mock.calls[0]?.[0][0]?.name).toBe('Record title')
    act(() => root.unmount())
  })
})
