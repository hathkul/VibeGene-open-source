import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test'

const schemes = ['beige', 'bright', 'dark'] as const

async function resolvedValue(locator: Locator, property: string): Promise<string> {
  return locator.evaluate((node, propertyName) => getComputedStyle(node).getPropertyValue(propertyName).trim(), property)
}

async function resolvedToken(locator: Locator, property: string, token: string): Promise<string> {
  return locator.evaluate((node, { propertyName, tokenName }) => {
    const tokenValue = getComputedStyle(node).getPropertyValue(tokenName).trim()
    const probe = document.createElement('span')
    probe.style.setProperty(tokenName, tokenValue)
    probe.style.setProperty(propertyName, `var(${tokenName})`)
    document.body.append(probe)
    const value = getComputedStyle(probe).getPropertyValue(propertyName).trim()
    probe.remove()
    return value
  }, { propertyName: property, tokenName: token })
}

async function expectToken(_page: Page, locator: Locator, property: string, token: string): Promise<void> {
  expect(await resolvedValue(locator, property)).toBe(await resolvedToken(locator, property, token))
}

function parseRgbTriplet(color: string): [number, number, number] | null {
  const match = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function relativeLuminance([red, green, blue]: [number, number, number]): number {
  const channel = (value: number) => {
    const normalized = value / 255
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue)
}

function contrastRatio(foreground: [number, number, number], background: [number, number, number]): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background))
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background))
  return (lighter + 0.05) / (darker + 0.05)
}

async function expectMinContrastAgainstBackground(foregroundLocator: Locator, foregroundProperty: string, backgroundLocator: Locator, backgroundProperty: string, minimum: number): Promise<void> {
  const foreground = parseRgbTriplet(await resolvedValue(foregroundLocator, foregroundProperty))
  const background = parseRgbTriplet(await resolvedValue(backgroundLocator, backgroundProperty))
  expect(foreground, 'foreground must resolve to rgb()').not.toBeNull()
  expect(background, 'background must resolve to rgb()').not.toBeNull()
  expect(contrastRatio(foreground!, background!)).toBeGreaterThanOrEqual(minimum)
}

async function attach(locator: Locator, testInfo: TestInfo, name: string): Promise<void> {
  await testInfo.attach(name, {
    body: await locator.screenshot({ animations: 'disabled', timeout: 5_000 }),
    contentType: 'image/png',
  })
}

async function expectTokenInImage(_page: Page, locator: Locator, token: string): Promise<void> {
  const tokenValue = await resolvedToken(locator, 'background-color', token)
  expect(await resolvedValue(locator, 'background-image')).toContain(tokenValue)
}

async function expectControlSurfaceGradient(_page: Page, locator: Locator): Promise<void> {
  expect(await resolvedValue(locator, 'background-image')).toBe(await resolvedToken(locator, 'background-image', '--vg-control-surface'))
}

async function expectBoxShadowToken(_page: Page, locator: Locator, token: string): Promise<void> {
  expect(await resolvedValue(locator, 'box-shadow')).toBe(await resolvedToken(locator, 'box-shadow', token))
}

test.beforeEach(async ({ page }) => {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.hostname === '127.0.0.1') await route.continue()
    else await route.abort()
  })
  await page.addInitScript(() => document.documentElement.classList.remove('vg-tauri'))
  await page.goto('/theme-audit.html')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }' })
})

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus || page.isClosed()) return
  for (const [name, selector] of [
    ['toolbar', '.theme-audit-toolbar-shell'],
    ['startup', '.theme-audit-startup-host'],
    ['trace', '.theme-audit-trace-host'],
  ] as const) {
    const locator = page.locator(selector)
    if (await locator.isVisible().catch(() => false)) {
      await attach(locator, testInfo, `${testInfo.project.name}-${name}.png`).catch(() => undefined)
    }
  }
})

test.describe('browser theme cascade', () => {
  for (const scheme of schemes) {
    test(`${scheme} semantic surfaces and interactions`, async ({ page }, testInfo) => {
      await page.evaluate((value) => { document.documentElement.dataset.colorScheme = value }, scheme)
      await page.locator('html').evaluate((node) => node.classList.add('vg-hybrid-window'))
      const modalBackdrop = page.locator('.startup-window > .translation-dialog-backdrop')
      await modalBackdrop.evaluate((node) => { (node as HTMLElement).style.display = 'none' })
      const overlayScrim = page.getByTestId('theme-audit-overlay-scrim')
      await overlayScrim.evaluate((node) => { (node as HTMLElement).style.display = 'none' })
      const dropTarget = page.getByTestId('startup-drop-target')
      await dropTarget.evaluate((node) => { (node as HTMLElement).style.display = 'none' })

      const toolbarShell = page.locator('.theme-audit-toolbar-shell')
      await toolbarShell.evaluate((node) => { (node as HTMLElement).style.display = 'none' })

      const primaryInverse = page.getByTestId('theme-audit-primary-inverse')
      await expectToken(page, primaryInverse, 'background-color', '--vg-control-primary')
      await expectToken(page, primaryInverse, 'color', '--vg-text-inverse')
      await expectMinContrastAgainstBackground(primaryInverse, 'color', primaryInverse, 'background-color', 4.5)
      const primaryDisabled = page.getByTestId('theme-audit-primary-disabled')
      await expect(primaryDisabled).toBeDisabled()
      await expectToken(page, primaryDisabled, 'color', '--vg-text-disabled')
      expect(await resolvedValue(primaryDisabled, 'background-color')).not.toBe(await resolvedValue(primaryInverse, 'background-color'))
      if (testInfo.project.name === 'desktop') {
        await primaryInverse.hover()
        await expectToken(page, primaryInverse, 'background-color', '--vg-control-primary-hover')
        const primaryHoverFill = await resolvedToken(primaryDisabled, 'background-color', '--vg-control-primary-hover')
        const disabledBackgroundBeforeHover = await resolvedValue(primaryDisabled, 'background-color')
        await primaryDisabled.hover({ force: true, timeout: 3_000 }).catch(() => undefined)
        expect(await resolvedValue(primaryDisabled, 'background-color')).not.toBe(primaryHoverFill)
        expect(await resolvedValue(primaryDisabled, 'background-color')).toBe(disabledBackgroundBeforeHover)
      }

      const uniprotPrimary = page.getByTestId('theme-audit-uniprot-primary')
      await expectToken(page, uniprotPrimary, 'background-color', '--vg-control-primary')
      await expectToken(page, uniprotPrimary, 'color', '--vg-text-inverse')
      let primaryHoverBackground: string | undefined
      if (testInfo.project.name === 'desktop') {
        await uniprotPrimary.hover()
        await expectToken(page, uniprotPrimary, 'background-color', '--vg-control-primary-hover')
        primaryHoverBackground = await resolvedValue(uniprotPrimary, 'background-color')
      }

      const uniprotDestructive = page.getByTestId('theme-audit-uniprot-destructive')
      await expectToken(page, uniprotDestructive, 'background-color', '--vg-control-destructive')
      await expectToken(page, uniprotDestructive, 'color', '--vg-text-inverse')
      if (testInfo.project.name === 'desktop') {
        await uniprotDestructive.hover()
        await expectToken(page, uniprotDestructive, 'background-color', '--vg-control-destructive-hover')
        expect(await resolvedValue(uniprotDestructive, 'background-color')).not.toBe(primaryHoverBackground)
      }

      const translationPrimary = page.getByTestId('theme-audit-translation-primary')
      await expectToken(page, translationPrimary, 'background-color', '--vg-control-primary')
      await expectToken(page, translationPrimary, 'color', '--vg-text-inverse')
      if (testInfo.project.name === 'desktop') {
        await translationPrimary.hover()
        await expectToken(page, translationPrimary, 'background-color', '--vg-control-primary-hover')
      }

      const affirmative = page.getByTestId('theme-audit-affirmative')
      const affirmativeRestBackground = await resolvedValue(affirmative, 'background-color')
      await expectToken(page, affirmative, 'background-color', '--vg-control-affirmative')
      if (testInfo.project.name === 'desktop') {
        await affirmative.hover()
        await expectToken(page, affirmative, 'background-color', '--vg-control-affirmative-hover')
        expect(await resolvedValue(affirmative, 'background-color')).not.toBe(affirmativeRestBackground)
      }

      const segmentActive = page.locator('.enzyme-position-mode-toggle button.is-active')
      const segmentRestBackground = await resolvedValue(segmentActive, 'background-color')
      await expectToken(page, segmentActive, 'background-color', '--vg-control-segment-active')
      if (testInfo.project.name === 'desktop') {
        await segmentActive.hover()
        await expectToken(page, segmentActive, 'background-color', '--vg-control-segment-active-hover')
        expect(await resolvedValue(segmentActive, 'background-color')).not.toBe(segmentRestBackground)
      }

      const input = page.getByTestId('text-input')
      await expectToken(page, input, 'background-color', '--app-field')
      await expectToken(page, input, 'color', '--text')
      await expectToken(page, input, 'border-top-color', '--app-button-border')
      await input.focus()
      await expectToken(page, input, 'outline-color', '--app-focus')

      const sequenceRow = page.getByTestId('theme-audit-sequence-row')
      await expect(sequenceRow).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
      await expectToken(page, sequenceRow, 'color', '--text')
      if (testInfo.project.name === 'desktop') {
        await sequenceRow.hover()
        await expectToken(page, sequenceRow, 'background-color', '--app-table-hover')
        await expectToken(page, sequenceRow, 'color', '--text')
      }

      const supplierList = page.locator('.enzyme-preferences-supplier-list')
      await expectToken(page, supplierList, 'background-color', '--app-field')

      const dbFileList = page.getByTestId('theme-audit-db-file-list')
      await expectToken(page, dbFileList, 'background-color', '--app-field')

      const normalTab = page.getByTestId('theme-audit-normal-tab')
      await expectToken(page, normalTab, 'background-color', '--app-button-bottom')
      await expectToken(page, normalTab, 'border-top-color', '--app-button-border')
      const activeTab = page.getByTestId('theme-audit-active-tab')
      await expectToken(page, activeTab, 'background-color', '--app-panel')
      await expectToken(page, activeTab, 'color', '--app-selection-text')
      await expectToken(page, page.getByTestId('theme-audit-preferences-active'), 'color', '--text-h')

      const selectedSequenceRow = page.locator('.sequence-database-result-list > button.is-selected')
      await expectToken(page, selectedSequenceRow, 'background-color', '--app-selection')
      const newDnaError = page.getByTestId('theme-audit-new-dna-error')
      await expectToken(page, newDnaError, 'color', '--text')
      await expect(newDnaError).toHaveCSS('background-color', /rgb/)
      await expect(newDnaError).toHaveCSS('border-top-color', /rgb/)

      const featureMenuItem = page.getByTestId('theme-audit-feature-menu-item')
      if (testInfo.project.name === 'desktop') {
        await featureMenuItem.hover()
        // The later :hover:not(:disabled) arm wins over the earlier hover arm.
        await expectToken(page, featureMenuItem, 'background-color', '--vg-interactive-hover')
      }

      const changedHistory = page.getByTestId('theme-audit-history-changed')
      await expectToken(page, changedHistory, 'border-top-color', '--app-focus')
      await expectToken(page, changedHistory, 'background-color', '--app-table-hover')
      const historySuccess = page.getByTestId('theme-audit-history-success')
      await expectToken(page, historySuccess, 'color', '--text')
      await expect(historySuccess).toHaveCSS('background-color', /rgb/)

      await expectToken(page, page.getByTestId('theme-audit-cloning-active'), 'background-color', '--app-selection')
      await expectToken(page, page.getByTestId('theme-audit-pcr-recipe-note'), 'color', '--muted')
      await expectToken(page, page.getByTestId('theme-audit-pcr-primer-tab'), 'color', '--text')
      await expectToken(page, page.getByTestId('theme-audit-pcr-primer-tab-active'), 'color', '--text-h')
      await expectToken(page, page.getByTestId('theme-audit-agarose-gel-controls'), 'background-color', '--app-panel-muted')
      await expectToken(page, page.getByTestId('theme-audit-agarose-footer-divider'), 'background-color', '--app-divider')
      const diagramInk = page.getByTestId('theme-audit-diagram-ink')
      await expectToken(page, diagramInk, 'color', '--vg-diagram-ink')
      await expectMinContrastAgainstBackground(diagramInk, 'color', page.getByTestId('theme-audit-locked-panel'), 'background-color', 4.5)
      const mapInkLabel = page.getByTestId('theme-audit-map-ink-label')
      await expectToken(page, mapInkLabel, 'fill', '--vg-map-ink')
      await expectMinContrastAgainstBackground(mapInkLabel, 'fill', page.getByTestId('theme-audit-locked-panel'), 'background-color', 4.5)
      const dataMark = page.getByTestId('theme-audit-data-mark')
      await expectToken(page, dataMark, 'stroke', '--vg-scientific-ruler-ink')
      await expectControlSurfaceGradient(page, page.getByTestId('theme-audit-generic-control-surface'))
      const frameshiftCell = page.getByTestId('theme-audit-frameshift-cell')
      const panelFill = await resolvedToken(page.getByTestId('theme-audit-locked-panel'), 'background-color', '--vg-surface-panel')
      expect(await resolvedValue(frameshiftCell, 'background-color')).not.toBe(panelFill)
      await expectMinContrastAgainstBackground(frameshiftCell, 'color', frameshiftCell, 'background-color', 4.5)
      expect(await resolvedValue(page.getByTestId('theme-audit-frameshift-legend'), 'background-color')).toBe(await resolvedValue(frameshiftCell, 'background-color'))
      await overlayScrim.evaluate((node) => { (node as HTMLElement).style.removeProperty('display') })
      await expectToken(page, overlayScrim, 'background-color', '--vg-overlay-scrim')
      await overlayScrim.evaluate((node) => { (node as HTMLElement).style.display = 'none' })
      if (scheme === 'dark') {
        const primerBase = page.getByTestId('theme-audit-primer-base')
        expect(await resolvedValue(primerBase, 'fill')).toBe('rgb(242, 233, 255)')
        expect(await resolvedValue(primerBase, 'fill')).not.toBe(await resolvedToken(page.getByTestId('theme-audit-locked-body-text'), 'color', '--vg-text'))
      }
      await expectToken(page, page.getByTestId('theme-audit-import-options'), 'background-color', '--vg-surface-panel')
      await expectToken(page, page.getByTestId('theme-audit-reads-hint'), 'color', '--vg-text-muted')
      await expectToken(page, page.getByTestId('theme-audit-ncbi-scope'), 'border-top-color', '--vg-border')
      await expectControlSurfaceGradient(page, page.getByTestId('theme-audit-features-toolbar-button'))
      await expectToken(page, page.getByTestId('theme-audit-compact-input'), 'background-color', '--vg-surface-inset')
      await expectToken(page, page.getByTestId('theme-audit-compact-input'), 'border-top-color', '--vg-control-border')
      const lockedPanel = page.getByTestId('theme-audit-locked-panel')
      const lockedBody = lockedPanel.getByTestId('theme-audit-locked-body-text')
      await expectToken(page, lockedBody, 'color', '--vg-text')
      await expectToken(page, lockedPanel, 'background-color', '--vg-surface-panel')
      await expectMinContrastAgainstBackground(lockedBody, 'color', lockedPanel, 'background-color', 4.5)
      await expectToken(page, lockedPanel.getByTestId('theme-audit-locked-strong').locator('h4'), 'color', '--vg-text-strong')
      await expectToken(page, lockedPanel.getByTestId('theme-audit-locked-muted'), 'color', '--vg-text-muted')
      await expectMinContrastAgainstBackground(page.getByTestId('theme-audit-locked-muted'), 'color', lockedPanel, 'background-color', 4.5)
      await expectToken(page, page.getByTestId('theme-audit-locked-inset'), 'background-color', '--vg-surface-inset')
      await expectToken(page, page.getByTestId('theme-audit-locked-inset'), 'border-top-color', '--vg-control-border')
      await expect(page.getByTestId('theme-audit-restriction-ready')).toHaveCSS('background-color', /rgb/)
      await expect(page.getByTestId('theme-audit-restriction-ready')).toHaveCSS('border-top-color', /rgb/)
      await expect(page.getByTestId('theme-audit-restriction-invalid')).toHaveCSS('background-color', /rgb/)
      await expect(page.getByTestId('theme-audit-restriction-invalid')).toHaveCSS('border-top-color', /rgb/)
      const dbDrop = page.getByTestId('theme-audit-db-drop')
      await expectToken(page, dbDrop, 'color', '--app-selection-text')
      await expect(dbDrop).toHaveCSS('background-color', /rgb/)

      const commonRow = page.getByTestId('theme-audit-common-row')
      const commonSelected = page.getByTestId('theme-audit-common-selected')
      await expectToken(page, page.locator('.common-features-browse-sidebar'), 'background-color', '--app-field')
      await expectToken(page, commonRow, 'color', '--text')
      await expectToken(page, commonSelected, 'background-color', '--app-selection')
      await expectToken(page, commonSelected, 'color', '--app-selection-text')
      const enzymeSelected = page.getByTestId('theme-audit-enzyme-selected')
      await expectToken(page, enzymeSelected, 'background-color', '--app-selection')
      await expectToken(page, enzymeSelected, 'color', '--app-selection-text')

      const table = page.getByTestId('theme-audit-data-table')
      await expectToken(page, table.locator('th').first(), 'background-color', '--app-table-head')
      await expectToken(page, table.locator('td').first(), 'border-bottom-color', '--app-table-border')
      await expectToken(page, page.getByTestId('theme-audit-table-selected'), 'background-color', '--app-table-hover')
      const dbPagination = page.getByTestId('theme-audit-db-pagination')
      await expectToken(page, dbPagination, 'background-color', '--app-panel-muted')
      await expectToken(page, dbPagination, 'color', '--muted')
      if (testInfo.project.name === 'desktop') {
        const next = page.getByTestId('theme-audit-db-next')
        await next.hover()
        await expectToken(page, next, 'background-color', '--app-panel-muted')
      }

      const disabledInput = page.getByTestId('disabled-input')
      await expect(disabledInput).toBeDisabled()
      await expectToken(page, disabledInput, 'background-color', '--app-panel-muted')
      await expectToken(page, disabledInput, 'color', '--muted')
      await expect(disabledInput).toHaveCSS('opacity', '0.5')
      const checkedCheckbox = page.getByTestId('checked-checkbox')
      await expect(checkedCheckbox).toBeChecked()
      await expectToken(page, checkedCheckbox, 'background-color', '--app-focus')
      await expectToken(page, checkedCheckbox, 'border-top-color', '--app-focus')
      const disabledCheckbox = page.getByTestId('disabled-checkbox')
      await expect(disabledCheckbox).toBeDisabled()
      await expect(disabledCheckbox).toHaveCSS('opacity', '0.45')
      await expect(disabledCheckbox).toHaveCSS('cursor', 'default')
      const checkedRadio = page.getByTestId('checked-radio')
      await expect(checkedRadio).toBeChecked()
      await expectToken(page, checkedRadio, 'border-top-color', '--app-focus')
      await expectTokenInImage(page, checkedRadio, '--app-focus')

      await toolbarShell.evaluate((node) => { (node as HTMLElement).style.removeProperty('display') })

      const toolbarButton = page.getByRole('button', { name: 'More options' })
      const toolbarItem = page.getByRole('button', { name: 'Undo' })
      await toolbarButton.focus()
      await expect(page.getByRole('button', { name: 'Nested option' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Disabled action' })).toHaveCSS('opacity', '0.5')
      await expect(page.getByRole('button', { name: 'Disabled action' })).toHaveCSS('cursor', 'not-allowed')
      const popup = page.locator('.toolbar-edit-dropdown')
      await expect(popup).toBeVisible()
      await expect(popup).toHaveCSS('position', testInfo.project.name === 'narrow-mobile' ? 'static' : 'absolute')
      const submenu = page.locator('.toolbar-edit-submenu-panel')
      await expect(submenu).toBeVisible()
      await expect(submenu).toHaveCSS('position', testInfo.project.name === 'narrow-mobile' ? 'static' : 'absolute')
      await expectToken(page, popup, 'background-color', '--vg-surface-panel')
      if (testInfo.project.name === 'desktop') {
        await expectBoxShadowToken(page, primaryInverse, '--vg-shadow-elevation')
      }
      if (testInfo.project.name === 'desktop') {
        const toolbarBefore = await resolvedValue(toolbarItem, 'background-color')
        await toolbarItem.hover()
        await expect.poll(async () => resolvedValue(toolbarItem, 'background-color')).not.toBe(toolbarBefore)
      }

      const startup = page.locator('.startup-window')
      await expectToken(page, startup, 'background-color', '--vg-startup-canvas')
      const card = page.locator('.startup-action-card')
      await expectToken(page, card, 'background-color', '--vg-startup-card-surface')
      await expectToken(page, card, 'border-top-color', '--vg-startup-card-border')
      await expectToken(page, card.locator('strong'), 'color', '--vg-startup-strong-ink')
      await expectToken(page, card.locator('small'), 'color', '--vg-startup-muted')
      if (testInfo.project.name === 'desktop') {
        await card.hover()
        await expectToken(page, card, 'border-top-color', '--vg-startup-interaction-border')
      }
      await card.focus()
      await expectToken(page, card, 'outline-color', '--vg-startup-focus-ring')
      const startupOption = page.locator('.startup-new-options button').first()
      await expectToken(page, startupOption, 'background-color', '--vg-startup-option-surface')
      await expectToken(page, startupOption, 'border-top-color', '--vg-startup-option-border')
      await expectToken(page, startupOption, 'color', '--vg-startup-option-ink')
      const fileRow = page.locator('.startup-file-row').first()
      await expectToken(page, fileRow, 'color', '--vg-startup-ink')
      if (testInfo.project.name === 'desktop') {
        await fileRow.hover()
        await expectToken(page, fileRow, 'background-color', '--vg-startup-hover-surface')
      }
      await expectToken(page, page.locator('.startup-status'), 'color', '--vg-startup-status')
      await expectToken(page, page.locator('.startup-empty'), 'color', '--vg-startup-faint')
      for (const category of ['purple', 'blue', 'teal', 'amber', 'slate', 'rose']) {
        const icon = page.locator(`.theme-audit-category-row .startup-icon-${category}`)
        await expectToken(page, icon, 'color', `--vg-startup-icon-${category}-ink`)
        await expectToken(page, icon, 'background-color', `--vg-startup-icon-${category}-surface`)
      }
      await expectTokenInImage(page, page.locator('.startup-ambient-one'), '--vg-startup-ambient-one')
      await expectTokenInImage(page, page.locator('.startup-ambient-two'), '--vg-startup-ambient-two')
      await expectToken(page, page.locator('.startup-molecule-dot').first(), 'background-color', '--vg-startup-dna-dot')
      await expectToken(page, page.locator('.startup-molecule-dot.protein'), 'background-color', '--vg-startup-protein-dot')
      await expectToken(page, page.locator('.startup-source-badge').first(), 'background-color', '--vg-startup-source-surface')
      await expectToken(page, page.locator('.startup-source-badge.database'), 'background-color', '--vg-startup-database-surface')
      const deleteButton = page.getByTestId('startup-delete')
      if (testInfo.project.name === 'desktop') {
        await deleteButton.hover()
        await expectToken(page, deleteButton, 'color', '--vg-startup-delete-ink')
        await expectToken(page, deleteButton, 'background-color', '--vg-startup-delete-surface')
      }
      await deleteButton.focus()
      await expectToken(page, deleteButton, 'outline-color', '--vg-startup-delete-focus')
      await dropTarget.evaluate((node) => { (node as HTMLElement).style.removeProperty('display') })
      await expect(dropTarget).toBeVisible()
      await expectToken(page, dropTarget, 'background-color', '--vg-startup-drop-surface')
      await expectToken(page, dropTarget, 'border-top-color', '--vg-startup-drop-border')
      await expectToken(page, dropTarget.locator('span'), 'color', '--vg-startup-drop-ink')
      await modalBackdrop.evaluate((node) => { (node as HTMLElement).style.removeProperty('display') })
      await expectToken(page, modalBackdrop, 'background-color', '--vg-startup-modal-overlay')
      await expectToken(page, page.locator('.new-dna-dialog'), 'background-color', '--vg-startup-modal-surface')
      await expectToken(page, page.locator('.new-dna-dialog'), 'border-top-color', '--vg-startup-modal-border')

      const traceAction = page.getByRole('button', { name: 'Open sequence' })
      const traceDisabled = page.getByRole('button', { name: 'Disabled trace action' })
      await expectToken(page, traceAction, 'background-color', '--trace-viewer-accent')
      if (scheme === 'dark') {
        expect(await resolvedValue(traceDisabled, 'color')).toBe(await resolvedValue(traceAction, 'color'))
      } else {
        await expectToken(page, traceDisabled, 'color', '--vg-text-disabled')
      }
      await expectToken(page, traceDisabled, 'border-top-color', '--vg-border-disabled')
      await expect(traceDisabled).toHaveCSS('background-image', /linear-gradient/)
      await expect(traceDisabled).toHaveCSS('cursor', 'default')
      await expect(traceDisabled).toBeDisabled()

      if (testInfo.project.name === 'narrow-mobile') {
        expect(await page.locator('body').evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
      }
    })
  }
})

test('static fixture exposes every cross-scheme interaction target', async ({ page }) => {
  await page.evaluate(() => document.documentElement.classList.add('vg-hybrid-window'))
  await expect(page.getByTestId('startup-drop-target')).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Hybrid modal' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open sequence' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Disabled trace action' })).toBeDisabled()
  await expect(page.getByTestId('disabled-input')).toBeDisabled()
  await expect(page.getByTestId('theme-audit-pcr-recipe-note')).toBeVisible()
  await expect(page.getByTestId('theme-audit-pcr-primer-tab')).toBeVisible()
  await expect(page.getByTestId('theme-audit-pcr-primer-tab-active')).toBeVisible()
  await expect(page.getByTestId('theme-audit-agarose-gel-controls')).toBeVisible()
  await expect(page.getByTestId('theme-audit-agarose-footer-divider')).toBeVisible()
  await expect(page.getByTestId('theme-audit-compact-input')).toBeVisible()
  await expect(page.getByTestId('theme-audit-locked-body-text')).toBeVisible()
  await expect(page.getByTestId('theme-audit-locked-strong')).toBeVisible()
  await expect(page.getByTestId('theme-audit-locked-muted')).toBeVisible()
  await expect(page.getByTestId('theme-audit-locked-panel')).toBeVisible()
  await expect(page.getByTestId('theme-audit-locked-inset')).toBeVisible()
  await expect(page.getByTestId('theme-audit-generic-control-surface')).toBeVisible()
  await expect(page.getByTestId('theme-audit-panel-shadow')).toBeVisible()
  await expect(page.getByTestId('theme-audit-overlay-scrim')).toBeVisible()
  await expect(page.getByTestId('theme-audit-frameshift-cell')).toBeVisible()
  await expect(page.getByTestId('theme-audit-primer-base')).toBeVisible()
})
