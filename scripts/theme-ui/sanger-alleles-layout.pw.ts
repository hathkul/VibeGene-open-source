import { expect, test } from '@playwright/test'

test('sticky footer covers scrolling traces in themed dialogs', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 500 })
  await page.goto('/scripts/theme-ui/sanger-alleles-fixture.html')
  await page.evaluate(() => { document.documentElement.dataset.colorScheme = 'light' })
  const dialog = page.getByRole('dialog')
  const footer = dialog.locator('.sgrna-dialog-actions')
  await dialog.evaluate((element) => { element.scrollTop = element.scrollHeight / 2 })
  const state = await footer.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const hit = document.elementFromPoint(rect.left + 4, rect.top + 4)
    return { background: getComputedStyle(element).backgroundColor, covered: hit === element || element.contains(hit) }
  })
  expect(state.background).not.toBe('rgba(0, 0, 0, 0)')
  expect(state.covered).toBe(true)
  await dialog.evaluate((element) => { element.scrollTop = element.scrollHeight })
  const lastRow = dialog.locator('.sanger-alleles-trace').last()
  expect((await lastRow.boundingBox())!.y + (await lastRow.boundingBox())!.height).toBeLessThanOrEqual((await footer.boundingBox())!.y)
})

for (const size of [{ name: 'wide desktop', width: 1440, height: 900, sideBySide: true }, { name: 'constrained dialog in wide window', width: 1440, height: 900, dialogWidth: 560, sideBySide: false }, { name: 'constrained window', width: 700, height: 900, sideBySide: false }, { name: 'mobile', width: 390, height: 844, sideBySide: false }]) {
  test(`selected group keeps trace rows readable at ${size.name}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: size.width, height: size.height })
    await page.goto('/scripts/theme-ui/sanger-alleles-fixture.html')
    const dialog = page.locator('.sanger-alleles-dialog')
    if (size.dialogWidth) await dialog.evaluate((element, width) => { (element as HTMLElement).style.width = `${width}px` }, size.dialogWidth)
    const trace = page.locator('.sanger-alleles-trace').first()
    await trace.locator('input[type=checkbox]').check()
    await trace.locator('input[type=text]').fill('clone 9')
    const grouping = page.locator('.sanger-alleles-grouping')
    const fields = grouping.locator(':scope > fieldset')
    const groups = grouping.locator(':scope > .sanger-alleles-group-options')
    await expect(groups).toContainText('clone 9')
    const layout = await trace.evaluate((row) => {
      const label = row.querySelector('label')!.getBoundingClientRect()
      const text = row.querySelector('label span')!.getBoundingClientRect()
      const input = row.querySelector('input[type=text]')!.getBoundingClientRect()
      return { labelWidth: label.width, textWidth: text.width, labelRight: label.right, inputLeft: input.left, rowHeight: row.getBoundingClientRect().height }
    })
    expect(layout.textWidth).toBeGreaterThan(90)
    expect(layout.labelRight).toBeLessThanOrEqual(layout.inputLeft)
    expect(layout.rowHeight).toBeLessThan(120)
    const left = (await fields.boundingBox())!
    const right = (await groups.boundingBox())!
    if (size.sideBySide) expect(right.x).toBeGreaterThanOrEqual(left.x + left.width)
    else expect(right.y).toBeGreaterThanOrEqual(left.y + left.height)
    expect(await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
    if (size.sideBySide) expect((await dialog.boundingBox())!.width).toBeGreaterThan(1000)
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible()
    await testInfo.attach('populated-dialog', { body: await dialog.screenshot(), contentType: 'image/png' })
  })
}

test('competing variants remain selectable and readable', async ({ page }, testInfo) => {
  await page.goto('/scripts/theme-ui/sanger-alleles-fixture.html?ambiguity')
  const dialog = page.getByRole('dialog')
  const first = dialog.getByRole('checkbox', { name: /Variant 1/ })
  const second = dialog.getByRole('checkbox', { name: /Variant 2/ })
  const open = dialog.getByRole('button', { name: 'Open allele library' })
  await expect(first).toBeChecked()
  await expect(second).toBeChecked()
  const variantRows = dialog.locator('.sanger-alleles-variant-list > li')
  const firstCheckbox = (await first.boundingBox())!
  const secondCheckbox = (await second.boundingBox())!
  const firstJunction = (await variantRows.nth(0).locator('code').boundingBox())!
  const secondJunction = (await variantRows.nth(1).locator('code').boundingBox())!
  expect(Math.abs(firstCheckbox.x - secondCheckbox.x)).toBeLessThan(1)
  expect(Math.abs(firstJunction.x - secondJunction.x)).toBeLessThan(1)
  await first.uncheck()
  await expect(open).toBeEnabled()
  await second.uncheck()
  await expect(open).toBeDisabled()
  await first.check()
  expect(await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
  await testInfo.attach('variant-selection', { body: await dialog.screenshot(), contentType: 'image/png' })
})

for (const width of [1440, 390]) {
  test(`independent read comparison is readable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/scripts/theme-ui/sanger-alleles-fixture.html?comparison')
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText(/Warning: independently fitted reads report different/)).toBeVisible()
    await expect(dialog.getByText(/long-forward-chromatogram-name/)).toBeVisible()
    await expect(dialog.getByText(/long-reverse-chromatogram-name/)).toBeVisible()
    expect(await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
    const boxes = await dialog.locator('.sanger-independent-read').evaluateAll((elements) => elements.map((element) => ({ top: element.getBoundingClientRect().top, bottom: element.getBoundingClientRect().bottom })))
    expect(boxes[1]!.top).toBeGreaterThanOrEqual(boxes[0]!.bottom)
  })
}

for (const width of [1440, 390]) {
  test(`help list markers have room at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/scripts/theme-ui/sanger-alleles-fixture.html?help')
    const list = page.locator('.crispr-workflow-help-dialog section[aria-labelledby="sanger-alleles-help-title"] ol').first()
    await list.scrollIntoViewIfNeeded()
    const dimensions = await list.evaluate((element) => {
      const styles = getComputedStyle(element)
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')!
      context.font = `${styles.fontSize} ${styles.fontFamily}`
      return { padding: parseFloat(styles.paddingLeft), markerWidth: context.measureText('12.  ').width, fontSize: parseFloat(styles.fontSize) }
    })
    expect(dimensions.padding).toBeGreaterThan(dimensions.markerWidth)
    expect(dimensions.padding / dimensions.fontSize).toBeGreaterThanOrEqual(2)
    expect(await list.evaluate((element) => element.closest('.dna-library-help-scroll')!.scrollWidth - element.closest('.dna-library-help-scroll')!.clientWidth)).toBeLessThanOrEqual(1)
    await testInfo.attach('help-numbered-list', { body: await list.screenshot(), contentType: 'image/png' })
  })
}

for (const width of [1440, 390]) {
  test(`contextual help opens without losing setup at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/scripts/theme-ui/sanger-alleles-fixture.html')
    const setup = page.getByRole('dialog', { name: 'Alleles from Sanger data', exact: true })
    const trace = setup.locator('.sanger-alleles-trace input[type=checkbox]').first()
    await trace.check()
    const helpButton = setup.getByRole('button', { name: 'Help: Alleles from Sanger data' })
    const heading = setup.getByRole('heading', { name: 'Alleles from Sanger data', exact: true })
    const titleBox = (await heading.boundingBox())!
    const buttonBox = (await helpButton.boundingBox())!
    expect(buttonBox.x).toBeGreaterThanOrEqual(titleBox.x + titleBox.width)
    expect(buttonBox.y).toBeLessThan(titleBox.y + titleBox.height)
    await helpButton.click()
    const article = page.getByRole('dialog', { name: 'Alleles from Sanger data · Help' })
    await expect(article.getByRole('heading', { name: 'How deconvolution helps' })).toBeVisible()
    expect(await article.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
    await page.keyboard.press('Escape')
    await expect(article).toHaveCount(0)
    await expect(trace).toBeChecked()
    await expect(helpButton).toBeFocused()
    await helpButton.click()
    await article.getByRole('button', { name: 'Close' }).click()
    await expect(article).toHaveCount(0)
    await expect(trace).toBeChecked()
  })
}
