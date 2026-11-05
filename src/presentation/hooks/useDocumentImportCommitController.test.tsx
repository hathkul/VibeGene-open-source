// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { addOperation } from '../../domain/sequence'
import { formatSequenceLength } from '../../domain/moleculeCapabilities'
import { cloneFixture } from '../../domain/fixtures'
import type { PreparedImportedFile } from '../../application/documentImport/prepareImportedFile'
import type { TraceFileRecord } from '../../domain/traceTypes'
import type { DisplaySettings } from '../sequence'
import type { DocumentImportCommitOptions } from './useDocumentImportCommitController'
import { useDocumentImportCommitController } from './useDocumentImportCommitController'

type SnapGenePrepared = Extract<PreparedImportedFile, { kind: 'snapgene' }>
type ProjectPrepared = Extract<PreparedImportedFile, { kind: 'project' }>

const trace = (id: string): TraceFileRecord => ({
  id,
  fileName: `${id}.ab1`,
  sequence: 'ATGC',
  enabled: true,
  expanded: false,
  showAnnotations: false,
  alignment: null,
  chromatogram: { aTrace: [], tTrace: [], gTrace: [], cTrace: [], basePos: [], baseCalls: [] },
})

function createOptions(log: string[]) {
  const calls = {
    setDisplaySettings: vi.fn((updater: DisplaySettings | ((current: DisplaySettings) => DisplaySettings)) => {
      log.push('setDisplaySettings')
      if (typeof updater === 'function') {
        const base = { enzymes: { set: 'common' as const, supplierSetId: 'previous' }, alignments: { visible: false, mode: 'trace' as const } } as unknown as DisplaySettings
        return updater(base)
      }
      return updater
    }),
    setRecord: vi.fn((record) => { log.push(`setRecord:${record.id}`) }),
    setLibraryFolderId: vi.fn((value) => { log.push(`setLibraryFolderId:${String(value)}`) }),
    setWorkspaceDiskPath: vi.fn((value) => { log.push(`setWorkspaceDiskPath:${String(value)}`) }),
    applyDefaultMapViewForTopology: vi.fn((topology, length) => { log.push(`applyDefaultMapViewForTopology:${topology}:${length}`) }),
    setTraceFiles: vi.fn((recordId, traces) => { log.push(`setTraceFiles:${recordId}:${traces.length}`) }),
    clearDocumentSelection: vi.fn(() => { log.push('clearDocumentSelection') }),
    setActiveTabForRecord: vi.fn((record) => { log.push(`setActiveTabForRecord:${record.id}`) }),
    setAlignmentsVisible: vi.fn(() => { log.push('setAlignmentsVisible') }),
    setLastAlignedSequence: vi.fn((sequence) => { log.push(`setLastAlignedSequence:${sequence.length}`) }),
    setTracesNeedRealign: vi.fn((value) => { log.push(`setTracesNeedRealign:${value}`) }),
    markClean: vi.fn((record, traces) => { log.push(`markClean:${record.id}:${traces.length}`) }),
    touchRecentLocalFile: vi.fn((path, fileName) => { log.push(`touchRecentLocalFile:${path}:${fileName}`) }),
    setStatus: vi.fn((status) => { log.push(`setStatus:${status}`) }),
    addImportOperation: vi.fn((record, fileName) => {
      log.push(`addImportOperation:${fileName}`)
      return addOperation(record, 'import', `Imported ${fileName}.`)
    }),
    mergeUserCommonFeatures: vi.fn(() => { log.push('mergeUserCommonFeatures') }),
    mergeCustomMwLadders: vi.fn(() => { log.push('mergeCustomMwLadders') }),
    mergeDisplaySettingsFromProject: vi.fn((partial, topology) => {
      log.push(`mergeDisplaySettingsFromProject:${partial === undefined ? 'persisted' : 'project'}:${topology}`)
      return { merged: true, topology } as unknown as DisplaySettings
    }),
    loadPersistedVisualSettings: vi.fn(() => ({ sequenceVisual: { fontSize: 12 } })),
    persistVisualSettingsFromPatch: vi.fn((patch) => { log.push(`persistVisualSettingsFromPatch:${JSON.stringify(patch)}`) }),
  }
  return calls
}

type Options = ReturnType<typeof createOptions>

async function renderController(options: DocumentImportCommitOptions) {
  let controller: ReturnType<typeof useDocumentImportCommitController>
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  function Harness() {
    controller = useDocumentImportCommitController(options)
    return null
  }
  await act(async () => root.render(<Harness />))
  return {
    controller: controller!,
    cleanup: () => {
      act(() => root.unmount())
      host.remove()
    },
  }
}

describe('useDocumentImportCommitController', () => {
  const cleanups: Array<() => void> = []
  afterEach(() => {
    while (cleanups.length) cleanups.pop()!()
  })

  it('restores a custom SnapGene selection and reports names missing from the catalog', async () => {
    const calls = createOptions([])
    const { controller, cleanup } = await renderController(calls)
    cleanups.push(cleanup)
    const record = cloneFixture()
    const prepared: SnapGenePrepared = {
      kind: 'snapgene', file: { fileName: 'custom.dna', bytes: new Uint8Array() }, record, traces: [],
      enzymeDisplay: { set: 'custom', selectedNames: ['EcoRI', 'AasI'], unavailableNames: ['AasI'] },
    }
    act(() => controller.commitSnapGeneImport(prepared, 'custom.dna'))
    expect(calls.setDisplaySettings.mock.results[0].value.enzymes).toMatchObject({ set: 'custom', selectedNames: ['EcoRI', 'AasI'] })
    expect(calls.setStatus.mock.calls[0][0]).toContain('1 enzyme is unavailable')
  })

  it('commits a SnapGene import with enzyme display, traces, and recent-file update', async () => {
    const log: string[] = []
    const calls = createOptions(log)
    const { controller, cleanup } = await renderController(calls)
    cleanups.push(cleanup)
    const record = cloneFixture()
    const prepared: SnapGenePrepared = {
      kind: 'snapgene',
      file: { fileName: 'plasmid.dna', bytes: new Uint8Array() },
      record,
      traces: [trace('t1'), trace('t2')],
      enzymeDisplay: { set: 'unique', supplierSetId: null },
    }

    act(() => controller.commitSnapGeneImport(prepared, 'plasmid.dna', '/tmp/plasmid.dna'))

    expect(calls.addImportOperation).toHaveBeenCalledWith(record, 'plasmid.dna')
    const imported = calls.addImportOperation.mock.results[0].value
    expect(calls.setRecord).toHaveBeenCalledWith(imported)
    expect(calls.setLastAlignedSequence).toHaveBeenCalledWith(imported.sequence)
    expect(calls.setTracesNeedRealign).toHaveBeenCalledWith(false)
    expect(calls.setDisplaySettings).toHaveBeenCalledTimes(1)
    expect(calls.setDisplaySettings.mock.results[0].value.enzymes).toMatchObject({
      set: 'unique', supplierSetId: null, hiddenNames: [],
    })
    expect(calls.setLibraryFolderId).toHaveBeenCalledWith(undefined)
    expect(calls.setWorkspaceDiskPath).toHaveBeenCalledWith('/tmp/plasmid.dna')
    expect(calls.applyDefaultMapViewForTopology).toHaveBeenCalledWith(imported.topology, imported.sequence.length)
    expect(calls.setTraceFiles).toHaveBeenCalledWith(imported.id, prepared.traces)
    expect(calls.clearDocumentSelection).toHaveBeenCalledTimes(1)
    expect(calls.setActiveTabForRecord).toHaveBeenCalledWith(imported)
    expect(calls.setAlignmentsVisible).not.toHaveBeenCalled()
    expect(calls.setStatus).toHaveBeenCalledWith(`Imported plasmid.dna (${formatSequenceLength(imported.sequence.length, imported.molecule)}, 2 sequencing traces).`)
    expect(calls.markClean).toHaveBeenCalledWith(imported, prepared.traces)
    expect(calls.touchRecentLocalFile).toHaveBeenCalledWith('/tmp/plasmid.dna', 'plasmid.dna')
    expect(log[log.length - 1]).toBe('touchRecentLocalFile:/tmp/plasmid.dna:plasmid.dna')
    expect(log[log.length - 2]).toMatch(/^markClean:/)
    expect(log[log.length - 3]).toMatch(/^setStatus:/)
  })

  it('commits a SnapGene library record without enzyme display and shows library alignments', async () => {
    const log: string[] = []
    const calls = createOptions(log)
    const { controller, cleanup } = await renderController(calls)
    cleanups.push(cleanup)
    const base = cloneFixture()
    const record = { ...base, dna: { ...base.dna, documentRole: 'library' as const } }
    const prepared: SnapGenePrepared = {
      kind: 'snapgene',
      file: { fileName: 'library.dna', bytes: new Uint8Array() },
      record,
      traces: [],
      enzymeDisplay: null,
    }

    act(() => controller.commitSnapGeneImport(prepared, 'library.dna'))

    const imported = calls.addImportOperation.mock.results[0].value
    expect(calls.setAlignmentsVisible).toHaveBeenCalledTimes(1)
    expect(calls.setDisplaySettings).toHaveBeenCalledTimes(1)
    expect(calls.setDisplaySettings.mock.results[0].value.enzymes.hiddenNames).toEqual([])
    expect(calls.setStatus).toHaveBeenCalledWith(`Imported library.dna (${formatSequenceLength(imported.sequence.length, imported.molecule)}).`)
    expect(calls.setStatus.mock.calls[0][0]).not.toContain('sequencing traces')
    expect(calls.touchRecentLocalFile).not.toHaveBeenCalled()
    expect(calls.clearDocumentSelection).toHaveBeenCalledTimes(1)
  })

  it('clears the selection when the imported record has no features', async () => {
    const log: string[] = []
    const calls = createOptions(log)
    const { controller, cleanup } = await renderController(calls)
    cleanups.push(cleanup)
    const record = { ...cloneFixture(), features: [] }
    const prepared: SnapGenePrepared = {
      kind: 'snapgene',
      file: { fileName: 'empty.dna', bytes: new Uint8Array() },
      record,
      traces: [],
      enzymeDisplay: null,
    }

    act(() => controller.commitSnapGeneImport(prepared, 'empty.dna'))

    expect(calls.clearDocumentSelection).toHaveBeenCalledTimes(1)
  })

  it('commits a project import applying merges, visual settings, and extras status', async () => {
    const log: string[] = []
    const calls = createOptions(log)
    const { controller, cleanup } = await renderController(calls)
    cleanups.push(cleanup)
    const record = cloneFixture()
    const userCommonFeatures = [{ id: 'cf1', fileName: 'f', name: 'n', type: 't', color: 'c', sequence: 'ATGC', qualifiers: [], locations: [{ start: 0, end: 4, strand: 'forward' as const }] }]
    const customMwLadders = [{ id: 'mw1', name: 'ladder', supplier: 's', preferredUnits: 'kb' as const, concentration: null, url: null, isDefault: false, fragments: [] }]
    const displaySettings = { sequenceVisual: { fontSize: 14 } }
    const prepared: ProjectPrepared = {
      kind: 'project',
      file: { fileName: 'project.vbgp', bytes: new Uint8Array() },
      project: { record, userCommonFeatures, displaySettings, customMwLadders },
    }

    act(() => controller.commitProjectImport(prepared, 'project.vbgp', '/tmp/project.vbgp'))

    expect(calls.mergeUserCommonFeatures).toHaveBeenCalledWith(userCommonFeatures)
    expect(calls.mergeCustomMwLadders).toHaveBeenCalledWith(customMwLadders)
    const imported = calls.addImportOperation.mock.results[0].value
    expect(log.indexOf('mergeUserCommonFeatures')).toBeLessThan(log.indexOf('addImportOperation:project.vbgp'))
    expect(log.indexOf('mergeCustomMwLadders')).toBeLessThan(log.indexOf('addImportOperation:project.vbgp'))
    expect(calls.mergeDisplaySettingsFromProject).toHaveBeenCalledWith(displaySettings, imported.topology)
    expect(calls.setDisplaySettings).toHaveBeenCalledWith(calls.mergeDisplaySettingsFromProject.mock.results[0].value)
    expect(calls.persistVisualSettingsFromPatch).toHaveBeenCalledWith(displaySettings)
    expect(calls.loadPersistedVisualSettings).not.toHaveBeenCalled()
    expect(calls.setTraceFiles).toHaveBeenCalledWith(imported.id, imported.traceFiles ?? [])
    expect(calls.clearDocumentSelection).toHaveBeenCalledTimes(1)
    expect(calls.setStatus).toHaveBeenCalledWith(
      `Imported project.vbgp (${formatSequenceLength(imported.sequence.length, imported.molecule)}) with 1 common features and 1 custom MW markers and visual settings.`,
    )
    expect(calls.markClean).toHaveBeenCalledWith(imported, imported.traceFiles ?? [])
    expect(calls.touchRecentLocalFile).toHaveBeenCalledWith('/tmp/project.vbgp', 'project.vbgp')
  })

  it('falls back to persisted visual settings and skips persistence for plain projects', async () => {
    const log: string[] = []
    const calls = createOptions(log)
    const { controller, cleanup } = await renderController(calls)
    cleanups.push(cleanup)
    const record = cloneFixture()
    const prepared: ProjectPrepared = {
      kind: 'project',
      file: { fileName: 'plain.vbgp', bytes: new Uint8Array() },
      project: { record },
    }

    act(() => controller.commitProjectImport(prepared, 'plain.vbgp'))

    expect(calls.mergeUserCommonFeatures).not.toHaveBeenCalled()
    expect(calls.mergeCustomMwLadders).not.toHaveBeenCalled()
    const imported = calls.addImportOperation.mock.results[0].value
    expect(calls.mergeDisplaySettingsFromProject).toHaveBeenCalledWith({ sequenceVisual: { fontSize: 12 } }, imported.topology)
    expect(calls.loadPersistedVisualSettings).toHaveBeenCalled()
    expect(calls.persistVisualSettingsFromPatch).not.toHaveBeenCalled()
    expect(calls.setStatus).toHaveBeenCalledWith(`Imported plain.vbgp (${formatSequenceLength(imported.sequence.length, imported.molecule)}).`)
    expect(calls.touchRecentLocalFile).not.toHaveBeenCalled()
  })

  it('marks options type as exhaustive for compile-time port checks', () => {
    const log: string[] = []
    const calls: Options = createOptions(log)
    const options: DocumentImportCommitOptions = calls
    expect(Object.keys(options).length).toBeGreaterThanOrEqual(20)
  })
})
