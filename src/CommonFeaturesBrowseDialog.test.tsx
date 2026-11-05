// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CommonFeaturesBrowseDialog } from './CommonFeaturesBrowseDialog'

vi.mock('./domain/commonFeatures', () => ({
  loadBuiltInCommonFeatures: async () => [
    { id: 'standard-a', name: 'Standard A', type: 'misc', sequence: 'AAAA' },
    { id: 'standard-b', name: 'Standard B', type: 'misc', sequence: 'CCCC' },
  ],
}))

vi.mock('./storage/userCommonFeatures', () => ({
  addUserCommonFeatures: vi.fn(),
  listUserCommonFeatures: () => [{ id: 'user-a', name: 'User A', type: 'misc', sequence: 'GGGG' }],
  MIN_COMMON_FEATURE_LENGTH_BP: 1,
  writeUserCommonFeatures: vi.fn(),
}))

vi.mock('./CommonFeaturePreviewWorkspace', () => ({
  CommonFeaturePreviewWorkspace: ({ template }: { template: { id: string } | null }) => (
    <div data-selected-template={template?.id ?? ''} />
  ),
}))

describe('CommonFeaturesBrowseDialog selection lifecycle', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })

  it('resets to the first template when the library source changes', async () => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => {
      root.render(<CommonFeaturesBrowseDialog onCancel={() => undefined} renderWorkspace={() => null} />)
      await Promise.resolve()
    })

    const standardItems = () => [...host.querySelectorAll<HTMLButtonElement>('[role="option"]')]
    expect(standardItems()).toHaveLength(2)
    act(() => standardItems()[1]!.click())
    expect(standardItems()[1]!.getAttribute('aria-selected')).toBe('true')

    const library = host.querySelector('select') as HTMLSelectElement
    act(() => {
      library.value = 'user'
      library.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(standardItems()).toHaveLength(1)
    expect(standardItems()[0]!.getAttribute('aria-selected')).toBe('true')

    act(() => {
      library.value = 'standard'
      library.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(standardItems()).toHaveLength(2)
    expect(standardItems()[0]!.getAttribute('aria-selected')).toBe('true')
    expect(standardItems()[0]!.textContent).toBe('Standard A')
  })
})
