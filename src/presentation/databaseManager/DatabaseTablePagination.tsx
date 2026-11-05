import type { DatabaseManagerPaginationModel } from './databaseManagerTableTypes'

export type DatabaseTablePaginationCommands = {
  onGoToPage: (page: number) => void
}

export type DatabaseTablePaginationProps = {
  model: DatabaseManagerPaginationModel
  commands: DatabaseTablePaginationCommands
}

export function DatabaseTablePagination({ model, commands }: DatabaseTablePaginationProps) {
  if (model.total <= model.pageSize) return null
  const { page, pageCount, start, end, total } = model
  return (
    <nav className="db-table-pagination" aria-label="Database table pages">
      <span>
        {(start + 1).toLocaleString()}–{end.toLocaleString()} of {total.toLocaleString()}
      </span>
      <div>
        <button type="button" disabled={page === 0} onClick={() => commands.onGoToPage(0)} aria-label="First page">
          First
        </button>
        <button
          type="button"
          disabled={page === 0}
          onClick={() => commands.onGoToPage(page - 1)}
          aria-label="Previous page"
        >
          Previous
        </button>
        <strong>
          Page {(page + 1).toLocaleString()} of {pageCount.toLocaleString()}
        </strong>
        <button
          type="button"
          disabled={page >= pageCount - 1}
          onClick={() => commands.onGoToPage(page + 1)}
          aria-label="Next page"
        >
          Next
        </button>
        <button
          type="button"
          disabled={page >= pageCount - 1}
          onClick={() => commands.onGoToPage(pageCount - 1)}
          aria-label="Last page"
        >
          Last
        </button>
      </div>
    </nav>
  )
}
