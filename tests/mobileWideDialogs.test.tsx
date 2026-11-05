// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EnzymeInfoDialog } from '../src/EnzymeInfoDialog'
import { isIosWebFilePicker } from '../src/domain/fileFormats'
import { MobilePaneTabs } from '../src/ui/MobilePaneTabs'
import { MOBILE_SHELL_MEDIA } from '../src/ui/mobileShellMedia'

let reactRoot: ReturnType<typeof createRoot> | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  if (reactRoot) act(() => reactRoot!.unmount())
  container?.remove()
  reactRoot = null
  container = null
  vi.unstubAllGlobals()
})

function render(node: ReactNode) {
  container = document.createElement('div')
  document.body.append(container)
  reactRoot = createRoot(container)
  act(() => {
    reactRoot!.render(node)
  })
}

describe('MobilePaneTabs', () => {
  it('marks the active pane and reports changes', () => {
    const onChange = vi.fn()
    render(
      <MobilePaneTabs
        label="Test panes"
        panes={[
          { id: 'gel', label: 'Gel' },
          { id: 'lanes', label: 'Lanes' },
          { id: 'setup', label: 'Setup' },
        ]}
        value="gel"
        onChange={onChange}
      />,
    )

    const tabs = document.querySelector('.mobile-cloning-pane-tabs')
    expect(tabs?.getAttribute('aria-label')).toBe('Test panes')
    expect(tabs?.classList.contains('is-two-pane')).toBe(false)
    const buttons = [...document.querySelectorAll('.mobile-cloning-pane-tabs button')]
    expect(buttons.map((button) => button.textContent)).toEqual(['Gel', 'Lanes', 'Setup'])
    expect(buttons[0]?.classList.contains('is-active')).toBe(true)

    act(() => {
      buttons[1]!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onChange).toHaveBeenCalledWith('lanes')
  })

  it('uses a two-pane class for list/detail switchers', () => {
    render(
      <MobilePaneTabs
        label="Folders"
        panes={[
          { id: 'folders', label: 'Folders' },
          { id: 'records', label: 'Records' },
        ]}
        value="records"
        onChange={() => undefined}
      />,
    )
    expect(document.querySelector('.mobile-cloning-pane-tabs')?.classList.contains('is-two-pane')).toBe(true)
  })
})

describe('EnzymeInfoDialog mobile panes', () => {
  it('renders list/detail switcher markup used by the phone layout', () => {
    render(<EnzymeInfoDialog initialEnzymeName="EcoRI" onClose={() => undefined} />)
    const tabs = document.querySelector('.mobile-cloning-pane-tabs[aria-label="Enzyme information panes"]')
    expect(tabs).toBeTruthy()
    expect(document.querySelector('.enzyme-info-body')?.classList.contains('mobile-pane-detail')).toBe(true)
    const listButton = [...document.querySelectorAll('.mobile-cloning-pane-tabs button')].find(
      (button) => button.textContent === 'Enzymes',
    )
    act(() => {
      listButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(document.querySelector('.enzyme-info-body')?.classList.contains('mobile-pane-list')).toBe(true)
  })

  it('exposes a header close control with an accessible label', () => {
    const onClose = vi.fn()
    render(<EnzymeInfoDialog initialEnzymeName="EcoRI" onClose={onClose} />)
    const close = document.querySelector<HTMLButtonElement>('.enzyme-info-close')
    expect(close?.getAttribute('aria-label')).toBe('Close dialog')
    act(() => {
      close!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('isIosWebFilePicker', () => {
  it('detects iPhone Safari user agents', () => {
    vi.stubGlobal('navigator', {
      platform: 'iPhone',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
      maxTouchPoints: 5,
    })
    expect(isIosWebFilePicker()).toBe(true)
  })

  it('does not treat desktop Safari as iOS', () => {
    vi.stubGlobal('navigator', {
      platform: 'MacIntel',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15',
      maxTouchPoints: 0,
    })
    expect(isIosWebFilePicker()).toBe(false)
  })
})

describe('mobile shell media contract', () => {
  it('keeps the existing touch-phone query string', () => {
    expect(MOBILE_SHELL_MEDIA).toContain('(hover: none) and (pointer: coarse) and (max-width: 760px)')
  })
})
