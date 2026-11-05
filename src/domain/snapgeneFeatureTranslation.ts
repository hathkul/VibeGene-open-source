import { defaultFeatureTranslationOptions, GENETIC_CODE_NAMES, translateFeature } from './geneticCode'
import type {
  FeatureReadingFrame,
  FeatureTranslationOptions,
  SequenceFeature,
  Strand,
  Topology,
} from './types'

const VALID_READING_FRAMES = new Set<FeatureReadingFrame>([1, 2, 3, -1, -2, -3])

function snapGeneQualifierInt(featureElement: Element, qualifierName: string): number | null {
  const valueElement = featureElement.querySelector(`Q[name="${qualifierName}"] V`)
  if (!valueElement) return null
  const intValue = valueElement.getAttribute('int')
  if (intValue === null) return null
  const parsed = Number(intValue)
  return Number.isFinite(parsed) ? parsed : null
}

export function geneticCodeFromSnapGeneTranslTable(tableNumber: number | null): string {
  if (tableNumber === null || tableNumber < 1) return 'Standard'
  const name = GENETIC_CODE_NAMES[tableNumber - 1]
  return name ?? 'Standard'
}

export function snapGeneTranslTableFromGeneticCode(geneticCode: string): number {
  const index = (GENETIC_CODE_NAMES as readonly string[]).indexOf(geneticCode)
  return index >= 0 ? index + 1 : 1
}

export function parseSnapGeneReadingFrame(value: string | null, strand: Strand): FeatureReadingFrame {
  const parsed = Number(value)
  if (VALID_READING_FRAMES.has(parsed as FeatureReadingFrame)) return parsed as FeatureReadingFrame
  return strand === 'reverse' ? -1 : 1
}

/** SnapGene Sequence-view translation is gated by Segment translated="1" (not /translation or translationMW alone). */
export function featureSnapGeneShowsTranslation(_featureElement: Element, segmentElements: Element[]): boolean {
  return segmentElements.some(
    (segment) => segment.getAttribute('type') !== 'gap' && segment.getAttribute('translated') === '1',
  )
}

export function parseSnapGeneFeatureTranslation(
  featureElement: Element,
  codingSegmentCount: number,
  strand: Strand,
): FeatureTranslationOptions {
  const base = defaultFeatureTranslationOptions(Math.max(1, codingSegmentCount))
  const consecutiveTranslationNumbering = featureElement.getAttribute('consecutiveTranslationNumbering')
  const consecutiveNumberingStartsFrom = Number(featureElement.getAttribute('consecutiveNumberingStartsFrom'))

  return {
    geneticCode: geneticCodeFromSnapGeneTranslTable(snapGeneQualifierInt(featureElement, 'transl_table')),
    firstCodonAsMet: featureElement.getAttribute('translateFirstCodonAsMet') === '1',
    readingFrame: parseSnapGeneReadingFrame(featureElement.getAttribute('readingFrame'), strand),
    consecutiveNumbering: consecutiveTranslationNumbering !== '0',
    segmentNumbering: base.segmentNumbering.map((entry, index) => ({
      startAt: index === 0 && Number.isFinite(consecutiveNumberingStartsFrom) && consecutiveNumberingStartsFrom > 0
        ? consecutiveNumberingStartsFrom
        : entry.startAt,
      skip: entry.skip,
    })),
  }
}

export function snapGeneFeatureTranslationAttrs(feature: SequenceFeature): string {
  if (!feature.translateInSequenceView || !feature.translation) return ''
  const options = feature.translation
  const attrs: string[] = []
  attrs.push(`readingFrame="${options.readingFrame}"`)
  if (options.firstCodonAsMet) attrs.push('translateFirstCodonAsMet="1"')
  attrs.push(`consecutiveTranslationNumbering="${options.consecutiveNumbering ? '1' : '0'}"`)
  if (options.consecutiveNumbering) {
    const startAt = options.segmentNumbering[0]?.startAt ?? 1
    if (startAt !== 1) attrs.push(`consecutiveNumberingStartsFrom="${startAt}"`)
  }
  return attrs.length ? ` ${attrs.join(' ')}` : ''
}

export function snapGeneSegmentTranslatedAttr(feature: SequenceFeature): string {
  return feature.translateInSequenceView ? ' translated="1"' : ''
}

function xmlEscape(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

export function exportSnapGeneTranslationQualifiers(
  feature: SequenceFeature,
  sequence: string,
  topology: Topology,
): string {
  if (!feature.translateInSequenceView || !feature.translation) return ''
  const table = snapGeneTranslTableFromGeneticCode(feature.translation.geneticCode)
  const protein = translateFeature(feature, sequence, feature.translation, { topology })
  return `<Q name="codon_start"><V int="1"/></Q><Q name="translation"><V text="${xmlEscape(protein)}"/></Q><Q name="transl_table"><V int="${table}"/></Q>`
}

export function snapGeneImportedFeatureFields(
  featureElement: Element,
  codingSegmentCount: number,
  strand: Strand,
): Pick<SequenceFeature, 'prioritizeDisplay' | 'translateInSequenceView' | 'translation' | 'cleavageArrows' | 'visible'> {
  const segmentElements = [...featureElement.querySelectorAll('Segment')].filter(
    (segment) => segment.getAttribute('type') !== 'gap',
  )
  const translateInSequenceView = featureSnapGeneShowsTranslation(featureElement, segmentElements)
  const prioritizeDisplay = featureElement.getAttribute('prioritize') === '1'
  const cleavageArrows = parseSnapGeneCleavageArrows(featureElement.getAttribute('cleavageArrows'))
  const visibleAttr = featureElement.getAttribute('visible')
  const hidden = visibleAttr === '0' || visibleAttr === 'false'
  return {
    ...(prioritizeDisplay ? { prioritizeDisplay: true } : {}),
    ...(hidden ? { visible: false } : {}),
    ...(cleavageArrows?.length ? { cleavageArrows } : {}),
    ...(translateInSequenceView
      ? {
          translateInSequenceView: true,
          translation: parseSnapGeneFeatureTranslation(featureElement, codingSegmentCount, strand),
        }
      : {}),
  }
}

/** SnapGene stores 1-based absolute positions; convert to 0-based. */
export function parseSnapGeneCleavageArrows(raw: string | null): number[] | undefined {
  if (!raw?.trim()) return undefined
  const positions = raw
    .split(',')
    .map((part) => Number(part.trim()) - 1)
    .filter((position) => Number.isFinite(position) && position >= 0)
  return positions.length ? [...new Set(positions)].sort((a, b) => a - b) : undefined
}

export function formatSnapGeneCleavageArrows(positions: number[] | undefined): string | undefined {
  if (!positions?.length) return undefined
  return [...new Set(positions)]
    .filter((position) => Number.isFinite(position) && position >= 0)
    .sort((a, b) => a - b)
    .map((position) => String(Math.floor(position) + 1))
    .join(',')
}
