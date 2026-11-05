// @vitest-environment jsdom
import { createRef, type RefObject } from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MobileMenuActions, type MobileMenuActionsProps } from './MobileMenuActions'

const OPTIONS = [
  { id: 'save' as const, label: 'Save', title: 'Save to the same database folder' },
  { id: 'save-to' as const, label: 'Save to…', title: 'Choose a database folder' },
]

function makeProps(overrides: Partial<MobileMenuActionsProps> = {}): MobileMenuActionsProps {
  return {
    onOpen: vi.fn(),
    saveMenuRef: createRef<HTMLDivElement>(),
    saveMenuOpen: false,
    saveToolbarMode: 'save',
    saveToolbarOptions: OPTIONS,
    onRunSaveMode: vi.fn(),
    onToggleSaveMenu: vi.fn(),
    onSelectSaveMode: vi.fn(),
    onOpenDatabase: vi.fn(),
    onOpenNewWindow: vi.fn(),
    newWindowAvailable: true,
    ...overrides,
  }
}

describe('MobileMenuActions', () => {
  let root: Root | null = null
  let host: HTMLElement | null = null

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
    root = null
    host = null
  })

  function render(props: MobileMenuActionsProps) {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root!.render(<MobileMenuActions {...props} />))
    return host
  }

  function buttonByText(dom: HTMLElement, text: string) {
    return Array.from(dom.querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.includes(text),
    ) as HTMLButtonElement | undefined
  }

  it('routes the Open and Database actions', () => {
    const onOpen = vi.fn()
    const onOpenDatabase = vi.fn()
    const dom = render(makeProps({ onOpen, onOpenDatabase }))
    act(() => buttonByText(dom, 'Open')!.click())
    act(() => buttonByText(dom, 'Database')!.click())
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onOpenDatabase).toHaveBeenCalledTimes(1)
  })

  it('shows only the New window action when available', () => {
    const onOpenNewWindow = vi.fn()
    const dom = render(makeProps({ onOpenNewWindow }))
    act(() => buttonByText(dom, 'New window')!.click())
    expect(onOpenNewWindow).toHaveBeenCalledTimes(1)

    act(() => root!.render(<MobileMenuActions {...makeProps({ newWindowAvailable: false })} />))
    expect(buttonByText(host!, 'New window')).toBeUndefined()
  })

  it('runs the active save mode from the main save button', () => {
    const onRunSaveMode = vi.fn()
    const dom = render(makeProps({ onRunSaveMode, saveToolbarMode: 'save-to' }))
    const main = dom.querySelector('.toolbar-save-mode-main')! as HTMLButtonElement
    expect(main.textContent).toContain('Save to…')
    expect(main.getAttribute('title')).toBe('Choose a database folder')
    act(() => main.click())
    expect(onRunSaveMode).toHaveBeenCalledWith('save-to')
  })

  it('toggles the save-mode menu from the chevron and reflects aria-expanded', () => {
    const onToggleSaveMenu = vi.fn()
    const dom = render(makeProps({ onToggleSaveMenu, saveMenuOpen: true }))
    const chevron = dom.querySelector('.toolbar-save-mode-chevron')! as HTMLButtonElement
    expect(chevron.getAttribute('aria-expanded')).toBe('true')
    expect(chevron.getAttribute('aria-haspopup')).toBe('menu')
    expect(dom.querySelector('.toolbar-save-mode-menu')).not.toBeNull()
    act(() => chevron.click())
    expect(onToggleSaveMenu).toHaveBeenCalledTimes(1)
  })

  it('routes save-mode selection and marks the active mode', () => {
    const onSelectSaveMode = vi.fn()
    const dom = render(makeProps({ onSelectSaveMode, saveMenuOpen: true, saveToolbarMode: 'save' }))
    const items = Array.from(dom.querySelectorAll('.toolbar-save-mode-menu button'))
    expect(items).toHaveLength(2)
    expect(items[0]!.classList.contains('is-active')).toBe(true)
    expect(items[1]!.classList.contains('is-active')).toBe(false)
    act(() => (items[1]! as HTMLButtonElement).click())
    expect(onSelectSaveMode).toHaveBeenCalledWith('save-to')
  })

  it('hides the save-mode menu when closed and attaches the outside-pointer ref', () => {
    const saveMenuRef: RefObject<HTMLDivElement | null> = createRef<HTMLDivElement>()
    const dom = render(makeProps({ saveMenuRef }))
    expect(dom.querySelector('.toolbar-save-mode-menu')).toBeNull()
    expect(saveMenuRef.current).toBe(dom.querySelector('.toolbar-save-mode-group'))
  })
})
