// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { shouldCloseMobileDocumentDrawer } from '../src/ui/mobileDocumentDrawer'

function drawerWith(innerHtml: string): HTMLElement {
  document.body.innerHTML = `<div id="mobile-document-menu" class="tool-group">${innerHtml}</div>`
  return document.getElementById('mobile-document-menu')!
}

describe('shouldCloseMobileDocumentDrawer', () => {
  it('closes on top-level Database and Open actions', () => {
    const drawer = drawerWith(`
      <button type="button" id="open"><span>Open</span></button>
      <button type="button" id="database"><span>Database</span></button>
    `)
    expect(shouldCloseMobileDocumentDrawer(drawer.querySelector('#open'))).toBe(true)
    expect(shouldCloseMobileDocumentDrawer(drawer.querySelector('#database'))).toBe(true)
  })

  it('closes on save main but not the save mode chevron', () => {
    const drawer = drawerWith(`
      <div class="toolbar-save-mode-group">
        <button type="button" class="toolbar-save-mode-main" id="save-main">Save</button>
        <button type="button" class="toolbar-save-mode-chevron" aria-haspopup="menu" id="save-chevron">▾</button>
      </div>
    `)
    expect(shouldCloseMobileDocumentDrawer(drawer.querySelector('#save-main'))).toBe(true)
    expect(shouldCloseMobileDocumentDrawer(drawer.querySelector('#save-chevron'))).toBe(false)
  })

  it('closes on leaf menuitem actions but not nested menu triggers', () => {
    const drawer = drawerWith(`
      <button type="button" class="toolbar-edit-trigger" aria-haspopup="menu" id="file">File</button>
      <button type="button" role="menuitem" class="toolbar-edit-item" id="leaf">New DNA file…</button>
      <button type="button" role="menuitem" aria-haspopup="menu" class="toolbar-edit-item toolbar-edit-submenu-trigger" id="submenu">Open Recent</button>
    `)
    expect(shouldCloseMobileDocumentDrawer(drawer.querySelector('#file'))).toBe(false)
    expect(shouldCloseMobileDocumentDrawer(drawer.querySelector('#leaf'))).toBe(true)
    expect(shouldCloseMobileDocumentDrawer(drawer.querySelector('#submenu'))).toBe(false)
  })

  it('closes on the drawer heading dismiss control', () => {
    const drawer = drawerWith(`
      <div class="mobile-drawer-heading">
        <button type="button" id="close">Close</button>
      </div>
    `)
    expect(shouldCloseMobileDocumentDrawer(drawer.querySelector('#close'))).toBe(true)
  })

  it('ignores clicks outside the drawer', () => {
    document.body.innerHTML = `<button type="button" id="outside">Outside</button>`
    expect(shouldCloseMobileDocumentDrawer(document.querySelector('#outside'))).toBe(false)
  })
})
