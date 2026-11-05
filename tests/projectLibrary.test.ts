import { describe, expect, it } from 'vitest'
import {
  assertFolderMappingAllowsMove,
  buildFolderTree,
  collectAllTags,
  commonTags,
  detachProjectFromFolderSyncSource,
  folderSyncSourcePathChanged,
  folderPathLabel,
  normalizeTags,
  prepareProjectPathMutation,
  resolveTopLevelFolder,
  type StoredFolder,
} from '../src/storage/projectLibrary'
import type { StoredProject } from '../src/storage/projects'
import { defaultConstructProperties } from '../src/domain/constructProperties'

function makeProject(partial: Partial<StoredProject> & Pick<StoredProject, 'id' | 'name'>): StoredProject {
  return {
    id: partial.id,
    name: partial.name,
    updatedAt: partial.updatedAt ?? '',
    folderId: partial.folderId ?? null,
    tags: partial.tags ?? [],
    record: partial.record ?? {
      id: partial.id,
      name: partial.name,
      description: '',
      molecule: 'dna',
      topology: 'circular',
      sequence: 'ATGC',
      features: [],
      primers: [],
      operations: [],
      construct: defaultConstructProperties,
      createdAt: '',
      updatedAt: '',
    },
  }
}

describe('projectLibrary', () => {
  it('normalizes and dedupes tags case-insensitively', () => {
    expect(normalizeTags(['  CRISPR ', 'crispr', 'Vector', 'vector', ''])).toEqual(['CRISPR', 'Vector'])
  })

  it('builds a nested folder tree sorted by name', () => {
    const folders: StoredFolder[] = [
      { id: 'b', name: 'Beta', parentId: null, updatedAt: '' },
      { id: 'a', name: 'Alpha', parentId: null, updatedAt: '' },
      { id: 'a1', name: 'Child', parentId: 'a', updatedAt: '' },
    ]
    const tree = buildFolderTree(folders)
    expect(tree.map((node) => node.name)).toEqual(['Alpha', 'Beta'])
    expect(tree[0]?.children.map((node) => node.name)).toEqual(['Child'])
  })

  it('resolves nested folders to a top-level sync owner', () => {
    const folders: StoredFolder[] = [
      { id: 'root', name: 'Root', parentId: null, updatedAt: '' },
      { id: 'child', name: 'Child', parentId: 'root', updatedAt: '' },
      { id: 'leaf', name: 'Leaf', parentId: 'child', updatedAt: '' },
    ]
    expect(resolveTopLevelFolder(folders, 'leaf')?.id).toBe('root')
    expect(resolveTopLevelFolder(folders, 'root')?.id).toBe('root')
    expect(resolveTopLevelFolder(folders, 'missing')).toBe(null)
    expect(
      resolveTopLevelFolder(
        [
          { id: 'a', name: 'A', parentId: 'b', updatedAt: '' },
          { id: 'b', name: 'B', parentId: 'a', updatedAt: '' },
        ],
        'a',
      ),
    ).toBe(null)
  })

  it('formats folder paths and collects tags from projects', () => {
    const folders: StoredFolder[] = [
      { id: 'lab', name: 'Lab', parentId: null, updatedAt: '' },
      { id: 'lenti', name: 'Lenti', parentId: 'lab', updatedAt: '' },
    ]
    expect(folderPathLabel(folders, null)).toBe('Unfiled')
    expect(folderPathLabel(folders, 'lenti')).toBe('Lab / Lenti')
    expect(
      collectAllTags([
        makeProject({ id: '1', name: 'a', tags: ['Vector'] }),
        makeProject({ id: '2', name: 'b', tags: ['vector', 'CRISPR'] }),
      ]),
    ).toEqual(['CRISPR', 'Vector'])
  })

  it('computes common tags across a multi-selection', () => {
    expect(
      commonTags([
        makeProject({ id: '1', name: 'a', tags: ['Vector', 'CRISPR'] }),
        makeProject({ id: '2', name: 'b', tags: ['vector', 'Lab'] }),
        makeProject({ id: '3', name: 'c', tags: ['VECTOR'] }),
      ]),
    ).toEqual(['Vector'])
    expect(commonTags([])).toEqual([])
  })

  it('invalidates source metadata without touching identity or file bytes metadata', () => {
    const project = {
      ...makeProject({
        id: 'linked',
        name: 'Linked',
        folderId: 'root',
      }),
      folderId: 'root',
      syncSourceHash: 'old-disk-hash',
      syncRelativePath: 'old/path.gb',
      fileName: 'path.gb',
      fileFormat: 'genbank',
      fileSyncState: 'synced',
      fileProvenance: 'sync-folder',
    } satisfies StoredProject

    const detached = detachProjectFromFolderSyncSource(project)

    expect(detached).toMatchObject({
      id: 'linked',
      folderId: 'root',
      fileName: 'path.gb',
      fileFormat: 'genbank',
      fileSyncState: 'local-only',
      fileProvenance: 'imported',
    })
    expect(detached.syncSourceHash).toBeUndefined()
    expect(detached.syncRelativePath).toBeUndefined()
    expect(project.syncSourceHash).toBe('old-disk-hash')
    expect(project.syncRelativePath).toBe('old/path.gb')
  })

  it('only treats an existing, genuinely different source path as a remap', () => {
    expect(folderSyncSourcePathChanged(undefined, '/new/source')).toBe(false)
    expect(folderSyncSourcePathChanged('/same/source/', '/same/source')).toBe(false)
    expect(folderSyncSourcePathChanged('C:\\same\\source', 'C:/same/source/')).toBe(false)
    expect(folderSyncSourcePathChanged('/old/source', '/new/source')).toBe(true)
  })

  it('tombstones the old baseline path and detaches a mapped project path mutation', () => {
    const project = {
      ...makeProject({ id: 'linked', name: 'Linked', folderId: 'old-child' }),
      syncSourceHash: 'summary-hash',
      syncRelativePath: 'stale/path.gb',
      fileName: 'path.gb',
      fileFormat: 'genbank',
      fileSyncState: 'modified',
      fileProvenance: 'sync-folder',
    } satisfies StoredProject
    const prepared = prepareProjectPathMutation({
      project,
      baseline: {
        projectId: project.id,
        fileName: 'path.gb',
        fileFormat: 'genbank',
        contentHash: 'baseline-hash',
        semanticRecordHash: 'semantic-hash',
        relativePath: 'old/path.gb',
        capturedAt: '2026-08-12T00:00:00.000Z',
      },
      oldRootFolderId: 'old-root',
      oldRootIsMapped: true,
      updatedAt: '2026-08-13T00:00:00.000Z',
      tombstoneId: 'path-move',
    })

    expect(prepared.tombstone).toMatchObject({
      id: 'path-move',
      rootFolderId: 'old-root',
      relativePath: 'old/path.gb',
      projectId: 'linked',
      contentHash: 'baseline-hash',
    })
    expect(prepared.project).toMatchObject({
      id: 'linked',
      folderId: 'old-child',
      fileName: 'path.gb',
      fileFormat: 'genbank',
      fileSyncState: 'local-only',
      fileProvenance: 'imported',
      updatedAt: '2026-08-13T00:00:00.000Z',
    })
    expect(prepared.project.syncSourceHash).toBeUndefined()
    expect(prepared.project.syncRelativePath).toBeUndefined()
  })

  it('does not tombstone local-only or unmapped project path mutations', () => {
    const linked = {
      ...makeProject({ id: 'linked', name: 'Linked', folderId: 'old-child' }),
      syncRelativePath: 'old/path.gb',
      fileSyncState: 'synced',
    } satisfies StoredProject
    const common = {
      baseline: null,
      oldRootFolderId: 'old-root',
      updatedAt: '2026-08-13T00:00:00.000Z',
      tombstoneId: 'unused',
    }

    expect(
      prepareProjectPathMutation({
        ...common,
        project: { ...linked, fileSyncState: 'local-only' },
        oldRootIsMapped: true,
      }).tombstone,
    ).toBe(null)
    expect(
      prepareProjectPathMutation({
        ...common,
        project: linked,
        oldRootIsMapped: false,
      }).tombstone,
    ).toBe(null)
  })

  it('requires explicit mapping removal before nesting a mapped top-level folder', () => {
    const root = { parentId: null }

    expect(() => assertFolderMappingAllowsMove(root, 'another-folder', true)).toThrow(
      'Remove its sync mapping first',
    )
    expect(() => assertFolderMappingAllowsMove(root, 'another-folder', false)).not.toThrow()
    expect(() =>
      assertFolderMappingAllowsMove({ parentId: 'old-parent' }, 'another-folder', true),
    ).not.toThrow()
  })
})
