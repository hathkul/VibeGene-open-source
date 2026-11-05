import { Fragment, useLayoutEffect, useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { formatRange } from '../../domain/sequence'
import {
  sgRnaGuideScanMetrics,
  sgRnaPrimerPaneFields,
  type PrimerPaneEntry,
  type PrimerPanePrimerRow,
  type PrimerPaneSgRnaRow,
  type PrimerPaneSortDirection,
  type SgRnaPaneSortMode,
} from '../../domain/primerPaneEntries'
import type { PrimerTabSortMode } from '../../domain/primerExport'
import { primerDescriptionForDisplay } from '../../domain/sgrnaOligoPrimers'
import type { SgRNAAnnotation } from '../../domain/sgrna'
import { FeatureVisibilityHeaderMenu } from '../dnaViewControls'
import {
  PRIMER_COLUMN_ORDER,
  PrimerColumnResizeHandle,
  PrimerPaneOligoGroupHeaderRow,
  PrimerPaneSgRnaGroupHeaderRow,
  PrimerTableSortHeader,
} from '../primers/PrimerTablePresentation'
import type { PrimerColumnId } from '../sequence'
import './PrimersTabPane.css'

export type PrimersTabPaneProps = {
  featureSelectionMemberId: string | null
  selectedAlignmentTraceId: string | null
  selectedFeatureId: string | null
  selectedFeatureIds: readonly string[]
  selectedPrimerId: string | null
  selectedPrimerIds: readonly string[]
  newSgRnaMemberId: string | null
  selectedSgRnaRow: PrimerPaneSgRnaRow | undefined
  openAnnealedOligosAvailable: boolean
  hasPrimerSelected: boolean
  table: {
    entries: PrimerPaneEntry[]
    minWidthPx: number
    columnWidths: Record<PrimerColumnId, number>
    primerSort: { mode: PrimerTabSortMode; direction: PrimerPaneSortDirection }
    oligoSort: { mode: PrimerTabSortMode; direction: PrimerPaneSortDirection }
    sgRnaSort: { mode: SgRnaPaneSortMode; direction: PrimerPaneSortDirection }
  }
  search: {
    hitSet: ReadonlySet<string>
    activeHitId: string | null
  }
  queries: {
    hasRegularSelection: () => boolean
    hasOligoSelection: (memberId: string | null) => boolean
    hasSgRnaSelection: (memberId: string | null) => boolean
  }
  actions: {
    onAddPrimer: () => void
    onNewSgRna: (memberId: string | null) => void
    onOpenAnnealedOligos: () => void
    onDeleteSelected: () => void
    onCheckRegularVisibility: (visible: boolean) => void
    onCheckOligoVisibility: (memberId: string | null, visible: boolean) => void
    onCheckSgRnaVisibility: (memberId: string | null, visible: boolean) => void
    onSortPrimer: (mode: PrimerTabSortMode) => void
    onSortOligo: (mode: PrimerTabSortMode) => void
    onSortSgRna: (mode: SgRnaPaneSortMode) => void
    onResizeColumn: (columnId: PrimerColumnId, nextWidth: number) => void
    onSelectSgRnaRow: (entry: PrimerPaneSgRnaRow, event: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => void
    onSelectPrimerRow: (entry: PrimerPanePrimerRow, event: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => void
    onSetPrimerVisibility: (primerId: string, visible: boolean, memberId: string | null) => void
    onSetSgRnasVisibility: (annotations: readonly SgRNAAnnotation[], visible: boolean, memberId: string | null) => void
    onFocusFeatureSelection: (featureId: string, selectedIds: string[], memberId: string | null) => void
    onFocusPrimerSelection: (primerId: string, selectedIds: string[], memberId: string | null) => void
    onOpenFeatureEditor: (featureId: string, options?: { libraryMemberId?: string | null }) => void
    onOpenPrimerEditor: (primerId: string, memberId?: string | null) => void
  }
}

export function PrimersTabPane({
  featureSelectionMemberId,
  selectedAlignmentTraceId,
  selectedFeatureId,
  selectedFeatureIds,
  selectedPrimerId,
  selectedPrimerIds,
  newSgRnaMemberId,
  selectedSgRnaRow,
  openAnnealedOligosAvailable,
  hasPrimerSelected,
  table,
  search,
  queries,
  actions,
}: PrimersTabPaneProps) {
  const [availableWidth, setAvailableWidth] = useState(0)
  const [sequenceContentWidth, setSequenceContentWidth] = useState(table.columnWidths.sequence)
  const tableWrapRef = useRef<HTMLDivElement | null>(null)
  const tableRef = useRef<HTMLTableElement | null>(null)
  const [manuallyResizedColumns, setManuallyResizedColumns] = useState<ReadonlySet<PrimerColumnId>>(() => new Set())

  useLayoutEffect(() => {
    const wrap = tableWrapRef.current
    if (!wrap) return
    const updateWidth = () => setAvailableWidth(wrap.clientWidth)
    updateWidth()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(updateWidth)
    observer.observe(wrap)
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    const tableElement = tableRef.current
    if (!tableElement) return
    const sequenceColumnIndex = PRIMER_COLUMN_ORDER.indexOf('sequence')
    const columns = Array.from(tableElement.querySelectorAll('col'))
    const sequenceColumn = columns[sequenceColumnIndex]
    if (!sequenceColumn) return
    const renderedSequenceWidth = Array.from(tableElement.querySelectorAll<HTMLElement>('tbody td.primer-sequence-cell'))
      .reduce((maximum, cell) => Math.max(maximum, cell.scrollWidth), 0)

    const originalLayout = tableElement.style.tableLayout
    const originalWidth = tableElement.style.width
    const originalMinWidth = tableElement.style.minWidth
    const originalColumnWidths = columns.map((column) => column.style.width)
    tableElement.style.tableLayout = 'auto'
    tableElement.style.width = 'max-content'
    tableElement.style.minWidth = '0'
    columns.forEach((column) => { column.style.width = 'auto' })
    const measuredWidth = Math.max(
      renderedSequenceWidth,
      Math.ceil(sequenceColumn.getBoundingClientRect().width),
    )
    tableElement.style.tableLayout = originalLayout
    tableElement.style.width = originalWidth
    tableElement.style.minWidth = originalMinWidth
    columns.forEach((column, index) => { column.style.width = originalColumnWidths[index] ?? '' })
    if (measuredWidth > 0) setSequenceContentWidth(measuredWidth)
  }, [table.entries.length])

  const resizeColumn = (columnId: PrimerColumnId, nextWidth: number) => {
    setManuallyResizedColumns((previous) => {
      const next = new Set(previous)
      next.add(columnId)
      return next
    })
    actions.onResizeColumn(columnId, nextWidth)
  }

  const fixedWidth = PRIMER_COLUMN_ORDER
    .filter((columnId) => columnId !== 'sequence' && columnId !== 'warnings')
    .reduce((total, columnId) => total + table.columnWidths[columnId], 0)
  const dataSequenceWidth = table.entries.reduce((maximum, entry) => {
    if (entry.kind === 'sgrna') {
      return Math.max(maximum, sgRnaPrimerPaneFields(entry.annotation).sequence.length * 8 + 28)
    }
    if (entry.kind === 'primer') {
      return Math.max(maximum, entry.row.primer.sequence.length * 8 + 28)
    }
    return maximum
  }, 0)
  const sequenceMaximumWidth = availableWidth > 0 ? availableWidth * 0.4 : Number.POSITIVE_INFINITY
  const effectiveSequenceWidth = manuallyResizedColumns.has('sequence')
    ? table.columnWidths.sequence
    : Math.max(
        80,
        Math.min(
          sequenceMaximumWidth,
          Math.max(table.columnWidths.sequence, sequenceContentWidth, dataSequenceWidth),
        ),
      )
  const effectiveWarningsWidth = Math.max(
    table.columnWidths.warnings,
    manuallyResizedColumns.has('warnings')
      ? table.columnWidths.warnings
      : availableWidth > 0
        ? availableWidth - fixedWidth - effectiveSequenceWidth
        : table.columnWidths.warnings,
  )
  const effectiveColumnWidths = {
    ...table.columnWidths,
    vis: Math.max(30, table.columnWidths.vis),
    sequence: effectiveSequenceWidth,
    warnings: effectiveWarningsWidth,
  }

  return (
    <div className="tab-table-layout primers-tab">
      <div className="features-toolbar primers-tab-actions">
        <button type="button" onClick={actions.onAddPrimer}>
          <Plus size={16} /> New primer
        </button>
        <button type="button" onClick={() => actions.onNewSgRna(newSgRnaMemberId)}>
          <Plus size={16} /> New sgRNA
        </button>
        {selectedSgRnaRow?.kind === 'sgrna' && (
          <button type="button" onClick={() => actions.onOpenFeatureEditor(selectedSgRnaRow.annotation.guide.id, { libraryMemberId: selectedSgRnaRow.memberId })}>
            {selectedSgRnaRow.annotation.pam ? 'Edit sgRNA' : 'Edit guide annotation'}
          </button>
        )}
        {openAnnealedOligosAvailable && (
          <button type="button" onClick={actions.onOpenAnnealedOligos}>Open as sequence</button>
        )}
        <button
          type="button"
          className="danger"
          disabled={!hasPrimerSelected && selectedSgRnaRow?.kind !== 'sgrna'}
          onClick={actions.onDeleteSelected}
        >
          <Trash2 size={16} /> Delete
        </button>
      </div>
      <div className="primers-tab-table-wrap" ref={tableWrapRef}>
        <table
          ref={tableRef}
          className="data-table primer-list-table"
          style={{ minWidth: Math.max(table.minWidthPx, fixedWidth + table.columnWidths.sequence + table.columnWidths.warnings), width: '100%', tableLayout: 'fixed' }}
        >
          <colgroup>
            {PRIMER_COLUMN_ORDER.map((columnId) => (
              <col key={columnId} style={{ width: effectiveColumnWidths[columnId] }} />
            ))}
          </colgroup>
          {(table.entries.length === 0
            || table.entries.some((entry) => entry.kind === 'heading' && entry.group === 'primer')) && (
          <thead>
            <tr>
              <th className="feature-visibility-col">
                <FeatureVisibilityHeaderMenu
                  title="Primer visibility"
                  checkLabel={queries.hasRegularSelection() ? 'Check selected' : 'Check all'}
                  uncheckLabel={queries.hasRegularSelection() ? 'Uncheck selected' : 'Uncheck all'}
                  onCheckAll={() => actions.onCheckRegularVisibility(true)}
                  onUncheckAll={() => actions.onCheckRegularVisibility(false)}
                />
                <PrimerColumnResizeHandle
                  columnId="vis"
                  width={effectiveColumnWidths.vis}
                  onResize={resizeColumn}
                />
              </th>
              <th className="enzyme-sortable-header">
                <PrimerTableSortHeader
                  label="Primer"
                  mode="name"
                  activeMode={table.primerSort.mode}
                  direction={table.primerSort.direction}
                  onSort={actions.onSortPrimer}
                />
                <PrimerColumnResizeHandle
                  columnId="name"
                  width={effectiveColumnWidths.name}
                  onResize={resizeColumn}
                />
              </th>
              <th className="enzyme-sortable-header">
                <PrimerTableSortHeader
                  label="Length"
                  mode="length"
                  activeMode={table.primerSort.mode}
                  direction={table.primerSort.direction}
                  onSort={actions.onSortPrimer}
                />
                <PrimerColumnResizeHandle
                  columnId="length"
                  width={effectiveColumnWidths.length}
                  onResize={resizeColumn}
                />
              </th>
              <th className="enzyme-sortable-header">
                <PrimerTableSortHeader
                  label="Binding site"
                  mode="binding"
                  activeMode={table.primerSort.mode}
                  direction={table.primerSort.direction}
                  onSort={actions.onSortPrimer}
                />
                <PrimerColumnResizeHandle
                  columnId="binding"
                  width={effectiveColumnWidths.binding}
                  onResize={resizeColumn}
                />
              </th>
              <th className="enzyme-sortable-header">
                <PrimerTableSortHeader
                  label="Orientation"
                  mode="orientation"
                  activeMode={table.primerSort.mode}
                  direction={table.primerSort.direction}
                  onSort={actions.onSortPrimer}
                />
                <PrimerColumnResizeHandle
                  columnId="orientation"
                  width={effectiveColumnWidths.orientation}
                  onResize={resizeColumn}
                />
              </th>
              <th className="enzyme-sortable-header">
                <PrimerTableSortHeader
                  label="3′ / Duplex Tm"
                  mode="tm"
                  activeMode={table.primerSort.mode}
                  direction={table.primerSort.direction}
                  onSort={actions.onSortPrimer}
                />
                <PrimerColumnResizeHandle
                  columnId="tm"
                  width={effectiveColumnWidths.tm}
                  onResize={resizeColumn}
                />
              </th>
              <th className="enzyme-sortable-header">
                <PrimerTableSortHeader
                  label="GC"
                  mode="gc"
                  activeMode={table.primerSort.mode}
                  direction={table.primerSort.direction}
                  onSort={actions.onSortPrimer}
                />
                <PrimerColumnResizeHandle
                  columnId="gc"
                  width={effectiveColumnWidths.gc}
                  onResize={resizeColumn}
                />
              </th>
              <th className="enzyme-sortable-header">
                <PrimerTableSortHeader
                  label="Da"
                  mode="mass"
                  activeMode={table.primerSort.mode}
                  direction={table.primerSort.direction}
                  onSort={actions.onSortPrimer}
                />
                <PrimerColumnResizeHandle
                  columnId="mass"
                  width={effectiveColumnWidths.mass}
                  onResize={resizeColumn}
                />
              </th>
              <th className="enzyme-sortable-header">
                <PrimerTableSortHeader
                  label="Sequence"
                  mode="sequence"
                  activeMode={table.primerSort.mode}
                  direction={table.primerSort.direction}
                  onSort={actions.onSortPrimer}
                />
                <PrimerColumnResizeHandle
                  columnId="sequence"
                  width={effectiveColumnWidths.sequence}
                  onResize={resizeColumn}
                />
              </th>
              <th className="enzyme-sortable-header">
                <PrimerTableSortHeader
                  label="Description"
                  mode="description"
                  activeMode={table.primerSort.mode}
                  direction={table.primerSort.direction}
                  onSort={actions.onSortPrimer}
                />
                <PrimerColumnResizeHandle
                  columnId="description"
                  width={effectiveColumnWidths.description}
                  onResize={resizeColumn}
                />
              </th>
              <th className="enzyme-sortable-header">
                <PrimerTableSortHeader
                  label="Warnings"
                  mode="warnings"
                  activeMode={table.primerSort.mode}
                  direction={table.primerSort.direction}
                  onSort={actions.onSortPrimer}
                />
                <PrimerColumnResizeHandle
                  columnId="warnings"
                  width={effectiveColumnWidths.warnings}
                  onResize={resizeColumn}
                />
              </th>
            </tr>
          </thead>
          )}
          <tbody>
            {table.entries.length === 0 ? (
              <tr>
                <td colSpan={PRIMER_COLUMN_ORDER.length} className="common-features-empty">
                  No primers or sgRNAs in this file.
                </td>
              </tr>
            ) : (
              table.entries.map((entry) => {
                if (entry.kind === 'heading' && entry.group === 'oligo') {
                  const hasOligoSelection = queries.hasOligoSelection(entry.memberId)
                  return (
                    <Fragment key={entry.key}>
                      <tr className="primer-subgroup-row">
                        <td colSpan={PRIMER_COLUMN_ORDER.length} title={entry.label}>{entry.label}</td>
                      </tr>
                      <PrimerPaneOligoGroupHeaderRow
                        oligoTabSortMode={table.oligoSort.mode}
                        oligoTabSortDirection={table.oligoSort.direction}
                        toggleOligoTabSort={actions.onSortOligo}
                        primerColumnWidths={effectiveColumnWidths}
                        resizePrimerColumn={resizeColumn}
                        visibilityMenu={(
                          <FeatureVisibilityHeaderMenu
                            title="sgRNA cloning oligo visibility"
                            checkLabel={hasOligoSelection ? 'Check selected' : 'Check all'}
                            uncheckLabel={hasOligoSelection ? 'Uncheck selected' : 'Uncheck all'}
                            onCheckAll={() => actions.onCheckOligoVisibility(entry.memberId, true)}
                            onUncheckAll={() => actions.onCheckOligoVisibility(entry.memberId, false)}
                          />
                        )}
                      />
                    </Fragment>
                  )
                }
                if (entry.kind === 'heading' && entry.group === 'sgrna') {
                  const hasSgRnaSelection = queries.hasSgRnaSelection(entry.memberId)
                  return (
                    <Fragment key={entry.key}>
                      <tr className="primer-subgroup-row">
                        <td colSpan={PRIMER_COLUMN_ORDER.length} title={entry.label}>{entry.label}</td>
                      </tr>
                      <PrimerPaneSgRnaGroupHeaderRow
                        sgRnaTabSortMode={table.sgRnaSort.mode}
                        sgRnaTabSortDirection={table.sgRnaSort.direction}
                        toggleSgRnaTabSort={actions.onSortSgRna}
                        primerColumnWidths={effectiveColumnWidths}
                        resizePrimerColumn={resizeColumn}
                        visibilityMenu={(
                          <FeatureVisibilityHeaderMenu
                            title="sgRNA visibility"
                            checkLabel={hasSgRnaSelection ? 'Check selected' : 'Check all'}
                            uncheckLabel={hasSgRnaSelection ? 'Uncheck selected' : 'Uncheck all'}
                            onCheckAll={() => actions.onCheckSgRnaVisibility(entry.memberId, true)}
                            onUncheckAll={() => actions.onCheckSgRnaVisibility(entry.memberId, false)}
                          />
                        )}
                      />
                    </Fragment>
                  )
                }
                if (entry.kind === 'heading') {
                  return (
                    <tr key={entry.key} className={entry.level === 'subgroup' ? 'primer-subgroup-row' : 'feature-section-row'}>
                      <td colSpan={PRIMER_COLUMN_ORDER.length} title={entry.label}>{entry.label}</td>
                    </tr>
                  )
                }
                if (entry.kind === 'sgrna') {
                  const { annotation, memberId } = entry
                  const guide = annotation.guide
                  const fields = sgRnaPrimerPaneFields(annotation)
                  const metrics = sgRnaGuideScanMetrics(annotation)
                  const metricsTitle = metrics?.source ?? 'Not picked or validated by GuideScan2'
                  const bindingLabel = fields.ranges.map((range) => formatRange(range.start, range.end)).join(' + ')
                  const selected = featureSelectionMemberId === memberId
                    && (selectedFeatureId === guide.id || selectedFeatureIds.includes(guide.id))
                  return (
                    <tr
                      key={entry.key}
                      className={selected ? 'is-selected primer-sgrna-row' : 'primer-sgrna-row'}
                      onMouseDown={(event) => {
                        if (event.shiftKey || event.metaKey || event.ctrlKey) event.preventDefault()
                      }}
                      onClick={(event) => actions.onSelectSgRnaRow(entry, event)}
                      onDoubleClick={() => actions.onOpenFeatureEditor(guide.id, { libraryMemberId: memberId })}
                      title={`${fields.nuclease} · ${fields.pam}`}
                    >
                      <td className="feature-visibility-col" onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={guide.visible !== false && annotation.pam?.visible !== false}
                          onChange={(event) => actions.onSetSgRnasVisibility([annotation], event.target.checked, memberId)}
                          aria-label={`Show ${guide.name}${annotation.pam ? ' and PAM' : ''} on map and sequence`}
                        />
                      </td>
                      <td>
                        <span className="color-chip" style={{ background: guide.color }} />
                        <button
                          type="button"
                          className="link-button primer-name-button"
                          onClick={(event) => {
                            event.stopPropagation()
                            actions.onFocusFeatureSelection(guide.id, [guide.id], memberId)
                            actions.onOpenFeatureEditor(guide.id, { libraryMemberId: memberId })
                          }}
                          title={fields.name}
                        >
                          {fields.name}
                        </button>
                      </td>
                      <td title={fields.annotatedLength !== fields.length
                        ? `${fields.length}-nt target spacer; ${fields.annotatedLength}-nt annotated expressed guide`
                        : undefined}>{fields.length}-mer</td>
                      <td>{bindingLabel || '—'}</td>
                      <td><span className="common-feature-direction" aria-label={fields.strand}>{fields.strand === 'reverse' ? '←' : '→'}</span></td>
                      <td title={metricsTitle}>{metrics?.specificity ?? '—'}</td>
                      <td title={metricsTitle}>{metrics?.cuttingEfficiency ?? '—'}</td>
                      <td
                        className="primer-offtargets-cell"
                        title={metrics ? `${metrics.offTargets} · ${metrics.source}` : metricsTitle}
                      >
                        {metrics?.offTargets ?? '—'}
                      </td>
                      <td className="mono-cell primer-sequence-cell">{fields.sequence || '—'}</td>
                      <td />
                      <td className="primer-warnings-cell" title={`${fields.nuclease} · ${fields.pam}`}>{fields.nuclease} · {fields.pam}</td>
                    </tr>
                  )
                }
                const { row, memberId } = entry
                const { primer } = row
                const description = primerDescriptionForDisplay(primer)
                const isVisible = primer.visible !== false
                const isHit = memberId === null && search.hitSet.has(primer.id)
                const isActiveHit =
                  isHit && search.activeHitId === primer.id
                const isSelected =
                  selectedAlignmentTraceId === memberId
                  && (selectedPrimerIds.includes(primer.id) || selectedPrimerId === primer.id)
                const duplexTailResult = row.duplexTm && row.duplexTm.status !== 'unsupported' ? row.duplexTm : undefined
                const duplexTailTitle = duplexTailResult?.excludedFivePrimeBases
                  ? duplexTailResult.modeledFivePrimeDanglingBases
                    ? `; 5′ tail: ${duplexTailResult.modeledFivePrimeDanglingBases} adjacent dangling ${duplexTailResult.modeledFivePrimeDanglingBases === 1 ? 'base' : 'bases'} modeled${duplexTailResult.excludedFivePrimeBases > duplexTailResult.modeledFivePrimeDanglingBases ? `; ${duplexTailResult.excludedFivePrimeBases - duplexTailResult.modeledFivePrimeDanglingBases} remaining tail bases excluded` : ''}`
                    : `; 5′ tail: ${duplexTailResult.excludedFivePrimeBases} unpaired bases excluded; dangling-end contribution not modeled`
                  : ''
                return (
                  <tr
                    key={entry.key}
                    className={[
                      isSelected ? 'is-selected' : '',
                      isHit ? 'is-search-hit' : '',
                      isActiveHit ? 'is-search-hit-active' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onMouseDown={(event) => {
                      if (event.shiftKey || event.metaKey || event.ctrlKey) event.preventDefault()
                    }}
                    onClick={(event) => actions.onSelectPrimerRow(entry, event)}
                  >
                    <td className="feature-visibility-col" onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isVisible}
                        onChange={(event) => actions.onSetPrimerVisibility(primer.id, event.target.checked, memberId)}
                        aria-label={`Show ${primer.name} on map and sequence`}
                      />
                    </td>
                    <td title={primer.name}>
                      <span className="color-chip" style={{ background: primer.color }} />
                      <button
                        type="button"
                        className="link-button primer-name-button"
                        title={primer.name}
                        onClick={(event) => {
                          event.stopPropagation()
                          actions.onFocusPrimerSelection(primer.id, [primer.id], memberId)
                          actions.onOpenPrimerEditor(primer.id, memberId)
                        }}
                      >
                        {primer.name}
                      </button>
                    </td>
                    <td>{row.length}-mer</td>
                    <td title={row.bindingLabel}>{row.bindingLabel}</td>
                    <td>
                      {row.strand ? (
                        <span className="common-feature-direction" aria-label={row.strand}>
                          {row.strand === 'reverse' ? '←' : '→'}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td title={row.duplexTm?.status === 'unsupported'
                      ? `Duplex Tm unavailable: ${row.duplexTm.reason}${row.duplexTm.variantCoverage ? `; evaluated ${row.duplexTm.variantCoverage.evaluatedVariantCount}/${row.duplexTm.variantCoverage.totalVariantCount}, ${row.duplexTm.variantCoverage.estimatedVariantCount} estimated, ${row.duplexTm.variantCoverage.unsupportedVariantCount ?? 'unknown'} unsupported, ${row.duplexTm.variantCoverage.unexaminedVariantCount} unexamined` : ''}`
                      : row.duplexTm?.status === 'estimated-range'
                        ? `${row.duplexTm.unsupportedVariantCount ? 'Partial range' : 'Range'} across ${row.duplexTm.estimatedVariantCount} estimated variants out of ${row.duplexTm.totalVariantCount}; assumes equal abundance (${(row.duplexTm.oligoConcPerVariant * 1e9).toPrecision(3)} nM per variant), actual proportions may differ${row.duplexTm.unsupportedVariantCount ? `; ${row.duplexTm.unsupportedVariantCount} unsupported variants excluded` : ''}${row.duplexTm.approximateTandemMismatchVariantCount ? `; internal-loop approximation used for ${row.duplexTm.approximateTandemMismatchVariantCount} variants` : ''}${duplexTailTitle}`
                        : `3′ continuous-match Tm; duplex estimate assumes 250 nM oligo, 50 mM monovalent salt, 2 mM Mg and 0.8 mM dNTP${duplexTailTitle}${row.duplexTm?.assumedSubstitutions ? '; equal-length internal blocks treated as substitutions' : ''}${row.duplexTm?.approximateTandemMismatch ? '; internal-loop model is unvalidated and salt correction approximate' : ''}`}>
                      {row.tmLabel}
                      {row.duplexTm && <div>{row.duplexTm.status === 'estimated'
                        ? `${row.duplexTm.approximateTandemMismatch ? 'Approx. duplex' : 'Duplex'} ${row.duplexTm.tmC.toFixed(1)} °C`
                        : row.duplexTm.status === 'estimated-range'
                          ? `${row.duplexTm.unsupportedVariantCount ? 'Partial duplex range' : 'Duplex range'} ${row.duplexTm.tmCRange.min.toFixed(1)}–${row.duplexTm.tmCRange.max.toFixed(1)} °C (${row.duplexTm.estimatedVariantCount}/${row.duplexTm.totalVariantCount} estimated)`
                          : row.duplexTm.variantCoverage?.unexaminedVariantCount
                            ? `Duplex unavailable (${row.duplexTm.variantCoverage.unexaminedVariantCount} variants unexamined)`
                            : row.duplexTm.variantCoverage
                              ? `Duplex unavailable (${row.duplexTm.variantCoverage.estimatedVariantCount} estimated; ${row.duplexTm.variantCoverage.unsupportedVariantCount ?? 'unknown'} unsupported; ${row.duplexTm.variantCoverage.unexaminedVariantCount} unexamined)`
                            : 'Duplex unavailable'}</div>}
                    </td>
                    <td>{row.gcPercent.toFixed(0)}%</td>
                    <td>{row.massDa.toFixed(1)}</td>
                    <td className="mono-cell primer-sequence-cell">{primer.sequence}</td>
                    <td className="primer-description-cell" title={description}>{description || '—'}</td>
                    <td className="primer-warnings-cell">{row.warnings}</td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
