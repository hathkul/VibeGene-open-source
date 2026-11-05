import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  compatibleStickyEndGroups,
  dnaLetterCodes,
  filterCatalogEnzymeNames,
  formatOverhangType,
  getEnzymeByName,
  listCatalogManufacturerOptions,
  manufacturersForEnzyme,
  nebBufferLabel,
  sibBufferLabel,
  thermoBufferLabel,
  usbBufferLabel,
  vivantisBufferLabel,
  rocheBufferLabel,
  takaraBufferLabel,
  promegaBufferLabel,
  jenaBufferLabel,
  eurxBufferLabel,
  palindromeLengthBp,
  proteinLetterCodes,
  recognitionDisplayFor,
  relatedEnzymeCount,
  sameRecognitionGroups,
  type EnzymeBufferCode,
  type EnzymeManufacturerProfile,
  type RecognitionRowDisplay,
  type RelatedEnzymeGroup,
  type SibBufferCode,
  type ThermoBufferCode,
  type UsbBufferCode,
  type VivantisBufferCode,
  type RocheBufferCode,
  type TakaraBufferCode,
  type PromegaBufferCode,
  type JenaBufferCode,
  type EurxBufferCode,
} from './domain/enzymeCatalog'
import {
  buildInferredActivityTable,
  chooseInferenceSource,
  type InferredActivityTableModel,
} from './domain/inferredBufferActivityTable'
import type { EnzymeManufacturerId, RestrictionEnzyme } from './domain/types'
import { MobilePaneTabs } from './ui/MobilePaneTabs'

type EnzymeInfoDialogProps = {
  initialEnzymeName: string
  onClose: () => void
}

const relatedEnzymeMenuMaxHeightPx = 280

type RelatedEnzymeMenuPosition = {
  top: number
  left: number
  width: number
}

function RelatedEnzymeMenu({
  label,
  groups,
  onSelect,
}: {
  label: string
  groups: RelatedEnzymeGroup[]
  onSelect: (enzymeName: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState<RelatedEnzymeMenuPosition | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const count = relatedEnzymeCount(groups)

  function updateMenuPosition() {
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom - 8
    const spaceAbove = rect.top - 8
    const openBelow = spaceBelow >= relatedEnzymeMenuMaxHeightPx || spaceBelow >= spaceAbove
    const top = openBelow
      ? rect.bottom + 2
      : Math.max(8, rect.top - Math.min(relatedEnzymeMenuMaxHeightPx, spaceAbove) - 2)
    setMenuPosition({
      top,
      left: rect.left,
      width: rect.width,
    })
  }

  useLayoutEffect(() => {
    if (!open || count === 0) return
    updateMenuPosition()
    const scrollHosts = [
      triggerRef.current?.closest('.enzyme-info-main'),
      triggerRef.current?.closest('.enzyme-info-dialog'),
    ].filter((host): host is HTMLElement => host instanceof HTMLElement)

    window.addEventListener('resize', updateMenuPosition)
    scrollHosts.forEach((host) => host.addEventListener('scroll', updateMenuPosition, { passive: true }))
    return () => {
      window.removeEventListener('resize', updateMenuPosition)
      scrollHosts.forEach((host) => host.removeEventListener('scroll', updateMenuPosition))
    }
  }, [count, open])

  useEffect(() => {
    if (!open) return
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [open])

  const menu =
    open && count > 0 && menuPosition
      ? createPortal(
          <div
            ref={menuRef}
            className="enzyme-info-related-menu enzyme-info-related-menu-portal"
            role="menu"
            style={{ top: menuPosition.top, left: menuPosition.left, width: menuPosition.width }}
          >
            <div className="enzyme-info-related-menu-count">-- {count} Enzymes --</div>
            {groups.map((group) => (
              <div key={group.title} className="enzyme-info-related-group">
                <div className="enzyme-info-related-group-title">{group.title}</div>
                {group.entries.map((entry) => (
                  <button
                    key={entry.enzyme.name}
                    type="button"
                    className="enzyme-info-related-item"
                    role="menuitem"
                    onClick={() => {
                      onSelect(entry.enzyme.name)
                      setOpen(false)
                    }}
                  >
                    <span>{entry.enzyme.name}</span>
                    <span className={entry.incubationC !== 37 ? 'is-warm' : ''}>{entry.incubationC} °C</span>
                  </button>
                ))}
              </div>
            ))}
          </div>,
          document.body,
        )
      : null

  return (
    <div className="enzyme-info-related-picker">
      <button
        ref={triggerRef}
        type="button"
        className="enzyme-info-related-trigger"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        {label}: {count ? `-- ${count} Enzymes --` : 'None'}
      </button>
      {menu}
    </div>
  )
}

function CutMarker({ strand }: { strand: 'top' | 'bottom' }) {
  return (
    <span className="enzyme-info-cut-anchor" aria-hidden>
      <span className={`enzyme-info-cut enzyme-info-cut-${strand === 'top' ? 'top' : 'bottom'}`} />
    </span>
  )
}

function SpacerGroup({ count, expanded }: { count: number; expanded: boolean }) {
  if (expanded || count === 1) {
    return (
      <span className="enzyme-info-spacer-explicit">
        {Array.from({ length: count }, (_, index) => (
          <span key={index} className="enzyme-info-base-cell">
            N
          </span>
        ))}
      </span>
    )
  }
  return (
    <span className="enzyme-info-spacer-group">
      (N)<sub>{count}</sub>
    </span>
  )
}

function RecognitionRow({
  row,
  strand,
  leadingLabel,
  trailingLabel,
}: {
  row: RecognitionRowDisplay
  strand: 'top' | 'bottom'
  leadingLabel: string
  trailingLabel: string
}) {
  const cutBoundaries = row.cutBoundaries.length > 0
    ? row.cutBoundaries
    : row.cutBoundary == null
      ? []
      : [row.cutBoundary]

  return (
    <div className="enzyme-info-recognition-row">
      <span className="enzyme-info-strand-label">{leadingLabel}</span>
      <div className="enzyme-info-recognition-bases">
        <span className="enzyme-info-ellipsis">...</span>
        <div className="enzyme-info-base-stack">
          {cutBoundaries.includes(row.rangeStart) && <CutMarker strand={strand} />}
          {row.segments.map((segment) => {
            if (segment.kind === 'spacer') {
              const count = segment.rangeEnd - segment.rangeStart
              return (
                <FragmentWithCut
                  key={`${strand}-spacer-${segment.rangeStart}`}
                  cutBoundaries={cutBoundaries}
                  strand={strand}
                  rangeEnd={segment.rangeEnd}
                >
                  <SpacerGroup count={count} expanded={segment.role === 'overhang'} />
                </FragmentWithCut>
              )
            }

            return (
              <FragmentWithCut
                key={`${strand}-recognition-${segment.rangeStart}`}
                cutBoundaries={cutBoundaries}
                strand={strand}
                rangeEnd={segment.rangeEnd}
              >
                {segment.text.split('').map((base, index) => (
                  <span key={`${strand}-${segment.rangeStart + index}-${base}`} className="enzyme-info-base-cell">
                    {base}
                  </span>
                ))}
              </FragmentWithCut>
            )
          })}
        </div>
        <span className="enzyme-info-ellipsis">...</span>
      </div>
      <span className="enzyme-info-strand-label">{trailingLabel}</span>
    </div>
  )
}

function FragmentWithCut({
  children,
  cutBoundaries,
  strand,
  rangeEnd,
}: {
  children: ReactNode
  cutBoundaries: number[]
  strand: 'top' | 'bottom'
  rangeEnd: number
}) {
  return (
    <>
      {children}
      {cutBoundaries.includes(rangeEnd) && <CutMarker strand={strand} />}
    </>
  )
}

function RecognitionDiagram({ enzyme }: { enzyme: RestrictionEnzyme }) {
  const display = recognitionDisplayFor(enzyme)
  const showCutNotes =
    display.top.cutBoundaries.length === 0 || display.bottom.cutBoundaries.length === 0

  return (
    <div className="enzyme-info-recognition">
      <RecognitionRow row={display.top} strand="top" leadingLabel="5'" trailingLabel="3'" />
      <RecognitionRow row={display.bottom} strand="bottom" leadingLabel="3'" trailingLabel="5'" />
      {showCutNotes && (
        <div className="enzyme-info-cut-notes">
          <span>{display.topCutLabel}</span>
          <span>{display.bottomCutLabel}</span>
        </div>
      )}
    </div>
  )
}

function BufferActivityTable({
  profile,
  preferredBuffer,
}: {
  profile: EnzymeManufacturerProfile
  preferredBuffer: EnzymeBufferCode
}) {
  const tablePreferred = profile.enzymeSpecificBuffer ? null : preferredBuffer
  const labelFor = (buffer: EnzymeBufferCode) => {
    if (profile.bufferSystem === 'thermo') return thermoBufferLabel(buffer as ThermoBufferCode)
    if (profile.bufferSystem === 'sibenzyme') return sibBufferLabel(buffer as SibBufferCode)
    if (profile.bufferSystem === 'usb') return usbBufferLabel(buffer as UsbBufferCode)
    if (profile.bufferSystem === 'vivantis') return vivantisBufferLabel(buffer as VivantisBufferCode)
    if (profile.bufferSystem === 'roche') return rocheBufferLabel(buffer as RocheBufferCode)
    if (profile.bufferSystem === 'takara') return takaraBufferLabel(buffer as TakaraBufferCode)
    if (profile.bufferSystem === 'promega') return promegaBufferLabel(buffer as PromegaBufferCode)
    if (profile.bufferSystem === 'jena') return jenaBufferLabel(buffer as JenaBufferCode)
    if (profile.bufferSystem === 'eurx') return eurxBufferLabel(buffer as EurxBufferCode)
    return nebBufferLabel(buffer)
  }
  return (
    <table className="enzyme-info-buffer-table">
      <thead>
        <tr>
          {profile.bufferColumns.map((buffer) => (
            <th key={buffer} className={buffer === tablePreferred ? 'is-preferred' : ''}>
              {labelFor(buffer)}
            </th>
          ))}
          {profile.enzymeSpecificBuffer && (
            <th className="is-preferred is-enzyme-specific">Enzyme-specific buffer</th>
          )}
        </tr>
      </thead>
      <tbody>
        <tr>
          {profile.bufferColumns.map((buffer) => (
            <td key={buffer} className={buffer === tablePreferred ? 'is-preferred' : ''}>
              {profile.bufferActivity[buffer]}
            </td>
          ))}
          {profile.enzymeSpecificBuffer && (
            <td className="is-preferred is-enzyme-specific">{profile.enzymeSpecificBuffer}</td>
          )}
        </tr>
      </tbody>
    </table>
  )
}

const inferredActivityPanelMaxHeightPx = 360

type InferredActivityPanelPosition = {
  top: number
  left: number
}

function InferredActivityPanel({
  enzyme,
  manufacturerId,
}: {
  enzyme: RestrictionEnzyme
  manufacturerId: EnzymeManufacturerId
}) {
  const [open, setOpen] = useState(false)
  const [panelPosition, setPanelPosition] = useState<InferredActivityPanelPosition | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const source = useMemo(() => chooseInferenceSource(enzyme, manufacturerId), [enzyme, manufacturerId])
  const table = useMemo(
    () => (open ? buildInferredActivityTable(enzyme, manufacturerId) : null),
    [enzyme, manufacturerId, open],
  )

  function updatePanelPosition() {
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const width = Math.min(720, window.innerWidth - 16)
    const spaceBelow = window.innerHeight - rect.bottom - 8
    const spaceAbove = rect.top - 8
    const openBelow = spaceBelow >= 220 || spaceBelow >= spaceAbove
    const top = openBelow ? rect.bottom + 2 : Math.max(8, rect.top - inferredActivityPanelMaxHeightPx - 2)
    const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8)
    setPanelPosition({ top, left })
  }

  useLayoutEffect(() => {
    if (!open) return
    updatePanelPosition()
    window.addEventListener('resize', updatePanelPosition)
    return () => window.removeEventListener('resize', updatePanelPosition)
  }, [open, table?.rows.length])

  useEffect(() => {
    if (!open) return
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return
      setOpen(false)
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const disabled = !source
  const panel =
    open && panelPosition
      ? createPortal(
          <div
            ref={panelRef}
            className="enzyme-info-inferred-panel"
            role="dialog"
            aria-label={table?.caption ?? 'Inferred activity'}
            style={{ top: panelPosition.top, left: panelPosition.left }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="enzyme-info-inferred-panel-header">
              <div
                className="enzyme-info-inferred-caption"
                title={
                  table
                    ? `${table.caption} (${table.sourceFull})${table.doubleInferenceNote ? ` ${table.doubleInferenceNote}` : ''}`
                    : undefined
                }
              >
                {table?.caption ?? 'Inferred activity'}
              </div>
              <button
                type="button"
                className="enzyme-info-inferred-close"
                onClick={() => setOpen(false)}
                aria-label="Close inferred activity"
              >
                ×
              </button>
            </div>
            {table ? (
              <InferredActivityTable model={table} />
            ) : (
              <div className="enzyme-info-inferred-empty">Need ≥2 numeric points on a native chart.</div>
            )}
          </div>,
          document.body,
        )
      : null

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="enzyme-info-inferred-button"
        disabled={disabled}
        title={
          disabled
            ? 'Need ≥2 numeric points on a native chart'
            : `Inferred activity from ${source.name} chart`
        }
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        Inferred activity
      </button>
      {panel}
    </>
  )
}

function InferredActivityTable({ model }: { model: InferredActivityTableModel }) {
  return (
    <div className="enzyme-info-inferred-table-wrap">
      <table className="enzyme-info-inferred-table">
        <thead>
          <tr>
            <th>Manufacturer</th>
            <th>Buffer</th>
            <th>Activity</th>
            <th>Confidence</th>
            <th>Flags</th>
          </tr>
        </thead>
        <tbody>
          {model.rows.map((row) => (
            <tr key={`${row.vendorId}:${row.buffer}`} className={`is-${row.kind}`}>
              <td className="enzyme-info-inferred-clip" title={row.manufacturerFull}>
                {row.manufacturerShort}
              </td>
              <td className="enzyme-info-inferred-clip" title={row.bufferTitle}>
                {row.bufferLabel}
              </td>
              <td
                className={`enzyme-info-inferred-clip enzyme-info-inferred-activity is-${row.kind}`}
                title={row.rationale}
              >
                {row.activity}
              </td>
              <td className="enzyme-info-inferred-clip" title={row.rationale}>
                {row.confidence}
              </td>
              <td className="enzyme-info-inferred-flags" title={row.flagsTitle}>
                {row.needsAdditive ? <span title="Needs additive">+</span> : null}
                {row.starRisk ? <span title="Star-activity risk">*</span> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function LetterCodesTip({ onClose }: { onClose: () => void }) {
  const [dnaOpen, setDnaOpen] = useState(true)
  const [proteinOpen, setProteinOpen] = useState(true)

  return (
    <div className="enzyme-info-letter-codes" role="dialog" aria-label="Letter Codes">
      <button type="button" className="enzyme-info-letter-codes-close" onClick={onClose} aria-label="Close letter codes">
        ×
      </button>
      <button type="button" className="enzyme-info-letter-section-toggle" onClick={() => setDnaOpen((open) => !open)}>
        <span aria-hidden>{dnaOpen ? '▾' : '▸'}</span> DNA Letter Codes
      </button>
      {dnaOpen && (
        <div className="enzyme-info-letter-grid">
          {dnaLetterCodes.map((entry) => (
            <div key={entry.code}>
              <strong>{entry.code}</strong> = {entry.meaning}
            </div>
          ))}
        </div>
      )}
      <button type="button" className="enzyme-info-letter-section-toggle" onClick={() => setProteinOpen((open) => !open)}>
        <span aria-hidden>{proteinOpen ? '▾' : '▸'}</span> Protein Letter Codes
      </button>
      {proteinOpen && (
        <div className="enzyme-info-letter-grid enzyme-info-letter-grid-protein">
          {proteinLetterCodes.map((entry) => (
            <div key={entry.code}>
              <strong>{entry.code}</strong> = {entry.meaning}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function EnzymeInfoDialog({ initialEnzymeName, onClose }: EnzymeInfoDialogProps) {
  const [nav, setNav] = useState({ names: [initialEnzymeName], index: 0 })
  const [findQuery, setFindQuery] = useState('')
  const [listManufacturerFilter, setListManufacturerFilter] = useState<'all' | EnzymeManufacturerId>('all')
  const [manufacturerId, setManufacturerId] = useState('neb')
  const [letterCodesOpen, setLetterCodesOpen] = useState(false)
  const [mobilePane, setMobilePane] = useState<'list' | 'detail'>('detail')
  const listRef = useRef<HTMLDivElement | null>(null)

  const selectedName = nav.names[nav.index] ?? initialEnzymeName
  const enzyme = getEnzymeByName(selectedName) ?? getEnzymeByName(initialEnzymeName)
  const filteredNames = useMemo(
    () => filterCatalogEnzymeNames(findQuery, listManufacturerFilter === 'all' ? 'all' : listManufacturerFilter),
    [findQuery, listManufacturerFilter],
  )
  const listManufacturerOptions = useMemo(() => listCatalogManufacturerOptions(), [])
  const manufacturers = enzyme ? manufacturersForEnzyme(enzyme) : []
  const manufacturer = manufacturers.find((entry) => entry.id === manufacturerId) ?? manufacturers[0]
  const sameRecognition = enzyme ? sameRecognitionGroups(enzyme) : []
  const stickyEnds = enzyme ? compatibleStickyEndGroups(enzyme) : []

  useEffect(() => {
    const row = listRef.current?.querySelector<HTMLElement>('.enzyme-info-list-item.is-selected')
    row?.scrollIntoView?.({ block: 'nearest' })
  }, [selectedName])

  function navigateTo(name: string) {
    if (!getEnzymeByName(name)) return
    setMobilePane('detail')
    setNav((current) => {
      const trimmed = current.names.slice(0, current.index + 1)
      if (trimmed[trimmed.length - 1] === name) return current
      return { names: [...trimmed, name], index: trimmed.length }
    })
  }

  function goBack() {
    setNav((current) => (current.index > 0 ? { ...current, index: current.index - 1 } : current))
  }

  function goForward() {
    setNav((current) =>
      current.index < current.names.length - 1 ? { ...current, index: current.index + 1 } : current,
    )
  }

  if (!enzyme || !manufacturer) return null

  return (
    <div className="translation-dialog-backdrop enzyme-info-backdrop" role="presentation" onPointerDown={onClose}>
      <div
        className="translation-dialog enzyme-info-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`${enzyme.name} enzyme information`}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="enzyme-info-header">
          <div className="enzyme-info-nav">
            <button type="button" onClick={goBack} disabled={nav.index <= 0} aria-label="Back">
              ←
            </button>
            <button type="button" onClick={goForward} disabled={nav.index >= nav.names.length - 1} aria-label="Forward">
              →
            </button>
          </div>
          <h2>{enzyme.name}</h2>
          <div className="enzyme-info-header-actions">
            <button type="button" className="enzyme-info-letter-codes-button" onClick={() => setLetterCodesOpen((open) => !open)}>
              DNA Letter Codes
            </button>
            {letterCodesOpen && <LetterCodesTip onClose={() => setLetterCodesOpen(false)} />}
            <button type="button" className="enzyme-info-close" onClick={onClose} aria-label="Close dialog">
              ×
            </button>
          </div>
        </header>

        <MobilePaneTabs
          label="Enzyme information panes"
          panes={[
            { id: 'list', label: 'Enzymes' },
            { id: 'detail', label: 'Details' },
          ]}
          value={mobilePane}
          onChange={setMobilePane}
        />
        <div className={`enzyme-info-body mobile-pane-${mobilePane}`}>
          <aside className="enzyme-info-sidebar">
            <label className="enzyme-info-list-filter">
              <span>Manufacturer</span>
              <select
                value={listManufacturerFilter}
                onChange={(event) =>
                  setListManufacturerFilter(event.target.value as 'all' | EnzymeManufacturerId)
                }
              >
                <option value="all">All enzymes</option>
                {listManufacturerOptions.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="enzyme-info-list-count">{filteredNames.length} enzymes</div>
            <div className="enzyme-info-list" ref={listRef}>
              {filteredNames.map((name) => (
                <button
                  key={name}
                  type="button"
                  className={`enzyme-info-list-item${name === selectedName ? ' is-selected' : ''}`}
                  onClick={() => navigateTo(name)}
                >
                  {name}
                </button>
              ))}
            </div>
            <label className="enzyme-info-find">
              <span>Find:</span>
              <input value={findQuery} onChange={(event) => setFindQuery(event.target.value)} spellCheck={false} />
            </label>
          </aside>

          <div className="enzyme-info-main">
            <RecognitionDiagram enzyme={enzyme} />
            <div className="enzyme-info-meta-row">
              <span>
                <strong>Overhang Type:</strong> {formatOverhangType(enzyme)}
              </span>
              <span>
                <strong>Palindromic Recognition Sequence:</strong> {palindromeLengthBp(enzyme)} bp
              </span>
            </div>

            <div className="enzyme-info-manufacturer-row">
              <label>
                <span>Manufacturer</span>
                <select value={manufacturer.id} onChange={(event) => setManufacturerId(event.target.value)}>
                  {manufacturers.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="enzyme-info-buffer-panel">
              <div className="enzyme-info-buffer-title">{manufacturer.bufferLabel}</div>
              <BufferActivityTable profile={manufacturer} preferredBuffer={manufacturer.preferredBuffer} />
              <div className="enzyme-info-buffer-footer">
                <span>
                  <strong>Incubation Temperature:</strong> {manufacturer.incubationC}°C
                </span>
                {manufacturer.heatInactivation && (
                  <span>
                    <strong>Heat Inactivation:</strong> {manufacturer.heatInactivation}
                  </span>
                )}
                {manufacturer.bsa && (
                  <span>
                    <strong>BSA:</strong> {manufacturer.bsa}
                  </span>
                )}
                {manufacturer.doubleDigest && (
                  <span>
                    <strong>Double Digest (Tango):</strong> {manufacturer.doubleDigest}
                    {manufacturer.tango2x ? ` (2X: ${manufacturer.tango2x})` : ''}
                  </span>
                )}
                <span className="enzyme-info-buffer-footer-actions">
                  <a href={manufacturer.websiteUrl} target="_blank" rel="noreferrer">
                    Enzyme Website
                  </a>
                  <InferredActivityPanel enzyme={enzyme} manufacturerId={manufacturer.id} />
                </span>
              </div>
            </div>

            <div className="enzyme-info-secondary-row">
              <div className="enzyme-info-methylation">
                <div>
                  <strong>Dam:</strong> {manufacturer.methylation.dam}
                </div>
                <div>
                  <strong>Dcm:</strong> {manufacturer.methylation.dcm}
                </div>
                <div>
                  <strong>EcoKI:</strong> {manufacturer.methylation.ecoKI}
                </div>
              </div>
              <div className="enzyme-info-related-column">
                <RelatedEnzymeMenu
                  label="Same Recognition Sequence"
                  groups={sameRecognition}
                  onSelect={navigateTo}
                />
                <RelatedEnzymeMenu label="Compatible Sticky Ends" groups={stickyEnds} onSelect={navigateTo} />
              </div>
            </div>

            <div className="enzyme-info-tips">
              {manufacturer.tips.map((tip) => (
                <p key={tip}>{tip}</p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
