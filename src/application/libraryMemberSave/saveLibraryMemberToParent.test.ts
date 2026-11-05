import { describe, expect, it, vi } from 'vitest'
import { cloneFixture } from '../../domain/fixtures'
import { withDnaLibraryRole } from '../../domain/dnaLibrary'
import { traceRecordFromSequence } from '../../domain/sequenceTraceFactory'
import { saveLibraryMemberToParent } from './saveLibraryMemberToParent'

function setup() {
  const parent = {
    ...cloneFixture(),
    id: 'library-1',
    updatedAt: '2026-01-01T00:00:00.000Z',
    dna: withDnaLibraryRole(cloneFixture().dna),
    traceFiles: [traceRecordFromSequence('member-1.dna', 'AACCGG')],
  }
  parent.traceFiles[0]!.id = 'member-1'
  const edited = {
    ...cloneFixture(),
    id: 'standalone-copy',
    name: 'renamed-member.dna',
    sequence: 'AATCGG',
    features: [],
    primers: [],
  }
  const getProject = vi.fn().mockResolvedValue({
    id: parent.id,
    name: parent.name,
    updatedAt: parent.updatedAt,
    folderId: 'folder-1',
    tags: ['library'],
    sequenceLength: parent.sequence.length,
    molecule: parent.molecule,
    topology: parent.topology,
    record: parent,
  })
  const saveProject = vi.fn(async (record) => ({ ...record, updatedAt: '2026-01-02T00:00:00.000Z' }))
  const origin = {
    kind: 'library-member' as const,
    projectId: parent.id,
    folderId: 'folder-1',
    memberId: 'member-1',
    parentUpdatedAt: parent.updatedAt,
  }
  return { parent, edited, getProject, saveProject, origin }
}

describe('saveLibraryMemberToParent', () => {
  it('replaces the source member while preserving its identity and updates the origin revision', async () => {
    const { edited, getProject, saveProject, origin } = setup()
    const result = await saveLibraryMemberToParent(edited, origin, { getProject, saveProject })
    const savedParent = saveProject.mock.calls[0]![0]
    const member = savedParent.traceFiles![0]!
    expect(member.id).toBe('member-1')
    expect(member.fileName).toBe('renamed-member.dna')
    expect(member.sequence).toBe('AATCGG')
    expect(saveProject).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      folderId: 'folder-1',
      tags: ['library'],
      expectedProjectUpdatedAt: origin.parentUpdatedAt,
    }))
    expect(result.origin.parentUpdatedAt).toBe('2026-01-02T00:00:00.000Z')
  })

  it('preserves edited nucleotide case in the saved member and base calls', async () => {
    const { edited, getProject, saveProject, origin } = setup()
    edited.sequence = 'AaTcGg'

    await saveLibraryMemberToParent(edited, origin, { getProject, saveProject })

    const member = saveProject.mock.calls[0]![0].traceFiles![0]!
    expect(member.sequence).toBe('AaTcGg')
    expect(member.chromatogram.baseCalls).toEqual(['A', 'a', 'T', 'c', 'G', 'g'])
  })

  it('rejects a stale parent revision instead of overwriting another window', async () => {
    const { edited, getProject, saveProject, origin } = setup()
    getProject.mockResolvedValueOnce({ ...(await getProject()), record: { ...(await getProject()).record, updatedAt: 'later' } })
    await expect(saveLibraryMemberToParent(edited, origin, { getProject, saveProject }))
      .rejects.toThrow('changed in another window')
    expect(saveProject).not.toHaveBeenCalled()
  })

  it('reports a removed member explicitly', async () => {
    const { edited, getProject, saveProject, origin } = setup()
    const project = await getProject()
    getProject.mockResolvedValueOnce({ ...project, record: { ...project.record, traceFiles: [] } })
    await expect(saveLibraryMemberToParent(edited, origin, { getProject, saveProject }))
      .rejects.toThrow('no longer present')
  })
})
