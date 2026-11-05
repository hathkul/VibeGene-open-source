// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { defaultEnzymePreferences } from '../../src/domain/enzymePreferences'
import { parseGenBank } from '../../src/domain/parsers'
import {
  createSgRNAFeatures,
  findSgRNATargets,
  groupSgRNAFeatures,
  SGRNA_PRESETS,
} from '../../src/domain/sgrna'
import {
  sgRnaGuideAnchorBp,
  sgRnaMapDisplaySegments,
  sgRnaVisualSegments,
} from '../../src/domain/sgrnaVisualLayout'
import { PlasmidMap } from '../../src/presentation/map/PlasmidMap'
import { circularMapPolarPoint } from '../../src/domain/circularMapGeometry'

const GUIDE = 'ACGTACGTACGTACGTACGA'
const fixture = resolve(process.cwd(), 'scripts/compactness-guide/guide-construct.gb')
const canvasMeasureText = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
  measureText: (text: string) => ({ width: text.length * 7 }),
} as CanvasRenderingContext2D)
const displaySettings = {
  enzymes: { visible: false, showPositions: false },
  features: { labelsVisible: true, externalLabels: true },
  primers: { visible: false },
  labelRouting: {
    minMapRadiusRatio: 0.34,
    softRingFloorDiameterRatio: 0.72,
    ellipticRingGap: 12,
    ellipticSideBudget: null,
    ellipticHorizontalGapPx: null,
    ellipticVerticalGapPx: null,
    maxEnzymeSiteLabels: 0,
    maxPrimerSiteLabels: null,
    showAllPrimers: false,
  },
}

describe('application compactness guide regression', () => {
  afterAll(() => canvasMeasureText.mockRestore())
  it('preserves the imported guide identity and rendered 5′ anchor across viewport scales', () => {
    const record = parseGenBank(readFileSync(fixture, 'utf8'), 'guide-construct.gb')
    const hit = findSgRNATargets(record.sequence, GUIDE, record.topology, SGRNA_PRESETS[0]!)[0]
    expect(hit).toBeDefined()
    const [guide, pam] = createSgRNAFeatures(hit!, {
      id: 'compactness-guide',
      name: 'Compactness guide',
      nuclease: 'SpCas9',
      pamMotif: 'NGG',
      pamSide: '3prime',
      spacer: GUIDE,
    })
    const annotation = groupSgRNAFeatures([guide, pam])[0]!
    const trueSegments = sgRnaVisualSegments([annotation], record.sequence)
    expect(trueSegments.map((segment) => segment.bases)).toEqual([GUIDE, 'AGG'])

    const anchorBp = sgRnaGuideAnchorBp(annotation)
    for (const pxPerBp of [0.05, 0.1, 0.5, 2]) {
      const displayed = sgRnaMapDisplaySegments(trueSegments, pxPerBp)
      const guideSegment = displayed.find((segment) => segment.part === 'guide')!
      const pamSegment = displayed.find((segment) => segment.part === 'pam')!
      // The SVG map converts these bp positions with the same sequence scale. Verify its
      // leader's bp anchor and the displayed guide start remain at the annotated 5′ end.
      const renderedLeaderX = anchorBp * pxPerBp
      const renderedGuideStartX = guideSegment.strand === 'reverse'
        ? guideSegment.end * pxPerBp
        : guideSegment.start * pxPerBp
      expect(renderedLeaderX).toBeCloseTo(renderedGuideStartX)
      expect(guideSegment.annotation.id).toBe('compactness-guide')
      expect(pamSegment.annotation.id).toBe('compactness-guide')
      expect(guideSegment.end - guideSegment.start).toBeGreaterThanOrEqual(20)
      expect(guideSegment.bases).toBe(GUIDE)
      expect(pamSegment.bases).toBe('AGG')
    }
  })

  it('renders the circular SVG leader at the imported guide 5′ anchor across viewport sizes', async () => {
    const record = parseGenBank(readFileSync(fixture, 'utf8'), 'guide-construct.gb')
    const hit = findSgRNATargets(record.sequence, GUIDE, record.topology, SGRNA_PRESETS[0]!)[0]!
    const guideFeatures = createSgRNAFeatures(hit, {
      id: 'compactness-guide', name: 'Compactness guide', nuclease: 'SpCas9',
      pamMotif: 'NGG', pamSide: '3prime', spacer: GUIDE,
    })
    const guideFeatureId = guideFeatures[0]!.id
    record.features = guideFeatures
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const render = async (width: number, height: number) => {
      await act(async () => {
        root.render(createElement(PlasmidMap, {
          mapSize: Math.min(width, height), viewportWidth: width, viewportHeight: height,
          minLocked: true, record, restrictionSites: [], primerBindings: [], annotationFeatures: guideFeatures,
          displaySettings, enzymePreferences: defaultEnzymePreferences, selectedRange: null,
          selectedFeatureId: guideFeatureId, selectedFeatureIds: [], selectedPrimerId: null,
          onSelect: () => {}, onRangeSelect: () => {}, onPrimerSelect: () => {},
          onRestrictionSelect: () => {}, onEnzymeInfo: () => {}, onFeatureEdit: () => {},
        }))
      })
    }

    try {
      for (const [width, height] of [[520, 520], [760, 640], [1100, 760]]) {
        await render(width!, height!)
        const svg = host.querySelector('svg.plasmid-map')!
        expect(host.querySelectorAll('.enzyme-callout.sgrna-map-callout[data-map-guide-id]')).toHaveLength(1)
        for (const selector of ['.sgrna-map-binding', '.sgrna-map-pam-arrow']) {
          const segments = host.querySelectorAll(selector)
          expect(segments).toHaveLength(1)
          expect(segments[0]!.closest('[data-map-guide-id]')?.getAttribute('data-map-guide-id')).toBe(guideFeatureId)
        }
        const callout = host.querySelector<SVGGElement>('.enzyme-callout.sgrna-map-callout[data-map-guide-id]')!
        const leader = callout.querySelector<SVGPolylineElement>('.sgrna-map-leader')!
        const point = leader.getAttribute('points')!.trim().split(/[ ,]+/).map(Number)
        const ring = host.querySelector<SVGCircleElement>('.map-backbone.outer')!
        const centerX = Number(ring.getAttribute('cx'))
        const centerY = Number(ring.getAttribute('cy'))
        const radius = Number(ring.getAttribute('r')) - 3
        const expected = circularMapPolarPoint(
          sgRnaGuideAnchorBp(groupSgRNAFeatures(guideFeatures)[0]!), record.sequence.length,
          centerX, centerY, radius - 18, 0, record.topology,
        )
        expect(svg.getAttribute('aria-label')).toContain('circular plasmid map')
        expect(callout.getAttribute('data-map-guide-id')).toBe(guideFeatureId)
        expect(callout.textContent).toContain('Compactness guide')
        expect(point[0]).toBeCloseTo(expected.x, 2)
        expect(point[1]).toBeCloseTo(expected.y, 2)
      }
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  })
})
