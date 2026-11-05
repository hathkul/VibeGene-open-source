import { expect, test } from '@playwright/test'

test('wheel scrolling keeps annotated members and their labels synchronized', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 700 })
  await page.goto('/scripts/theme-ui/library-alignment-fixture.html?many')
  const list = page.locator('.alignment-list-scroll')
  const traces = page.locator('.alignment-traces-host')
  await expect(page.locator('.alignment-trace-annotation-row')).toHaveCount(12)
  await expect.poll(() => traces.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeGreaterThan(300)
  await page.evaluate(() => {
    const traces = document.querySelector<HTMLElement>('.alignment-traces-host')!
    const list = document.querySelector<HTMLElement>('.alignment-list-scroll')!
    traces.scrollTop = 120
    traces.dispatchEvent(new Event('scroll'))
    list.scrollTop = 240
    list.dispatchEvent(new Event('scroll'))
  })
  await expect.poll(() => traces.evaluate((el) => el.scrollTop)).toBe(240)
  await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBe(240)
  for (const host of [traces, list]) {
    const box = (await host.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    for (let i = 0; i < 4; i++) {
      const previous = await host.evaluate((el) => el.scrollTop)
      await page.mouse.wheel(0, 100)
      await expect.poll(() => host.evaluate((el) => el.scrollTop)).toBeGreaterThan(previous)
      await expect.poll(async () => Math.abs(await list.evaluate((el) => el.scrollTop) - await traces.evaluate((el) => el.scrollTop))).toBeLessThanOrEqual(1)
    }
  }
  await traces.evaluate((el) => { el.scrollTop = 200 })
  await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBe(200)
  await page.getByRole('button', { name: 'Dense region' }).click()
  await expect(page.locator('.alignment-trace-annotation-row').first().locator('.sequence-feature-segment')).toHaveCount(7)
  await expect.poll(() => traces.evaluate((el) => el.scrollTop)).toBe(200)
  await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBe(200)
  await page.getByRole('button', { name: 'Near region' }).click()
  await expect(page.locator('.alignment-trace-annotation-row').first().locator('.sequence-feature-segment')).toHaveCount(2)
  await expect.poll(() => traces.evaluate((el) => el.scrollTop)).toBe(200)
  await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBe(200)
})

test('member annotations use visible lanes and keep both columns synchronized while panning', async ({ page }, testInfo) => {
  await page.goto('/scripts/theme-ui/library-alignment-fixture.html')
  const members = page.locator('.alignment-trace-annotation-row')
  const labels = page.locator('.alignment-list-row.is-annotation-mode')
  const nearGuideFrames = testInfo.project.name === 'narrow-mobile' ? 1 : 2
  await expect(members).toHaveCount(2)
  await expect(labels).toHaveCount(2)
  const first = members.first()
  await expect(first.locator('.sequence-feature-segment')).toHaveCount(2)
  await expect(first.locator('.sequence-sgrna-frame')).toHaveCount(nearGuideFrames)

  const heights = async () => ({
    member: (await first.boundingBox())!.height,
    content: (await first.locator('.sequence-row').boundingBox())!.height,
    sidebar: (await labels.first().boundingBox())!.height,
  })
  await expect.poll(async () => Math.abs((await heights()).member - (await heights()).sidebar)).toBeLessThan(1)
  const near = await heights()
  expect(near.member - near.content).toBeLessThanOrEqual(2)
  expect(near.member).toBeLessThan(220)

  await page.getByRole('button', { name: 'Dense region' }).click()
  await expect(first.locator('.sequence-feature-segment')).toHaveCount(7)
  await expect(first.locator('.sequence-sgrna-frame')).toHaveCount(6)
  await expect.poll(async () => (await heights()).member).toBeGreaterThan(near.member + 30)
  await expect.poll(async () => Math.abs((await heights()).member - (await heights()).sidebar)).toBeLessThan(1)
  const dense = await heights()
  expect(dense.member).toBeGreaterThanOrEqual(dense.content - 1)
  const featuresFit = await first.locator('.sequence-feature-segment').evaluateAll((features) => features.every((feature) => {
    const row = feature.closest('.sequence-row')!.getBoundingClientRect()
    const bounds = feature.getBoundingClientRect()
    return bounds.top >= row.top && bounds.bottom <= row.bottom + 1
  }))
  expect(featuresFit).toBe(true)
  const guidesFit = await first.locator('.sequence-sgrna-frame').evaluateAll((guides) => guides.every((guide) => {
    const row = guide.closest('.sequence-row')!.getBoundingClientRect()
    const bounds = guide.getBoundingClientRect()
    return bounds.top >= row.top && bounds.bottom <= row.bottom + 1
  }))
  expect(guidesFit).toBe(true)

  await page.getByRole('button', { name: 'Near region' }).click()
  await expect(first.locator('.sequence-feature-segment')).toHaveCount(2)
  await expect(first.locator('.sequence-sgrna-frame')).toHaveCount(nearGuideFrames)
  await expect.poll(async () => (await heights()).member).toBeLessThan(dense.member - 30)
  await expect.poll(async () => Math.abs((await heights()).member - (await heights()).sidebar)).toBeLessThan(1)
  await testInfo.attach('library-alignment', { body: await page.screenshot(), contentType: 'image/png' })
})
