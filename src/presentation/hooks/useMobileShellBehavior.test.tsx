// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MOBILE_SHELL_MEDIA } from '../../ui/mobileShellMedia'
import {
  useMobileShellBehavior,
  type MobileShellBehavior,
} from './useMobileShellBehavior'

class FakeMediaQueryList implements MediaQueryList {
  readonly media: string
  matches: boolean
  onchange: ((this: MediaQueryList, ev: MediaQueryListEvent) => unknown) | null = null
  private readonly changeListeners = new Set<EventListenerOrEventListenerObject>()

  constructor(media: string, matches: boolean) {
    this.media = media
    this.matches = matches
  }

  get listenerCount() {
    return this.changeListeners.size
  }

  setMatches(matches: boolean) {
    this.matches = matches
    const event = { matches, media: this.media } as MediaQueryListEvent
    for (const listener of [...this.changeListeners]) {
      if (typeof listener === 'function') listener.call(this, event)
      else listener.handleEvent(event)
    }
  }

  addEventListener(_type: string, listener: EventListenerOrEventListenerObject | null) {
    if (listener) this.changeListeners.add(listener)
  }

  removeEventListener(_type: string, listener: EventListenerOrEventListenerObject | null) {
    if (listener) this.changeListeners.delete(listener)
  }

  addListener() {}

  removeListener() {}

  dispatchEvent() {
    return true
  }
}

type SetupOptions = {
  mobile?: boolean
  descriptionVisible?: boolean
}

function setup({ mobile = true, descriptionVisible = false }: SetupOptions = {}) {
  const media = new FakeMediaQueryList(MOBILE_SHELL_MEDIA, mobile)
  const matchMedia = vi.fn((query: string) => {
    expect(query).toBe(MOBILE_SHELL_MEDIA)
    return media
  })
  const descriptionCalls: boolean[] = []
  const latest: { behavior: MobileShellBehavior | null } = { behavior: null }

  function Harness() {
    const [visible, setVisible] = useState(descriptionVisible)
    const behavior = useMobileShellBehavior({
      descriptionPanel: {
        visible,
        setVisible: (next) => {
          descriptionCalls.push(typeof next === 'function' ? next(visible) : next)
          setVisible(next)
        },
      },
      host: { matchMedia },
    })
    latest.behavior = behavior
    return (
      <>
        <button ref={behavior.mobileMenuButtonRef} data-testid="menu-button" />
        <button ref={behavior.mobileSidebarButtonRef} data-testid="sidebar-button" />
        <button ref={behavior.mobileDescriptionButtonRef} data-testid="description-button" />
      </>
    )
  }

  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  act(() => root.render(<Harness />))
  return { media, matchMedia, descriptionCalls, latest, host, root }
}

function pressEscape() {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
  })
}

function buildToolbarSubmenu(host: HTMLElement, label: string) {
  const toolbar = document.createElement('div')
  toolbar.className = 'toolbar'
  const group = document.createElement('div')
  group.className = 'tool-group'
  const submenu = document.createElement('div')
  submenu.className = 'toolbar-edit-submenu'
  const trigger = document.createElement('button')
  trigger.type = 'button'
  trigger.className = 'toolbar-edit-submenu-trigger'
  trigger.setAttribute('aria-expanded', 'false')
  trigger.textContent = label
  submenu.append(trigger)
  group.append(submenu)
  toolbar.append(group)
  host.append(toolbar)
  return { toolbar, submenu, trigger }
}

function pointerDown(target: Element) {
  let dispatched: Event | null = null
  target.addEventListener('pointerdown', (event) => {
    dispatched = event
  })
  const event = new Event('pointerdown', { bubbles: true, cancelable: true })
  act(() => {
    target.dispatchEvent(event)
  })
  return { event, dispatched }
}

describe('useMobileShellBehavior', () => {
  let root: Root | null = null
  let host: HTMLElement | null = null

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
    root = null
    host = null
  })

  it('syncs isMobileShell from the media query and removes the change listener on unmount', () => {
    const setupResult = setup({ mobile: true })
    root = setupResult.root
    host = setupResult.host
    expect(setupResult.latest.behavior?.isMobileShell).toBe(true)
    expect(setupResult.media.listenerCount).toBe(1)

    act(() => setupResult.media.setMatches(false))
    expect(setupResult.latest.behavior?.isMobileShell).toBe(false)

    act(() => setupResult.root.unmount())
    root = null
    expect(setupResult.media.listenerCount).toBe(0)
  })

  it('does not react to Escape when nothing is open', () => {
    const setupResult = setup({ mobile: true })
    root = setupResult.root
    host = setupResult.host
    pressEscape()
    expect(setupResult.latest.behavior?.mobileMenuOpen).toBe(false)
    expect(setupResult.latest.behavior?.mobileSidebarOpen).toBe(false)
    expect(setupResult.latest.behavior?.mobileSearchOpen).toBe(false)
    expect(setupResult.descriptionCalls).toEqual([])
  })

  it('closes search first and leaves the other panels open', () => {
    const setupResult = setup({ mobile: true })
    root = setupResult.root
    host = setupResult.host
    act(() => {
      setupResult.latest.behavior?.setMobileSearchOpen(true)
      setupResult.latest.behavior?.setMobileSidebarOpen(true)
      setupResult.latest.behavior?.setMobileMenuOpen(true)
    })
    pressEscape()
    expect(setupResult.latest.behavior?.mobileSearchOpen).toBe(false)
    expect(setupResult.latest.behavior?.mobileSidebarOpen).toBe(true)
    expect(setupResult.latest.behavior?.mobileMenuOpen).toBe(true)
  })

  it('closes the description panel on Escape and restores focus to its trigger', () => {
    const setupResult = setup({ mobile: true, descriptionVisible: true })
    root = setupResult.root
    host = setupResult.host
    pressEscape()
    expect(setupResult.descriptionCalls).toEqual([false])
    expect(document.activeElement).toBe(host.querySelector('[data-testid="description-button"]'))
    expect(setupResult.latest.behavior?.mobileMenuOpen).toBe(false)
  })

  it('skips the description panel when not on a mobile shell', () => {
    const setupResult = setup({ mobile: false, descriptionVisible: true })
    root = setupResult.root
    host = setupResult.host
    act(() => setupResult.latest.behavior?.setMobileSidebarOpen(true))
    pressEscape()
    expect(setupResult.descriptionCalls).toEqual([])
    expect(setupResult.latest.behavior?.mobileSidebarOpen).toBe(false)
    expect(document.activeElement).toBe(host.querySelector('[data-testid="sidebar-button"]'))
  })

  it('walks the full Escape chain search → description → sidebar → menu with focus restoration', () => {
    const setupResult = setup({ mobile: true, descriptionVisible: true })
    root = setupResult.root
    host = setupResult.host
    act(() => {
      setupResult.latest.behavior?.setMobileSearchOpen(true)
      setupResult.latest.behavior?.setMobileSidebarOpen(true)
      setupResult.latest.behavior?.setMobileMenuOpen(true)
    })

    pressEscape()
    expect(setupResult.latest.behavior?.mobileSearchOpen).toBe(false)

    pressEscape()
    expect(setupResult.descriptionCalls).toEqual([false])
    expect(document.activeElement).toBe(host.querySelector('[data-testid="description-button"]'))

    pressEscape()
    expect(setupResult.latest.behavior?.mobileSidebarOpen).toBe(false)
    expect(document.activeElement).toBe(host.querySelector('[data-testid="sidebar-button"]'))

    pressEscape()
    expect(setupResult.latest.behavior?.mobileMenuOpen).toBe(false)
    expect(document.activeElement).toBe(host.querySelector('[data-testid="menu-button"]'))
  })

  it('toggles toolbar submenus from a capture-phase pointerdown on mobile', () => {
    const setupResult = setup({ mobile: true })
    root = setupResult.root
    host = setupResult.host
    const { toolbar, submenu, trigger } = buildToolbarSubmenu(host!, 'Edit')
    let bubbleSeen = false
    toolbar.addEventListener('pointerdown', () => {
      bubbleSeen = true
    })

    const first = pointerDown(trigger)
    expect(submenu.classList.contains('is-submenu-open')).toBe(true)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(first.event.defaultPrevented).toBe(true)
    expect(bubbleSeen).toBe(false)

    pointerDown(trigger)
    expect(submenu.classList.contains('is-submenu-open')).toBe(false)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('opens only one toolbar submenu at a time', () => {
    const setupResult = setup({ mobile: true })
    root = setupResult.root
    host = setupResult.host
    const first = buildToolbarSubmenu(host!, 'Edit')
    const second = buildToolbarSubmenu(host!, 'View')

    pointerDown(first.trigger)
    pointerDown(second.trigger)
    expect(first.submenu.classList.contains('is-submenu-open')).toBe(false)
    expect(second.submenu.classList.contains('is-submenu-open')).toBe(true)
  })

  it('does not intercept toolbar pointerdown when not on a mobile shell', () => {
    const setupResult = setup({ mobile: false })
    root = setupResult.root
    host = setupResult.host
    const { submenu, trigger } = buildToolbarSubmenu(host!, 'Edit')
    const { event } = pointerDown(trigger)
    expect(submenu.classList.contains('is-submenu-open')).toBe(false)
    expect(event.defaultPrevented).toBe(false)
  })

  it('cleans up open submenus when the mobile menu closes', () => {
    const setupResult = setup({ mobile: true })
    root = setupResult.root
    host = setupResult.host
    const { submenu, trigger } = buildToolbarSubmenu(host!, 'Edit')
    pointerDown(trigger)
    expect(submenu.classList.contains('is-submenu-open')).toBe(true)

    act(() => setupResult.latest.behavior?.setMobileMenuOpen(true))
    expect(submenu.classList.contains('is-submenu-open')).toBe(true)
    act(() => setupResult.latest.behavior?.setMobileMenuOpen(false))
    expect(submenu.classList.contains('is-submenu-open')).toBe(false)
  })
})
