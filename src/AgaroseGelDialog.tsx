import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { CloningWorkspaceRenderArgs } from './cloningWorkspaceTypes'
import { getOpenTabSession, listOtherOpenTabs } from './crossTab/openTabs'
import {
  agaroseBandMassIntensity,
  agaroseBandStyle,
  agaroseLadderBandIntensity,
  clampGelPercent,
  digestedFragmentSelectionRange,
  DEFAULT_AGAROSE_PERCENT,
  DEFAULT_GEL_RUN_SLIDER,
  formatLadderBandLabel,
  gelMatrixPercentBounds,
  gelRunDurationFromSlider,
  layoutLadderBandLabels,
  placeDnaGelBand,
  type DigestedFragment,
  type DnaGelMatrix,
} from './domain/agaroseGel'
import {
  AGAROSE_GEL_MAX_CUT_SLOTS,
  AGAROSE_GEL_MAX_LANE_COUNT,
  agaroseGelLaneCountForSamples,
  lastOccupiedGelSampleLaneIndex,
  listAgaroseGelMemberSources,
  padAgaroseGelEnzymeSlots,
  type AgaroseGelDnaSource,
} from './domain/agaroseGelLibrary'
import { isDnaLibraryRecord } from './domain/dnaLibrary'
import { defaultMwLadderId } from './domain/mwLadderFavorites'
import { mwLadderMaxMass } from './domain/mwLadders'
import { enzymes, findRestrictionSites } from './domain/enzymes'
import { listCatalogEnzymeNames } from './domain/enzymeCatalog'
import { SEQUENCE_OPEN_ACCEPT } from './domain/fileFormats'
import { isSnapGeneBytes, parseSequenceBytes, parseSnapGene } from './domain/parsers'
import { addOperation } from './domain/sequence'
import { bytesToFile, subscribeDesktopFileDrops } from './desktop/fileIo'
import { isTauriRuntime } from './desktop/tauriRuntime'
import { DatabaseConstructPickerDialog } from './cloning/DatabaseConstructPickerDialog'
import { GelLibraryMemberPickerDialog } from './components/GelLibraryMemberPickerDialog'
import { MwLadderPicker } from './MwLadderPicker'
import { absentGelDigestEnzymes, uniqueAgaroseGelOpenSources } from './domain/agaroseGelSourceSearch'
import type { Primer, RestrictionSite, SequenceRecord } from './domain/types'
import { MobilePaneTabs } from './ui/MobilePaneTabs'
import { useMobileShellViewport } from './ui/mobileShellMedia'
import { loadMwLadderFavorites, resolveStoredMwLadder } from './storage/mwLadderFavorites'
import {
  createEmptyGelSample,
  createInitialGelLanes,
  enzymesUseLabel,
  gelSourcesFromRecord,
  listFirstPcrPrimerOptions,
  listGelLaneBands,
  listGelLaneFragments,
  listSecondPcrPrimerOptions,
  type GelDigestMode,
  type GelLane,
  type GelSampleLane,
} from './application/agaroseGel/agaroseGelLanePlanning'
import {
  createAgaroseGelExportController,
  createDefaultAgaroseGelExportBrowserPort,
  createUnavailableAgaroseGelExportController,
} from './presentation/hooks/useAgaroseGelExportController'

const MAX_CUT_SLOTS = AGAROSE_GEL_MAX_CUT_SLOTS
const DEFAULT_LANE_COUNT = 10
const DEFAULT_SIDEBAR_WIDTH_PX = 520
const MIN_SIDEBAR_WIDTH_PX = 280
const MIN_MAIN_WIDTH_PX = 320
/** Fixed pitch per gel lane — more lanes widen the gel instead of compressing. */
const GEL_LANE_PITCH_PX = 36
const GEL_LANE_WIDTH_PX = 26
/** Space for MW size labels + leader stubs left of the gel slab. */
const GEL_LABEL_COLUMN_RIGHT_PX = 46
const GEL_LEADER_STUB_PX = 10
const GEL_LEFT_PAD_PX = 78
const GEL_RUN_CONTROL_COL_PX = 50
const GEL_SIDEBAR_CHROME_PX = 24
const DEFAULT_GEL_VIEW_HEIGHT_PX = 340
const MIN_GEL_VIEW_HEIGHT_PX = 180
const MIN_LANE_LIST_HEIGHT_PX = 72
const MW_LABEL_MIN_GAP_PX = 11

function sidebarWidthForLaneCount(count: number): number {
  const gelContentWidth = GEL_LEFT_PAD_PX + Math.max(1, count) * GEL_LANE_PITCH_PX + 16
  return gelContentWidth + GEL_RUN_CONTROL_COL_PX + GEL_SIDEBAR_CHROME_PX
}

type SourceOption =
  | { kind: 'current'; label: string; record: SequenceRecord }
  | { kind: 'open-tab'; label: string; tabId: string; record: SequenceRecord }

function sourceOptionValue(option: SourceOption): string {
  return option.kind === 'open-tab' ? `open-tab:${option.tabId}` : `current:${option.record.id}`
}

type AgaroseGelDialogProps = {
  currentRecord: SequenceRecord
  currentTabId: string
  /** Prefill sample lanes; defaults to current construct. */
  initialSamples?: AgaroseGelDnaSource[]
  /** Extra DNA sources from the opening DNA library. */
  libraryMemberSources?: AgaroseGelDnaSource[]
  /** Override label for the current-window construct in the picker. */
  currentSourceLabel?: string
  onClose: () => void
  renderWorkspace: (args: CloningWorkspaceRenderArgs) => ReactNode
}

type LibraryMemberPickState = {
  libraryName: string
  members: AgaroseGelDnaSource[]
  mode: 'single' | 'multiple'
  title?: string
  confirmLabel?: string
  onConfirm: (selected: AgaroseGelDnaSource[]) => void
}

type GelFooterMenu = 'print' | 'export' | null

function sizeDialogToMainPane(dialog: HTMLElement) {
  const panes = document.querySelectorAll('.snapgene-body .workspace .tab-content .view-main')
  let pane: HTMLElement | null = null
  for (const candidate of panes) {
    if (!(candidate instanceof HTMLElement)) continue
    if (candidate.closest('.tab-panel-hidden')) continue
    const rect = candidate.getBoundingClientRect()
    if (rect.width < 40 || rect.height < 40) continue
    pane = candidate
    break
  }
  if (!pane) return
  const rect = pane.getBoundingClientRect()
  const maxWidth = Math.max(320, window.innerWidth - 24)
  const maxHeight = Math.max(240, window.innerHeight - 24)
  dialog.style.width = `${Math.min(maxWidth, Math.max(720, Math.round(rect.width) + 280))}px`
  dialog.style.height = `${Math.min(maxHeight, Math.max(480, Math.round(rect.height) + 40))}px`
}

function useStableCallback<Args extends readonly unknown[], Result>(callback: (...args: Args) => Result) {
  const callbackRef = useRef(callback)
  useEffect(() => {
    callbackRef.current = callback
  }, [callback])
  return useCallback((...args: Args) => callbackRef.current(...args), [])
}

export function AgaroseGelDialog({
  currentRecord,
  currentTabId,
  initialSamples,
  libraryMemberSources = [],
  currentSourceLabel,
  onClose,
  renderWorkspace,
}: AgaroseGelDialogProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const layoutRef = useRef<HTMLDivElement | null>(null)
  const sidebarRef = useRef<HTMLElement | null>(null)
  const gelCanvasRef = useRef<HTMLDivElement | null>(null)
  const splitDragRef = useRef<{ startX: number; startWidth: number } | null>(null)
  const gelHeightDragRef = useRef<{ startY: number; startHeight: number } | null>(null)
  const multiFileInputRef = useRef<HTMLInputElement | null>(null)
  const bulkAddMenuRef = useRef<HTMLDivElement | null>(null)
  const [libraryMemberPick, setLibraryMemberPick] = useState<LibraryMemberPickState | null>(null)
  const [bulkAddMenuOpen, setBulkAddMenuOpen] = useState(false)
  const [bulkDatabasePickOpen, setBulkDatabasePickOpen] = useState(false)
  const isMobileShell = useMobileShellViewport()
  const [mobilePane, setMobilePane] = useState<'gel' | 'lanes' | 'setup'>('gel')
  const seedSamples = useMemo<AgaroseGelDnaSource[]>(() => {
    // Explicit empty list (e.g. startup with no construct) starts a blank gel.
    if (initialSamples !== undefined) return initialSamples
    return [{
      label: currentSourceLabel ?? `${currentRecord.name} (this window)`,
      record: currentRecord,
    }]
  }, [currentRecord, currentSourceLabel, initialSamples])
  const seedLaneCount = agaroseGelLaneCountForSamples(seedSamples.length, DEFAULT_LANE_COUNT)
  const [laneCount, setLaneCount] = useState(seedLaneCount)
  const [gelMatrix, setGelMatrix] = useState<DnaGelMatrix>('agarose')
  const [gelPercent, setGelPercent] = useState(DEFAULT_AGAROSE_PERCENT)
  const [lanes, setLanes] = useState<GelLane[]>(() => createInitialGelLanes(seedSamples, seedLaneCount, defaultMwLadderId(loadMwLadderFavorites())))
  const [selectedLaneIndexes, setSelectedLaneIndexes] = useState<number[]>(() => [1])
  const [laneSelectionAnchor, setLaneSelectionAnchor] = useState<number | null>(1)
  const activeLaneIndex = selectedLaneIndexes.length > 0
    ? selectedLaneIndexes[selectedLaneIndexes.length - 1]!
    : null
  const [openTabs, setOpenTabs] = useState<{ tabId: string; name: string; record: SequenceRecord }[]>([])
  const [workspaceSites, setWorkspaceSites] = useState<RestrictionSite[]>([])
  const [sidebarWidthPx, setSidebarWidthPx] = useState(() =>
    Math.max(DEFAULT_SIDEBAR_WIDTH_PX, sidebarWidthForLaneCount(seedLaneCount)),
  )
  const [gelViewHeightPx, setGelViewHeightPx] = useState(DEFAULT_GEL_VIEW_HEIGHT_PX)
  const [gelCanvasSize, setGelCanvasSize] = useState({ width: 480, height: DEFAULT_GEL_VIEW_HEIGHT_PX })
  const [runSlider, setRunSlider] = useState(DEFAULT_GEL_RUN_SLIDER)
  /** Selected digest fragment id per sample lane index. */
  const [selectedFragmentByLane, setSelectedFragmentByLane] = useState<Record<number, string | null>>({})
  /** Independent expand state for lane detail spoilers (not tied to selection). */
  const [expandedLanes, setExpandedLanes] = useState<Record<number, boolean>>(() => ({ 1: true }))
  const [footerMenu, setFooterMenu] = useState<GelFooterMenu>(null)
  const [exportFormatChooser, setExportFormatChooser] = useState<'normal' | 'inverted' | null>(null)
  const [workspaceDragActive, setWorkspaceDragActive] = useState(false)
  const footerMenuRef = useRef<HTMLDivElement | null>(null)
  const workspaceDragDepthRef = useRef(0)
  const exportBrowser = useMemo(
    () => typeof document === 'undefined' ? null : createDefaultAgaroseGelExportBrowserPort(),
    [],
  )
  const getGelSvg = useStableCallback(() => {
    const source = gelCanvasRef.current?.querySelector('svg')
    return source instanceof SVGSVGElement ? source : null
  })
  const exportController = useMemo(
    () => exportBrowser ? createAgaroseGelExportController({
      getSourceSvg: getGelSvg,
      currentRecordName: currentRecord.name,
      lanes,
      gelPercent,
      gelMatrix,
      resolveLadder: resolveStoredMwLadder,
      setExpandedLanes,
      browser: exportBrowser,
    }) : createUnavailableAgaroseGelExportController(),
    [currentRecord.name, exportBrowser, gelMatrix, gelPercent, getGelSvg, lanes],
  )
  const lanePlans = useMemo(() => lanes.map((lane) => lane.kind === 'sample'
    ? (() => { const fragments = listGelLaneFragments(lane); return { kind: 'sample' as const, fragments, bands: fragments } })()
    : { kind: 'mw' as const, bands: listGelLaneBands(lane, resolveStoredMwLadder) }), [lanes])
  useEffect(() => {
    if (!footerMenu) return
    const onPointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (footerMenuRef.current?.contains(target)) return
      setFooterMenu(null)
      setExportFormatChooser(null)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setFooterMenu(null)
        setExportFormatChooser(null)
      }
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [footerMenu])

  useEffect(() => {
    if (!bulkAddMenuOpen) return
    const onPointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (bulkAddMenuRef.current?.contains(target)) return
      setBulkAddMenuOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setBulkAddMenuOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [bulkAddMenuOpen])

  useLayoutEffect(() => {
    if (dialogRef.current) sizeDialogToMainPane(dialogRef.current)
  }, [])

  useEffect(() => {
    const onPointerMove = (event: globalThis.PointerEvent) => {
      const widthDrag = splitDragRef.current
      if (widthDrag) {
        const layoutWidth = layoutRef.current?.clientWidth ?? window.innerWidth
        const maxSidebar = Math.max(
          MIN_SIDEBAR_WIDTH_PX,
          layoutWidth - MIN_MAIN_WIDTH_PX - 8,
        )
        const nextWidth = Math.max(
          MIN_SIDEBAR_WIDTH_PX,
          Math.min(maxSidebar, widthDrag.startWidth + (event.clientX - widthDrag.startX)),
        )
        setSidebarWidthPx(nextWidth)
      }
      const heightDrag = gelHeightDragRef.current
      if (heightDrag) {
        const sidebarHeight = sidebarRef.current?.clientHeight ?? 600
        const reservedBelow = 160
        const maxHeight = Math.max(
          MIN_GEL_VIEW_HEIGHT_PX,
          sidebarHeight - reservedBelow - MIN_LANE_LIST_HEIGHT_PX,
        )
        const nextHeight = Math.max(
          MIN_GEL_VIEW_HEIGHT_PX,
          Math.min(maxHeight, heightDrag.startHeight + (event.clientY - heightDrag.startY)),
        )
        setGelViewHeightPx(nextHeight)
      }
    }
    const onPointerUp = () => {
      splitDragRef.current = null
      gelHeightDragRef.current = null
      document.body.classList.remove('agarose-gel-resizing', 'agarose-gel-resizing-y')
    }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      document.body.classList.remove('agarose-gel-resizing', 'agarose-gel-resizing-y')
    }
  }, [])

  useEffect(() => {
    const host = gelCanvasRef.current
    if (!host || typeof ResizeObserver === 'undefined') return
    const update = () => {
      setGelCanvasSize({
        width: Math.max(160, host.clientWidth),
        height: Math.max(160, host.clientHeight),
      })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(host)
    return () => observer.disconnect()
  }, [gelViewHeightPx])

  function startSidebarSplitDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (isMobileShell) return
    event.preventDefault()
    splitDragRef.current = { startX: event.clientX, startWidth: sidebarWidthPx }
    document.body.classList.add('agarose-gel-resizing')
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function startGelHeightSplitDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (isMobileShell) return
    event.preventDefault()
    gelHeightDragRef.current = { startY: event.clientY, startHeight: gelViewHeightPx }
    document.body.classList.add('agarose-gel-resizing-y')
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const tabs = await listOtherOpenTabs(currentTabId)
      if (cancelled) return
      const tabSessions = await Promise.all(
        tabs.map(async (tab) => {
          const session = await getOpenTabSession(tab.tabId)
          return session ? { tabId: tab.tabId, name: session.name, record: session.record } : null
        }),
      )
      setOpenTabs(tabSessions.filter((tab): tab is NonNullable<typeof tab> => Boolean(tab)))
    })()
    return () => {
      cancelled = true
    }
  }, [currentRecord, currentTabId])

  const sourceOptions = useMemo<SourceOption[]>(() => {
    const current: SourceOption = {
      kind: 'current',
      label: currentSourceLabel ?? `${currentRecord.name} (this window)`,
      record: currentRecord,
    }
    const availableOpenTabs = uniqueAgaroseGelOpenSources(
      openTabs.map((tab) => ({
        kind: 'open-tab',
        label: `${tab.name} (open tab)`,
        tabId: tab.tabId,
        record: tab.record,
      } as const)),
      currentRecord.id,
    )
    return [current, ...availableOpenTabs]
  }, [currentRecord, currentSourceLabel, openTabs])

  function resizeLanes(nextLaneCount: number) {
    setLaneCount(nextLaneCount)
    setSidebarWidthPx((current) => Math.max(current, sidebarWidthForLaneCount(nextLaneCount)))
    setLanes((current) => {
      if (current.length === nextLaneCount) return current
      if (current.length < nextLaneCount) {
        const next = [...current]
        while (next.length < nextLaneCount) next.push(createEmptyGelSample())
        return next
      }
      const trimmed = current.slice(0, nextLaneCount)
      if (!trimmed.some((lane) => lane.kind === 'mw')) {
        return [{ kind: 'mw', ladderId: defaultMwLadderId(loadMwLadderFavorites()) }, ...trimmed.slice(1)]
      }
      return trimmed
    })
    setSelectedLaneIndexes((indexes) => {
      const max = Math.max(0, nextLaneCount - 1)
      const next = indexes.map((index) => Math.min(index, max)).filter((index, pos, all) => all.indexOf(index) === pos)
      return next
    })
    setLaneSelectionAnchor((anchor) => (anchor == null ? null : Math.min(anchor, Math.max(0, nextLaneCount - 1))))
  }

  const activeLane = activeLaneIndex != null ? lanes[activeLaneIndex] ?? null : null
  const activeSample = activeLane?.kind === 'sample' ? activeLane : null
  const activeSourceOption = sourceOptions.find((option) => option.record.id === activeSample?.record?.id)
  const selectedSampleLaneIndexes = useMemo(
    () => selectedLaneIndexes.filter((index) => lanes[index]?.kind === 'sample'),
    [lanes, selectedLaneIndexes],
  )
  const multiSampleSelection = selectedSampleLaneIndexes.length > 1

  function setExclusiveLane(laneIndex: number | null) {
    if (laneIndex == null) {
      setSelectedLaneIndexes([])
      setLaneSelectionAnchor(null)
      return
    }
    setSelectedLaneIndexes([laneIndex])
    setLaneSelectionAnchor(laneIndex)
  }

  const updateActiveSample = useCallback((patch: Partial<GelSampleLane>) => {
    setLanes((current) =>
      current.map((lane, index) => {
        if (activeLaneIndex == null || index !== activeLaneIndex || lane.kind !== 'sample') return lane
        return { ...lane, ...patch }
      }),
    )
  }, [activeLaneIndex, setLanes])

  const updateSelectedSampleLanes = useCallback((patch: Partial<GelSampleLane>) => {
    setLanes((current) => {
      const targets = new Set(
        selectedLaneIndexes.filter((index) => current[index]?.kind === 'sample'),
      )
      if (targets.size === 0 && activeLaneIndex != null) targets.add(activeLaneIndex)
      return current.map((lane, index) => {
        if (!targets.has(index) || lane.kind !== 'sample') return lane
        return { ...lane, ...patch }
      })
    })
  }, [activeLaneIndex, selectedLaneIndexes, setLanes])

  function clearFragmentForLane(laneIndex: number | null) {
    if (laneIndex == null) return
    setSelectedFragmentByLane((current) => ({ ...current, [laneIndex]: null }))
  }

  function clearFragmentsForLanes(laneIndexes: number[]) {
    if (laneIndexes.length === 0) return
    setSelectedFragmentByLane((current) => {
      const next = { ...current }
      for (const index of laneIndexes) next[index] = null
      return next
    })
  }

  /** Click a lane; ⌘/Ctrl toggles, Shift selects a sample range. */
  function selectLane(
    laneIndex: number,
    event?: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean; preventDefault?: () => void },
  ) {
    if (event?.shiftKey || event?.metaKey || event?.ctrlKey) {
      event.preventDefault?.()
      window.getSelection()?.removeAllRanges()
    }
    const lane = lanes[laneIndex]
    if (!lane) return
    const shift = Boolean(event?.shiftKey)
    const toggle = Boolean(event?.metaKey || event?.ctrlKey)

    if (lane.kind === 'mw') {
      if (!shift && !toggle && selectedLaneIndexes.length === 1 && selectedLaneIndexes[0] === laneIndex) {
        setExclusiveLane(null)
        clearFragmentForLane(laneIndex)
        return
      }
      setExclusiveLane(laneIndex)
      return
    }

    if (shift && laneSelectionAnchor != null) {
      const lo = Math.min(laneSelectionAnchor, laneIndex)
      const hi = Math.max(laneSelectionAnchor, laneIndex)
      const range: number[] = []
      for (let index = lo; index <= hi; index += 1) {
        if (lanes[index]?.kind === 'sample') range.push(index)
      }
      setSelectedLaneIndexes(range.length > 0 ? range : [laneIndex])
      return
    }

    if (toggle) {
      setSelectedLaneIndexes((current) => {
        const sampleOnly = current.filter((index) => lanes[index]?.kind === 'sample')
        if (sampleOnly.includes(laneIndex)) {
          return sampleOnly.filter((index) => index !== laneIndex)
        }
        return [...sampleOnly, laneIndex]
      })
      setLaneSelectionAnchor(laneIndex)
      return
    }

    if (selectedLaneIndexes.length === 1 && selectedLaneIndexes[0] === laneIndex) {
      setExclusiveLane(null)
      clearFragmentForLane(laneIndex)
      return
    }
    setExclusiveLane(laneIndex)
  }

  function toggleLaneExpanded(laneIndex: number) {
    setExpandedLanes((current) => ({
      ...current,
      [laneIndex]: !current[laneIndex],
    }))
  }

  function ensureLaneExpanded(laneIndex: number) {
    setExpandedLanes((current) => (current[laneIndex] ? current : { ...current, [laneIndex]: true }))
  }

  function applySourceToLane(laneIndex: number, source: AgaroseGelDnaSource) {
    setLanes((current) =>
      current.map((lane, index) => {
        if (index !== laneIndex || lane.kind !== 'sample') return lane
        return {
          ...lane,
          record: source.record,
          sourceLabel: source.label,
          enzymeNames: ['', '', '', ''],
          primerIds: [],
        }
      }),
    )
    setExclusiveLane(laneIndex)
    ensureLaneExpanded(laneIndex)
    setSelectedFragmentByLane((current) => ({ ...current, [laneIndex]: null }))
  }

  const placeSourcesOnSuccessiveLanes = useCallback((sources: AgaroseGelDnaSource[]) => {
    if (sources.length === 0) return
    let last = lastOccupiedGelSampleLaneIndex(lanes)
    const next = [...lanes]
    const placedIndexes: number[] = []
    for (const source of sources) {
      let target = last + 1
      while (target < next.length && next[target]?.kind !== 'sample') target += 1
      if (target >= next.length) {
        if (next.length >= AGAROSE_GEL_MAX_LANE_COUNT) break
        next.push(createEmptyGelSample())
        target = next.length - 1
      }
      const lane = next[target]
      if (!lane || lane.kind !== 'sample') continue
      next[target] = {
        ...lane,
        record: source.record,
        sourceLabel: source.label,
        enzymeNames: ['', '', '', ''],
        primerIds: [],
      }
      last = target
      placedIndexes.push(target)
    }
    if (placedIndexes.length === 0) {
      window.alert('No free sample lanes left (gel is full).')
      return
    }
    setLanes(next)
    setLaneCount(next.length)
    setSidebarWidthPx((current) => Math.max(current, sidebarWidthForLaneCount(next.length)))
    const focus = placedIndexes[0]!
    setSelectedLaneIndexes([focus])
    setLaneSelectionAnchor(focus)
    setExpandedLanes((current) => (current[focus] ? current : { ...current, [focus]: true }))
    setSelectedFragmentByLane((fragmentState) => {
      const updated = { ...fragmentState }
      for (const index of placedIndexes) updated[index] = null
      return updated
    })
  }, [lanes, setExpandedLanes, setLaneCount, setLaneSelectionAnchor, setLanes, setSelectedFragmentByLane, setSelectedLaneIndexes, setSidebarWidthPx])

  function openLibraryMemberPick(options: {
    library: SequenceRecord
    mode: 'single' | 'multiple'
    title?: string
    confirmLabel?: string
    onConfirm: (selected: AgaroseGelDnaSource[]) => void
  }) {
    const members = listAgaroseGelMemberSources(options.library)
    if (members.length === 0) {
      window.alert(`“${options.library.name}” has no sequence members to load onto the gel.`)
      return
    }
    if (options.mode === 'single' && members.length === 1) {
      options.onConfirm(members)
      return
    }
    setLibraryMemberPick({
      libraryName: options.library.name,
      members,
      mode: options.mode,
      title: options.title,
      confirmLabel: options.confirmLabel,
      onConfirm: options.onConfirm,
    })
  }

  function assignSource(option: SourceOption) {
    const record = option.record
    if (isDnaLibraryRecord(record)) {
      if (activeLaneIndex == null || activeLane?.kind !== 'sample') return
      const laneIndex = activeLaneIndex
      openLibraryMemberPick({
        library: record,
        mode: 'single',
        onConfirm: (selected) => {
          const member = selected[0]
          if (!member) return
          applySourceToLane(laneIndex, member)
          setLibraryMemberPick(null)
        },
      })
      return
    }
    updateActiveSample({
      record,
      sourceLabel: option.label,
      enzymeNames: ['', '', '', ''],
      primerIds: [],
    })
    setSelectedFragmentByLane((current) => ({ ...current, ...(activeLaneIndex != null ? { [activeLaneIndex]: null } : {}) }))
    if (activeLaneIndex != null) ensureLaneExpanded(activeLaneIndex)
  }

  const parseConstructFile = useCallback(async (file: File): Promise<SequenceRecord> => {
    const buffer = await file.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    const parsed = isSnapGeneBytes(bytes)
      ? parseSnapGene(bytes, file.name)
      : parseSequenceBytes(buffer, file.name)
    const imported = addOperation(parsed, 'import', `Imported ${file.name} for gel.`)
    if (!imported.traceFiles?.length) return imported
    return {
      ...imported,
      traceFiles: imported.traceFiles.map((member) => ({
        ...member,
        chromatogram: { aTrace: [], tTrace: [], gTrace: [], cTrace: [], basePos: [], baseCalls: [] },
        alignment: null,
        expanded: false,
      })),
    }
  }, [])

  async function importConstructFileToLane(file: File, laneIndex: number) {
    try {
      const imported = await parseConstructFile(file)
      if (isDnaLibraryRecord(imported)) {
        openLibraryMemberPick({
          library: imported,
          mode: 'single',
          onConfirm: (selected) => {
            const member = selected[0]
            if (!member) return
            applySourceToLane(laneIndex, member)
            setLibraryMemberPick(null)
          },
        })
        return
      }
      applySourceToLane(laneIndex, { label: `${imported.name} (imported)`, record: imported })
    } catch (error) {
      window.alert(`Could not import construct: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const importMultipleConstructFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return
    const sources: AgaroseGelDnaSource[] = []
    const errors: string[] = []
    for (const file of files) {
      try {
        const imported = await parseConstructFile(file)
        if (isDnaLibraryRecord(imported)) {
          const members = listAgaroseGelMemberSources(imported)
          if (members.length === 0) errors.push(`${file.name}: library has no sequence members`)
          else sources.push(...members)
        } else sources.push({ label: `${imported.name} (imported)`, record: imported })
      } catch (error) {
        errors.push(`${file.name}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    if (sources.length > 0) placeSourcesOnSuccessiveLanes(sources)
    else if (errors.length === 0) window.alert('No DNA sequences were available to add to the gel.')
    if (errors.length > 0) window.alert(`Could not import ${errors.length} file(s):\n${errors.slice(0, 5).join('\n')}`)
    if (multiFileInputRef.current) multiFileInputRef.current.value = ''
  }, [parseConstructFile, placeSourcesOnSuccessiveLanes])

  async function importConstructFile(file: File) {
    const targetLaneIndex =
      activeLane?.kind === 'sample' && activeLaneIndex != null
        ? activeLaneIndex
        : lanes.findIndex((lane) => lane.kind === 'sample')
    if (targetLaneIndex < 0) {
      window.alert('No sample lane is available to load this construct into.')
      return
    }
    await importConstructFileToLane(file, targetLaneIndex)
  }

  const importConstructFileHandler = useStableCallback(importConstructFile)
  const importMultipleConstructFilesHandler = useStableCallback(importMultipleConstructFiles)

  // Tauri webviews swallow HTML5 OS file drops; use the native drag-drop API instead.
  useEffect(() => {
    if (!isTauriRuntime()) return
    let cancelled = false
    let unlisten: (() => void) | undefined
    void subscribeDesktopFileDrops({
      onHoverChange: (active) => {
        if (!cancelled) setWorkspaceDragActive(active)
      },
      onFiles: async (files) => {
        if (files.length > 1) {
          await importMultipleConstructFilesHandler(files.map((entry) => bytesToFile(entry.name, entry.bytes)))
          return
        }
        const first = files[0]
        if (!first) return
        await importConstructFileHandler(bytesToFile(first.name, first.bytes))
      },
    }).then((stop) => {
      if (cancelled) {
        stop()
        return
      }
      unlisten = stop
    })
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [importConstructFileHandler, importMultipleConstructFilesHandler])

  function placeRecordsFromDatabase(records: SequenceRecord[]) {
    const sources = records.flatMap((record) =>
      gelSourcesFromRecord(record, `${record.name} (saved)`),
    )
    if (sources.length === 0) {
      window.alert('No DNA sequences were available to add to the gel.')
      return
    }
    placeSourcesOnSuccessiveLanes(sources)
    setBulkDatabasePickOpen(false)
  }

  function workspaceDragHasFiles(event: ReactDragEvent) {
    return Array.from(event.dataTransfer?.types ?? []).includes('Files')
  }

  function handleWorkspaceDragEnter(event: ReactDragEvent<HTMLDivElement>) {
    // In Tauri, OS file drops use the native API — HTML5 handlers never see them.
    if (isTauriRuntime() || !workspaceDragHasFiles(event)) return
    event.preventDefault()
    event.stopPropagation()
    workspaceDragDepthRef.current += 1
    setWorkspaceDragActive(true)
  }

  function handleWorkspaceDragOver(event: ReactDragEvent<HTMLDivElement>) {
    if (isTauriRuntime() || !workspaceDragHasFiles(event)) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'copy'
  }

  function handleWorkspaceDragLeave(event: ReactDragEvent<HTMLDivElement>) {
    if (isTauriRuntime() || !workspaceDragHasFiles(event)) return
    event.preventDefault()
    event.stopPropagation()
    workspaceDragDepthRef.current = Math.max(0, workspaceDragDepthRef.current - 1)
    if (workspaceDragDepthRef.current === 0) setWorkspaceDragActive(false)
  }

  function handleWorkspaceDrop(event: ReactDragEvent<HTMLDivElement>) {
    if (isTauriRuntime()) return
    event.preventDefault()
    event.stopPropagation()
    workspaceDragDepthRef.current = 0
    setWorkspaceDragActive(false)
    const files = Array.from(event.dataTransfer.files ?? [])
    if (files.length > 1) {
      void importMultipleConstructFiles(files)
      return
    }
    const file = files[0]
    if (file) void importConstructFile(file)
  }

  const cutEnzymeOptions = useMemo(() => {
    const selectedNames = activeSample?.enzymeNames.filter(Boolean) ?? []
    if (!activeSample?.record) {
      return listCatalogEnzymeNames().map((name) => ({ name, count: null as number | null }))
    }
    const counts = new Map<string, number | null>()
    if (workspaceSites.length === 0) {
      for (const name of listCatalogEnzymeNames()) counts.set(name, null)
    } else {
      for (const site of workspaceSites) {
        counts.set(site.enzyme.name, (counts.get(site.enzyme.name) ?? 0) + 1)
      }
    }
    for (const name of selectedNames) {
      if (!counts.has(name)) counts.set(name, null)
    }
    return [...counts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ name, count }))
  }, [activeSample?.enzymeNames, activeSample?.record, workspaceSites])

  const selectedDigestSites = useMemo(() => {
    if (!activeSample?.record) return [] as RestrictionSite[]
    const names = new Set(activeSample.enzymeNames.filter(Boolean))
    if (names.size === 0) return []
    const pool = enzymes.filter((enzyme) => names.has(enzyme.name))
    return findRestrictionSites(activeSample.record.sequence, pool, {
      construct: activeSample.record.construct,
      topology: activeSample.record.topology,
    })
  }, [activeSample])

  const absentSelectedEnzymes = useMemo(() => absentGelDigestEnzymes(
    activeSample?.enzymeNames ?? [],
    selectedDigestSites.map((site) => site.enzyme.name),
  ), [activeSample?.enzymeNames, selectedDigestSites])

  function setLaneEnzymeNames(names: string[]) {
    const padded = padAgaroseGelEnzymeSlots(names)
    updateSelectedSampleLanes({ digestMode: 'cut', enzymeNames: padded })
    clearFragmentsForLanes(selectedSampleLaneIndexes)
  }

  function handleGelEnzymeSelect(site: RestrictionSite, extendSelection: boolean) {
    if (!activeSample?.record) return
    if (!multiSampleSelection && activeSample.digestMode !== 'cut') return
    const enzymeName = site.enzyme.name
    const current = activeSample.enzymeNames.filter(Boolean)

    if (!extendSelection) {
      setLaneEnzymeNames([enzymeName])
      return
    }

    if (current.includes(enzymeName)) {
      setLaneEnzymeNames(current.filter((name) => name !== enzymeName))
      return
    }

    if (current.length < MAX_CUT_SLOTS) {
      setLaneEnzymeNames([...current, enzymeName])
      return
    }

    setLaneEnzymeNames([...current.slice(0, MAX_CUT_SLOTS - 1), enzymeName])
  }

  function setLaneDigestMode(mode: GelDigestMode) {
    if (!activeSample) return
    if (mode === 'cut' && multiSampleSelection) {
      updateSelectedSampleLanes({ digestMode: 'cut' })
      clearFragmentsForLanes(selectedSampleLaneIndexes)
      return
    }
    updateActiveSample({ digestMode: mode })
    clearFragmentForLane(activeLaneIndex)
  }

  const firstPcrPrimerOptions = useMemo(() => {
    if (!activeSample?.record || activeSample.digestMode !== 'pcr') return [] as Primer[]
    return listFirstPcrPrimerOptions(activeSample.record)
  }, [activeSample])

  const firstPcrPrimerId = activeSample?.digestMode === 'pcr' ? (activeSample.primerIds[0] ?? '') : ''
  const secondPcrPrimerId = activeSample?.digestMode === 'pcr' ? (activeSample.primerIds[1] ?? '') : ''

  const secondPcrPrimerOptions = useMemo(() => {
    if (!activeSample?.record || activeSample.digestMode !== 'pcr' || !firstPcrPrimerId) {
      return [] as Primer[]
    }
    return listSecondPcrPrimerOptions(activeSample.record, firstPcrPrimerId)
  }, [activeSample, firstPcrPrimerId])

  function setPcrPrimerSlot(slot: 0 | 1, primerId: string) {
    if (!activeSample?.record || activeSample.digestMode !== 'pcr') return
    if (slot === 0) {
      if (!primerId) {
        updateActiveSample({ primerIds: [] })
        clearFragmentForLane(activeLaneIndex)
        return
      }
      const partners = listSecondPcrPrimerOptions(activeSample.record, primerId)
      const keepSecond =
        activeSample.primerIds[1] && partners.some((primer) => primer.id === activeSample.primerIds[1])
          ? activeSample.primerIds[1]!
          : null
      updateActiveSample({ primerIds: keepSecond ? [primerId, keepSecond] : [primerId] })
      clearFragmentForLane(activeLaneIndex)
      return
    }
    if (!firstPcrPrimerId) return
    if (!primerId) {
      updateActiveSample({ primerIds: [firstPcrPrimerId] })
      clearFragmentForLane(activeLaneIndex)
      return
    }
    updateActiveSample({ primerIds: [firstPcrPrimerId, primerId] })
    clearFragmentForLane(activeLaneIndex)
  }

  function handleGelPrimerSelect(primerId: string, extendSelection: boolean) {
    if (!activeSample?.record || activeSample.digestMode !== 'pcr') return
    const current = activeSample.primerIds.filter((id) =>
      activeSample.record!.primers.some((primer) => primer.id === id),
    )

    if (!extendSelection) {
      setPcrPrimerSlot(0, primerId)
      return
    }

    if (current.includes(primerId)) {
      if (current[0] === primerId) {
        updateActiveSample({ primerIds: [] })
      } else {
        updateActiveSample({ primerIds: current.filter((id) => id !== primerId) })
      }
      clearFragmentForLane(activeLaneIndex)
      return
    }

    if (current.length === 0) {
      setPcrPrimerSlot(0, primerId)
      return
    }

    if (current.length === 1) {
      const partners = listSecondPcrPrimerOptions(activeSample.record, current[0]!)
      if (partners.some((primer) => primer.id === primerId)) {
        setPcrPrimerSlot(1, primerId)
        return
      }
      // Incompatible as second: treat as new first primer.
      setPcrPrimerSlot(0, primerId)
      return
    }

    // Already have a pair — replace second if compatible with first, else start new pair.
    const partners = listSecondPcrPrimerOptions(activeSample.record, current[0]!)
    if (partners.some((primer) => primer.id === primerId)) {
      setPcrPrimerSlot(1, primerId)
      return
    }
    setPcrPrimerSlot(0, primerId)
  }

  const runDuration = gelRunDurationFromSlider(runSlider)

  const gelTop = 36
  const svgHeight = Math.max(160, gelCanvasSize.height)
  const gelBottom = Math.max(gelTop + 80, svgHeight - 24)
  const leftPad = GEL_LEFT_PAD_PX
  const laneWidth = GEL_LANE_WIDTH_PX
  const laneGap = GEL_LANE_PITCH_PX - GEL_LANE_WIDTH_PX
  const svgWidth = leftPad + lanes.length * GEL_LANE_PITCH_PX + 12

  const mwLabelLayouts = useMemo(() => {
    const mwLane = lanes.find((lane) => lane.kind === 'mw')
    if (!mwLane || mwLane.kind !== 'mw') return []
    const ladder = resolveStoredMwLadder(mwLane.ladderId)
    const inputs = []
    for (const fragment of ladder.fragments) {
      if (fragment.format === 'hidden') continue
      const placement = placeDnaGelBand(fragment.lengthBp, gelTop, gelBottom, gelPercent, runDuration, gelMatrix)
      if (placement.y === null) continue
      inputs.push({
        lengthBp: fragment.lengthBp,
        bandY: placement.y,
        isMajor: fragment.format === 'bold',
      })
    }
    return layoutLadderBandLabels(inputs, {
      minGap: MW_LABEL_MIN_GAP_PX,
      minY: gelTop,
      maxY: gelBottom,
    })
  }, [gelBottom, gelMatrix, gelPercent, gelTop, lanes, runDuration])

  function setActiveMwLadder(ladderId: string) {
    setLanes((current) =>
      current.map((lane) => (lane.kind === 'mw' ? { ...lane, ladderId } : lane)),
    )
  }

  function duplicateActiveLane() {
    if (!activeSample) return
    setLanes((current) => {
      const emptyIndex = current.findIndex((lane, index) => index > 0 && lane.kind === 'sample' && !lane.record)
      if (emptyIndex < 0) return current
      const copy: GelSampleLane = {
        kind: 'sample',
        record: activeSample.record,
        sourceLabel: activeSample.sourceLabel,
        digestMode: activeSample.digestMode,
        enzymeNames: [...activeSample.enzymeNames],
        primerIds: [...activeSample.primerIds],
      }
      return current.map((lane, index) => (index === emptyIndex ? copy : lane))
    })
  }

  function clearActiveLane() {
    if (activeLane?.kind === 'mw') return
    if (multiSampleSelection) {
    updateSelectedSampleLanes(createEmptyGelSample())
      clearFragmentsForLanes(selectedSampleLaneIndexes)
      return
    }
    updateActiveSample(createEmptyGelSample())
    clearFragmentForLane(activeLaneIndex)
  }

  function selectLaneFragment(laneIndex: number, fragment: DigestedFragment) {
    setExclusiveLane(laneIndex)
    ensureLaneExpanded(laneIndex)
    setSelectedFragmentByLane((current) => ({
      ...current,
      [laneIndex]: current[laneIndex] === fragment.id ? null : fragment.id,
    }))
  }

  function moveActiveLane(direction: -1 | 1) {
    if (activeLaneIndex == null || multiSampleSelection) return
    const from = activeLaneIndex
    setLanes((current) => {
      const to = from + direction
      if (to < 0 || to >= current.length) return current
      // Keep MW fixed at index 0 when possible
      if (current[from]?.kind === 'mw' || current[to]?.kind === 'mw') return current
      const next = [...current]
      const tmp = next[from]!
      next[from] = next[to]!
      next[to] = tmp
      return next
    })
    const to = from + direction
    if (to < 0 || to >= lanes.length) return
    if (lanes[from]?.kind === 'mw' || lanes[to]?.kind === 'mw') return
    setExclusiveLane(to)
    setSelectedFragmentByLane((current) => {
      const next = { ...current }
      const tmp = next[from] ?? null
      next[from] = next[to] ?? null
      next[to] = tmp
      return next
    })
  }

  function applyDigestToAllLanes() {
    if (!activeSample) return
    const digestMode = activeSample.digestMode
    const enzymesCopy = [...activeSample.enzymeNames]
    const primersCopy = [...activeSample.primerIds]
    setLanes((current) =>
      current.map((lane) =>
        lane.kind === 'sample' && lane.record
          ? {
              ...lane,
              digestMode,
              enzymeNames: [...enzymesCopy],
              primerIds: [...primersCopy],
            }
          : lane,
      ),
    )
  }

  function resetGel() {
    setLaneCount(seedLaneCount)
    setGelMatrix('agarose')
    setGelPercent(DEFAULT_AGAROSE_PERCENT)
    setRunSlider(DEFAULT_GEL_RUN_SLIDER)
    setGelViewHeightPx(DEFAULT_GEL_VIEW_HEIGHT_PX)
    setSidebarWidthPx(Math.max(DEFAULT_SIDEBAR_WIDTH_PX, sidebarWidthForLaneCount(seedLaneCount)))
    setLanes(createInitialGelLanes(seedSamples, seedLaneCount, defaultMwLadderId(loadMwLadderFavorites())))
    setExclusiveLane(1)
    setSelectedFragmentByLane({})
    setExpandedLanes({ 1: true })
  }

  function closeFooterMenus() {
    setFooterMenu(null)
    setExportFormatChooser(null)
  }
  const activeLaneFragments = useMemo(() => {
    const plan = activeLaneIndex == null ? undefined : lanePlans[activeLaneIndex]
    return plan?.kind === 'sample' ? plan.fragments : [] as DigestedFragment[]
  }, [activeLaneIndex, lanePlans])
  const selectedFragment = useMemo(() => {
    if (activeLaneIndex == null) return null
    const fragmentId = selectedFragmentByLane[activeLaneIndex]
    if (!fragmentId) return null
    return activeLaneFragments.find((fragment) => fragment.id === fragmentId) ?? null
  }, [activeLaneFragments, activeLaneIndex, selectedFragmentByLane])

  const workspaceSelectedRange =
    selectedFragment && activeSample?.record
      ? digestedFragmentSelectionRange(selectedFragment, activeSample.record.sequence.length)
      : null

  const runLabel =
    runSlider === DEFAULT_GEL_RUN_SLIDER
      ? 'Normal'
      : runSlider < DEFAULT_GEL_RUN_SLIDER
        ? 'Short'
        : 'Long'

  return (
    <div className="translation-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        className="translation-dialog restriction-cloning-dialog agarose-gel-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Simulate DNA gel"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div
          ref={layoutRef}
          className={`agarose-gel-layout${isMobileShell ? ` mobile-pane-${mobilePane}` : ''}`}
          style={isMobileShell ? undefined : { ['--agarose-gel-sidebar-width' as string]: `${sidebarWidthPx}px` }}
        >
          <MobilePaneTabs
            label="Gel workspace panes"
            panes={[
              { id: 'gel', label: 'Gel' },
              { id: 'lanes', label: 'Lanes' },
              { id: 'setup', label: 'Setup' },
            ]}
            value={mobilePane}
            onChange={setMobilePane}
          />
          <aside className="agarose-gel-sidebar" ref={sidebarRef}>
            <div className="agarose-gel-view" style={isMobileShell ? undefined : { height: gelViewHeightPx }}>
              <div
                className="agarose-gel-canvas"
                ref={gelCanvasRef}
                onMouseDown={(event) => {
                  // Shift/⌘-click range selection must not highlight SVG lane numbers / labels.
                  if (event.shiftKey || event.metaKey || event.ctrlKey) {
                    event.preventDefault()
                    window.getSelection()?.removeAllRanges()
                  }
                }}
              >
                <svg
                  viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                  width={svgWidth}
                  height={svgHeight}
                  preserveAspectRatio="xMinYMin meet"
                  role="img"
                  aria-label="Simulated DNA gel"
                >
                  <text
                    className="agarose-gel-axis-label"
                    x={GEL_LABEL_COLUMN_RIGHT_PX}
                    y={18}
                    textAnchor="end"
                    fontSize="11"
                  >
                    bp
                  </text>
                  <rect
                    x={leftPad - 8}
                    y={gelTop - 10}
                    width={svgWidth - leftPad + 4}
                    height={gelBottom - gelTop + 20}
                    rx={4}
                    fill="#2a2a2a"
                  />
                  {mwLabelLayouts.map((label) => {
                    const mwLaneX = leftPad
                    const bandLeftX = mwLaneX + 4
                    const stubStartX = bandLeftX - GEL_LEADER_STUB_PX
                    const labelAnchorX = GEL_LABEL_COLUMN_RIGHT_PX
                    const angledEndX = stubStartX
                    return (
                      <g key={`mw-label-${label.lengthBp}-${label.bandY}-${label.labelY}`}>
                        <text
                          className="agarose-gel-axis-label"
                          x={labelAnchorX}
                          y={label.labelY + 3}
                          textAnchor="end"
                          fontSize="10"
                          fontWeight={label.isMajor ? 700 : 500}
                        >
                          {formatLadderBandLabel(label.lengthBp)}
                        </text>
                        <path
                          className="agarose-gel-axis-leader"
                          d={`M ${labelAnchorX + 3} ${label.labelY} L ${angledEndX} ${label.bandY} H ${bandLeftX}`}
                          fill="none"
                          strokeWidth={1}
                          strokeLinejoin="round"
                        />
                      </g>
                    )
                  })}
                  {lanes.map((lane, laneIndex) => {
                    const x = leftPad + laneIndex * (laneWidth + laneGap)
                    const mwLadder = lane.kind === 'mw' ? resolveStoredMwLadder(lane.ladderId) : null
                    const mwMaxMass = mwLadder ? mwLadderMaxMass(mwLadder) : 1
                    const fragments = lanePlans[laneIndex]?.bands ?? []
                    const selected = selectedLaneIndexes.includes(laneIndex)
                    const selectedId = selectedFragmentByLane[laneIndex] ?? null
                    const laneRefLength =
                      lane.kind === 'sample'
                        ? Math.max(1, ...fragments.map((fragment) => fragment.length))
                        : 1
                    return (
                      <g key={`lane-${laneIndex}`}>
                        <rect
                          className={`agarose-gel-lane-hit${selected ? ' is-selected' : ''}`}
                          x={x}
                          y={gelTop - 28}
                          width={laneWidth}
                          height={gelBottom - gelTop + 40}
                          style={{ cursor: 'pointer' }}
                          onMouseDown={(event) => {
                            if (event.shiftKey || event.metaKey || event.ctrlKey) event.preventDefault()
                          }}
                          onClick={(event) => selectLane(laneIndex, event)}
                        >
                          <title>{lane.kind === 'mw' ? 'MW marker' : `Lane ${laneIndex}`}</title>
                        </rect>
                        <text
                          className={`agarose-gel-svg-lane-label${selected ? ' is-selected' : ''}`}
                          x={x + laneWidth / 2}
                          y={gelTop - 14}
                          textAnchor="middle"
                          fontSize="11"
                          fontWeight={selected ? 700 : 500}
                          style={{ cursor: 'pointer', userSelect: 'none' }}
                          onMouseDown={(event) => {
                            if (event.shiftKey || event.metaKey || event.ctrlKey) event.preventDefault()
                          }}
                          onClick={(event) => selectLane(laneIndex, event)}
                        >
                          {lane.kind === 'mw' ? 'MW' : String(laneIndex)}
                        </text>
                        {fragments.map((fragment) => {
                          const placement = placeDnaGelBand(
                            fragment.length,
                            gelTop,
                            gelBottom,
                            gelPercent,
                            runDuration,
                            gelMatrix,
                          )
                          if (placement.y === null) return null
                          const isFragmentSelected = selectedId === fragment.id
                          const intensity =
                            lane.kind === 'mw' && 'mass' in fragment
                              ? agaroseLadderBandIntensity(
                                  (fragment as { mass: number }).mass,
                                  mwMaxMass,
                                )
                              : agaroseBandMassIntensity(fragment.length, laneRefLength)
                          const { thickness, opacity } = agaroseBandStyle(intensity, {
                            selected: isFragmentSelected,
                          })
                          return (
                            <rect
                              key={`${laneIndex}-${fragment.id}`}
                              x={x + 4}
                              y={placement.y - thickness / 2}
                              width={laneWidth - 8}
                              height={thickness}
                              rx={0.5}
                              fill={isFragmentSelected ? '#4a9eff' : '#f2f2f2'}
                              opacity={opacity}
                              style={{ cursor: lane.kind === 'sample' ? 'pointer' : 'default' }}
                              onClick={(event) => {
                                event.stopPropagation()
                                if (lane.kind === 'sample') {
                                  selectLaneFragment(laneIndex, fragment as DigestedFragment)
                                } else {
                                  selectLane(laneIndex, event)
                                }
                              }}
                            >
                              <title>{`${fragment.length.toLocaleString()} bp`}</title>
                            </rect>
                          )
                        })}
                      </g>
                    )
                  })}
                </svg>
              </div>

              <div className="agarose-gel-run-control">
                <span className="agarose-gel-run-caption" title="Gel run duration">
                  Run
                </span>
                <input
                  type="range"
                  className="agarose-gel-run-slider"
                  min={0}
                  max={100}
                  step={1}
                  value={runSlider}
                  aria-label="Gel run duration"
                  aria-valuetext={`${runLabel} run (${runDuration.toFixed(2)}×)`}
                  title={`Run duration: ${runLabel} (${runDuration.toFixed(2)}×). Middle = 100 bp at gel end.`}
                  onChange={(event) => setRunSlider(Number(event.target.value))}
                />
                <span className="agarose-gel-run-value">{runLabel}</span>
              </div>
            </div>

            <div
              className="agarose-gel-height-splitter"
              role="separator"
              aria-orientation="horizontal"
              aria-label="Resize gel height"
              aria-valuenow={Math.round(gelViewHeightPx)}
              onPointerDown={startGelHeightSplitDrag}
            />

            <div className="agarose-gel-settings">
              <label>
                <span>lanes</span>
                <input
                  type="number"
                  min={2}
                  max={AGAROSE_GEL_MAX_LANE_COUNT}
                  value={laneCount}
                  onChange={(event) => resizeLanes(Math.max(2, Math.min(AGAROSE_GEL_MAX_LANE_COUNT, Number(event.target.value) || 2)))}
                />
              </label>
              <label className="agarose-gel-matrix-settings">
                <input
                  type="number"
                  min={gelMatrixPercentBounds(gelMatrix).min}
                  max={gelMatrixPercentBounds(gelMatrix).max}
                  step={gelMatrixPercentBounds(gelMatrix).step}
                  value={gelPercent}
                  aria-label="Gel percentage"
                  onChange={(event) => {
                    const raw = Number(event.target.value)
                    setGelPercent(clampGelPercent(Number.isFinite(raw) ? raw : gelMatrixPercentBounds(gelMatrix).defaultPercent, gelMatrix))
                  }}
                />
                <span>%</span>
                <select
                  value={gelMatrix}
                  aria-label="Gel matrix"
                  onChange={(event) => {
                    const next = event.target.value as DnaGelMatrix
                    setGelMatrix(next)
                    setGelPercent(gelMatrixPercentBounds(next).defaultPercent)
                  }}
                >
                  <option value="agarose">agarose</option>
                  <option value="polyacrylamide">polyacrylamide</option>
                </select>
              </label>
            </div>

            <div className="agarose-gel-lane-list">
              {lanes.map((lane, index) => {
                const active = selectedLaneIndexes.includes(index)
                const focused = activeLaneIndex === index
                const canExpand = lane.kind === 'sample' && Boolean(lane.record)
                const expanded = Boolean(canExpand && expandedLanes[index])
                const fragments = canExpand && lanePlans[index]?.kind === 'sample'
                  ? lanePlans[index].fragments
                  : []
                const enzymesUsed =
                  lane.kind === 'sample' && lane.digestMode === 'cut'
                    ? lane.enzymeNames.filter(Boolean)
                    : []
                const primersUsed =
                  lane.kind === 'sample' && lane.digestMode === 'pcr'
                    ? lane.primerIds
                        .map((id) => lane.record?.primers.find((primer) => primer.id === id)?.name)
                        .filter(Boolean)
                    : []
                const selectedId = selectedFragmentByLane[index] ?? null
                return (
                  <div
                    key={`list-${index}`}
                    className={`agarose-gel-lane-block${active ? ' is-active' : ''}${focused ? ' is-focused' : ''}${expanded ? ' is-expanded' : ''}`}
                  >
                    <div className="agarose-gel-lane-row">
                      <button
                        type="button"
                        className="agarose-gel-lane-select"
                        onMouseDown={(event) => {
                          if (event.shiftKey || event.metaKey || event.ctrlKey) event.preventDefault()
                        }}
                        onClick={(event) => selectLane(index, event)}
                      >
                        <span className="agarose-gel-lane-index">
                          {lane.kind === 'mw' ? 'MW' : index}
                        </span>
                        <span
                          className="agarose-gel-lane-name"
                          title={
                            lane.kind === 'mw'
                              ? resolveStoredMwLadder(lane.ladderId).name
                              : lane.record
                                ? lane.record.name
                                : undefined
                          }
                        >
                          {lane.kind === 'mw'
                            ? resolveStoredMwLadder(lane.ladderId).name
                            : lane.record
                              ? lane.record.name
                              : ''}
                        </span>
                      </button>
                      {canExpand ? (
                        <button
                          type="button"
                          className="agarose-gel-lane-caret"
                          aria-label={expanded ? `Collapse lane ${index} details` : `Expand lane ${index} details`}
                          aria-expanded={expanded}
                          onClick={() => toggleLaneExpanded(index)}
                        >
                          {expanded
                            ? <ChevronDown size={16} strokeWidth={2.25} aria-hidden="true" />
                            : <ChevronRight size={16} strokeWidth={2.25} aria-hidden="true" />}
                        </button>
                      ) : (
                        <span className="agarose-gel-lane-caret-spacer" aria-hidden />
                      )}
                    </div>
                    {expanded && lane.kind === 'sample' && lane.record && (
                      <div className="agarose-gel-lane-details">
                        <div className="agarose-gel-lane-construct">{lane.record.name}</div>
                        {enzymesUsed.length > 0 && (
                          <div className="agarose-gel-lane-enzymes">{enzymesUsed.join(' + ')}</div>
                        )}
                        {primersUsed.length > 0 && (
                          <div className="agarose-gel-lane-enzymes">PCR {primersUsed.join(' + ')}</div>
                        )}
                        {lane.digestMode === 'pcr' && primersUsed.length === 0 && (
                          <div className="agarose-gel-lane-empty">Pick two primers</div>
                        )}
                        {fragments.length > 0 ? (
                          <ol className="agarose-gel-fragment-list">
                            {fragments.map((fragment, fragmentIndex) => (
                              <li key={fragment.id}>
                                <button
                                  type="button"
                                  className={`agarose-gel-fragment-item${selectedId === fragment.id ? ' is-selected' : ''}`}
                                  onClick={() => selectLaneFragment(index, fragment)}
                                >
                                  <span className="agarose-gel-fragment-index">{fragmentIndex + 1}.</span>
                                  <span>{fragment.length.toLocaleString()} bp</span>
                                </button>
                              </li>
                            ))}
                          </ol>
                        ) : lane.digestMode === 'cut' || primersUsed.length >= 2 ? (
                          <div className="agarose-gel-lane-empty">No fragments</div>
                        ) : null}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="agarose-gel-lane-actions">
              <button type="button" disabled={!activeSample?.record} onClick={duplicateActiveLane}>
                Duplicate
              </button>
              <button type="button" disabled={!activeSample} onClick={clearActiveLane}>
                Clear
              </button>
              <span className="agarose-gel-move-label">Move</span>
              <button type="button" aria-label="Move lane up" disabled={!activeSample || multiSampleSelection} onClick={() => moveActiveLane(-1)}>
                ▲
              </button>
              <button type="button" aria-label="Move lane down" disabled={!activeSample || multiSampleSelection} onClick={() => moveActiveLane(1)}>
                ▼
              </button>
            </div>
          </aside>

          <div
            className="agarose-gel-splitter"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize gel panel"
            aria-valuenow={Math.round(sidebarWidthPx)}
            onPointerDown={startSidebarSplitDrag}
          />

          <section className="agarose-gel-main">
            <div className="agarose-gel-controls">
              {activeLaneIndex == null ? (
                <div className="agarose-gel-mw-banner">
                  Select a lane on the gel or in the list to edit its contents.
                  ⌘/Ctrl-click or Shift-click sample lanes to set the same enzymes on several at once.
                </div>
              ) : activeLane?.kind === 'mw' ? (
                <div className="agarose-gel-mw-banner">
                  Molecular weight marker: {resolveStoredMwLadder(activeLane.ladderId).name}
                </div>
              ) : (
                <>
                  <label className="agarose-gel-lane-source">
                    <span>
                      {multiSampleSelection
                        ? `Lanes ${selectedSampleLaneIndexes.join(', ')}:`
                        : `Lane ${activeLaneIndex}:`}
                    </span>
                    <select
                      className="agarose-gel-source-select"
                      aria-label="Lane construct"
                      disabled={multiSampleSelection}
                      title={multiSampleSelection ? 'Select a single lane to change its construct' : undefined}
                      value={!multiSampleSelection && activeSourceOption ? sourceOptionValue(activeSourceOption) : ''}
                      onChange={(event) => {
                        const option = sourceOptions.find((entry) => sourceOptionValue(entry) === event.target.value)
                        if (option) assignSource(option)
                      }}
                    >
                      {multiSampleSelection || !activeSourceOption ? (
                        <option value="">
                          {multiSampleSelection
                            ? `${selectedSampleLaneIndexes.length} samples selected`
                            : activeSample?.sourceLabel || 'Choose a construct…'}
                        </option>
                      ) : null}
                      <option value={sourceOptionValue(sourceOptions[0]!)}>{sourceOptions[0]!.label}</option>
                      {sourceOptions.length > 1 ? (
                        <optgroup label="Open constructs">
                          {sourceOptions.slice(1).map((option) => (
                            <option key={sourceOptionValue(option)} value={sourceOptionValue(option)}>
                              {option.label}
                            </option>
                          ))}
                        </optgroup>
                      ) : null}
                    </select>
                    <div className="agarose-gel-bulk-add" ref={bulkAddMenuRef}>
                      <button
                        type="button"
                        className={bulkAddMenuOpen ? 'is-open' : undefined}
                        disabled={multiSampleSelection}
                        aria-haspopup="menu"
                        aria-expanded={bulkAddMenuOpen}
                        title={
                          multiSampleSelection
                            ? 'Select a single lane before adding constructs'
                            : 'Add constructs from Database or files'
                        }
                        onClick={() => setBulkAddMenuOpen((open) => !open)}
                      >
                        Add
                        <ChevronDown size={16} strokeWidth={2.25} aria-hidden="true" />
                      </button>
                      {bulkAddMenuOpen ? (
                        <div className="agarose-gel-bulk-add-dropdown" role="menu">
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setBulkAddMenuOpen(false)
                              setBulkDatabasePickOpen(true)
                            }}
                          >
                            From Database…
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setBulkAddMenuOpen(false)
                              multiFileInputRef.current?.click()
                            }}
                          >
                            From files…
                          </button>
                          {libraryMemberSources.length > 0 ? (
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setBulkAddMenuOpen(false)
                                setLibraryMemberPick({
                                  libraryName: currentRecord.name,
                                  members: libraryMemberSources,
                                  mode: 'multiple',
                                  title: 'Add library members to gel',
                                  confirmLabel: 'Add',
                                  onConfirm: (selected) => {
                                    placeSourcesOnSuccessiveLanes(selected)
                                    setLibraryMemberPick(null)
                                  },
                                })
                              }}
                            >
                              From current library…
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </label>

                  <div className="agarose-gel-digest-block">
                    <div className="agarose-gel-digest-mode-row">
                      <select
                        className="agarose-gel-digest-mode"
                        value={multiSampleSelection ? 'cut' : (activeSample?.digestMode ?? 'cut')}
                        disabled={!activeSample?.record && selectedSampleLaneIndexes.every((index) => {
                          const lane = lanes[index]
                          return lane?.kind !== 'sample' || !lane.record
                        })}
                        aria-label="Lane digest mode"
                        title={
                          multiSampleSelection
                            ? 'Enzyme digests apply to all selected sample lanes'
                            : activeSample?.digestMode === 'pcr'
                              ? 'amplify by PCR'
                              : 'cut with'
                        }
                        onChange={(event) => setLaneDigestMode(event.target.value as GelDigestMode)}
                      >
                        <option value="cut">cut with</option>
                        <option value="pcr" disabled={multiSampleSelection}>amplify by PCR</option>
                      </select>
                      {multiSampleSelection ? (
                        <span className="agarose-gel-multi-hint">
                          Enzymes apply to {selectedSampleLaneIndexes.length} lanes
                        </span>
                      ) : null}
                    </div>
                    {!multiSampleSelection && activeSample?.digestMode === 'pcr' ? (
                      <div className="agarose-gel-cut-row">
                        <select
                          className="agarose-gel-pcr-primer-select"
                          value={firstPcrPrimerId}
                          disabled={!activeSample.record}
                          aria-label="First PCR primer"
                          onChange={(event) => setPcrPrimerSlot(0, event.target.value)}
                        >
                          <option value="">Primer…</option>
                          {firstPcrPrimerOptions.map((primer) => (
                            <option key={primer.id} value={primer.id}>
                              {primer.name}
                            </option>
                          ))}
                        </select>
                        <span className="agarose-gel-cut-plus">+</span>
                        <select
                          className="agarose-gel-pcr-primer-select"
                          value={
                            secondPcrPrimerId &&
                            secondPcrPrimerOptions.some((primer) => primer.id === secondPcrPrimerId)
                              ? secondPcrPrimerId
                              : ''
                          }
                          disabled={!activeSample.record || !firstPcrPrimerId}
                          aria-label="Second PCR primer"
                          onChange={(event) => setPcrPrimerSlot(1, event.target.value)}
                        >
                          <option value="">Primer…</option>
                          {secondPcrPrimerOptions.map((primer) => (
                            <option key={primer.id} value={primer.id}>
                              {primer.name}
                            </option>
                          ))}
                        </select>
                        <span className="agarose-gel-pcr-hint">
                          or Ctrl/Shift-click primers on the map, sequence, or Primers tab
                        </span>
                        <button
                          type="button"
                          className="agarose-gel-apply-all"
                          disabled={!activeSample?.record}
                          onClick={applyDigestToAllLanes}
                        >
                          Apply to All Lanes
                        </button>
                      </div>
                    ) : (
                      <div className="agarose-gel-cut-row">
                        {Array.from({ length: MAX_CUT_SLOTS }, (_, slot) => (
                          <span key={slot} className="agarose-gel-cut-slot">
                            {slot > 0 && <span className="agarose-gel-cut-plus">+</span>}
                            <select
                              value={activeSample?.enzymeNames[slot] ?? ''}
                              disabled={!activeSample?.record && !multiSampleSelection}
                              onChange={(event) => {
                                if (!activeSample && !multiSampleSelection) return
                                const base = activeSample?.enzymeNames ?? ['', '', '', '']
                                const next = [...base]
                                next[slot] = event.target.value
                                updateSelectedSampleLanes({ digestMode: 'cut', enzymeNames: next })
                                clearFragmentsForLanes(selectedSampleLaneIndexes)
                              }}
                            >
                              <option value="">—</option>
                              {cutEnzymeOptions.map((entry) => (
                                <option key={entry.name} value={entry.name}>
                                  {absentSelectedEnzymes.includes(entry.name)
                                    ? `${entry.name} (no sites)`
                                    : entry.count === null || entry.count === 0
                                      ? entry.name
                                      : `${entry.name} (${entry.count})`}
                                </option>
                              ))}
                            </select>
                          </span>
                        ))}
                        <button
                          type="button"
                          className="agarose-gel-apply-all"
                          disabled={!activeSample?.record}
                          onClick={applyDigestToAllLanes}
                        >
                          Apply to All Lanes
                        </button>
                      </div>
                    )}
                    {activeSample?.digestMode === 'cut' && absentSelectedEnzymes.length > 0 ? (
                      <p className="agarose-gel-digest-warning" role="status">
                        {absentSelectedEnzymes.join(', ')} {absentSelectedEnzymes.length === 1 ? 'has' : 'have'} no
                        cut sites in this construct. This lane will include undigested DNA.
                      </p>
                    ) : null}
                  </div>
                </>
              )}
            </div>

            <div
              className={`agarose-gel-workspace${workspaceDragActive ? ' is-drag-active' : ''}`}
              onDragEnter={handleWorkspaceDragEnter}
              onDragOver={handleWorkspaceDragOver}
              onDragLeave={handleWorkspaceDragLeave}
              onDrop={handleWorkspaceDrop}
            >
              {activeLaneIndex == null ? (
                <div className="cloning-preview-workspace cloning-preview-workspace-empty">
                  <p>
                    Select a lane on the gel or in the list to view its map, sequence, enzymes, and primers.
                    ⌘/Ctrl-click or Shift-click sample lanes to edit enzymes on several at once.
                    You can also drop a sequence file here to load a sample lane.
                  </p>
                </div>
              ) : activeLane?.kind === 'mw' ? (
                <MwLadderPicker
                  selectedLadderId={activeLane.ladderId}
                  onSelectLadder={setActiveMwLadder}
                />
              ) : activeSample?.record ? (
                renderWorkspace({
                  record: activeSample.record,
                  title: selectedFragment
                    ? `${activeSample.record.name} · ${selectedFragment.length.toLocaleString()} bp ${
                        activeSample.digestMode === 'pcr' ? 'product' : 'fragment'
                      }`
                    : activeSample.digestMode === 'pcr'
                      ? activeSample.primerIds.length > 0
                        ? `${activeSample.record.name} · PCR ${activeSample.primerIds
                            .map(
                              (id) =>
                                activeSample.record!.primers.find((primer) => primer.id === id)?.name ??
                                id,
                            )
                            .join(' + ')}`
                        : `${activeSample.record.name} · amplify by PCR`
                      : activeSample.enzymeNames.filter(Boolean).length > 0
                        ? `${activeSample.record.name} · cut with ${enzymesUseLabel(activeSample.enzymeNames.filter(Boolean))}`
                        : activeSample.record.name,
                  selectedRange: workspaceSelectedRange,
                  cutStrandSelection: null,
                  selectedSites:
                    multiSampleSelection || activeSample.digestMode === 'cut' ? selectedDigestSites : [],
                  allowEnzymeSelect: multiSampleSelection || activeSample.digestMode === 'cut',
                  allowPrimerSelect: !multiSampleSelection && activeSample.digestMode === 'pcr',
                  selectedPrimerIds:
                    !multiSampleSelection && activeSample.digestMode === 'pcr' ? activeSample.primerIds : [],
                  includePrimersTab: true,
                  onRestrictionSelect: handleGelEnzymeSelect,
                  onPrimerSelect: handleGelPrimerSelect,
                  onEnzymePickerSitesChange: setWorkspaceSites,
                  onRangeSelect: () => {
                    clearFragmentForLane(activeLaneIndex)
                  },
                })
              ) : (
                <div className="cloning-preview-workspace cloning-preview-workspace-empty">
                  <p>Drop a sequence file here, or use Add to load constructs onto the gel.</p>
                </div>
              )}
            </div>
          </section>
        </div>

        <footer className="agarose-gel-footer">
          <div className="agarose-gel-footer-left" ref={footerMenuRef}>
            <div className="agarose-gel-footer-menu">
              <button
                type="button"
                className="agarose-gel-footer-trigger"
                aria-haspopup="menu"
                aria-expanded={footerMenu === 'print'}
                onClick={() => {
                  setExportFormatChooser(null)
                  setFooterMenu((current) => (current === 'print' ? null : 'print'))
                }}
              >
                Print Gel Data <span aria-hidden>▾</span>
              </button>
              {footerMenu === 'print' && (
                <div className="agarose-gel-footer-dropdown" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      exportController.printGelImage(false)
                      closeFooterMenus()
                    }}
                  >
                    Print Gel
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      exportController.printGelImage(true)
                      closeFooterMenus()
                    }}
                  >
                    Print Inverted Gel
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      exportController.printBandData()
                      closeFooterMenus()
                    }}
                  >
                    Print Band Data
                  </button>
                </div>
              )}
            </div>

            <div className="agarose-gel-footer-menu">
              <button
                type="button"
                className="agarose-gel-footer-trigger"
                aria-haspopup="menu"
                aria-expanded={footerMenu === 'export'}
                onClick={() => {
                  setExportFormatChooser(null)
                  setFooterMenu((current) => (current === 'export' ? null : 'export'))
                }}
              >
                Copy/Export Gel Data <span aria-hidden>▾</span>
              </button>
              {footerMenu === 'export' && (
                <div className="agarose-gel-footer-dropdown" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      void exportController.copyGelImage(false).finally(closeFooterMenus)
                    }}
                  >
                    Copy Gel Image
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      void exportController.copyGelImage(true).finally(closeFooterMenus)
                    }}
                  >
                    Copy Inverted Gel Image
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      exportController.copyFragmentList()
                      closeFooterMenus()
                    }}
                  >
                    Copy Fragment List
                  </button>
                  <div className="agarose-gel-footer-dropdown-divider" role="separator" />
                  <button
                    type="button"
                    role="menuitem"
                    className={exportFormatChooser === 'normal' ? 'is-open' : undefined}
                    onClick={() =>
                      setExportFormatChooser((current) => (current === 'normal' ? null : 'normal'))
                    }
                  >
                    Export Gel Image…
                  </button>
                  {exportFormatChooser === 'normal' && (
                    <div className="agarose-gel-footer-format-row">
                      <button
                        type="button"
                        onClick={() => {
                          void exportController.exportGelImage(false, 'png').finally(closeFooterMenus)
                        }}
                      >
                        PNG
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void exportController.exportGelImage(false, 'svg').finally(closeFooterMenus)
                        }}
                      >
                        SVG
                      </button>
                    </div>
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    className={exportFormatChooser === 'inverted' ? 'is-open' : undefined}
                    onClick={() =>
                      setExportFormatChooser((current) =>
                        current === 'inverted' ? null : 'inverted',
                      )
                    }
                  >
                    Export Inverted Gel Image…
                  </button>
                  {exportFormatChooser === 'inverted' && (
                    <div className="agarose-gel-footer-format-row">
                      <button
                        type="button"
                        onClick={() => {
                          void exportController.exportGelImage(true, 'png').finally(closeFooterMenus)
                        }}
                      >
                        PNG
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void exportController.exportGelImage(true, 'svg').finally(closeFooterMenus)
                        }}
                      >
                        SVG
                      </button>
                    </div>
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      exportController.exportFragmentList()
                      closeFooterMenus()
                    }}
                  >
                    Export Fragment List…
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="agarose-gel-footer-right">
            <button type="button" onClick={resetGel}>
              Reset
            </button>
            <button type="button" className="primary" onClick={onClose}>
              Close
            </button>
          </div>
        </footer>

        <input
          ref={multiFileInputRef}
          type="file"
          accept={SEQUENCE_OPEN_ACCEPT}
          multiple
          hidden
          onChange={(event) => {
            const files = Array.from(event.target.files ?? [])
            if (files.length > 0) void importMultipleConstructFiles(files)
            event.currentTarget.value = ''
          }}
        />

        {libraryMemberPick ? (
          <GelLibraryMemberPickerDialog
            libraryName={libraryMemberPick.libraryName}
            members={libraryMemberPick.members}
            mode={libraryMemberPick.mode}
            title={libraryMemberPick.title}
            confirmLabel={libraryMemberPick.confirmLabel}
            onCancel={() => setLibraryMemberPick(null)}
            onConfirm={(selected) => libraryMemberPick.onConfirm(selected)}
          />
        ) : null}

        {bulkDatabasePickOpen ? (
          <DatabaseConstructPickerDialog
            multiple
            allowCurrent
            molecules={['dna']}
            confirmLabel="Add"
            cancelLabel="Cancel"
            title="Add to gel from Database"
            onCancel={() => setBulkDatabasePickOpen(false)}
            onSelectMany={(choices) => {
              placeRecordsFromDatabase(choices.map((choice) => choice.record))
            }}
          />
        ) : null}
      </div>
    </div>
  )
}
