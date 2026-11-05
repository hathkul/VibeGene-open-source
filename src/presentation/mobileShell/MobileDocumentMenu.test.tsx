// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MobileDocumentMenu,
  type MobileDocumentMenuProps,
} from './MobileDocumentMenu'

function makeProps(overrides: Partial<MobileDocumentMenuProps> = {}): MobileDocumentMenuProps {
  return {
    menuOpen: false,
    isMobileShell: true,
    onCloseMenu: vi.fn(),
    children: <button type="button">Leaf action</button>,
    ...overrides,
  }
}

describe('MobileDocumentMenu', () => {
  let root: Root | null = null
  let host: HTMLElement | null = null

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
    root = null
    host = null
  })

  function render(props: MobileDocumentMenuProps) {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root!.render(<MobileDocumentMenu {...props} />))
    return host
  }

  it('renders the backdrop only while the menu is open and closes on click', () => {
    const onCloseMenu = vi.fn()
    const closed = render(makeProps({ onCloseMenu }))
    expect(closed.querySelector('.mobile-menu-backdrop')).toBeNull()

    act(() => root!.render(<MobileDocumentMenu {...makeProps({ menuOpen: true, onCloseMenu })} />))
    const backdrop = host!.querySelector('.mobile-menu-backdrop')! as HTMLButtonElement
    expect(backdrop.getAttribute('aria-label')).toBe('Close document menu')
    act(() => backdrop.click())
    expect(onCloseMenu).toHaveBeenCalledTimes(1)
  })

  it('toggles the mobile-menu-open class and renders the drawer heading with a close button', () => {
    const onCloseMenu = vi.fn()
    const dom = render(makeProps({ menuOpen: true, onCloseMenu }))
    const drawer = dom.querySelector('#mobile-document-menu')!
    expect(drawer.className).toBe('tool-group mobile-menu-open')
    expect(drawer.querySelector('.mobile-drawer-heading strong')!.textContent).toBe('Document menu')
    const headingClose = drawer.querySelector('.mobile-drawer-heading button')! as HTMLButtonElement
    act(() => headingClose.click())
    expect(onCloseMenu).toHaveBeenCalled()
  })

  it('closes on capture-phase clicks of leaf children while open on a mobile shell', () => {
    const onCloseMenu = vi.fn()
    const dom = render(makeProps({ menuOpen: true, isMobileShell: true, onCloseMenu }))
    const leaf = Array.from(dom.querySelectorAll('#mobile-document-menu button')).find(
      (candidate) => candidate.textContent === 'Leaf action',
    )! as HTMLButtonElement
    act(() => leaf.click())
    expect(onCloseMenu).toHaveBeenCalledTimes(1)
  })

  it('keeps the drawer open for clicks when closed or on a non-mobile shell', () => {
    const leaf = <button type="button">Leaf action</button>
    const closedCall = vi.fn()
    const closedDom = render(makeProps({ menuOpen: false, isMobileShell: true, onCloseMenu: closedCall, children: leaf }))
    act(() => (Array.from(closedDom.querySelectorAll('#mobile-document-menu button')).find(
      (candidate) => candidate.textContent === 'Leaf action',
    )! as HTMLButtonElement).click())
    expect(closedCall).not.toHaveBeenCalled()

    const desktopCall = vi.fn()
    act(() => root!.render(<MobileDocumentMenu {...makeProps({ menuOpen: true, isMobileShell: false, onCloseMenu: desktopCall, children: leaf })} />))
    act(() => (Array.from(host!.querySelectorAll('#mobile-document-menu button')).find(
      (candidate) => candidate.textContent === 'Leaf action',
    )! as HTMLButtonElement).click())
    expect(desktopCall).not.toHaveBeenCalled()
  })

  it('does not close when the click target is a menu toggle', () => {
    const onCloseMenu = vi.fn()
    render(makeProps({
      menuOpen: true,
      isMobileShell: true,
      onCloseMenu,
      children: <button type="button" aria-haspopup="menu">Submenu</button>,
    }))
    const toggle = host!.querySelector('button[aria-haspopup="menu"]')! as HTMLButtonElement
    act(() => toggle.click())
    expect(onCloseMenu).not.toHaveBeenCalled()
  })

  it('renders children inside the drawer wrapper', () => {
    const dom = render(makeProps({ children: <p>menu content</p> }))
    expect(dom.querySelector('#mobile-document-menu p')!.textContent).toBe('menu content')
  })
})
