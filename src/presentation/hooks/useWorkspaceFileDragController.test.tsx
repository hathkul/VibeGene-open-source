// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceFileDragEvent } from './useWorkspaceFileDragController'
import { useWorkspaceFileDragController } from './useWorkspaceFileDragController'
import { DATABASE_PROJECTS_DRAG_MIME, encodeDatabaseProjectsDragPayload } from '../../domain/databaseProjectDrag'

function dragEvent(files: File[] = []): WorkspaceFileDragEvent {
  return {
    preventDefault: vi.fn(),
    dataTransfer: { types: ['Files'], dropEffect: '', files: files as unknown as FileList },
  }
}

describe('useWorkspaceFileDragController', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })

  it('keeps nested browser drags active until the final leave, then resets before routing a drop', () => {
    const setDragActive = vi.fn()
    const onFiles = vi.fn()
    let controller: ReturnType<typeof useWorkspaceFileDragController>
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      controller = useWorkspaceFileDragController({
        isNativeDesktop: false,
        blocked: false,
        hasFiles: (types) => types.includes('Files'),
        setDragActive,
        onFiles,
      })
      return null
    }
    act(() => root.render(<Harness />))

    act(() => { controller!.onDragEnter(dragEvent()); controller!.onDragEnter(dragEvent()); controller!.onDragLeave(dragEvent()) })
    expect(setDragActive).toHaveBeenCalledTimes(2)
    expect(setDragActive).toHaveBeenLastCalledWith(true)

    const dropped = new File(['ATGC'], 'vector.dna')
    act(() => controller!.onDrop(dragEvent([dropped])))
    expect(setDragActive).toHaveBeenLastCalledWith(false)
    expect(onFiles).toHaveBeenCalledWith([dropped])
  })

  it('routes a validated database-project payload instead of treating it as a file drop', () => {
    const onDatabaseProjects = vi.fn()
    let controller: ReturnType<typeof useWorkspaceFileDragController>
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      controller = useWorkspaceFileDragController({
        isNativeDesktop: false,
        blocked: false,
        hasFiles: () => false,
        setDragActive: vi.fn(),
        onFiles: vi.fn(),
        onDatabaseProjects,
      })
      return null
    }
    act(() => root.render(<Harness />))
    const event: WorkspaceFileDragEvent = {
      preventDefault: vi.fn(),
      dataTransfer: {
        types: [DATABASE_PROJECTS_DRAG_MIME],
        dropEffect: '',
        files: [] as unknown as FileList,
        getData: (type) => type === DATABASE_PROJECTS_DRAG_MIME ? encodeDatabaseProjectsDragPayload(['p1']) : '',
      },
    }
    act(() => controller!.onDrop(event))
    expect(onDatabaseProjects).toHaveBeenCalledWith(['p1'])
  })
})
