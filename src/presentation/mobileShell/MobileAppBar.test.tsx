// @vitest-environment jsdom
import { createRef } from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MobileAppBar, type MobileAppBarProps } from './MobileAppBar'

function makeProps(overrides: Partial<MobileAppBarProps> = {}): MobileAppBarProps {
  return {
    menuButtonRef: createRef<HTMLButtonElement>(),
    sidebarButtonRef: createRef<HTMLButtonElement>(),
    descriptionButtonRef: createRef<HTMLButtonElement>(),
    documentTitle: 'plasmid.dna — VibeGene',
    menuOpen: false,
    sidebarOpen: false,
    descriptionPanelVisible: false,
    sidePanelAvailable: true,
    sidePanelLabel: 'Display controls',
    descriptionPanelAvailable: true,
    onToggleMenu: vi.fn(),
    onToggleSidebar: vi.fn(),
    onToggleDescriptionPanel: vi.fn(),
    ...overrides,
  }
}

describe('MobileAppBar', () => {
  let root: Root | null = null
  let host: HTMLElement | null = null

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
    root = null
    host = null
  })

  function render(props: MobileAppBarProps) {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root!.render(<MobileAppBar {...props} />))
    return host
  }

  function button(dom: HTMLElement, label: string) {
    return Array.from(dom.querySelectorAll('button')).find(
      (candidate) => candidate.getAttribute('aria-label') === label,
    )
  }

  it('reflects the menu open state in the trigger label and aria-expanded', () => {
    const dom = render(makeProps())
    const open = button(dom, 'Open document menu')!
    expect(open.getAttribute('aria-expanded')).toBe('false')
    expect(open.getAttribute('aria-controls')).toBe('mobile-document-menu')

    act(() => root!.render(<MobileAppBar {...makeProps({ menuOpen: true })} />))
    expect(button(dom, 'Open document menu')).toBeUndefined()
    const close = button(dom, 'Close document menu')!
    expect(close.getAttribute('aria-expanded')).toBe('true')
  })

  it('renders the document title as content and tooltip', () => {
    const dom = render(makeProps())
    const title = dom.querySelector('.mobile-document-title')!
    expect(title.textContent).toBe('plasmid.dna — VibeGene')
    expect(title.getAttribute('title')).toBe('plasmid.dna — VibeGene')
  })

  it('routes each trigger to its own command callback', () => {
    const onToggleMenu = vi.fn()
    const onToggleSidebar = vi.fn()
    const onToggleDescriptionPanel = vi.fn()
    const dom = render(makeProps({ onToggleMenu, onToggleSidebar, onToggleDescriptionPanel }))
    act(() => button(dom, 'Open document menu')!.click())
    act(() => button(dom, 'Open display controls')!.click())
    act(() => button(dom, 'Open description panel')!.click())
    expect(onToggleMenu).toHaveBeenCalledTimes(1)
    expect(onToggleSidebar).toHaveBeenCalledTimes(1)
    expect(onToggleDescriptionPanel).toHaveBeenCalledTimes(1)
  })

  it('omits the side-panel and description triggers when unavailable', () => {
    const dom = render(makeProps({ sidePanelAvailable: false, descriptionPanelAvailable: false }))
    expect(button(dom, 'Open display controls')).toBeUndefined()
    expect(button(dom, 'Open description panel')).toBeUndefined()
    expect(button(dom, 'Open document menu')).toBeDefined()
  })

  it('attaches the behavior-hook refs so focus restoration can target the triggers', () => {
    const menuButtonRef = createRef<HTMLButtonElement>()
    const sidebarButtonRef = createRef<HTMLButtonElement>()
    const descriptionButtonRef = createRef<HTMLButtonElement>()
    render(makeProps({ menuButtonRef, sidebarButtonRef, descriptionButtonRef }))

    expect(menuButtonRef.current?.getAttribute('aria-label')).toBe('Open document menu')
    expect(sidebarButtonRef.current?.getAttribute('aria-controls')).toBe('mobile-side-panel')
    expect(descriptionButtonRef.current?.getAttribute('aria-controls')).toBe('document-description-drawer')

    act(() => menuButtonRef.current!.focus())
    expect(document.activeElement).toBe(menuButtonRef.current)
    act(() => descriptionButtonRef.current!.focus())
    expect(document.activeElement).toBe(descriptionButtonRef.current)
  })
})
