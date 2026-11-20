import { expect, test } from '@playwright/test'

test('homepage exposes product metadata and descriptive browser title', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle('VibeGene — DNA Editing, Cloning & Sequence Analysis')
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /Free DNA sequence editor/)
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /VibeGene/)
})

for (const viewport of [
  { name: 'desktop', width: 1280, height: 800, project: 'desktop' },
  { name: 'narrow', width: 390, height: 640, project: 'narrow-mobile' },
  { name: 'constrained-height', width: 390, height: 420, project: 'narrow-mobile' },
]) {
  test(`About dialog remains usable at ${viewport.name} dimensions`, async ({ page }) => {
    test.skip(test.info().project.name !== viewport.project, 'Run each viewport check in its matching browser project')
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await page.goto('/scripts/theme-ui/about-fixture.html')
    const dialog = page.getByRole('dialog', { name: 'About VibeGene' })
    await expect(dialog.getByRole('heading', { name: 'DNA editing, virtual cloning and sequence analysis' })).toBeVisible()
    await expect(dialog.getByText(/free molecular biology software with a familiar interface/i)).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'OK' })).toBeVisible()
    const box = await dialog.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1)
    expect(box!.y).toBeGreaterThanOrEqual(0)
    expect(box!.height).toBeLessThanOrEqual(viewport.height)
  })
}
