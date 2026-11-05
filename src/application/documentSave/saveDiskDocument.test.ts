import { describe, expect, it, vi } from 'vitest'
import { saveDiskDocument, type SaveDiskDocumentPorts } from './saveDiskDocument'
import type { SequenceRecord } from '../../domain/types'

function record(overrides: Partial<SequenceRecord> = {}): SequenceRecord {
  return {
    id: 'record-1',
    name: 'Untitled',
    sequence: 'ACGT',
    molecule: 'dna',
    topology: 'circular',
    features: [],
    primers: [],
    traceFiles: [],
    ...overrides,
  } as SequenceRecord
}

function ports(overrides: Partial<SaveDiskDocumentPorts> = {}): SaveDiskDocumentPorts {
  return {
    serialize: vi.fn(() => ({ ok: true as const, bytes: Uint8Array.from([1, 2, 3]) })),
    mappedFolderDefaultSavePath: vi.fn(async () => '/mapped/Untitled.dna'),
    saveAs: vi.fn(async () => '/chosen/Untitled.dna'),
    desktopPathExists: vi.fn(async () => false),
    writeBytesToPath: vi.fn(async () => undefined),
    adoptWorkspaceDiskPath: vi.fn(),
    ...overrides,
  }
}

describe('save disk document workflow', () => {
  it('rejects trace documents without serializing or writing', async () => {
    const io = ports()
    await expect(saveDiskDocument({ record: record(), traces: [], workspaceDiskPath: null, traceDocument: true }, io))
      .resolves.toEqual({ kind: 'rejected', message: 'Trace documents are read-only. Open as sequence before saving.' })
    expect(io.serialize).not.toHaveBeenCalled()
    expect(io.saveAs).not.toHaveBeenCalled()
  })

  it('saves a new document through the dialog and returns the renamed stub record', async () => {
    const io = ports({ saveAs: vi.fn(async () => '/chosen/plasmid.dna') })
    const result = await saveDiskDocument({ record: record(), traces: [], workspaceDiskPath: null }, io)
    expect(result).toMatchObject({ kind: 'saved', path: '/chosen/plasmid.dna', record: { name: 'plasmid' } })
    expect(io.mappedFolderDefaultSavePath).toHaveBeenCalledWith('Untitled.dna')
    expect(io.saveAs).toHaveBeenCalledWith('Untitled.dna', expect.any(Uint8Array), 'application/octet-stream', {
      defaultPath: '/mapped/Untitled.dna',
    })
    expect(io.writeBytesToPath).toHaveBeenCalledWith('/chosen/plasmid.dna', expect.any(Uint8Array))
    expect(io.adoptWorkspaceDiskPath).toHaveBeenCalledWith('/chosen/plasmid.dna')
    expect(io.serialize).toHaveBeenCalledTimes(2)
    expect(vi.mocked(io.serialize).mock.calls.map(([, serializedRecord]) => serializedRecord.name))
      .toEqual(['Untitled', 'plasmid'])
  })

  it('returns cancellation from Save As without a state-commit outcome', async () => {
    const io = ports({ saveAs: vi.fn(async () => null) })
    await expect(saveDiskDocument({ record: record(), traces: [], workspaceDiskPath: null }, io))
      .resolves.toEqual({ kind: 'cancelled' })
    expect(io.writeBytesToPath).not.toHaveBeenCalled()
    expect(io.adoptWorkspaceDiskPath).not.toHaveBeenCalled()
  })

  it('forces Save As for an existing path and avoids a second write when the name is unchanged', async () => {
    const io = ports({ saveAs: vi.fn(async () => '/chosen/plasmid.dna') })
    const result = await saveDiskDocument({
      record: record({ name: 'plasmid' }),
      traces: [],
      workspaceDiskPath: '/maps/plasmid.dna',
      forceDialog: true,
    }, io)
    expect(result).toMatchObject({ kind: 'saved', path: '/chosen/plasmid.dna', format: 'snapgene' })
    expect(io.saveAs).toHaveBeenCalledTimes(1)
    expect(io.saveAs).toHaveBeenCalledWith('plasmid.dna', expect.any(Uint8Array), 'application/octet-stream', {
      defaultPath: '/maps/plasmid.dna',
    })
    expect(io.writeBytesToPath).not.toHaveBeenCalled()
    expect(io.adoptWorkspaceDiskPath).toHaveBeenCalledWith('/chosen/plasmid.dna')
  })

  it.each([
    { path: '/maps/file version 2.dna', name: 'file version 2.dna', suggestedPath: '/maps/file version 2.dna', molecule: 'dna' as const },
    { path: 'C:\\maps\\file version 2.DNA', name: 'file version 2.DNA', suggestedPath: 'C:\\maps\\file version 2.DNA', molecule: 'dna' as const },
    { path: '/maps/file version 2.gb', name: 'file version 2.dna', suggestedPath: '/maps/file version 2.dna', molecule: 'dna' as const },
    { path: '/maps/protein source.fasta', name: 'protein source.prot', suggestedPath: '/maps/protein source.prot', molecule: 'protein' as const },
  ])('suggests the opened file name for Save As: $path', async ({ path, name, suggestedPath, molecule }) => {
    const io = ports({ saveAs: vi.fn(async () => null) })
    const result = await saveDiskDocument({
      record: record({ name: 'Different construct name', molecule }),
      traces: [], workspaceDiskPath: path, forceDialog: true,
    }, io)
    expect(result).toEqual({ kind: 'cancelled' })
    expect(io.saveAs).toHaveBeenCalledWith(name, expect.any(Uint8Array), 'application/octet-stream', { defaultPath: suggestedPath })
    expect(io.mappedFolderDefaultSavePath).not.toHaveBeenCalled()
    expect(io.adoptWorkspaceDiskPath).not.toHaveBeenCalled()
  })

  it('uses the protein default extension and SnapGene protein format', async () => {
    const io = ports({ saveAs: vi.fn(async () => '/chosen/enzyme.prot') })
    await saveDiskDocument({
      record: record({ name: 'Untitled protein', molecule: 'protein', topology: 'linear' }),
      traces: [],
      workspaceDiskPath: null,
    }, io)
    expect(io.mappedFolderDefaultSavePath).toHaveBeenCalledWith('Untitled protein.prot')
    expect(io.serialize).toHaveBeenCalledWith('snapgene-protein', expect.anything(), { snapGene: undefined })
  })

  it('preserves a writable opened format and overwrites its existing path', async () => {
    const io = ports()
    const result = await saveDiskDocument({
      record: record({ name: 'plasmid', topology: 'linear', features: [] }),
      traces: [],
      workspaceDiskPath: '/maps/plasmid.gb',
    }, io)
    expect(result).toMatchObject({ kind: 'saved', path: '/maps/plasmid.gb', format: 'genbank' })
    expect(io.desktopPathExists).not.toHaveBeenCalled()
    expect(io.writeBytesToPath).toHaveBeenCalledWith('/maps/plasmid.gb', expect.any(Uint8Array))
    expect(io.adoptWorkspaceDiskPath).not.toHaveBeenCalled()
  })

  it('converts a feature-bearing plain sequence to a sibling SnapGene path', async () => {
    const io = ports({
      desktopPathExists: vi.fn(async () => false),
    })
    const result = await saveDiskDocument({
      record: record({ name: 'plasmid', topology: 'linear', features: [{ id: 'f1' }] as never }),
      traces: [],
      workspaceDiskPath: '/maps/plasmid.seq',
    }, io)
    expect(result).toMatchObject({ kind: 'saved', path: '/maps/plasmid.dna', format: 'snapgene' })
    expect(result).toHaveProperty('conversionMessage', expect.stringContaining('plasmid.seq was left unchanged'))
    expect(io.desktopPathExists).toHaveBeenCalledWith('/maps/plasmid.dna')
    expect(io.writeBytesToPath).toHaveBeenCalledWith('/maps/plasmid.dna', expect.any(Uint8Array))
    expect(io.adoptWorkspaceDiskPath).toHaveBeenCalledWith('/maps/plasmid.dna')
  })

  it('uses Save As when the converted sibling already exists and reports cancellation', async () => {
    const io = ports({ desktopPathExists: vi.fn(async () => true), saveAs: vi.fn(async () => null) })
    await expect(saveDiskDocument({
      record: record({ name: 'plasmid', topology: 'linear', features: [{ id: 'f1' }] as never }),
      traces: [],
      workspaceDiskPath: '/maps/plasmid.seq',
    }, io)).resolves.toEqual({ kind: 'cancelled', message: 'Save cancelled.' })
    expect(io.saveAs).toHaveBeenCalledWith('plasmid.dna', expect.any(Uint8Array), 'application/octet-stream', {
      defaultPath: '/maps/plasmid.dna',
    })
    expect(io.adoptWorkspaceDiskPath).not.toHaveBeenCalled()
  })

  it('adopts a converted collision path after the dialog and does not overwrite it twice', async () => {
    const events: string[] = []
    const io = ports({
      desktopPathExists: vi.fn(async () => true),
      saveAs: vi.fn(async () => {
        events.push('save-as')
        return '/chosen/plasmid-copy.dna'
      }),
      adoptWorkspaceDiskPath: vi.fn(() => events.push('adopt-path')),
    })
    const result = await saveDiskDocument({
      record: record({ name: 'plasmid', topology: 'linear', features: [{ id: 'f1' }] as never }),
      traces: [],
      workspaceDiskPath: '/maps/plasmid.seq',
    }, io)
    expect(result).toMatchObject({ kind: 'saved', path: '/chosen/plasmid-copy.dna' })
    expect(events).toEqual(['save-as', 'adopt-path'])
    expect(io.writeBytesToPath).not.toHaveBeenCalled()
    expect(io.serialize).toHaveBeenCalledTimes(1)
  })

  it('adopts a chosen path before a later renamed-record serialization error', async () => {
    const io = ports({
      saveAs: vi.fn(async () => '/chosen/plasmid.dna'),
      serialize: vi
        .fn()
        .mockReturnValueOnce({ ok: true as const, bytes: Uint8Array.from([1]) })
        .mockReturnValueOnce({ ok: false as const, error: 'renamed export failed' }),
    })
    await expect(saveDiskDocument({ record: record(), traces: [], workspaceDiskPath: null }, io))
      .resolves.toEqual({ kind: 'error', message: 'renamed export failed' })
    expect(io.adoptWorkspaceDiskPath).toHaveBeenCalledWith('/chosen/plasmid.dna')
    expect(io.writeBytesToPath).not.toHaveBeenCalled()
  })

  it('surfaces serialization failures before any write', async () => {
    const io = ports({ serialize: vi.fn(() => ({ ok: false as const, error: 'export failed' })) })
    await expect(saveDiskDocument({ record: record(), traces: [], workspaceDiskPath: '/maps/plasmid.dna' }, io))
      .resolves.toEqual({ kind: 'error', message: 'export failed' })
    expect(io.writeBytesToPath).not.toHaveBeenCalled()
  })

  it('serializes the fresh traces supplied by the shell without changing the record', async () => {
    const traces = [{ id: 'trace-1', fileName: 'read.ab1', sequence: 'ACGT' }] as never
    const io = ports()
    await saveDiskDocument({ record: record({ name: 'plasmid' }), traces, workspaceDiskPath: '/maps/plasmid.dna' }, io)
    expect(io.serialize).toHaveBeenCalledWith('snapgene', expect.objectContaining({ traceFiles: traces }), { snapGene: undefined })
  })
})
