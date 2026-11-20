import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { boundedCdsNumericColumnWidths, effectiveFlexibleColumnWidths } from '../../application/databaseManager/columnWidthPlanning'
import { DatabaseProteinsTablePane, type DatabaseProteinsTableCommands } from './DatabaseProteinsTablePane'

const DEFAULT_DATABASE_PROTEIN_COLUMN_WIDTHS = {
  name: 180, sequence: 260, length: 90, mass: 90, product: 180, files: 120, actions: 140,
}
const DATABASE_PROTEIN_COLUMN_MIN_WIDTH = {
  name: 110, sequence: 180, length: 70, mass: 70, product: 120, files: 80, actions: 120,
}

it('keeps the CDS Actions column wide enough and exposes its resize handle', () => {
  const widths = effectiveFlexibleColumnWidths(DEFAULT_DATABASE_PROTEIN_COLUMN_WIDTHS, 300, 'sequence', {
    flexColumnMinWidth: DATABASE_PROTEIN_COLUMN_MIN_WIDTH.sequence,
    selectionColumnWidth: 40,
    minWidths: DATABASE_PROTEIN_COLUMN_MIN_WIDTH,
  })
  expect(widths.actions).toBeGreaterThanOrEqual(120)
  const noop = vi.fn()
  const commands: DatabaseProteinsTableCommands = {
    onToggleSelectAll: noop, onToggleRowSelected: noop, onSelectRow: noop, onOpenRow: noop,
    onCopyRowSequence: noop, onSort: noop, onResizeColumn: noop, onReorderColumn: noop,
    onReorderDragStart: noop, onReorderDragOver: noop, onReorderDragEnd: noop,
  }
  const html = renderToStaticMarkup(<DatabaseProteinsTablePane model={{
    empty: null, rows: [], tableWidth: 800, viewportWidth: 300, checkColWidth: 40,
    columnOrder: ['name', 'sequence', 'length', 'mass', 'product', 'files', 'actions'],
    columnWidths: widths, sortColumn: 'name', sortDirection: 'asc',
    selection: { allVisibleSelected: false, someVisibleSelected: false }, selectedKeys: [],
    columnReorder: { dragColumnId: null, dropTargetId: null },
  }} commands={commands} />)
  expect(html).toContain('aria-label="Resize actions column"')
})

it('returns excess numeric-column width to the sequence column without mutating saved widths', () => {
  const saved = { ...DEFAULT_DATABASE_PROTEIN_COLUMN_WIDTHS, length: 350 }
  const bounded = boundedCdsNumericColumnWidths(saved)
  expect(saved.length).toBe(350)
  expect(bounded.length).toBe(160)
  const options = { flexColumnMinWidth: DATABASE_PROTEIN_COLUMN_MIN_WIDTH.sequence,
    selectionColumnWidth: 40, minWidths: DATABASE_PROTEIN_COLUMN_MIN_WIDTH }
  const previous = effectiveFlexibleColumnWidths(saved, 1400, 'sequence', options)
  const next = effectiveFlexibleColumnWidths(bounded, 1400, 'sequence', options)
  expect(next.sequence - previous.sequence).toBe(190)
})
