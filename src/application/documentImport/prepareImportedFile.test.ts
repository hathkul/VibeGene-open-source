import { describe, expect, it, vi } from 'vitest'
import type { SequenceRecord } from '../../domain/types'
import type { TraceFileRecord } from '../../domain/traceTypes'
import { defaultConstructProperties } from '../../domain/constructProperties'
import {
  prepareImportedFile,
  type ImportedFileParserPorts,
  type ImportProfilingPorts,
} from './prepareImportedFile'

const record = (overrides: Partial<SequenceRecord> = {}): SequenceRecord => ({
  id: 'seq-1',
  name: 'demo',
  description: '',
  molecule: 'dna',
  topology: 'circular',
  sequence: 'ACGT',
  features: [],
  primers: [],
  operations: [],
  construct: defaultConstructProperties,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
})

const trace = { id: 'trace-1', fileName: 'read.ab1', sequence: 'ACGT' } as TraceFileRecord

function ports(overrides: Partial<ImportedFileParserPorts> = {}): ImportedFileParserPorts {
  return {
    decodeText: (bytes) => new TextDecoder().decode(bytes),
    isAb1: () => false,
    isSnapGene: () => false,
    parseTrace: vi.fn(async () => trace),
    parseSnapGene: vi.fn(() => record()),
    parseSnapGeneTraces: vi.fn(async () => [trace]),
    parseProjectJson: vi.fn(() => ({ record: record() })),
    isSettingsFile: (value): value is never => Boolean(value && typeof value === 'object' && 'kind' in value),
    parseSettingsJson: vi.fn(() => ({ schemaVersion: 1 as const, kind: 'vibegene-settings' as const })),
    importRequiresTopologyChoice: () => false,
    parseSequenceBytes: vi.fn(() => record()),
    enzymeDisplayFromSnapGeneRecord: vi.fn(() => null),
    ...overrides,
  }
}

function profile(): ImportProfilingPorts {
  return {
    sync: (_name, run) => run(),
    async: (_name, run) => run(),
  }
}

describe('mounted workspace import preparation', () => {
  it('routes AB1 magic bytes and extension through the trace parser', async () => {
    const parseTrace = vi.fn(async () => trace)
    const io = ports({ isAb1: (bytes) => bytes[0] === 0x41, parseTrace })
    const file = { fileName: 'read.bin', bytes: Uint8Array.from([0x41]), localPath: '/tmp/read.bin' }

    await expect(prepareImportedFile(file, io, profile())).resolves.toMatchObject({ kind: 'trace', trace })
    expect(parseTrace).toHaveBeenCalledWith(file)
    await expect(prepareImportedFile({ ...file, fileName: 'read.AB1' }, ports({ parseTrace }), profile()))
      .resolves.toMatchObject({ kind: 'trace' })
    await expect(prepareImportedFile({ ...file, fileName: 'read.AB1 ' }, ports({ parseTrace }), profile()))
      .resolves.toMatchObject({ kind: 'trace' })
  })

  it('keeps trace parsing inside the encompassing import profile', async () => {
    const calls: string[] = []
    const sync: ImportProfilingPorts['sync'] = (_name, run) => {
      calls.push('sync')
      return run()
    }
    const async: ImportProfilingPorts['async'] = async (_name, run) => {
      calls.push('async')
      return run()
    }
    await prepareImportedFile(
      { fileName: 'read.ab1', bytes: Uint8Array.from([0]) },
      ports(),
      { sync, async },
    )
    expect(calls).toEqual([])
  })

  it('does not announce a non-trace import when opening a trace', async () => {
    const onNonTraceImportStarted = vi.fn()
    await prepareImportedFile(
      { fileName: 'read.ab1', bytes: Uint8Array.from([0]) },
      ports(),
      profile(),
      { onNonTraceImportStarted },
    )
    expect(onNonTraceImportStarted).not.toHaveBeenCalled()
  })

  it('parses SnapGene and keeps imported traces and enzyme metadata together', async () => {
    const parsed = record({ topology: 'linear' })
    const enzymeDisplay = { set: 'unique' as const }
    const parseSnapGeneTraces = vi.fn(async () => [trace])
    const io = ports({
      isSnapGene: () => true,
      parseSnapGene: () => parsed,
      parseSnapGeneTraces,
      enzymeDisplayFromSnapGeneRecord: () => enzymeDisplay,
    })

    await expect(prepareImportedFile({ fileName: 'demo.dna', bytes: Uint8Array.from([1, 2]) }, io, profile()))
      .resolves.toEqual({
        kind: 'snapgene',
        file: { fileName: 'demo.dna', bytes: Uint8Array.from([1, 2]) },
        record: parsed,
        traces: [trace],
        enzymeDisplay,
      })
    expect(parseSnapGeneTraces).toHaveBeenCalledWith(Uint8Array.from([1, 2]), 'ACGT', 'linear', parsed)
  })

  it('reports a parsed SnapGene record before trace parsing begins', async () => {
    const events: string[] = []
    const parsed = record()
    const io = ports({
      isSnapGene: () => true,
      parseSnapGene: () => parsed,
      parseSnapGeneTraces: async () => {
        events.push('traces')
        return []
      },
    })

    await prepareImportedFile(
      { fileName: 'demo.dna', bytes: Uint8Array.from([1, 2]) },
      io,
      profile(),
      {
        onNonTraceImportStarted: () => events.push('non-trace'),
        onSnapGeneParsed: (nextRecord, file) => events.push(`${nextRecord.name}:${file.fileName}`),
      },
    )

    expect(events).toEqual(['non-trace', 'demo:demo.dna', 'traces'])
  })

  it('announces a non-trace import before a parser error escapes', async () => {
    const onNonTraceImportStarted = vi.fn()
    const error = new Error('invalid sequence')
    await expect(
      prepareImportedFile(
        { fileName: 'bad.txt', bytes: Uint8Array.from([1]) },
        ports({ parseSequenceBytes: () => { throw error } }),
        profile(),
        { onNonTraceImportStarted },
      ),
    ).rejects.toBe(error)
    expect(onNonTraceImportStarted).toHaveBeenCalledOnce()
  })

  it('preserves parser profiling labels and file-name details', async () => {
    const calls: Array<[string, string, string]> = []
    const trackedProfile: ImportProfilingPorts = {
      sync: (name, run, detail) => {
        calls.push(['sync', name, detail])
        return run()
      },
      async: async (name, run, detail) => {
        calls.push(['async', name, detail])
        return run()
      },
    }
    const io = ports({ isSnapGene: () => true })

    await prepareImportedFile(
      { fileName: 'profiled.dna', bytes: Uint8Array.from([1, 2]) },
      io,
      trackedProfile,
    )

    expect(calls).toEqual([
      ['sync', 'parseSnapGene', 'profiled.dna'],
      ['async', 'parseSnapGeneTraces', 'profiled.dna'],
    ])
  })

  it('distinguishes settings JSON from project JSON and preserves project extras', async () => {
    const io = ports({
      isSettingsFile: (value): value is never => Boolean(value && (value as { kind?: string }).kind === 'vibegene-settings'),
      parseSettingsJson: () => ({ schemaVersion: 1, kind: 'vibegene-settings', displaySettings: { mapView: { linear: true } } }),
      parseProjectJson: () => ({ record: record(), userCommonFeatures: [{ id: 'f' } as never], customMwLadders: [{ id: 'mw' } as never], displaySettings: { mapView: { linear: true } } }),
    })
    const settings = await prepareImportedFile({ fileName: 'settings.json', bytes: new TextEncoder().encode('{"kind":"vibegene-settings"}') }, io, profile())
    expect(settings.kind).toBe('settings')
    const project = await prepareImportedFile({ fileName: 'project.json', bytes: new TextEncoder().encode('{"sequence":"ACGT"}') }, io, profile())
    expect(project).toMatchObject({ kind: 'project', project: { userCommonFeatures: [{ id: 'f' }], customMwLadders: [{ id: 'mw' }], displaySettings: { mapView: { linear: true } } } })
  })

  it('parses topology-ambiguous DNA once and returns a choice decision', async () => {
    const parseSequenceBytes = vi.fn(() => record({ topology: 'circular' }))
    const io = ports({ importRequiresTopologyChoice: () => true, parseSequenceBytes })
    const result = await prepareImportedFile({ fileName: 'sequence.fasta', bytes: new TextEncoder().encode('>demo\nACGT') }, io, profile())
    expect(result.kind).toBe('topology-choice')
    expect(parseSequenceBytes).toHaveBeenCalledOnce()
  })

  it('does not ask for topology when an ambiguous parser result is protein', async () => {
    const io = ports({ importRequiresTopologyChoice: () => true, parseSequenceBytes: () => record({ molecule: 'protein', topology: 'linear' }) })
    await expect(prepareImportedFile({ fileName: 'protein.txt', bytes: new TextEncoder().encode('MKW') }, io, profile()))
      .resolves.toMatchObject({ kind: 'sequence', record: { molecule: 'protein' } })
  })

  it('propagates parser errors without producing a state decision', async () => {
    const error = new Error('invalid sequence')
    const io = ports({ parseSequenceBytes: () => { throw error } })
    await expect(prepareImportedFile({ fileName: 'bad.txt', bytes: new Uint8Array([1]) }, io, profile())).rejects.toBe(error)
  })

  it('keeps invalid project JSON on the project parser path so its error is visible', async () => {
    const error = new Error('Not a VibeGene construct file')
    const io = ports({ parseProjectJson: () => { throw error } })
    const bytes = new TextEncoder().encode('{"not":"a project"}')
    await expect(prepareImportedFile({ fileName: 'broken.json', bytes }, io, profile())).rejects.toBe(error)
  })

  it('propagates SnapGene trace parsing failures before any mount decision', async () => {
    const error = new Error('Invalid sequencing trace packet')
    const io = ports({
      isSnapGene: () => true,
      parseSnapGeneTraces: async () => { throw error },
    })
    await expect(prepareImportedFile({ fileName: 'broken.dna', bytes: Uint8Array.from([1]) }, io, profile())).rejects.toBe(error)
  })
})
