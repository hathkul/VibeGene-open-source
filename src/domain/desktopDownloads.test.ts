import { describe, expect, it } from 'vitest'
import { DESKTOP_DOWNLOADS } from './desktopDownloads'

describe('desktop downloads for the web-only release', () => {
  it('keeps links on the desktop versions that were actually released', () => {
    expect(DESKTOP_DOWNLOADS.filter(({ id }) => !id.startsWith('windows')).every(({ href }) => href.includes('1.8.0'))).toBe(true)
    expect(DESKTOP_DOWNLOADS.filter(({ id }) => id.startsWith('windows')).every(({ href }) => href.includes('1.7.2'))).toBe(true)
  })
})
