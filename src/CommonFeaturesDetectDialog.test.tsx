// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cloneFixture } from './domain/fixtures'
import { CommonFeaturesDetectDialog } from './CommonFeaturesDetectDialog'

describe('CommonFeaturesDetectDialog', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })

  it('shows only OK when no common features were detected', () => {
    const onCancel = vi.fn()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root.render(
      <CommonFeaturesDetectDialog
        recordName="Construct"
        record={cloneFixture()}
        matches={[]}
        minimumIdentityPercent={95}
        onMinimumIdentityChange={vi.fn()}
        onCancel={onCancel}
        onAdd={vi.fn()}
      />,
    ))

    const buttons = [...host.querySelectorAll<HTMLButtonElement>('.common-features-detect-footer button')]
    expect(buttons).toHaveLength(1)
    expect(buttons[0]?.textContent).toBe('OK')
    act(() => buttons[0]?.click())
    expect(onCancel).toHaveBeenCalledOnce()
  })
})
