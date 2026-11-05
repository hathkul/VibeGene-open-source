import { describe, expect, it } from 'vitest'
import {
  databaseWorkspaceDocumentOrigin,
  diskWorkspaceDocumentOrigin,
  libraryMemberWorkspaceDocumentOrigin,
  parseWorkspaceDocumentOrigin,
  workspaceDocumentBindingForOrigin,
} from './workspaceDocumentOrigin'

describe('workspace document origin', () => {
  it('keeps database ownership when an unfiled project has no folder id', () => {
    const origin = databaseWorkspaceDocumentOrigin('project-1', null)
    expect(origin).toEqual({ kind: 'database', projectId: 'project-1', folderId: null })
    expect(workspaceDocumentBindingForOrigin(origin)).toBe('database')
  })

  it('routes a library member through the database save coordinator', () => {
    const origin = libraryMemberWorkspaceDocumentOrigin({
      projectId: 'library-1',
      folderId: 'folder-1',
      memberId: 'member-1',
      parentUpdatedAt: '2026-01-01T00:00:00.000Z',
    })
    expect(workspaceDocumentBindingForOrigin(origin)).toBe('database')
    expect(parseWorkspaceDocumentOrigin(origin)).toEqual(origin)
  })

  it('rejects malformed persisted origins and accepts a trimmed disk path', () => {
    expect(parseWorkspaceDocumentOrigin({ kind: 'database', projectId: '' })).toBeNull()
    expect(diskWorkspaceDocumentOrigin(' /tmp/construct.dna ')).toEqual({ kind: 'disk', path: '/tmp/construct.dna' })
  })
})
