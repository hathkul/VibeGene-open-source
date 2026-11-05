// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { normalizeSequenceRecord } from '../src/domain/constructProperties'
import { circularMapPolarPoint, circularMapPositionFromAngle } from '../src/domain/circularMapGeometry'
import { computeLinearTrackLayout } from '../src/domain/mapLayout'
import { cloneFixture } from '../src/domain/fixtures'
import { defaultEnzymePreferences } from '../src/domain/enzymePreferences'
import { useWorkspaceMapNavigationController } from '../src/presentation/hooks/useWorkspaceMapNavigationController'
import { PlasmidMap } from '../src/presentation/map/PlasmidMap'
import { TrackMap } from '../src/presentation/map/TrackMap'
import { defaultDisplaySettings, type DisplaySettings } from '../src/presentation/sequence'
import '../src/App.css'

const LINEAR_SEQUENCE_LENGTH = 1000
const LINEAR_TRACK_WIDTH = 960
const LINEAR_SIDE_PADDING = 16

function mockDomRect(partial: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>): DOMRect {
  const { left, top, width, height } = partial
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  }
}

function parseViewBox(svg: SVGSVGElement): { left: number; top: number; width: number; height: number } {
  const raw = svg.getAttribute('viewBox')
  if (!raw) throw new Error('SVG viewBox missing')
  const parts = raw.split(/\s+/).map(Number)
  if (parts.length !== 4 || parts.some((value) => Number.isNaN(value))) {
    throw new Error(`Invalid SVG viewBox: ${raw}`)
  }
  return { left: parts[0], top: parts[1], width: parts[2], height: parts[3] }
}

function linearMapPositionFromClientX(
  clientX: number,
  svg: SVGSVGElement,
  sequenceLength: number,
  trackLeft: number,
  trackRight: number,
): number {
  const viewBox = parseViewBox(svg)
  const rect = svg.getBoundingClientRect()
  const svgX = viewBox.left + ((clientX - rect.left) / rect.width) * viewBox.width
  const ratio = Math.max(0, Math.min(1, (svgX - trackLeft) / (trackRight - trackLeft)))
  return Math.round(ratio * sequenceLength)
}

function svgPointToClient(svg: SVGSVGElement, svgX: number, svgY: number): { clientX: number; clientY: number } {
  const viewBox = parseViewBox(svg)
  const rect = svg.getBoundingClientRect()
  return {
    clientX: rect.left + ((svgX - viewBox.left) / viewBox.width) * rect.width,
    clientY: rect.top + ((svgY - viewBox.top) / viewBox.height) * rect.height,
  }
}

function requireSvgElement(parent: ParentNode, selector: string, label: string): SVGSVGElement {
  const element = parent.querySelector(selector)
  if (!(element instanceof SVGSVGElement)) throw new Error(`${label} not found (${selector})`)
  return element
}

function requireElement(parent: ParentNode, selector: string, label: string): Element {
  const element = parent.querySelector(selector)
  if (!element) throw new Error(`${label} not found (${selector})`)
  return element
}

function requireHtmlElement(parent: ParentNode, selector: string, label: string): HTMLElement {
  const element = parent.querySelector(selector)
  if (!(element instanceof HTMLElement)) throw new Error(`${label} not found (${selector})`)
  return element
}

function requireCircleElement(parent: ParentNode, selector: string, label: string): Element {
  const element = parent.querySelector(selector)
  if (!element || element.tagName.toLowerCase() !== 'circle') {
    throw new Error(`${label} not found (${selector})`)
  }
  return element
}

async function dragSelectTarget(target: Element, fromX: number, toX: number, clientY: number) {
  const pointerId = 7
  const init = { bubbles: true, clientY, pointerId, button: 0, isPrimary: true }
  await act(async () => {
    target.dispatchEvent(new PointerEvent('pointerdown', { ...init, clientX: fromX }))
  })
  await act(async () => {
    target.dispatchEvent(new PointerEvent('pointermove', { ...init, clientX: toX }))
  })
  await act(async () => {
    target.dispatchEvent(new PointerEvent('pointerup', { ...init, clientX: toX }))
  })
}

async function flushLayout() {
  await act(async () => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve())
    })
  })
}

function mapDisplaySettings(overrides: Partial<DisplaySettings> = {}): DisplaySettings {
  return {
    ...defaultDisplaySettings,
    enzymes: { ...defaultDisplaySettings.enzymes, visible: false, showPositions: false },
    features: { ...defaultDisplaySettings.features, visible: false, labelsVisible: false, externalLabels: false },
    primers: { ...defaultDisplaySettings.primers, visible: false },
    alignments: { ...defaultDisplaySettings.alignments, visible: false },
    mapView: { ...defaultDisplaySettings.mapView, linear: false, zoom: false },
    ...overrides,
  }
}

class MockResizeObserver implements ResizeObserver {
  constructor(private callback: ResizeObserverCallback) {}

  observe(target: Element): void {
    const contentRect = mockDomRect({ left: 0, top: 0, width: LINEAR_TRACK_WIDTH, height: 400 })
    const entry: ResizeObserverEntry = {
      target,
      contentRect,
      borderBoxSize: [{ inlineSize: contentRect.width, blockSize: contentRect.height }],
      contentBoxSize: [{ inlineSize: contentRect.width, blockSize: contentRect.height }],
      devicePixelContentBoxSize: [{ inlineSize: contentRect.width, blockSize: contentRect.height }],
    }
    this.callback([entry], this)
  }

  unobserve(): void {}

  disconnect(): void {}
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver)
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = vi.fn()
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = vi.fn()
  }
})

afterAll(() => {
  vi.unstubAllGlobals()
})

describe('map ruler drag selection', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })

  it('opens feature properties when a linear external feature label is double-clicked', async () => {
    const feature = {
      id: 'short-feature', name: 'Long feature label '.repeat(12), type: 'misc_feature', color: '#4488cc',
      locations: [{ start: 300, end: 301, strand: 'forward' as const }],
    }
    const record = normalizeSequenceRecord({ ...cloneFixture(), topology: 'linear', sequence: 'A'.repeat(1000), features: [feature], primers: [] })
    const displaySettings = mapDisplaySettings({
      mapView: { ...defaultDisplaySettings.mapView, linear: true, zoom: false },
      features: { ...defaultDisplaySettings.features, visible: true, labelsVisible: true, externalLabels: true },
    })
    const onFeatureEdit = vi.fn()
    const onSelect = vi.fn()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => root.render(
      <TrackMap
        record={record} restrictionSites={[]} primerBindings={[]} annotationFeatures={[feature]}
        displaySettings={displaySettings} enzymePreferences={defaultEnzymePreferences}
        selectedRange={null} selectedFeatureId={null} selectedPrimerId={null} traceFiles={[]}
        alignmentsVisible={false} selectedAlignmentTraceId={null} onSelectAlignmentTrace={vi.fn()}
        onSelect={onSelect} onRangeSelect={vi.fn()} onExtendToBase={vi.fn()} onPrimerSelect={vi.fn()}
        onRestrictionSelect={vi.fn()} onEnzymeInfo={vi.fn()} onFeatureEdit={onFeatureEdit}
      />,
    ))
    await flushLayout()
    const label = requireElement(host, '.linear-feature-callout-external text', 'external feature label')
    await act(async () => label.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(onSelect).toHaveBeenCalledWith('short-feature', false, 300)
    await act(async () => label.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })))
    expect(onFeatureEdit).toHaveBeenCalledOnce()
    expect(onFeatureEdit).toHaveBeenCalledWith('short-feature')
  })

  it('linear TrackMap drag selects the exact expected range for fixed geometry', async () => {
    const onRangeSelect = vi.fn()
    const onSelect = vi.fn()
    const onPrimerSelect = vi.fn()
    const onRestrictionSelect = vi.fn()
    const onExtendToBase = vi.fn()
    const onSelectAlignmentTrace = vi.fn()
    const record = normalizeSequenceRecord({
      ...cloneFixture(),
      topology: 'linear',
      sequence: 'A'.repeat(LINEAR_SEQUENCE_LENGTH),
      features: [],
      primers: [],
    })
    const displaySettings = mapDisplaySettings({ mapView: { ...defaultDisplaySettings.mapView, linear: true, zoom: false } })
    const { trackLeft, trackRight } = computeLinearTrackLayout(LINEAR_TRACK_WIDTH, [], LINEAR_SIDE_PADDING)
    const fromClientX = 240
    const toClientX = 720

    host = document.createElement('div')
    host.style.width = `${LINEAR_TRACK_WIDTH}px`
    document.body.append(host)
    root = createRoot(host)

    await act(async () => {
      root.render(
        <TrackMap
          record={record}
          restrictionSites={[]}
          primerBindings={[]}
          annotationFeatures={[]}
          displaySettings={displaySettings}
          enzymePreferences={defaultEnzymePreferences}
          selectedRange={null}
          selectedFeatureId={null}
          selectedPrimerId={null}
          traceFiles={[]}
          alignmentsVisible={false}
          selectedAlignmentTraceId={null}
          onSelectAlignmentTrace={onSelectAlignmentTrace}
          onSelect={onSelect}
          onRangeSelect={onRangeSelect}
          onExtendToBase={onExtendToBase}
          onPrimerSelect={onPrimerSelect}
          onRestrictionSelect={onRestrictionSelect}
          onEnzymeInfo={vi.fn()}
          onFeatureEdit={vi.fn()}
        />,
      )
    })
    await flushLayout()

    const svg = requireSvgElement(host, 'svg', 'TrackMap SVG')
    const target = requireElement(host, '.map-select-target', 'linear ruler drag target')
    svg.getBoundingClientRect = () => mockDomRect({ left: 0, top: 0, width: LINEAR_TRACK_WIDTH, height: 400 })
    target.getBoundingClientRect = () => mockDomRect({ left: 80, top: 48, width: 800, height: 24 })

    const expectedStart = linearMapPositionFromClientX(fromClientX, svg, LINEAR_SEQUENCE_LENGTH, trackLeft, trackRight)
    const expectedEnd = linearMapPositionFromClientX(toClientX, svg, LINEAR_SEQUENCE_LENGTH, trackLeft, trackRight)
    const expectedRange = {
      start: Math.min(expectedStart, expectedEnd),
      end: Math.max(expectedStart, expectedEnd),
    }

    const activeBefore = document.activeElement
    const scrollHost = requireHtmlElement(host, '.track-map-scroll', 'track scroll host')
    const scrollLeftBefore = scrollHost.scrollLeft
    const scrollTopBefore = scrollHost.scrollTop

    await dragSelectTarget(target, fromClientX, toClientX, 60)

    expect(onRangeSelect).toHaveBeenCalled()
    expect(onRangeSelect.mock.calls.at(-1)?.[0]).toEqual(expectedRange)
    expect(onSelect).not.toHaveBeenCalled()
    expect(onPrimerSelect).not.toHaveBeenCalled()
    expect(onRestrictionSelect).not.toHaveBeenCalled()
    expect(onExtendToBase).not.toHaveBeenCalled()
    expect(onSelectAlignmentTrace).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(activeBefore)
    expect(scrollHost.scrollLeft).toBe(scrollLeftBefore)
    expect(scrollHost.scrollTop).toBe(scrollTopBefore)
  })

  it('library map drag routes through selectMapRange with browse member context only', async () => {
    const setSequenceRange = vi.fn()
    const setStatus = vi.fn()
    const selectFeatureById = vi.fn()
    const openFeatureEditorForFeature = vi.fn()
    const selectPrimerById = vi.fn()
    const openPrimerEditorForPrimer = vi.fn()
    const onSelect = vi.fn()
    const onPrimerSelect = vi.fn()
    const onRestrictionSelect = vi.fn()
    const onExtendToBase = vi.fn()
    const onSelectAlignmentTrace = vi.fn()
    const record = normalizeSequenceRecord({
      ...cloneFixture(),
      topology: 'linear',
      sequence: 'A'.repeat(LINEAR_SEQUENCE_LENGTH),
      features: [],
      primers: [],
    })
    const displaySettings = mapDisplaySettings({ mapView: { ...defaultDisplaySettings.mapView, linear: true, zoom: false } })
    const { trackLeft, trackRight } = computeLinearTrackLayout(LINEAR_TRACK_WIDTH, [], LINEAR_SIDE_PADDING)
    const fromClientX = 260
    const toClientX = 700

    host = document.createElement('div')
    host.style.width = `${LINEAR_TRACK_WIDTH}px`
    document.body.append(host)
    root = createRoot(host)

    await act(async () => {
      root.render(
        <LibraryMapDragHarness
          record={record}
          displaySettings={displaySettings}
          setSequenceRange={setSequenceRange}
          setStatus={setStatus}
          selectFeatureById={selectFeatureById}
          openFeatureEditorForFeature={openFeatureEditorForFeature}
          selectPrimerById={selectPrimerById}
          openPrimerEditorForPrimer={openPrimerEditorForPrimer}
          onSelect={onSelect}
          onPrimerSelect={onPrimerSelect}
          onRestrictionSelect={onRestrictionSelect}
          onExtendToBase={onExtendToBase}
          onSelectAlignmentTrace={onSelectAlignmentTrace}
        />,
      )
    })
    await flushLayout()

    const svg = requireSvgElement(host, 'svg', 'TrackMap SVG')
    const target = requireElement(host, '.map-select-target', 'linear ruler drag target')
    svg.getBoundingClientRect = () => mockDomRect({ left: 0, top: 0, width: LINEAR_TRACK_WIDTH, height: 400 })
    target.getBoundingClientRect = () => mockDomRect({ left: 80, top: 48, width: 800, height: 24 })

    const expectedStart = linearMapPositionFromClientX(fromClientX, svg, LINEAR_SEQUENCE_LENGTH, trackLeft, trackRight)
    const expectedEnd = linearMapPositionFromClientX(toClientX, svg, LINEAR_SEQUENCE_LENGTH, trackLeft, trackRight)
    const expectedRange = {
      start: Math.min(expectedStart, expectedEnd),
      end: Math.max(expectedStart, expectedEnd),
    }

    const activeBefore = document.activeElement
    const scrollHost = requireHtmlElement(host, '.track-map-scroll', 'track scroll host')
    const scrollLeftBefore = scrollHost.scrollLeft
    const scrollTopBefore = scrollHost.scrollTop

    await dragSelectTarget(target, fromClientX, toClientX, 60)

    expect(setSequenceRange).toHaveBeenCalledWith(expectedRange, {
      libraryMemberId: 'member-a',
      sequenceLength: 8,
    })
    expect(setStatus).not.toHaveBeenCalled()
    expect(selectFeatureById).not.toHaveBeenCalled()
    expect(selectPrimerById).not.toHaveBeenCalled()
    expect(openFeatureEditorForFeature).not.toHaveBeenCalled()
    expect(openPrimerEditorForPrimer).not.toHaveBeenCalled()
    expect(onSelect).not.toHaveBeenCalled()
    expect(onPrimerSelect).not.toHaveBeenCalled()
    expect(onRestrictionSelect).not.toHaveBeenCalled()
    expect(onExtendToBase).not.toHaveBeenCalled()
    expect(onSelectAlignmentTrace).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(activeBefore)
    expect(scrollHost.scrollLeft).toBe(scrollLeftBefore)
    expect(scrollHost.scrollTop).toBe(scrollTopBefore)
  })

  it('circular PlasmidMap drag across 12 o’clock yields wrap-around endpoints', async () => {
    const onRangeSelect = vi.fn()
    const onSelect = vi.fn()
    const onPrimerSelect = vi.fn()
    const onRestrictionSelect = vi.fn()
    const onExtendToBase = vi.fn()
    const sequenceLength = 200
    const dragStartPosition = 170
    const dragEndPosition = 30
    const record = normalizeSequenceRecord({
      ...cloneFixture(),
      topology: 'circular',
      sequence: 'A'.repeat(sequenceLength),
      features: [],
      primers: [],
    })
    const displaySettings = mapDisplaySettings()

    host = document.createElement('div')
    host.style.width = '420px'
    host.style.height = '420px'
    document.body.append(host)
    root = createRoot(host)

    await act(async () => {
      root.render(
        <PlasmidMap
          mapSize={360}
          viewportWidth={360}
          viewportHeight={360}
          minLocked
          record={record}
          restrictionSites={[]}
          primerBindings={[]}
          annotationFeatures={[]}
          displaySettings={displaySettings}
          enzymePreferences={defaultEnzymePreferences}
          selectedRange={null}
          selectedFeatureId={null}
          selectedPrimerId={null}
          onSelect={onSelect}
          onRangeSelect={onRangeSelect}
          onExtendToBase={onExtendToBase}
          onPrimerSelect={onPrimerSelect}
          onRestrictionSelect={onRestrictionSelect}
          onEnzymeInfo={vi.fn()}
          onFeatureEdit={vi.fn()}
        />,
      )
    })
    await flushLayout()

    const svg = requireSvgElement(host, 'svg', 'PlasmidMap SVG')
    const target = requireElement(host, '.map-select-target', 'circular ruler drag target')
    const ring = requireCircleElement(host, 'circle.map-backbone.outer', 'circular backbone')
    const ringCx = Number(ring.getAttribute('cx'))
    const ringCy = Number(ring.getAttribute('cy'))
    const ringOuterR = Number(ring.getAttribute('r'))
    if (!Number.isFinite(ringCx) || !Number.isFinite(ringCy) || !Number.isFinite(ringOuterR)) {
      throw new Error('Circular backbone geometry missing')
    }
    const ringRadius = ringOuterR - 3

    svg.getBoundingClientRect = () => mockDomRect({ left: 0, top: 0, width: 360, height: 360 })
    target.getBoundingClientRect = () => mockDomRect({ left: 0, top: 0, width: 360, height: 360 })

    const startPolar = circularMapPolarPoint(dragStartPosition, sequenceLength, ringCx, ringCy, ringRadius, 0, 'circular')
    const endPolar = circularMapPolarPoint(dragEndPosition, sequenceLength, ringCx, ringCy, ringRadius, 0, 'circular')
    const from = svgPointToClient(svg, startPolar.x, startPolar.y)
    const to = svgPointToClient(svg, endPolar.x, endPolar.y)

    const startAngle = Math.atan2(startPolar.y - ringCy, startPolar.x - ringCx)
    const endAngle = Math.atan2(endPolar.y - ringCy, endPolar.x - ringCx)
    const expectedStart = circularMapPositionFromAngle(startAngle, sequenceLength, 'circular')
    const expectedEnd = circularMapPositionFromAngle(endAngle, sequenceLength, 'circular')

    await dragSelectTarget(target, from.clientX, to.clientX, from.clientY)

    expect(onRangeSelect).toHaveBeenCalled()
    expect(onRangeSelect.mock.calls.at(-1)?.[0]).toEqual({ start: expectedStart, end: expectedEnd })
    expect(expectedStart).toBeGreaterThan(expectedEnd)
    expect(onSelect).not.toHaveBeenCalled()
    expect(onPrimerSelect).not.toHaveBeenCalled()
    expect(onRestrictionSelect).not.toHaveBeenCalled()
    expect(onExtendToBase).not.toHaveBeenCalled()
  })
})

type LibraryMapDragHarnessProps = {
  record: ReturnType<typeof normalizeSequenceRecord>
  displaySettings: DisplaySettings
  setSequenceRange: ReturnType<typeof vi.fn>
  setStatus: ReturnType<typeof vi.fn>
  selectFeatureById: ReturnType<typeof vi.fn>
  openFeatureEditorForFeature: ReturnType<typeof vi.fn>
  selectPrimerById: ReturnType<typeof vi.fn>
  openPrimerEditorForPrimer: ReturnType<typeof vi.fn>
  onSelect: ReturnType<typeof vi.fn>
  onPrimerSelect: ReturnType<typeof vi.fn>
  onRestrictionSelect: ReturnType<typeof vi.fn>
  onExtendToBase: ReturnType<typeof vi.fn>
  onSelectAlignmentTrace: ReturnType<typeof vi.fn>
}

function LibraryMapDragHarness(props: LibraryMapDragHarnessProps) {
  const { selectMapRange } = useWorkspaceMapNavigationController({
    libraryMapBrowseActive: true,
    libraryMapBrowseKeys: [null, 'member-a'],
    libraryMapBrowseIndex: 1,
    libraryMapMembers: [{ id: 'member-a', fileName: 'read-a.ab1', sequence: 'ACGTACGT' }],
    libraryMapBrowseMemberId: 'member-a',
    mapViewSequenceLength: 8,
    recordSequenceLength: props.record.sequence.length,
    queueRevealTarget: vi.fn(),
    setSequenceRange: props.setSequenceRange,
    setStatus: props.setStatus,
    selectFeatureById: props.selectFeatureById,
    openFeatureEditorForFeature: props.openFeatureEditorForFeature,
    selectPrimerById: props.selectPrimerById,
    openPrimerEditorForPrimer: props.openPrimerEditorForPrimer,
  })

  return (
    <TrackMap
      record={props.record}
      restrictionSites={[]}
      primerBindings={[]}
      annotationFeatures={[]}
      displaySettings={props.displaySettings}
      enzymePreferences={defaultEnzymePreferences}
      selectedRange={null}
      selectedFeatureId={null}
      selectedPrimerId={null}
      traceFiles={[]}
      alignmentsVisible={false}
      selectedAlignmentTraceId={null}
      onSelectAlignmentTrace={props.onSelectAlignmentTrace}
      onSelect={props.onSelect}
      onRangeSelect={selectMapRange}
      onExtendToBase={props.onExtendToBase}
      onPrimerSelect={props.onPrimerSelect}
      onRestrictionSelect={props.onRestrictionSelect}
      onEnzymeInfo={vi.fn()}
      onFeatureEdit={vi.fn()}
    />
  )
}
