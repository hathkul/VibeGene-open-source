// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { capabilitiesForRecord } from '../../domain/moleculeCapabilities'
import { cloneFixture } from '../../domain/fixtures'
import type { WorkspaceTab } from '../sequence'
import { useActiveWorkspaceTabRoutingLifecycle } from './useActiveWorkspaceTabRoutingLifecycle'

describe('useActiveWorkspaceTabRoutingLifecycle', () => {
  let host: HTMLDivElement | undefined
  let root: ReturnType<typeof createRoot> | undefined

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })

  it('forces Sequence when a trace document is open', () => {
    const setActiveTab = vi.fn()
    const record = cloneFixture()
    const moleculeCapabilities = capabilitiesForRecord(record)
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      useActiveWorkspaceTabRoutingLifecycle({
        activeTab: 'Map',
        setActiveTab,
        record,
        traceDocument: { fileName: 'read.ab1' },
        moleculeCapabilities,
      })
      return null
    }
    act(() => { root!.render(<Harness />) })
    expect(setActiveTab).toHaveBeenCalledWith('Sequence')
  })

  it('falls back when the active tab is invalid for the molecule', () => {
    const setActiveTab = vi.fn()
    const record = { ...cloneFixture(), molecule: 'protein' as const, dna: undefined }
    const moleculeCapabilities = capabilitiesForRecord(record)
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      useActiveWorkspaceTabRoutingLifecycle({
        activeTab: 'Enzymes' as WorkspaceTab,
        setActiveTab,
        record,
        traceDocument: null,
        moleculeCapabilities,
      })
      return null
    }
    act(() => { root!.render(<Harness />) })
    expect(setActiveTab).toHaveBeenCalledWith('Map')
  })
})
