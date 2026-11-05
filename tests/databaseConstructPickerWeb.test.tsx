// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultConstructProperties } from '../src/domain/constructProperties'
import { serializeProjectFile } from '../src/domain/fileFormats'
import { createRestrictionCloningProductLibrary } from '../src/domain/restrictionCloningBatch'
import { initSnapGeneLzma } from '../src/domain/snapgeneLzma'
import type { SequenceRecord } from '../src/domain/types'
import type { StoredProject } from '../src/storage/projects'

const mocks = vi.hoisted(() => ({
  managerProps: null as Record<string, unknown> | null,
  getProjectFileBlob: vi.fn(async () => null),
  listProjectSummaries: vi.fn(async () => []),
}))

vi.mock('../src/desktop/tauriRuntime', () => ({
  isTauriRuntime: () => false,
}))

vi.mock('../src/DatabaseManagerDialog', () => ({
  DatabaseManagerDialog: (props: Record<string, unknown>) => {
    mocks.managerProps = props
    return <div data-testid="database-manager" />
  },
}))

vi.mock('../src/storage/projects', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/storage/projects')>()
  return {
    ...original,
    deleteProject: vi.fn(),
    getProjectFileBlob: mocks.getProjectFileBlob,
    listProjectSummaries: mocks.listProjectSummaries,
  }
})

vi.mock('../src/storage/recentFiles', () => ({
  touchRecentDatabaseProject: vi.fn(),
}))

import { DatabaseConstructPickerDialog } from '../src/cloning/DatabaseConstructPickerDialog'

function libraryProject(): StoredProject {
  const record: SequenceRecord = {
    id: 'library',
    name: 'Library',
    description: '',
    molecule: 'dna',
    topology: 'linear',
    sequence: 'ATGC',
    dna: { documentRole: 'library' },
    traceFiles: [],
    features: [],
    primers: [],
    operations: [],
    construct: { ...defaultConstructProperties },
    createdAt: '',
    updatedAt: '',
  }
  return {
    id: record.id,
    name: record.name,
    updatedAt: record.updatedAt,
    sequenceLength: record.sequence.length,
    molecule: record.molecule,
    topology: record.topology,
    documentRole: 'library',
    record,
  }
}

let root: ReturnType<typeof createRoot> | null = null
let container: HTMLDivElement | null = null

beforeAll(async () => {
  await initSnapGeneLzma()
})

beforeEach(() => {
  mocks.managerProps = null
  mocks.getProjectFileBlob.mockResolvedValue(null)
  mocks.listProjectSummaries.mockResolvedValue([])
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  if (root) act(() => root!.unmount())
  container?.remove()
  root = null
  container = null
})

describe('DatabaseConstructPickerDialog in the browser', () => {
  it('returns a single database library through the multiple-selection callback', async () => {
    const onSelect = vi.fn()
    const onSelectMany = vi.fn()
    await act(async () => {
      root!.render(
        <DatabaseConstructPickerDialog
          multiple
          onCancel={() => undefined}
          onSelect={onSelect}
          onSelectMany={onSelectMany}
        />,
      )
      await Promise.resolve()
    })

    const project = libraryProject()
    await act(async () => {
      await (mocks.managerProps!.onAddConstruct as (choice: StoredProject) => Promise<void>)(project)
    })

    expect(onSelect).not.toHaveBeenCalled()
    expect(onSelectMany).toHaveBeenCalledWith([{ record: project.record, project }])
  })

  it('recovers members discarded by older database imports from the saved source file', async () => {
    const packed = createRestrictionCloningProductLibrary(
      [
        { ...libraryProject().record, id: 'a', name: 'Insert A', dna: undefined },
        { ...libraryProject().record, id: 'b', name: 'Insert B', dna: undefined },
      ],
      'Library',
    )
    const serialized = serializeProjectFile('snapgene', packed)
    if (!serialized.ok) throw new Error(serialized.error)
    mocks.getProjectFileBlob.mockResolvedValue({
      projectId: 'library',
      fileName: 'Library.dna',
      fileFormat: 'snapgene',
      bytes: serialized.bytes,
      byteLength: serialized.bytes.byteLength,
      updatedAt: '',
    })
    const onSelect = vi.fn()
    await act(async () => {
      root!.render(
        <DatabaseConstructPickerDialog
          onCancel={() => undefined}
          onSelect={onSelect}
        />,
      )
      await Promise.resolve()
    })

    await act(async () => {
      await (mocks.managerProps!.onAddConstruct as (choice: StoredProject) => Promise<void>)(
        libraryProject(),
      )
    })

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        dna: expect.objectContaining({ documentRole: 'library' }),
        traceFiles: expect.arrayContaining([
          expect.objectContaining({ fileName: 'Insert A' }),
          expect.objectContaining({ fileName: 'Insert B' }),
        ]),
      }),
      expect.any(Object),
    )
  })
})
