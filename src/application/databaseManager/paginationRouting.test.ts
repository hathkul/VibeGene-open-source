import { describe, expect, it, vi } from 'vitest'
import { buildDatabaseManagerGoToPageCommand, clampDatabaseManagerPageIndex } from './paginationRouting'

describe('database manager pagination routing', () => {
  it('clamps below zero and above last page', () => {
    expect(clampDatabaseManagerPageIndex(-3, 5)).toBe(0)
    expect(clampDatabaseManagerPageIndex(99, 5)).toBe(4)
    expect(clampDatabaseManagerPageIndex(2, 5)).toBe(2)
  })

  it('routes go-to-page command through clamping and scroll hook', () => {
    const setPage = vi.fn()
    const scrollToTop = vi.fn()
    const goToPage = buildDatabaseManagerGoToPageCommand({
      pageCount: 3,
      setPage,
      scrollToTop,
    })
    goToPage(10)
    expect(setPage).toHaveBeenCalledWith(2)
    expect(scrollToTop).toHaveBeenCalledTimes(1)
    goToPage(-1)
    expect(setPage).toHaveBeenCalledWith(0)
  })
})
