// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceTabBar, type WorkspaceTabBarCommands } from './WorkspaceTabBar'
import { buildWorkspaceTabBarModel } from './workspaceTabBarViewModel'

describe('WorkspaceTabBar', () => {
  let root: Root | null = null
  let host: HTMLElement | null = null

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
    root = null
    host = null
  })

  function render(
    overrides: Partial<ReturnType<typeof buildWorkspaceTabBarModel>> = {},
    commands?: Partial<WorkspaceTabBarCommands>,
  ) {
    const model = buildWorkspaceTabBarModel({
      tabs: ['Map', 'Sequence', 'History'],
      activeTab: 'Map',
      mobileSearchOpen: false,
      searchQuery: '',
      molecule: 'dna',
      traceDocument: false,
      descriptionPanelVisible: false,
      searchHitCount: 0,
      searchHitLabel: 'hits',
      searchHitIndex: 0,
    })
    const fullCommands: WorkspaceTabBarCommands = {
      onSelectTab: vi.fn(),
      onToggleMobileSearch: vi.fn(),
      onSearchQueryChange: vi.fn(),
      onPreviousSearchHit: vi.fn(),
      onNextSearchHit: vi.fn(),
      onDescriptionPanelVisibleChange: vi.fn(),
      ...commands,
    }
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root!.render(<WorkspaceTabBar model={{ ...model, ...overrides }} commands={fullCommands} />))
    return { dom: host, commands: fullCommands }
  }

  it('marks the active tab and routes tab selection', () => {
    const onSelectTab = vi.fn()
    const { dom } = render({}, { onSelectTab })
    const sequenceTab = Array.from(dom.querySelectorAll<HTMLButtonElement>('.tab-bar-tabs button')).find((button) => button.textContent?.includes('Sequence'))!
    expect(sequenceTab.classList.contains('active')).toBe(false)
    expect(dom.querySelector('.tab-bar-tabs button.active')!.textContent).toContain('Map')
    act(() => sequenceTab.click())
    expect(onSelectTab).toHaveBeenCalledWith('Sequence')
  })

  it('reflects mobile search open state and toggles search', () => {
    const onToggleMobileSearch = vi.fn()
    const { dom } = render({ mobileSearchOpen: true }, { onToggleMobileSearch })
    const toggle = dom.querySelector<HTMLButtonElement>('.mobile-search-toggle')!
    expect(toggle.classList.contains('is-active')).toBe(true)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(dom.querySelector('#tab-bar-search-panel')!.classList.contains('is-open')).toBe(true)
    act(() => toggle.click())
    expect(onToggleMobileSearch).toHaveBeenCalledTimes(1)
  })

  it('wires search controls, hit navigation, and description visibility toggle', () => {
    const onSearchQueryChange = vi.fn()
    const onPreviousSearchHit = vi.fn()
    const onNextSearchHit = vi.fn()
    const onDescriptionPanelVisibleChange = vi.fn()
    const { dom } = render({
      searchQuery: 'ggt',
      searchPlaceholder: 'Find sequence or enzyme',
      searchHitCountLabel: '3 hits',
      searchHitPositionLabel: ' · 2/3',
      searchNavDisabled: false,
      descriptionPanelVisible: true,
    }, {
      onSearchQueryChange,
      onPreviousSearchHit,
      onNextSearchHit,
      onDescriptionPanelVisibleChange,
    })
    const input = dom.querySelector('#tab-bar-search-panel input') as HTMLInputElement
    expect(input.value).toBe('ggt')
    expect(input.placeholder).toBe('Find sequence or enzyme')
    expect(dom.textContent).toContain('3 hits · 2/3')
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      setter.call(input, 'ggta')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(onSearchQueryChange).toHaveBeenCalledWith('ggta')
    const navButtons = dom.querySelectorAll<HTMLButtonElement>('.document-header-search-nav')
    act(() => navButtons[0]!.click())
    act(() => navButtons[1]!.click())
    expect(onPreviousSearchHit).toHaveBeenCalledTimes(1)
    expect(onNextSearchHit).toHaveBeenCalledTimes(1)
    const checkbox = dom.querySelector('.description-panel-toggle input') as HTMLInputElement
    expect(checkbox.checked).toBe(true)
    act(() => checkbox.click())
    expect(onDescriptionPanelVisibleChange).toHaveBeenCalledWith(false)
  })

  it('disables prev/next search navigation when there are no hits', () => {
    const { dom } = render({ searchNavDisabled: true })
    for (const button of dom.querySelectorAll('.document-header-search-nav')) {
      expect((button as HTMLButtonElement).disabled).toBe(true)
    }
  })

  it('does not render construct search controls for trace-only documents', () => {
    const { dom } = render({ showSearch: false })
    expect(dom.querySelector('.mobile-search-toggle')).toBeNull()
    expect(dom.querySelector('#tab-bar-search-panel')).toBeNull()
  })
})
