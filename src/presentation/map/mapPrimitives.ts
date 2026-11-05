import type { MouseEvent } from 'react'
import { enzymeNamesFromLabel, resolveEnzymeNameFromLabelClick } from '../../domain/enzymeLabel'
import { restrictionSiteForCalloutEnzyme } from '../../domain/restrictionSiteFilters'
import { isFeatureNoColor } from '../../domain/featureAppearance'
import { featureDisplayName as resolveFeatureDisplayName } from '../../domain/genbankFeatureName'
import { groupSgRNAFeatures, type SgRNAAnnotation } from '../../domain/sgrna'
import { sgRnaGuideAnchorBp } from '../../domain/sgrnaVisualLayout'
import { circularMapStartAngle, circularMapSweepRadians } from '../../domain/circularMapGeometry'
import { enzymeSiteDisplayName } from '../../domain/methylation'
import { featureArrowForPiece } from '../../domain/featureDirectionality'
import type { RestrictionSite, SequenceFeature, Topology } from '../../domain/types'
import { featureTypeHasArrow, type FeatureRenderInfo } from './featureRendering'

export type SelectionRange = { start: number; end: number }
export type RestrictionSiteList = RestrictionSite[]

let sharedMeasureCanvas: HTMLCanvasElement | null = null

/** Transparent hit band along the circular/linear ruler for drag-to-select. */
export function circularMapRulerSelectBandPath(
  cx: number,
  cy: number,
  radius: number,
  bandHalfWidth: number,
  tickLength: number,
  topology: Topology,
): string {
  const innerR = Math.max(0, radius - bandHalfWidth)
  const outerR = radius + bandHalfWidth + tickLength

  if (topology === 'circular') {
    return [
      `M ${cx + outerR} ${cy}`,
      `A ${outerR} ${outerR} 0 1 1 ${cx - outerR} ${cy}`,
      `A ${outerR} ${outerR} 0 1 1 ${cx + outerR} ${cy}`,
      `M ${cx + innerR} ${cy}`,
      `A ${innerR} ${innerR} 0 1 0 ${cx - innerR} ${cy}`,
      `A ${innerR} ${innerR} 0 1 0 ${cx + innerR} ${cy}`,
    ].join(' ')
  }

  const startAngle = circularMapStartAngle('linear')
  const sweep = circularMapSweepRadians('linear')
  const endAngle = startAngle + sweep
  const largeArc = sweep > Math.PI ? 1 : 0
  const polar = (r: number, angle: number) => ({
    x: cx + Math.cos(angle) * r,
    y: cy + Math.sin(angle) * r,
  })
  const outerStart = polar(outerR, startAngle)
  const outerEnd = polar(outerR, endAngle)
  const innerStart = polar(innerR, startAngle)
  const innerEnd = polar(innerR, endAngle)
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ')
}
/** Cleavage arrows on a drawable segment (0-based positions within [start, end)). */
export function cleavageArrowsOnSegment(feature: SequenceFeature, start: number, end: number): number[] {
  if (!feature.cleavageArrows?.length) return []
  return feature.cleavageArrows.filter((position) => position >= start && position < end)
}

export function featureContainsPosition(feature: SequenceFeature, position: number, sequenceLength: number) {
  void sequenceLength
  return feature.locations.some((location) => {
    if (location.end > location.start) return position >= location.start && position < location.end
    if (location.end === location.start) return false
    return position >= location.start || position < location.end
  })
}


export function linearFeatureShowsArrow(info: Pick<FeatureRenderInfo, 'feature' | 'strand' | 'isFeatureStart' | 'isFeatureEnd'>) {
  if (!info.feature.directionality && !featureTypeHasArrow(info.feature.type)) return false
  return featureArrowForPiece(info) !== 'none'
}

/** Match circular map feature band: FEATURE_WIDTH 15.5, flap +4.25, tip ~16px. */
export const LINEAR_FEATURE_HALF_WIDTH = 7.75
export const LINEAR_FEATURE_ARROW_PX = 16
export const LINEAR_FEATURE_FLAP_EXTRA = 4.25

export function linearFeatureBandPath(
  x: number,
  y: number,
  width: number,
  height: number,
  arrow: 'none' | 'forward' | 'reverse' | 'both',
) {
  const w = Math.max(1, width)
  const h = Math.max(1, height)
  const cy = y + h / 2
  const halfW = h / 2
  if (arrow === 'none') {
    return `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`
  }
  const arrowPx = Math.min(LINEAR_FEATURE_ARROW_PX, Math.max(2, w / 2))
  const flapW = halfW + LINEAR_FEATURE_FLAP_EXTRA
  if (arrow === 'both') {
    const bodyStart = x + arrowPx
    const bodyEnd = x + w - arrowPx
    return `M ${bodyStart} ${y} H ${bodyEnd} L ${bodyEnd} ${cy - flapW} L ${x + w} ${cy} L ${bodyEnd} ${cy + flapW} L ${bodyEnd} ${y + h} H ${bodyStart} L ${bodyStart} ${cy + flapW} L ${x} ${cy} L ${bodyStart} ${cy - flapW} Z`
  }
  if (arrow === 'forward') {
    const bodyEnd = x + w - arrowPx
    return `M ${x} ${y} H ${bodyEnd} L ${bodyEnd} ${cy - flapW} L ${x + w} ${cy} L ${bodyEnd} ${cy + flapW} L ${bodyEnd} ${y + h} H ${x} Z`
  }
  const bodyStart = x + arrowPx
  return `M ${bodyStart} ${y} H ${x + w} V ${y + h} H ${bodyStart} L ${bodyStart} ${cy + flapW} L ${x} ${cy} L ${bodyStart} ${cy - flapW} Z`
}

export function featureDisplayName(feature: SequenceFeature) {
  return resolveFeatureDisplayName(feature)
}

export function contrastTextColor(hexColor: string) {
  if (isFeatureNoColor(hexColor)) return '#111'
  const normalized = hexColor.replace('#', '')
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return '#111'
  const red = Number.parseInt(normalized.slice(0, 2), 16) / 255
  const green = Number.parseInt(normalized.slice(2, 4), 16) / 255
  const blue = Number.parseInt(normalized.slice(4, 6), 16) / 255
  const linearize = (value: number) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  const luminance = 0.2126 * linearize(red) + 0.7152 * linearize(green) + 0.0722 * linearize(blue)
  // WCAG contrast ratios for black and white cross at ~0.179 luminance.
  // Using that crossover keeps names readable on saturated mid-light feature
  // colours (notably green and orange), where white text has poor contrast.
  return luminance > 0.179 ? '#111' : '#fff'
}

/** Lighten dark primer colours only as much as needed to remain legible on the night canvas. */
export function darkThemePrimerColor(hexColor: string) {
  const normalized = hexColor.replace('#', '')
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return '#b9c6d8'

  const source = [0, 2, 4].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16))
  const background = [16, 26, 40]
  const linearize = (value: number) => {
    const channel = value / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  }
  const luminance = (rgb: number[]) =>
    0.2126 * linearize(rgb[0]) + 0.7152 * linearize(rgb[1]) + 0.0722 * linearize(rgb[2])
  const backgroundLuminance = luminance(background)
  const meetsContrast = (rgb: number[]) => (luminance(rgb) + 0.05) / (backgroundLuminance + 0.05) >= 4.5

  let low = 0
  let high = 1
  for (let attempt = 0; attempt < 12 && !meetsContrast(source.map((channel) => Math.round(channel + (255 - channel) * high))); attempt += 1) {
    high = Math.min(1, high * 1.5)
  }
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const mix = (low + high) / 2
    const candidate = source.map((channel) => Math.round(channel + (255 - channel) * mix))
    if (meetsContrast(candidate)) high = mix
    else low = mix
  }
  return `#${source.map((channel) => Math.round(channel + (255 - channel) * high).toString(16).padStart(2, '0')).join('')}`
}


export function linearSelectionSegments(
  range: SelectionRange | null,
  sequenceLength: number,
  topology: 'circular' | 'linear' = 'circular',
) {
  if (!range) return []
  if (range.start <= range.end) return [{ start: range.start, end: range.end }]
  // Linear topology never wraps through the origin — normalize instead of painting both ends.
  if (topology === 'linear') return [{ start: range.end, end: range.start }]
  return [
    { start: range.start, end: sequenceLength },
    { start: 0, end: range.end },
  ]
}

export function siteKey(site: RestrictionSite) {
  return `${site.enzyme.name}-${site.start}-${site.cutTop}-${site.cutBottom}`
}

export function calloutLabelForSite(site: RestrictionSite, showEnzymePositions: boolean) {
  if (site.match === '__feature_callout__') return site.enzyme.name
  if (site.match.startsWith('__primer_callout__')) return site.enzyme.name
  if (site.match === '__enzyme_callout__') {
    return enzymeSiteDisplayName(site, showEnzymePositions, 'cut')
  }
  return enzymeSiteDisplayName(site, showEnzymePositions, 'start')
}

export function restrictionSiteRange(site: RestrictionSite, sequenceLength: number): SelectionRange {
  return { start: site.start, end: site.end === 0 ? sequenceLength : site.end }
}

export function enzymeSiteCounts(sites: RestrictionSiteList) {
  const seen = new Set<string>()
  return sites.reduce<Record<string, number>>((counts, site) => {
    const key = `${site.enzyme.name}@${site.start}@${site.end}@${site.cutTop}@${site.cutBottom}`
    if (seen.has(key)) return counts
    seen.add(key)
    counts[site.enzyme.name] = (counts[site.enzyme.name] ?? 0) + 1
    return counts
  }, {})
}

export function resolveEnzymeLabelBudget(mapSize: number) {
  const normalized = (mapSize - 320) / (920 - 320)
  return Math.round(Math.max(80, Math.min(100, 80 + normalized * 20)))
}

export function hashString(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function measureTextWidthPx(text: string, font: string, fallbackPerChar = 6) {
  if (typeof document === 'undefined') return Math.max(1, text.length * fallbackPerChar)
  if (!sharedMeasureCanvas) sharedMeasureCanvas = document.createElement('canvas')
  const context = sharedMeasureCanvas.getContext('2d')
  if (!context) return Math.max(1, text.length * fallbackPerChar)
  context.font = font
  return Math.max(1, context.measureText(text).width)
}

/** Map-selection accent for primers — navy, distinct from primer palette blues/purples. */
export const SELECTED_PRIMER_MAP_COLOR = '#0a2342'

export function primerIsSelectedOnMap(primerId: string, selectedPrimerId: string | null, selectedPrimerIds: string[]) {
  return selectedPrimerIds.includes(primerId) || primerId === selectedPrimerId
}

export function restrictionSiteIsSelected(site: RestrictionSite, selectedSites: RestrictionSite[] | undefined) {
  if (!selectedSites?.length) return false
  const key = siteKey(site)
  return selectedSites.some((selected) => siteKey(selected) === key)
}

export function primerMapAccentColor(primerColor: string, selected: boolean) {
  return selected ? SELECTED_PRIMER_MAP_COLOR : primerColor
}


type SgRnaVisualPart = { annotation: SgRNAAnnotation; part: 'guide' | 'pam' }

export function sgRnaVisualParts(features: SequenceFeature[]): Map<string, SgRnaVisualPart> {
  const parts = new Map<string, SgRnaVisualPart>()
  for (const annotation of groupSgRNAFeatures(features)) {
    parts.set(annotation.guide.id, { annotation, part: 'guide' })
    if (annotation.pam) parts.set(annotation.pam.id, { annotation, part: 'pam' })
  }
  return parts
}

export function sgRnaCalloutSite(annotation: SgRNAAnnotation, index: number): RestrictionSite {
  const anchor = sgRnaGuideAnchorBp(annotation)
  return {
    enzyme: {
      name: annotation.guide.name,
      notation: '',
      recognition: '',
      cutTop: anchor,
      cutBottom: anchor,
      type: 'II',
      overhang: { type: 'blunt', sequence: null, length: 0 },
      manufacturers: [],
      notes: [],
    },
    start: anchor,
    end: anchor,
    match: `__primer_callout__sgrna_${index}`,
    cutTop: anchor,
    cutBottom: anchor,
  }
}

export function orfGlowColor(feature: SequenceFeature) {
  return feature.locations[0]?.strand === 'reverse' ? '#d8f5c4' : '#fce9a8'
}

export function orfCoreColor(feature: SequenceFeature) {
  return feature.locations[0]?.strand === 'reverse' ? '#3f7a24' : '#8a5a12'
}

/** Linear-map row density remains width-based; circular maps use circularMapResponsive. */
export function visibleLinearFeatureLevelLimit(size: number) {
  // Match circular dialog-friendly floors so overlapping features are not
  // forced onto a single track in the restriction-cloning / PCR panes.
  if (size <= 280) return 1
  if (size < 560) return 2
  if (size < 780) return 3
  if (size < 980) return 4
  if (size < 1180) return 6
  return Number.POSITIVE_INFINITY
}


/**
 * Open enzyme properties from a callout group double-click. Handled on the parent
 * <g> so it still fires after the first click selects the site and swaps the label
 * markup (SelectedMapCalloutLabel replaces EnzymeCalloutLabelText).
 */
export function openEnzymeInfoFromCalloutGroup(
  event: MouseEvent<SVGGElement>,
  label: string,
  fallbackName: string,
  onEnzymeInfo: (enzymeName: string) => void,
) {
  event.stopPropagation()
  event.preventDefault()
  const text = event.currentTarget.querySelector('text')
  if (text instanceof SVGTextElement) {
    onEnzymeInfo(resolveEnzymeNameFromLabelClick(text, label, event.clientX, event.clientY))
    return
  }
  onEnzymeInfo(enzymeNamesFromLabel(label)[0] ?? fallbackName)
}

/** Resolve a click on a comma-joined callout back to the real enzyme site under the pointer. */
export function restrictionSiteFromCalloutClick(
  event: MouseEvent<SVGGElement>,
  label: string,
  fallbackSite: RestrictionSite,
  restrictionSites: RestrictionSiteList,
) {
  const text = event.currentTarget.querySelector('text')
  const enzymeName =
    text instanceof SVGTextElement
      ? resolveEnzymeNameFromLabelClick(text, label, event.clientX, event.clientY)
      : enzymeNamesFromLabel(label)[0] ?? fallbackSite.enzyme.name
  return restrictionSiteForCalloutEnzyme(fallbackSite, enzymeName, restrictionSites)
}
