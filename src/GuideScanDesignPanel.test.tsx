// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultConstructProperties } from './domain/constructProperties'
import type { SequenceRecord } from './domain/types'
import { GuideScanDesignPanel } from './GuideScanDesignPanel'

vi.mock('./domain/guidescan', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./domain/guidescan')>()
  return {
    ...actual,
    loadGuideScanCatalog: vi.fn().mockResolvedValue(null),
  }
})

describe('GuideScanDesignPanel footer actions', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })

  it('places dialog Cancel on the left and Design with GuideScan2 on the right', () => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    const record = {
      id: 'sequence-1',
      name: 'Test construct',
      description: '',
      molecule: 'dna',
      topology: 'linear',
      sequence: 'ACGTACGTACGT',
      features: [],
      primers: [],
      operations: [],
      construct: { ...defaultConstructProperties },
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    } satisfies SequenceRecord

    act(() => root.render(
      <GuideScanDesignPanel
        record={record}
        onCancel={vi.fn()}
        onAddSelected={vi.fn()}
      />,
    ))

    const left = host.querySelector('.guidescan-footer-actions-left')
    const right = host.querySelector('.guidescan-footer-actions-right')
    expect(left?.querySelector('button')?.textContent).toBe('Cancel')
    expect(right?.querySelector('button')?.textContent).toBe('Design with GuideScan2')
    expect(host.querySelector('.guidescan-design-actions')).toBeNull()

    const resultsTab = [...host.querySelectorAll('[role="tab"]')]
      .find((tab) => tab.textContent?.trim() === 'Results')
    act(() => (resultsTab as HTMLButtonElement | undefined)?.click())
    expect(host.querySelector('.guidescan-footer-actions-left button')?.textContent).toBe('Cancel')
    expect(host.querySelector('.guidescan-footer-actions-right button')).toBeNull()
  })
})
