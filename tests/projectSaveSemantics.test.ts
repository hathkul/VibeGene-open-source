import { describe, expect, it } from 'vitest'
import { defaultConstructProperties } from '../src/domain/constructProperties'
import {
  canWriteProjectFileFormat,
  inferProjectFileFormat,
  projectFileFormatLabel,
  serializeProjectFile,
} from '../src/domain/fileFormats'
import {
  chooseDatabaseCopyFileName,
  nativeOverwriteAvailability,
  prepareDatabaseProjectSave,
  saveToolbarModeOptions,
  applyDiskSaveFileNameToStubConstruct,
  diskSaveConversionMessage,
  isStubConstructName,
  resolveDiskSaveTarget,
  workspaceDocumentBinding,
  workspaceTitleName,
  workspaceWindowTitle,
  workspaceSaveDisposition,
} from '../src/domain/projectSaveSemantics'
import type { SequenceRecord } from '../src/domain/types'
import { encodeRecordForSyncRelativePath } from '../src/storage/databaseSync'

const record: SequenceRecord = {
  id: 'original-id',
  name: 'Native map',
  description: '',
  molecule: 'dna',
  topology: 'circular',
  sequence: 'ATGC',
  features: [],
  primers: [],
  operations: [],
  construct: defaultConstructProperties,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const proteinRecord: SequenceRecord = {
  ...record,
  id: 'protein-id',
  name: 'Native protein',
  molecule: 'protein',
  topology: 'linear',
  sequence: 'MVK',
}

describe('disk save target', () => {
  const linear: SequenceRecord = { ...record, topology: 'linear' }
  const feature = {
    id: 'f1',
    name: 'promoter',
    type: 'promoter',
    start: 0,
    end: 3,
    strand: 1,
    color: '#000',
  } as unknown as SequenceRecord['features'][number]
  const primer = {
    id: 'p1',
    name: 'fwd',
    sequence: 'ATG',
  } as unknown as SequenceRecord['primers'][number]

  it('keeps the opened text format when it can hold the document', () => {
    expect(resolveDiskSaveTarget('/data/clone.seq', linear)).toEqual({
      path: '/data/clone.seq',
      format: 'plain-text',
    })
    expect(resolveDiskSaveTarget('/data/clone.gb', { ...record, features: [feature] })).toEqual({
      path: '/data/clone.gb',
      format: 'genbank',
    })
  })

  it('keeps SnapGene paths unchanged', () => {
    expect(resolveDiskSaveTarget('/data/clone.dna', { ...record, primers: [primer] })).toEqual({
      path: '/data/clone.dna',
      format: 'snapgene',
    })
  })

  it('switches a .seq with features or primers to a sibling .dna', () => {
    const target = resolveDiskSaveTarget('/data/clone.seq', {
      ...linear,
      features: [feature],
      primers: [primer],
    })
    expect(target.path).toBe('/data/clone.dna')
    expect(target.format).toBe('snapgene')
    expect(target.convertedFrom).toEqual({
      path: '/data/clone.seq',
      format: 'plain-text',
      lost: ['features', 'primers'],
    })
    expect(diskSaveConversionMessage(target)).toBe(
      'Saved as clone.dna — Plain sequence files cannot store features and primers. clone.seq was left unchanged.',
    )
  })

  it('switches GenBank only for content GenBank cannot store', () => {
    expect(resolveDiskSaveTarget('C:\\seqs\\clone.gb', { ...record, primers: [primer] }).path).toBe(
      'C:\\seqs\\clone.dna',
    )
  })

  it('switches circular FASTA and unwritable formats', () => {
    expect(resolveDiskSaveTarget('/data/clone.fasta', record).convertedFrom?.lost).toEqual([
      'circular topology',
    ])
    expect(resolveDiskSaveTarget('/data/clone.embl', linear).path).toBe('/data/clone.dna')
  })

  it('uses .prot for protein documents', () => {
    const target = resolveDiskSaveTarget('/data/binder.fasta', { ...proteinRecord, features: [feature] })
    expect(target.path).toBe('/data/binder.prot')
    expect(target.format).toBe('snapgene-protein')
  })
})

describe('project format registry', () => {
  it('normalizes aliases and exposes labels and writer capabilities', () => {
    expect(inferProjectFileFormat('map.ape')).toBe('genbank')
    expect(inferProjectFileFormat('map.flat')).toBe('genbank')
    expect(inferProjectFileFormat('protein.gp')).toBe('genpept')
    expect(projectFileFormatLabel('genbank')).toBe('GenBank')
    expect(projectFileFormatLabel('genpept')).toBe('GenPept Protein')
    expect(canWriteProjectFileFormat('snapgene')).toBe(true)
    expect(canWriteProjectFileFormat('embl')).toBe(false)
    expect(canWriteProjectFileFormat('genpept')).toBe(true)
  })

  it('serializes supported native formats and clearly rejects EMBL', () => {
    expect(serializeProjectFile('snapgene', record)).toMatchObject({ ok: true })
    expect(serializeProjectFile('genbank', record)).toMatchObject({ ok: true })
    expect(serializeProjectFile('fasta', record)).toMatchObject({ ok: true })
    expect(serializeProjectFile('plain-text', record)).toEqual({
      ok: true,
      bytes: new TextEncoder().encode('ATGC\n'),
    })
    expect(serializeProjectFile('vibegene-json', record)).toMatchObject({ ok: true })
    expect(serializeProjectFile('embl', record)).toEqual({
      ok: false,
      error: 'VibeGene can read EMBL files but cannot safely export EMBL yet.',
    })
    const genpept = serializeProjectFile('genpept', proteinRecord)
    expect(genpept).toMatchObject({ ok: true })
    expect(new TextDecoder().decode(genpept.ok ? genpept.bytes : undefined)).toContain('3 aa')
    expect(serializeProjectFile('genpept', record)).toEqual({
      ok: false,
      error: 'GenPept export requires a protein record.',
    })
    expect(nativeOverwriteAvailability('embl')).toMatchObject({
      available: false,
      label: 'EMBL',
    })
  })

  it('uses the registry when encoding sync paths', () => {
    const ape = new TextDecoder().decode(
      encodeRecordForSyncRelativePath('maps/native.ape', record),
    )
    expect(ape).toContain('LOCUS')
    expect(() => encodeRecordForSyncRelativePath('maps/native.embl', record)).toThrow(
      'cannot safely export EMBL',
    )
  })
})

describe('database save semantics', () => {
  it('chooses deterministic case-insensitive copy suffixes', () => {
    const occupied = ['MAP.DNA', 'map (2).dna', 'other.dna']
    expect(chooseDatabaseCopyFileName('map.gb', occupied)).toBe('map (3).dna')
    expect(chooseDatabaseCopyFileName('fresh.flat', occupied)).toBe('fresh.dna')
    expect(chooseDatabaseCopyFileName('map.gb', [...occupied].reverse())).toBe(
      'map (3).dna',
    )
  })

  it('routes unknown and native projects to the required decisions', () => {
    expect(workspaceSaveDisposition(null)).toBe('choose-database-folder')
    expect(workspaceSaveDisposition({ id: 'dna', fileFormat: 'snapgene' })).toBe(
      'save-snapgene',
    )
    expect(workspaceSaveDisposition({ id: 'gb', fileFormat: 'genbank' })).toBe(
      'choose-native-save',
    )
  })

  it('derives standalone save binding from database folder and disk path', () => {
    expect(workspaceDocumentBinding({ libraryFolderId: null, workspaceDiskPath: null })).toBe(
      'database',
    )
    expect(workspaceDocumentBinding({ libraryFolderId: undefined, workspaceDiskPath: '/tmp/a.dna' })).toBe(
      'disk',
    )
    expect(workspaceDocumentBinding({ libraryFolderId: undefined, workspaceDiskPath: null })).toBe(
      'new',
    )
  })

  it('labels window titles with Database vs disk source', () => {
    expect(workspaceWindowTitle('pDemo', { binding: 'database' })).toBe('pDemo — from Database')
    expect(workspaceWindowTitle('pDemo', { binding: 'disk', isDirty: true })).toBe(
      'pDemo* — from disk',
    )
    expect(workspaceWindowTitle('pDemo', { binding: 'new' })).toBe('pDemo')
    expect(workspaceWindowTitle('pDemo', { binding: 'database', showSource: false })).toBe('pDemo')
  })

  it('prefers the actual filename over the construct name for window titles', () => {
    expect(workspaceTitleName({ constructName: 'VLDLR', diskPath: '/tmp/NG_012741-edit.dna' })).toBe('NG_012741-edit.dna')
    expect(workspaceTitleName({ constructName: 'VLDLR', diskPath: 'C:\\data\\another.dna' })).toBe('another.dna')
    expect(workspaceTitleName({ constructName: 'VLDLR', databaseFileName: 'saved-copy.dna' })).toBe('saved-copy.dna')
    expect(workspaceTitleName({ constructName: 'VLDLR', importedFileName: 'source.gb' })).toBe('source.gb')
    expect(workspaceTitleName({ constructName: 'VLDLR', traceFileName: 'read.ab1', diskPath: '/tmp/other.dna' })).toBe('read.ab1')
    expect(workspaceTitleName({ constructName: 'Untitled' })).toBe('Untitled')
  })

  it('adopts the disk file stem for untitled constructs on first save', () => {
    expect(applyDiskSaveFileNameToStubConstruct({ name: 'Untitled' }, '/tmp/MyPlasmid.dna')).toEqual({
      name: 'MyPlasmid',
    })
    expect(applyDiskSaveFileNameToStubConstruct({ name: 'Untitled protein' }, '/tmp/Kinase.prot')).toEqual({
      name: 'Kinase',
    })
    expect(applyDiskSaveFileNameToStubConstruct({ name: 'Already named' }, '/tmp/Other.dna')).toEqual({
      name: 'Already named',
    })
    expect(isStubConstructName('Untitled')).toBe(true)
    expect(isStubConstructName('pET28')).toBe(false)
  })

  it('offers context-specific save toolbar options', () => {
    expect(saveToolbarModeOptions('database', 'dna').map((option) => option.id)).toEqual([
      'save',
      'save-to',
      'save-dna',
    ])
    expect(saveToolbarModeOptions('disk', 'protein')[1]).toMatchObject({
      id: 'save-dna',
      label: 'Save as…',
    })
    expect(saveToolbarModeOptions('disk', 'protein')[2]).toMatchObject({
      id: 'save-to',
      label: 'Save to database…',
    })
  })

  it('prepares a local-only .dna copy without mutating the original identity or bytes', () => {
    const sourceBytes = new Uint8Array([1, 2, 3])
    const existing = {
      id: 'original-id',
      folderId: 'folder-1',
      tags: ['native'],
      fileName: 'map.gb',
      fileFormat: 'genbank' as const,
      fileProvenance: 'sync-folder' as const,
    }
    const prepared = prepareDatabaseProjectSave({
      record,
      existing,
      decision: 'copy',
      bytes: new Uint8Array([9, 8, 7]),
      copyFileName: 'map.dna',
      freshProjectId: 'copy-id',
      createdAt: '2026-08-13T12:00:00.000Z',
    })

    expect(prepared).toMatchObject({
      kind: 'copy',
      folderId: 'folder-1',
      fileName: 'map.dna',
      fileFormat: 'snapgene',
      fileSyncState: 'local-only',
      fileProvenance: 'created',
      clearSourceMetadata: true,
    })
    expect(prepared.record.id).toBe('copy-id')
    expect(record.id).toBe('original-id')
    expect(existing.id).toBe('original-id')
    expect(sourceBytes).toEqual(new Uint8Array([1, 2, 3]))
    expect(prepared.fileBytes).toEqual(new Uint8Array([9, 8, 7]))
  })

  it('prepares native overwrite against the same id and format', () => {
    const prepared = prepareDatabaseProjectSave({
      record,
      existing: {
        id: 'original-id',
        folderId: 'folder-1',
        fileName: 'map.ape',
        fileFormat: 'genbank',
        fileProvenance: 'sync-folder',
      },
      decision: 'overwrite',
      bytes: new Uint8Array([4, 5]),
    })
    expect(prepared).toMatchObject({
      kind: 'overwrite',
      fileName: 'map.ape',
      fileFormat: 'genbank',
      fileSyncState: 'modified',
      fileProvenance: 'sync-folder',
      clearSourceMetadata: false,
    })
    expect(prepared.record.id).toBe('original-id')
  })

  it('refuses data preparation when the native writer is unavailable', () => {
    expect(() =>
      prepareDatabaseProjectSave({
        record,
        existing: {
          id: 'original-id',
          fileName: 'map.embl',
          fileFormat: 'embl',
        },
        decision: 'overwrite',
        bytes: new Uint8Array(),
      }),
    ).toThrow('cannot safely export EMBL')
  })
})
