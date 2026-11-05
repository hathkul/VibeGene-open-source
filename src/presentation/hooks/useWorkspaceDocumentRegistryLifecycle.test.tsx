// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import type {
  WorkspaceDocumentRegistryLifecycleInput,
  WorkspaceDocumentRegistryLifecyclePorts,
} from './useWorkspaceDocumentRegistryLifecycle'
import { useWorkspaceDocumentRegistryLifecycle } from './useWorkspaceDocumentRegistryLifecycle'

type WorkspaceDocumentRegistryHarnessInput = Omit<
  WorkspaceDocumentRegistryLifecycleInput,
  'resolveCurrentWindowLabel' | 'claimWorkspaceDocument' | 'releaseWorkspaceDocument'
> & {
  resolveCurrentWindowLabel: Mock<WorkspaceDocumentRegistryLifecyclePorts['resolveCurrentWindowLabel']>
  claimWorkspaceDocument: Mock<WorkspaceDocumentRegistryLifecyclePorts['claimWorkspaceDocument']>
  releaseWorkspaceDocument: Mock<WorkspaceDocumentRegistryLifecyclePorts['releaseWorkspaceDocument']>
}

describe('useWorkspaceDocumentRegistryLifecycle', () => {
  let host: HTMLDivElement | undefined
  let root: ReturnType<typeof createRoot> | undefined

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })

  function makeInput(
    overrides: Partial<WorkspaceDocumentRegistryHarnessInput> = {},
  ): WorkspaceDocumentRegistryHarnessInput {
    const resolveCurrentWindowLabel = vi.fn<WorkspaceDocumentRegistryLifecyclePorts['resolveCurrentWindowLabel']>()
    resolveCurrentWindowLabel.mockResolvedValue('window-1')
    return {
      isNativeDesktop: true,
      documentSaveBinding: 'new',
      workspaceDiskPath: null,
      recordId: 'project-1',
      resolveCurrentWindowLabel,
      claimWorkspaceDocument: vi.fn<WorkspaceDocumentRegistryLifecyclePorts['claimWorkspaceDocument']>(),
      releaseWorkspaceDocument: vi.fn<WorkspaceDocumentRegistryLifecyclePorts['releaseWorkspaceDocument']>(),
      ...overrides,
    }
  }

  it('skips registry work when not on native desktop', async () => {
    const input = makeInput({ isNativeDesktop: false, documentSaveBinding: 'disk', workspaceDiskPath: '/tmp/a.gb' })
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      useWorkspaceDocumentRegistryLifecycle(input)
      return null
    }
    await act(async () => { root!.render(<Harness />); await Promise.resolve(); await Promise.resolve() })
    expect(input.resolveCurrentWindowLabel).not.toHaveBeenCalled()
    await act(async () => { root!.unmount(); await Promise.resolve(); await Promise.resolve() })
    expect(input.releaseWorkspaceDocument).not.toHaveBeenCalled()
  })

  it('claims disk before database and releases when no document key', async () => {
    const claimWorkspaceDocument = vi.fn<WorkspaceDocumentRegistryLifecyclePorts['claimWorkspaceDocument']>()
    const releaseWorkspaceDocument = vi.fn<WorkspaceDocumentRegistryLifecyclePorts['releaseWorkspaceDocument']>()
    const input = makeInput({
      claimWorkspaceDocument,
      releaseWorkspaceDocument,
      documentSaveBinding: 'disk',
      workspaceDiskPath: '/tmp/plasmid.gb',
      recordId: 'project-1',
    })
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      useWorkspaceDocumentRegistryLifecycle(input)
      return null
    }
    await act(async () => { root!.render(<Harness />); await Promise.resolve() })
    expect(claimWorkspaceDocument).toHaveBeenCalledWith({ kind: 'file', path: '/tmp/plasmid.gb' }, 'window-1')

    input.documentSaveBinding = 'database'
    input.workspaceDiskPath = '/tmp/plasmid.gb'
    await act(async () => { root!.render(<Harness />); await Promise.resolve() })
    expect(claimWorkspaceDocument).toHaveBeenLastCalledWith({ kind: 'database', projectId: 'project-1' }, 'window-1')

    input.documentSaveBinding = 'database'
    input.workspaceDiskPath = null
    await act(async () => { root!.render(<Harness />); await Promise.resolve() })
    expect(claimWorkspaceDocument).toHaveBeenLastCalledWith({ kind: 'database', projectId: 'project-1' }, 'window-1')

    input.documentSaveBinding = 'new'
    input.recordId = 'project-1'
    await act(async () => { root!.render(<Harness />); await Promise.resolve() })
    expect(releaseWorkspaceDocument).toHaveBeenLastCalledWith('window-1')
  })

  it('ignores stale async label resolution after binding changes', async () => {
    let resolveFirst: ((label: string) => void) | undefined
    let resolveSecond: ((label: string) => void) | undefined
    const resolveCurrentWindowLabel = vi.fn<WorkspaceDocumentRegistryLifecyclePorts['resolveCurrentWindowLabel']>()
    resolveCurrentWindowLabel
      .mockImplementationOnce(() => new Promise<string>((resolve) => { resolveFirst = resolve }))
      .mockImplementationOnce(() => new Promise<string>((resolve) => { resolveSecond = resolve }))
    const claimWorkspaceDocument = vi.fn<WorkspaceDocumentRegistryLifecyclePorts['claimWorkspaceDocument']>()
    const input = makeInput({
      resolveCurrentWindowLabel,
      claimWorkspaceDocument,
      documentSaveBinding: 'disk',
      workspaceDiskPath: '/tmp/first.gb',
    })
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      useWorkspaceDocumentRegistryLifecycle(input)
      return null
    }
    await act(async () => { root!.render(<Harness />) })
    input.workspaceDiskPath = '/tmp/second.gb'
    await act(async () => { root!.render(<Harness />) })
    await act(async () => { resolveSecond!('window-2'); await Promise.resolve() })
    expect(claimWorkspaceDocument).toHaveBeenCalledTimes(1)
    expect(claimWorkspaceDocument).toHaveBeenCalledWith({ kind: 'file', path: '/tmp/second.gb' }, 'window-2')
    await act(async () => { resolveFirst!('window-stale'); await Promise.resolve() })
    expect(claimWorkspaceDocument).toHaveBeenCalledTimes(1)
  })

  it('swallows a rejected window-label lookup during claim', async () => {
    const resolveCurrentWindowLabel = vi.fn<WorkspaceDocumentRegistryLifecyclePorts['resolveCurrentWindowLabel']>()
    resolveCurrentWindowLabel.mockRejectedValue(new Error('label lookup failed'))
    const claimWorkspaceDocument = vi.fn<WorkspaceDocumentRegistryLifecyclePorts['claimWorkspaceDocument']>()
    const input = makeInput({
      resolveCurrentWindowLabel,
      claimWorkspaceDocument,
      documentSaveBinding: 'disk',
      workspaceDiskPath: '/tmp/a.gb',
    })
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      useWorkspaceDocumentRegistryLifecycle(input)
      return null
    }
    await act(async () => { root!.render(<Harness />); await Promise.resolve(); await Promise.resolve() })
    expect(claimWorkspaceDocument).not.toHaveBeenCalled()
  })

  it('swallows throwing claim and unmount release failures without surfacing errors', async () => {
    const claimWorkspaceDocument = vi.fn<WorkspaceDocumentRegistryLifecyclePorts['claimWorkspaceDocument']>()
    claimWorkspaceDocument.mockImplementation(() => {
      throw new Error('claim failed')
    })
    const input = makeInput({
      claimWorkspaceDocument,
      documentSaveBinding: 'disk',
      workspaceDiskPath: '/tmp/a.gb',
    })
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      useWorkspaceDocumentRegistryLifecycle(input)
      return null
    }
    await act(async () => { root!.render(<Harness />); await Promise.resolve() })
    expect(claimWorkspaceDocument).toHaveBeenCalledWith({ kind: 'file', path: '/tmp/a.gb' }, 'window-1')

    const releaseWorkspaceDocument = vi.fn<WorkspaceDocumentRegistryLifecyclePorts['releaseWorkspaceDocument']>()
    releaseWorkspaceDocument.mockImplementation(() => {
      throw new Error('release failed')
    })
    const releaseLabel = vi.fn<WorkspaceDocumentRegistryLifecyclePorts['resolveCurrentWindowLabel']>()
    releaseLabel.mockRejectedValue(new Error('unmount label failed'))
    input.resolveCurrentWindowLabel = releaseLabel
    input.releaseWorkspaceDocument = releaseWorkspaceDocument
    await act(async () => { root!.unmount(); await Promise.resolve(); await Promise.resolve() })
    expect(releaseWorkspaceDocument).not.toHaveBeenCalled()
  })

  it('releases on unmount in native desktop and uses fresh release port', async () => {
    const releaseWorkspaceDocument = vi.fn<WorkspaceDocumentRegistryLifecyclePorts['releaseWorkspaceDocument']>()
    const input = makeInput({ releaseWorkspaceDocument, documentSaveBinding: 'database', workspaceDiskPath: null })
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      useWorkspaceDocumentRegistryLifecycle(input)
      return null
    }
    await act(async () => { root!.render(<Harness />); await Promise.resolve() })
    const releaseOnUnmount = vi.fn<WorkspaceDocumentRegistryLifecyclePorts['releaseWorkspaceDocument']>()
    input.releaseWorkspaceDocument = releaseOnUnmount
    await act(async () => { root!.render(<Harness />); await Promise.resolve() })
    await act(async () => { root!.unmount(); await Promise.resolve() })
    expect(releaseOnUnmount).toHaveBeenCalledWith('window-1')
    expect(releaseWorkspaceDocument).not.toHaveBeenCalled()
  })
})
