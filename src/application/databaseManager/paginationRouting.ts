export function clampDatabaseManagerPageIndex(page: number, pageCount: number): number {
  if (pageCount <= 0) return 0
  return Math.max(0, Math.min(page, pageCount - 1))
}

export function databaseManagerPaginationGoToPageRoute(
  requestedPage: number,
  pageCount: number,
): { page: number } {
  return { page: clampDatabaseManagerPageIndex(requestedPage, pageCount) }
}

export function buildDatabaseManagerGoToPageCommand(input: {
  pageCount: number
  setPage: (page: number) => void
  scrollToTop?: () => void
}) {
  return (requestedPage: number) => {
    const { page } = databaseManagerPaginationGoToPageRoute(requestedPage, input.pageCount)
    input.setPage(page)
    input.scrollToTop?.()
  }
}
