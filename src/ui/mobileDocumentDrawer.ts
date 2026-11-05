/** Phone document drawer (#mobile-document-menu): dismiss on leaf actions, not menu toggles. */
export function shouldCloseMobileDocumentDrawer(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  const drawer = target.closest('#mobile-document-menu')
  if (!drawer) return false

  const button = target.closest('button')
  if (!button || !drawer.contains(button)) return false

  if (button.getAttribute('aria-haspopup') === 'menu') return false
  if (button.classList.contains('toolbar-edit-trigger')) return false
  if (button.classList.contains('toolbar-edit-submenu-trigger')) return false
  if (button.classList.contains('toolbar-save-mode-chevron')) return false

  if (button.closest('.mobile-drawer-heading')) return true
  if (button.classList.contains('toolbar-save-mode-main')) return true

  const role = button.getAttribute('role')
  if (role === 'menuitem' || button.classList.contains('toolbar-edit-item')) return true

  if (button.parentElement === drawer) return true

  return false
}
