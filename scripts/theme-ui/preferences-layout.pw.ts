import { expect, test } from '@playwright/test'
import { HYBRID_WINDOW_SPECS } from '../../src/desktop/hybridWindows'

test('default desktop window fits both tabs without scrolling', async ({ page }) => {
  const spec = HYBRID_WINDOW_SPECS.preferences
  expect(spec.fitToContent).toBe(true)
  expect(spec.resizable).toBe(false)
  await page.setViewportSize({ width: spec.width, height: 900 })
  await page.goto('/scripts/theme-ui/preferences-fixture.html?hybrid&fit-content')
  const dialog = page.getByRole('dialog', { name: 'Preferences' })
  const options = dialog.locator('.preferences-options')
  expect(await options.evaluate((element) => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(1)
  await expect(dialog.getByRole('button', { name: 'OK', exact: true })).toBeInViewport()
  const generalHeight = (await dialog.boundingBox())!.height
  await dialog.getByRole('tab', { name: 'PCR' }).click()
  await expect.poll(async () => (await dialog.boundingBox())!.height).not.toBe(generalHeight)
  const pcrHeight = (await dialog.boundingBox())!.height
  const pcr = dialog.locator('.preferences-pcr')
  expect(await pcr.evaluate((element) => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(1)
  const last = dialog.getByRole('spinbutton', { name: 'Default PCR cycle count' })
  await expect(last).toBeInViewport()
  expect((await last.boundingBox())!.y + (await last.boundingBox())!.height).toBeLessThanOrEqual((await dialog.locator('.preferences-footer').boundingBox())!.y)
  await dialog.getByRole('tab', { name: 'General' }).click()
  await expect.poll(async () => (await dialog.boundingBox())!.height).toBe(generalHeight)
  expect(pcrHeight).not.toBe(generalHeight)
})

for (const viewport of [{ name: 'desktop popup', width: 520, height: 425, hybrid: true }, { name: 'short desktop popup', width: 520, height: 280, hybrid: true }, { name: 'narrow web dialog', width: 390, height: 500, hybrid: false }]) {
  test(`PCR settings and actions remain reachable in ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await page.goto(`/scripts/theme-ui/preferences-fixture.html${viewport.hybrid ? '?hybrid' : ''}`)
    const dialog = page.getByRole('dialog', { name: 'Preferences' })
    await dialog.getByRole('tab', { name: 'PCR' }).click()
    const body = dialog.locator('.preferences-pcr')
    const footer = dialog.locator('.preferences-footer')
    const first = dialog.getByRole('spinbutton', { name: 'Default PCR volume (µl)' })
    const last = dialog.getByRole('spinbutton', { name: 'Default PCR cycle count' })
    await expect(first).toBeVisible()
    await first.fill('42')
    const before = await footer.boundingBox()
    expect(before!.y + before!.height).toBeLessThanOrEqual(viewport.height + 1)
    await last.scrollIntoViewIfNeeded()
    await expect(last).toBeVisible()
    const lastBox = await last.boundingBox()
    const after = await footer.boundingBox()
    expect(lastBox!.y + lastBox!.height).toBeLessThanOrEqual(after!.y + 1)
    expect(after!.y + after!.height).toBeLessThanOrEqual(viewport.height + 1)
    expect(await body.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)
    await dialog.getByRole('tab', { name: 'General' }).click()
    await dialog.getByRole('tab', { name: 'PCR' }).click()
    await expect(first).toHaveValue('42')
    await dialog.getByRole('button', { name: 'OK', exact: true }).click()
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('vibegene:app-preferences')!).pcr.reactionVolumeUl)).toBe(42)
  })
}
