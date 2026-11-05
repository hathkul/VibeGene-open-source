import { computeFeatureTranslationCells, type FeatureTranslationCell, type GeneticCodeOption } from './geneticCode'
import { normalizeDna, reverseComplement } from './sequence'
import type { SequenceFeature } from './types'

export type OrfDisplayMode = 'orfs-only' | 'frame-plus-1' | 'top-3' | 'bottom-3' | 'all-6'

export type OrfPredictionSettings = {
  mode: OrfDisplayMode
  minimumLengthAa: number
  requireStartCodon: boolean
  startCodon: string
  geneticCode: GeneticCodeOption
}

type OrfPredictionCacheEntry = {
  key: string
  features: SequenceFeature[]
  translations: Map<string, FeatureTranslationCell[]>
}

const ORF_PREDICTION_CACHE_LIMIT = 6
const orfPredictionCache = new Map<string, OrfPredictionCacheEntry>()

export function isOrfFeature(feature: Pick<SequenceFeature, 'id'>) {
  return feature.id.startsWith('orf:')
}

export function orfPredictionCacheKey(sequence: string, settings: OrfPredictionSettings) {
  return [
    sequence.length,
    sequence,
    settings.mode,
    settings.minimumLengthAa,
    settings.requireStartCodon ? '1' : '0',
    settings.startCodon,
    settings.geneticCode,
  ].join('\u0001')
}

function selectedOrfFrames(mode: OrfDisplayMode): Array<{ strand: 'forward' | 'reverse'; frame: 0 | 1 | 2 }> {
  if (mode === 'frame-plus-1') return [{ strand: 'forward', frame: 0 }]
  if (mode === 'top-3') {
    return [
      { strand: 'forward', frame: 0 },
      { strand: 'forward', frame: 1 },
      { strand: 'forward', frame: 2 },
    ]
  }
  if (mode === 'bottom-3') {
    return [
      { strand: 'reverse', frame: 0 },
      { strand: 'reverse', frame: 1 },
      { strand: 'reverse', frame: 2 },
    ]
  }
  return [
    { strand: 'forward', frame: 0 },
    { strand: 'forward', frame: 1 },
    { strand: 'forward', frame: 2 },
    { strand: 'reverse', frame: 0 },
    { strand: 'reverse', frame: 1 },
    { strand: 'reverse', frame: 2 },
  ]
}

function predictOrfFeatures(sequence: string, settings: OrfPredictionSettings) {
  const normalized = normalizeDna(sequence)
  if (!normalized.length) return []

  const stops = new Set(['TAA', 'TAG', 'TGA'])
  const startCodon = normalizeDna(settings.startCodon).slice(0, 3) || 'ATG'
  const minCodons = Math.max(1, Math.floor(settings.minimumLengthAa))
  const forward = normalized
  const reverse = reverseComplement(normalized)
  const length = normalized.length
  const results: SequenceFeature[] = []

  for (const { strand, frame } of selectedOrfFrames(settings.mode)) {
    const strandSequence = strand === 'forward' ? forward : reverse
    let cursor: number = frame

    while (cursor + 2 < strandSequence.length) {
      let codingStart: number = cursor
      if (settings.requireStartCodon) {
        let foundStart = -1
        for (let i = cursor; i + 2 < strandSequence.length; i += 3) {
          if (strandSequence.slice(i, i + 3) === startCodon) {
            foundStart = i
            break
          }
        }
        if (foundStart < 0) break
        codingStart = foundStart
      }

      let stopIndex = -1
      for (let i = codingStart + 3; i + 2 < strandSequence.length; i += 3) {
        if (stops.has(strandSequence.slice(i, i + 3))) {
          stopIndex = i
          break
        }
      }

      const codingEndExclusive =
        stopIndex >= 0 ? stopIndex + 3 : strandSequence.length - ((strandSequence.length - codingStart) % 3)
      const aminoLength = Math.floor((codingEndExclusive - codingStart) / 3)
      if (aminoLength >= minCodons && codingEndExclusive > codingStart) {
        const genomicStart = strand === 'forward' ? codingStart : length - codingEndExclusive
        const genomicEnd = strand === 'forward' ? codingEndExclusive : length - codingStart
        const oneBasedFrame = frame + 1
        const strandTag = strand === 'forward' ? '+' : '-'
        results.push({
          id: `orf:${strand}:${frame}:${genomicStart}-${genomicEnd}`,
          name: `ORF ${strandTag}${oneBasedFrame} (${aminoLength} aa)`,
          type: 'ORF',
          color: strand === 'forward' ? '#f5bf3d' : '#9be06a',
          notes: `/note="ORF ${strandTag}${oneBasedFrame}; ${aminoLength} aa; mode=${settings.mode}"`,
          translateInSequenceView: true,
          translation: {
            geneticCode: settings.geneticCode,
            firstCodonAsMet: false,
            readingFrame: strand === 'reverse' ? -1 : 1,
            consecutiveNumbering: true,
            segmentNumbering: [{ startAt: 1, skip: false }],
          },
          locations: [{ start: genomicStart, end: genomicEnd, strand }],
        })
      }

      if (stopIndex < 0) break
      cursor = stopIndex + 3
    }
  }

  return results
    .filter((feature) => feature.locations[0] && feature.locations[0].end > feature.locations[0].start)
    .sort((a, b) => a.locations[0].start - b.locations[0].start || a.locations[0].end - b.locations[0].end)
}

function buildOrfTranslations(features: SequenceFeature[], sequence: string) {
  const translations = new Map<string, FeatureTranslationCell[]>()
  features.forEach((feature) => {
    if (!feature.translation) return
    const cells = computeFeatureTranslationCells(feature, sequence, feature.translation)
    if (cells.length) translations.set(feature.id, cells)
  })
  return translations
}

function touchOrfPredictionCache(key: string, entry: OrfPredictionCacheEntry) {
  orfPredictionCache.delete(key)
  orfPredictionCache.set(key, entry)
  if (orfPredictionCache.size <= ORF_PREDICTION_CACHE_LIMIT) return
  const oldestKey = orfPredictionCache.keys().next().value
  if (oldestKey) orfPredictionCache.delete(oldestKey)
}

export function getCachedOrfPrediction(sequence: string, settings: OrfPredictionSettings) {
  const key = orfPredictionCacheKey(sequence, settings)
  const cached = orfPredictionCache.get(key)
  if (cached) {
    touchOrfPredictionCache(key, cached)
    return cached
  }

  const features = predictOrfFeatures(sequence, settings)
  const entry: OrfPredictionCacheEntry = {
    key,
    features,
    translations: buildOrfTranslations(features, sequence),
  }
  touchOrfPredictionCache(key, entry)
  return entry
}

export function getCachedOrfFeatures(sequence: string, settings: OrfPredictionSettings) {
  return getCachedOrfPrediction(sequence, settings).features
}

export function getCachedOrfTranslations(sequence: string, settings: OrfPredictionSettings) {
  return getCachedOrfPrediction(sequence, settings).translations
}

/** @internal Test helper */
export function clearOrfPredictionCacheForTests() {
  orfPredictionCache.clear()
}
