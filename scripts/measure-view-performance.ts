import { resolveDisplayablePrimerSites } from '../src/domain/primerSequenceLayout'
import { labPlasmid } from '../src/domain/fixtures'
import { enzymes, findRestrictionSites } from '../src/domain/enzymes'
import {
  defaultEnzymePreferences,
  enzymePoolForSettings,
  normalizeEnzymePreferences,
} from '../src/domain/enzymePreferences'
import { annotateRestrictionSiteMethylation } from '../src/domain/methylation'
import { findMotifs } from '../src/domain/sequence'
import {
  chooseCircularMapRadius,
  layoutEnzymeCallouts,
  layoutLinearEnzymeCallouts,
  estimateLinearMapHeightForRows,
  linearCutPosition,
} from '../src/domain/mapLayout'
import { layoutLinearEnzymeCalloutsSimple } from '../src/domain/linearSimpleRouter'
import { layoutSequenceViewLabels } from '../src/domain/sequenceLabelRouter'
import type { RestrictionSite, SequenceFeature, SequenceRecord } from '../src/domain/types'

type BenchResult = {
  task: string
  group: string
  medianMs: number
  meanMs: number
  minMs: number
  maxMs: number
  detail?: string
}

function bench(
  task: string,
  group: string,
  fn: () => unknown,
  iterations = 7,
  detail?: string,
): BenchResult {
  for (let index = 0; index < 2; index += 1) fn()
  const samples: number[] = []
  for (let index = 0; index < iterations; index += 1) {
    const started = performance.now()
    fn()
    samples.push(performance.now() - started)
  }
  samples.sort((a, b) => a - b)
  const medianMs = samples[Math.floor(samples.length / 2)]!
  const meanMs = samples.reduce((sum, value) => sum + value, 0) / samples.length
  return {
    task,
    group,
    medianMs,
    meanMs,
    minMs: samples[0]!,
    maxMs: samples[samples.length - 1]!,
    detail,
  }
}

function resolveEnzymeLabelBudget(mapSize: number) {
  const normalized = (mapSize - 320) / (920 - 320)
  return Math.round(Math.max(80, Math.min(100, 80 + normalized * 20)))
}

function prioritizeEnzymeSites(sites: RestrictionSite[], budget: number) {
  const byEnzyme = new Map<string, RestrictionSite[]>()
  sites.forEach((site) => {
    const list = byEnzyme.get(site.enzyme.name) ?? []
    list.push(site)
    byEnzyme.set(site.enzyme.name, list)
  })

  const ranked = [...byEnzyme.entries()]
    .map(([name, enzymeSites]) => ({
      name,
      sites: enzymeSites,
      count: enzymeSites.length,
      recognitionLength: enzymeSites[0]?.enzyme.recognition.length ?? 0,
    }))
    .toSorted((a, b) => {
      const aSixPlus = a.recognitionLength >= 6 ? 1 : 0
      const bSixPlus = b.recognitionLength >= 6 ? 1 : 0
      if (aSixPlus !== bSixPlus) return bSixPlus - aSixPlus
      if (a.count !== b.count) return a.count - b.count
      if (a.recognitionLength !== b.recognitionLength) return b.recognitionLength - a.recognitionLength
      return a.name.localeCompare(b.name)
    })

  const selected: RestrictionSite[] = []
  let used = 0
  ranked.forEach((group) => {
    if (used + group.count > budget) return
    selected.push(...group.sites)
    used += group.count
  })
  return selected
}

function mergeEnzymeCalloutSites(prioritized: RestrictionSite[]) {
  const byCutTop = new Map<number, RestrictionSite[]>()
  prioritized.forEach((site) => {
    const list = byCutTop.get(site.cutTop) ?? []
    list.push(site)
    byCutTop.set(site.cutTop, list)
  })

  return [...byCutTop.entries()]
    .map(([, sitesAtCut]) => {
      const sorted = sitesAtCut.toSorted((a, b) => a.enzyme.name.localeCompare(b.enzyme.name))
      const primary = sorted[0]!
      return {
        ...primary,
        enzyme: {
          ...primary.enzyme,
          name: sorted.map((site) => site.enzyme.name).join(', '),
        },
        match: '__enzyme_callout__',
      }
    })
    .toSorted((a, b) => a.cutTop - b.cutTop || a.enzyme.name.localeCompare(b.enzyme.name))
}

function featureDrawableSegments(features: SequenceFeature[], sequenceLength: number) {
  return features.flatMap((feature) => {
    const start = Math.max(0, Math.min(sequenceLength, feature.locations[0]?.start ?? 0))
    const end = Math.max(0, Math.min(sequenceLength, feature.locations.at(-1)?.end ?? 0))
    if (start === end) return []
    if (start < end) {
      return [{
        feature,
        segmentId: `${feature.id}:${start}-${end}`,
        start,
        end,
        strand: feature.locations[0]?.strand ?? 'forward' as const,
        level: 0,
        isFeatureStart: true,
        isFeatureEnd: true,
      }]
    }
    return [
      {
        feature,
        segmentId: `${feature.id}:${start}-${sequenceLength}`,
        start,
        end: sequenceLength,
        strand: feature.locations[0]?.strand ?? 'forward' as const,
        level: 0,
        isFeatureStart: true,
        isFeatureEnd: false,
      },
      {
        feature,
        segmentId: `${feature.id}:0-${end}`,
        start: 0,
        end,
        strand: feature.locations[0]?.strand ?? 'forward' as const,
        level: 0,
        isFeatureStart: false,
        isFeatureEnd: true,
      },
    ]
  })
}

function assignFeatureLevels(features: SequenceFeature[], sequenceLength: number) {
  const sorted = featureDrawableSegments(features, sequenceLength)
    .toSorted((a, b) => a.start - b.start || b.end - a.end)
  const levelOccupancy: Array<Array<{ start: number; end: number }>> = []
  return sorted.map((item) => {
    const level = levelOccupancy.findIndex((ranges) => !ranges.some((range) => item.start < range.end && range.start < item.end))
    const resolvedLevel = level === -1 ? levelOccupancy.length : level
    const occupied = levelOccupancy[resolvedLevel] ?? []
    occupied.push({ start: item.start, end: item.end })
    levelOccupancy[resolvedLevel] = occupied
    return { ...item, level: resolvedLevel }
  })
}

function measureSequenceRowLayout(containerWidth: number) {
  const sequenceBaseStepPx = 10
  const sequenceRowSideMarginPx = 36
  const sequenceRowEndIndexPx = 56
  const sequenceRowEndIndexGapPx = 10
  const sequenceTrackInsetPx = 28
  const sequenceRowScrollbarReservePx = 16
  const innerWidth = containerWidth - sequenceRowSideMarginPx * 2 - sequenceRowScrollbarReservePx
  const sequenceBudget = innerWidth - sequenceRowEndIndexPx - sequenceRowEndIndexGapPx - sequenceTrackInsetPx * 2
  const basesPerRow = Math.max(40, Math.floor(sequenceBudget / sequenceBaseStepPx))
  return { basesPerRow, sequenceTrackInsetPx, sequenceBaseStepPx }
}

function runScenario(name: string, record: SequenceRecord) {
  const preferences = normalizeEnzymePreferences(defaultEnzymePreferences)
  const enzymeSettings = {
    set: 'all' as const,
    selectedNames: enzymes.map((enzyme) => enzyme.name),
    supplierSetId: null,
  }
  const parentalSettings = {
    set: preferences.parentalSet === 'all' ? ('all' as const) : ('nonredundant' as const),
    selectedNames: [] as string[],
    supplierSetId: null,
  }
  const searchQuery = 'GAATTC'
  const mapSize = 900
  const trackWidth = 900
  const sequenceContainerWidth = 956
  const sequenceLayout = measureSequenceRowLayout(sequenceContainerWidth)
  const mapFeatures = record.features

  const results: BenchResult[] = []

  let activePool = enzymes
  results.push(
    bench('enzymePoolForSettings (active)', 'shared', () => {
      activePool = enzymePoolForSettings(enzymeSettings, preferences)
    }, 5, `${activePool.length} enzymes`),
  )

  let restrictionSites: RestrictionSite[] = []
  results.push(
    bench('findRestrictionSites (active pool)', 'shared', () => {
      restrictionSites = findRestrictionSites(record.sequence, activePool, { construct: record.construct })
    }, 5, `${restrictionSites.length} sites`),
  )

  results.push(
    bench('annotateRestrictionSiteMethylation (active)', 'shared', () => {
      restrictionSites = annotateRestrictionSiteMethylation(restrictionSites, record.sequence, record.construct)
    }, 5),
  )

  results.push(
    bench('findRestrictionSites (parental pool)', 'shared', () => {
      const parentalPool = enzymePoolForSettings(parentalSettings, preferences)
      annotateRestrictionSiteMethylation(
        findRestrictionSites(record.sequence, parentalPool, { construct: record.construct }),
        record.sequence,
        record.construct,
      )
    }, 5),
  )

  let primerBundle = resolveDisplayablePrimerSites(record)
  results.push(
    bench('resolveDisplayablePrimerSites', 'shared', () => {
      primerBundle = resolveDisplayablePrimerSites(record)
    }, 5, `${primerBundle.displays.length} displays, ${primerBundle.bindings.length} bindings`),
  )

  results.push(
    bench('findMotifs (default GAATTC search)', 'shared', () => {
      findMotifs(record.sequence, searchQuery)
    }, 5),
  )

  const labelBudget = resolveEnzymeLabelBudget(mapSize)
  let prioritizedSites = prioritizeEnzymeSites(restrictionSites, labelBudget)
  results.push(
    bench('prioritize enzyme label sites', 'map', () => {
      prioritizedSites = prioritizeEnzymeSites(restrictionSites, labelBudget)
    }, 5, `${prioritizedSites.length}/${restrictionSites.length} sites, budget=${labelBudget}`),
  )

  let mergedSites = mergeEnzymeCalloutSites(prioritizedSites)
  results.push(
    bench('merge enzyme callout sites', 'map', () => {
      mergedSites = mergeEnzymeCalloutSites(prioritizedSites)
    }, 5, `${mergedSites.length} merged labels`),
  )

  results.push(
    bench('assignFeatureLevels (map features)', 'map', () => {
      assignFeatureLevels(mapFeatures, record.sequence.length)
    }, 5, `${mapFeatures.length} features`),
  )

  results.push(
    bench('chooseCircularMapRadius + layoutEnzymeCallouts', 'map-circular', () => {
      const center = mapSize / 2
      const outerFeatureOffset = 18
      const radius = chooseCircularMapRadius({
        sites: mergedSites,
        sequenceLength: record.sequence.length,
        mapSize,
        center,
        outerFeatureOffset,
      })
      layoutEnzymeCallouts({
        sites: mergedSites,
        sequenceLength: record.sequence.length,
        mapSize,
        center,
        radius,
        outerFeatureOffset,
      })
    }, 5, `${mergedSites.length} labels`),
  )

  const featureBandBottom = 38 + 4 * 34 + 8
  const leftCount = mergedSites.filter((site) => site.cutTop / record.sequence.length < 0.5).length
  const rowsPerHalf = Math.max(leftCount, mergedSites.length - leftCount)
  const layoutHeight = Math.max(
    estimateLinearMapHeightForRows(rowsPerHalf + 4, {
      strandY: 28,
      featureStubHeight: 18,
      featureHeight: 24,
      labelRowLift: 18,
      protectedBandBottom: featureBandBottom,
      textHeight: 14,
    }),
    featureBandBottom + 80 + rowsPerHalf * 28,
  )
  const labelForSite = (site: RestrictionSite) => site.enzyme.name
  const labelWidthForSite = (_site: RestrictionSite, label: string) => Math.max(1, label.length * 6)

  results.push(
    bench('layoutLinearEnzymeCalloutsSimple (linear map)', 'map-linear', () => {
      layoutLinearEnzymeCalloutsSimple({
        sites: mergedSites,
        sequenceLength: record.sequence.length,
        mapWidth: trackWidth,
        mapHeight: layoutHeight,
        trackLeft: 16,
        trackRight: trackWidth - 16,
        strandY: 28,
        protectedBandTop: 38,
        protectedBandBottom: featureBandBottom,
        featureHeight: 24,
        featureStubHeight: 18,
        labelRowLift: 18,
        labelForSite,
        textHeightForSite: () => 12,
        labelPaddingForSite: () => 6,
        labelWidthForSite,
        rulerContactOffset: 1,
      })
    }, 5, `${mergedSites.length} labels`),
  )

  results.push(
    bench('layoutLinearEnzymeCallouts (strict router)', 'map-linear', () => {
      layoutLinearEnzymeCallouts({
        sites: mergedSites,
        sequenceLength: record.sequence.length,
        mapWidth: trackWidth,
        mapHeight: layoutHeight,
        trackLeft: 16,
        trackRight: trackWidth - 16,
        strandY: 28,
        protectedBandTop: 38,
        protectedBandBottom: featureBandBottom,
        featureHeight: 24,
        featureStubHeight: 18,
        labelRowLift: 18,
        labelForSite,
        textHeightForSite: () => 12,
        labelPaddingForSite: () => 6,
        labelWidthForSite,
        rulerContactOffset: 1,
      })
    }, 5, `${mergedSites.length} labels`),
  )

  const rowCount = Math.ceil(record.sequence.length / sequenceLayout.basesPerRow)
  results.push(
    bench('layoutSequenceViewLabels (all rows)', 'sequence', () => {
      layoutSequenceViewLabels({
        enzymeSites: restrictionSites,
        primerSites: [],
        sequenceLength: record.sequence.length,
        basesPerRow: sequenceLayout.basesPerRow,
        baseStepPx: sequenceLayout.sequenceBaseStepPx,
        trackInsetPx: sequenceLayout.sequenceTrackInsetPx,
        collisionUnitPx: 0,
        labelForSite: (site) => site.enzyme.name,
        textHeight: 13,
        labelPadding: 6,
        labelWidthForSite: (_site, label) => Math.max(1, label.length * 6),
      }, rowCount)
    }, 5, `${rowCount} rows, ${restrictionSites.length} enzyme sites, ${sequenceLayout.basesPerRow} bp/row`),
  )

  results.push(
    bench('layoutSequenceViewLabels (per-row average proxy)', 'sequence', () => {
      const sitesInRow = restrictionSites.filter((site) => {
        const cut = linearCutPosition(site)
        return cut >= 0 && cut < sequenceLayout.basesPerRow
      })
      layoutSequenceViewLabels({
        enzymeSites: sitesInRow,
        primerSites: [],
        sequenceLength: sequenceLayout.basesPerRow,
        basesPerRow: sequenceLayout.basesPerRow,
        baseStepPx: sequenceLayout.sequenceBaseStepPx,
        trackInsetPx: sequenceLayout.sequenceTrackInsetPx,
        collisionUnitPx: 0,
        labelForSite: (site) => site.enzyme.name,
        textHeight: 13,
        labelPadding: 6,
        labelWidthForSite: (_site, label) => Math.max(1, label.length * 6),
      }, 1)
    }, 5, `row 0 with ${restrictionSites.filter((site) => linearCutPosition(site) < sequenceLayout.basesPerRow).length} sites`),
  )

  console.log(`\n=== ${name} (${record.sequence.length.toLocaleString()} bp) ===`)
  const groups = ['shared', 'map', 'map-circular', 'map-linear', 'sequence'] as const
  for (const group of groups) {
    const groupResults = results
      .filter((result) => result.group === group)
      .toSorted((a, b) => b.medianMs - a.medianMs)
    if (!groupResults.length) continue
    console.log(`\n${group}:`)
    console.table(
      groupResults.map((result) => ({
        task: result.task,
        medianMs: Number(result.medianMs.toFixed(2)),
        meanMs: Number(result.meanMs.toFixed(2)),
        detail: result.detail ?? '',
      })),
    )
  }

  const top = [...results].toSorted((a, b) => b.medianMs - a.medianMs).slice(0, 8)
  console.log('\nTop bottlenecks overall:')
  top.forEach((result, index) => {
    console.log(`${index + 1}. [${result.group}] ${result.task}: ${result.medianMs.toFixed(2)} ms median${result.detail ? ` (${result.detail})` : ''}`)
  })

  return results
}

const scenarios: Array<{ name: string; record: SequenceRecord }> = [
  { name: 'VibeGene-pDemo fixture', record: labPlasmid },
]

console.log(`Catalog: ${enzymes.length.toLocaleString()} enzymes`)
for (const scenario of scenarios) {
  runScenario(scenario.name, scenario.record)
}

console.log('\nNote: circular PlasmidMap also runs a multi-radius search with feature callouts in React; use ?routerProfile=1 in the browser to profile that path.')
