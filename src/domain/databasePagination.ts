export type DatabasePageWindow = {
  page: number
  pageCount: number
  start: number
  end: number
}

/** Keep the Database table's initial render bounded to a modest row count. */
export const DATABASE_TABLE_PAGE_SIZE = 50

/** Resolve a bounded zero-based page window for a filtered Database result set. */
export function databasePageWindow(
  total: number,
  requestedPage: number,
  pageSize: number,
): DatabasePageWindow {
  const safeTotal = Math.max(0, Math.trunc(total))
  const safePageSize = Math.max(1, Math.trunc(pageSize))
  const pageCount = Math.max(1, Math.ceil(safeTotal / safePageSize))
  const page = Math.max(0, Math.min(Math.trunc(requestedPage), pageCount - 1))
  const start = page * safePageSize
  return {
    page,
    pageCount,
    start,
    end: Math.min(start + safePageSize, safeTotal),
  }
}
