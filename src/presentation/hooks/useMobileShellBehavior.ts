import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react'
import { MOBILE_SHELL_MEDIA } from '../../ui/mobileShellMedia'

export type MobileShellBehavior = {
  isMobileShell: boolean
  mobileMenuOpen: boolean
  setMobileMenuOpen: Dispatch<SetStateAction<boolean>>
  mobileSidebarOpen: boolean
  setMobileSidebarOpen: Dispatch<SetStateAction<boolean>>
  mobileSearchOpen: boolean
  setMobileSearchOpen: Dispatch<SetStateAction<boolean>>
  mobileMenuButtonRef: RefObject<HTMLButtonElement | null>
  mobileSidebarButtonRef: RefObject<HTMLButtonElement | null>
  mobileDescriptionButtonRef: RefObject<HTMLButtonElement | null>
}

export type MobileShellBehaviorDescriptionPanel = {
  visible: boolean
  setVisible: Dispatch<SetStateAction<boolean>>
}

export type MobileShellBehaviorHost = {
  /** Test seam: override media-query resolution (jsdom has no matchMedia). */
  matchMedia?: (query: string) => MediaQueryList
}

export type MobileShellBehaviorOptions = {
  descriptionPanel: MobileShellBehaviorDescriptionPanel
  host?: MobileShellBehaviorHost
}

function defaultMatchMedia(query: string): MediaQueryList {
  return window.matchMedia(query)
}

/**
 * Owns the mobile-shell interaction cluster: drawer open state, media-query
 * synchronization, toolbar submenu pointer interception/cleanup, and the
 * Escape-key close chain (search, description panel, sidebar, menu) with
 * focus restoration to the matching app-bar trigger.
 */
export function useMobileShellBehavior({
  descriptionPanel,
  host,
}: MobileShellBehaviorOptions): MobileShellBehavior {
  const matchMediaQuery = host?.matchMedia ?? defaultMatchMedia
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const [isMobileShell, setIsMobileShell] = useState(() => matchMediaQuery(MOBILE_SHELL_MEDIA).matches)
  const mobileMenuButtonRef = useRef<HTMLButtonElement | null>(null)
  const mobileSidebarButtonRef = useRef<HTMLButtonElement | null>(null)
  const mobileDescriptionButtonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    const media = matchMediaQuery(MOBILE_SHELL_MEDIA)
    const sync = () => setIsMobileShell(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [matchMediaQuery])

  useEffect(() => {
    if (!isMobileShell) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null
      if (!target) return
      const trigger = target.closest('.toolbar-edit-submenu-trigger')
      if (!trigger || !(trigger instanceof HTMLButtonElement)) return
      const submenu = trigger.closest('.toolbar-edit-submenu')
      if (!submenu || !submenu.closest('.toolbar > .tool-group')) return
      event.preventDefault()
      event.stopPropagation()
      const open = submenu.classList.contains('is-submenu-open')
      document.querySelectorAll('.toolbar-edit-submenu.is-submenu-open').forEach((node) => {
        if (node !== submenu) node.classList.remove('is-submenu-open')
      })
      submenu.classList.toggle('is-submenu-open', !open)
      trigger.setAttribute('aria-expanded', open ? 'false' : 'true')
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [isMobileShell])

  useEffect(() => {
    if (mobileMenuOpen) return
    document.querySelectorAll('.toolbar-edit-submenu.is-submenu-open').forEach((node) => {
      node.classList.remove('is-submenu-open')
    })
  }, [mobileMenuOpen])

  const descriptionPanelVisible = descriptionPanel.visible
  const setDescriptionPanelVisible = descriptionPanel.setVisible
  useEffect(() => {
    const closeMobilePanels = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (mobileSearchOpen) {
        setMobileSearchOpen(false)
        return
      }
      if (descriptionPanelVisible && isMobileShell) {
        setDescriptionPanelVisible(false)
        mobileDescriptionButtonRef.current?.focus()
        return
      }
      if (mobileSidebarOpen) {
        setMobileSidebarOpen(false)
        mobileSidebarButtonRef.current?.focus()
        return
      }
      if (mobileMenuOpen) {
        setMobileMenuOpen(false)
        mobileMenuButtonRef.current?.focus()
      }
    }
    window.addEventListener('keydown', closeMobilePanels)
    return () => window.removeEventListener('keydown', closeMobilePanels)
  }, [
    descriptionPanelVisible,
    isMobileShell,
    mobileMenuOpen,
    mobileSearchOpen,
    mobileSidebarOpen,
    setDescriptionPanelVisible,
  ])

  return {
    isMobileShell,
    mobileMenuOpen,
    setMobileMenuOpen,
    mobileSidebarOpen,
    setMobileSidebarOpen,
    mobileSearchOpen,
    setMobileSearchOpen,
    mobileMenuButtonRef,
    mobileSidebarButtonRef,
    mobileDescriptionButtonRef,
  }
}
