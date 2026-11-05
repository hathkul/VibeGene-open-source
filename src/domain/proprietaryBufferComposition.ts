/**
 * Inverse of `inferTargetActivity`: grid-search 1X compositions that best
 * reproduce measured activity in unpublished proprietary buffers when those
 * candidates are run through the same forward interpolator.
 *
 * Results are “most consistent with 1X ≈ …” on the discrete grid — not an
 * official recipe. Do not treat millimolar values as more precise than the grid.
 */

import type { EnzymeManufacturer, EnzymeManufacturerId, RestrictionEnzyme } from './types.ts'
import {
  BUFFER_COMPOSITIONS,
  inferTargetActivity,
  nativeObservedPoints,
  parseActivity,
  profileNeedsAdditive,
  type BufferComposition,
  type ObservedPoint,
  type ParsedActivity,
  type ProteinCarrier,
  type Reductant,
} from './crossVendorBufferActivity.ts'

export const SALT_GRID_MM = [0, 25, 33, 50, 66, 75, 100, 125, 150] as const
export const PH_GRID = [7.0, 7.5, 7.6, 7.9, 8.5] as const
export const MG_GRID_MM = [5, 6, 10] as const
export const ANION_GRID = ['chloride', 'acetate'] as const
export const CARRIER_GRID = ['none', 'BSA'] as const
export const REDUCTANT_GRID = ['none', 'DTT', 'BME'] as const

const EMPTY_EXTRAS = {
  needsAdditive: [] as string[],
  starInLowSalt: false,
  preferredIsSpecific: false,
}

const RUNNER_MAE_DELTA = 5
const LOO_MAX_N = 14

export type CompositionGuess = {
  monovalentSalt_mM: number
  mg_mM: number
  pH: number
  anion: 'chloride' | 'acetate'
  proteinCarrier: 'none' | 'BSA'
  reductant: 'none' | 'DTT' | 'BME'
}

export type FitObservation = {
  enzyme: string
  measured: ParsedActivity
  observed: ObservedPoint[]
  sourceVendor: EnzymeManufacturerId
}

export type ScoredGuess = CompositionGuess & { mae: number }

export type ExampleResidual = {
  enzyme: string
  measuredMid: number
  predictedMid: number
}

export type BufferFitResult = {
  id: string
  vendor: EnzymeManufacturerId
  buffer: string
  nEnzymes: number
  mae: number | null
  holdoutMae: number | null
  holdoutN: number
  holdoutMethod: 'none' | '20pct' | 'loo'
  best: CompositionGuess | null
  runnersUp: ScoredGuess[]
  tyingIonRecipes: number
  analogPublishedBuffer: string | null
  confidence: 'high' | 'medium' | 'low' | 'none'
  notes: string[]
  examples: ExampleResidual[]
}

export type ProprietaryCatalogFit = {
  generatedAt: string
  model: string
  buffers: BufferFitResult[]
}

type TiePrefer = {
  proteinCarrier?: 'none' | 'BSA'
  reductant?: 'none' | 'DTT' | 'BME'
  pH?: number
}

type TargetSpec = {
  id: string
  vendor: EnzymeManufacturerId
  buffer: string
  observedFrom: 'same-vendor' | 'other-vendors'
  grid: 'full' | 'salt-anion'
  fixed?: Partial<CompositionGuess>
  tiePrefer?: TiePrefer
  extraNotes: string[]
}

const TARGETS: TargetSpec[] = [
  {
    id: 'sibenzyme:rose',
    vendor: 'sibenzyme',
    buffer: 'rose',
    observedFrom: 'same-vendor',
    grid: 'full',
    tiePrefer: { proteinCarrier: 'none', reductant: 'DTT', pH: 7.6 },
    extraNotes: [
      'ROSE+ is published as ROSE + 100 µg/ml BSA; this fit is for ROSE ions. BSA vs none is a tie-break only when MAE matches.',
    ],
  },
  {
    id: 'jena:ub',
    vendor: 'jena',
    buffer: 'ub',
    observedFrom: 'same-vendor',
    grid: 'full',
    tiePrefer: { proteinCarrier: 'BSA', reductant: 'none', pH: 7.9 },
    extraNotes: [],
  },
  {
    id: 'jena:ub05',
    vendor: 'jena',
    buffer: 'ub05',
    observedFrom: 'same-vendor',
    grid: 'full',
    tiePrefer: { proteinCarrier: 'BSA', reductant: 'none', pH: 7.9 },
    extraNotes: ['Independent 0.5× column fit; compare to scaled ions of the 1× UB guess.'],
  },
  {
    id: 'jena:ub2',
    vendor: 'jena',
    buffer: 'ub2',
    observedFrom: 'same-vendor',
    grid: 'full',
    tiePrefer: { proteinCarrier: 'BSA', reductant: 'none', pH: 7.9 },
    extraNotes: ['Independent 2× column fit; compare to scaled ions of the 1× UB guess.'],
  },
  {
    id: 'eurx:one',
    vendor: 'eurx',
    buffer: 'one',
    observedFrom: 'other-vendors',
    grid: 'full',
    tiePrefer: { proteinCarrier: 'BSA', reductant: 'none', pH: 7.9 },
    extraNotes: [
      'Most EURx listings are 100% in ONE; the fit uses enzymes that also have a Thermo/NEB/etc known-composition chart.',
      'BSA is added separately at 100 µg/ml in the working reaction (not necessarily part of the 10× stock).',
    ],
  },
  {
    id: 'eurx:sau3AI',
    vendor: 'eurx',
    buffer: 'sau3AI',
    observedFrom: 'other-vendors',
    grid: 'full',
    tiePrefer: { proteinCarrier: 'BSA', reductant: 'none', pH: 7.9 },
    extraNotes: ['Few enzymes; unpublished + BSA + detergent. Treat as underconstrained if N is small or MAE stays large.'],
  },
  {
    id: 'eurx:tspGWI',
    vendor: 'eurx',
    buffer: 'tspGWI',
    observedFrom: 'other-vendors',
    grid: 'salt-anion',
    fixed: { pH: 8.5, mg_mM: 10, proteinCarrier: 'none', reductant: 'DTT' },
    extraNotes: ['Partial Tris/Mg/DTT already known; grid is extra salt + anion only.'],
  },
  {
    id: 'eurx:tspDTI',
    vendor: 'eurx',
    buffer: 'tspDTI',
    observedFrom: 'other-vendors',
    grid: 'salt-anion',
    fixed: { pH: 8.5, mg_mM: 10, proteinCarrier: 'none', reductant: 'DTT' },
    extraNotes: ['Partial Tris/Mg/DTT already known; grid is extra salt + anion only.'],
  },
]

export function guessToComposition(guess: CompositionGuess, label = 'candidate'): BufferComposition {
  const unusual: string[] = []
  if (guess.mg_mM < 8) unusual.push('lowMg')
  if (guess.pH >= 8.5) unusual.push('highpH')
  if (guess.monovalentSalt_mM >= 150) unusual.push('highSalt')
  return {
    vendor: 'neb',
    buffer: label,
    known: true,
    proprietary: false,
    partial: false,
    compositionSource: 'high',
    monovalentSalt_mM: guess.monovalentSalt_mM,
    mg_mM: guess.mg_mM,
    pH: guess.pH,
    anion: guess.anion,
    proteinCarrier: guess.proteinCarrier,
    reductant: guess.reductant,
    unusual,
  }
}

export function formatGuess(guess: CompositionGuess): string {
  const carrier = guess.proteinCarrier === 'none' ? 'no protein carrier' : guess.proteinCarrier
  const reductant = guess.reductant === 'none' ? 'no reductant' : guess.reductant
  return `${guess.monovalentSalt_mM} mM ${guess.anion}, pH ${guess.pH}, ${guess.mg_mM} mM Mg, ${carrier}, ${reductant}`
}

export function buildCompositionGrid(spec: { grid: 'full' | 'salt-anion'; fixed?: Partial<CompositionGuess> }): CompositionGuess[] {
  const guesses: CompositionGuess[] = []
  if (spec.grid === 'salt-anion') {
    for (const salt of SALT_GRID_MM) {
      for (const anion of ANION_GRID) {
        guesses.push({
          monovalentSalt_mM: salt,
          mg_mM: spec.fixed?.mg_mM ?? 10,
          pH: spec.fixed?.pH ?? 7.9,
          anion,
          proteinCarrier: spec.fixed?.proteinCarrier ?? 'none',
          reductant: spec.fixed?.reductant ?? 'DTT',
        })
      }
    }
    return guesses
  }
  for (const salt of SALT_GRID_MM) {
    for (const pH of PH_GRID) {
      for (const mg of MG_GRID_MM) {
        for (const anion of ANION_GRID) {
          for (const proteinCarrier of CARRIER_GRID) {
            for (const reductant of REDUCTANT_GRID) {
              guesses.push({
                monovalentSalt_mM: salt,
                mg_mM: mg,
                pH,
                anion,
                proteinCarrier,
                reductant,
              })
            }
          }
        }
      }
    }
  }
  return guesses
}

function pickKnownChart(enzyme: RestrictionEnzyme, excludeVendor: EnzymeManufacturerId): EnzymeManufacturer | null {
  const ranked = enzyme.manufacturers
    .filter((profile) => profile.id !== excludeVendor)
    .filter((profile) => profileNeedsAdditive(profile).length === 0)
    .map((profile) => ({ profile, n: nativeObservedPoints(profile).length }))
    .filter((row) => row.n >= 2)
    .toSorted((a, b) => b.n - a.n || a.profile.id.localeCompare(b.profile.id))
  return ranked[0]?.profile ?? null
}

export function collectFitObservations(
  enzymes: RestrictionEnzyme[],
  spec: { vendor: EnzymeManufacturerId; buffer: string; observedFrom: 'same-vendor' | 'other-vendors' },
): FitObservation[] {
  const rows: FitObservation[] = []
  for (const enzyme of enzymes) {
    const proprietaryProfile = enzyme.manufacturers.find((profile) => profile.id === spec.vendor)
    if (!proprietaryProfile) continue
    if (profileNeedsAdditive(proprietaryProfile).length > 0) continue
    const measured = parseActivity(proprietaryProfile.bufferActivity[spec.buffer as keyof typeof proprietaryProfile.bufferActivity])
    if (!measured?.interpolatable || measured.mid === null) continue

    let chart: EnzymeManufacturer | null = null
    if (spec.observedFrom === 'same-vendor') {
      if (nativeObservedPoints(proprietaryProfile).length >= 2) chart = proprietaryProfile
    } else {
      chart = pickKnownChart(enzyme, spec.vendor)
    }
    if (!chart) continue
    const observed = nativeObservedPoints(chart)
    if (observed.length < 2) continue
    rows.push({ enzyme: enzyme.name, measured, observed, sourceVendor: chart.id })
  }
  return rows.toSorted((a, b) => a.enzyme.localeCompare(b.enzyme))
}

function predictMid(observed: ObservedPoint[], guess: CompositionGuess): number | null {
  const prediction = inferTargetActivity(observed, guessToComposition(guess), EMPTY_EXTRAS)
  if (prediction.confidence === 'none') return null
  return (prediction.inferredLo + prediction.inferredHi) / 2
}

type RankedGuess = { guess: CompositionGuess; mae: number; n: number }

function rankGuesses(observations: FitObservation[], grid: CompositionGuess[], tiePrefer?: TiePrefer): RankedGuess[] {
  const ranked: RankedGuess[] = []
  for (const guess of grid) {
    const target = guessToComposition(guess)
    let abs = 0
    let n = 0
    for (const row of observations) {
      const prediction = inferTargetActivity(row.observed, target, EMPTY_EXTRAS)
      if (prediction.confidence === 'none' || row.measured.mid === null) continue
      const mid = (prediction.inferredLo + prediction.inferredHi) / 2
      abs += Math.abs(mid - row.measured.mid)
      n += 1
    }
    if (n === 0) continue
    ranked.push({ guess, mae: abs / n, n })
  }
  return ranked.toSorted((a, b) => compareRanked(a, b, tiePrefer))
}

function preferRank(value: string, prefer: string | undefined) {
  if (!prefer) return 0
  return value === prefer ? 0 : 1
}

function reductantOrder(value: CompositionGuess['reductant']) {
  if (value === 'none') return 0
  if (value === 'DTT') return 1
  return 2
}

function compareRanked(a: RankedGuess, b: RankedGuess, tiePrefer?: TiePrefer) {
  if (a.mae !== b.mae) return a.mae - b.mae
  const carrier = preferRank(a.guess.proteinCarrier, tiePrefer?.proteinCarrier) - preferRank(b.guess.proteinCarrier, tiePrefer?.proteinCarrier)
  if (carrier !== 0) return carrier
  const reductant = preferRank(a.guess.reductant, tiePrefer?.reductant) - preferRank(b.guess.reductant, tiePrefer?.reductant)
  if (reductant !== 0) return reductant
  const reductantKind = reductantOrder(a.guess.reductant) - reductantOrder(b.guess.reductant)
  if (reductantKind !== 0) return reductantKind
  if (tiePrefer?.pH != null) {
    const pHDelta = Math.abs(a.guess.pH - tiePrefer.pH) - Math.abs(b.guess.pH - tiePrefer.pH)
    if (pHDelta !== 0) return pHDelta
  }
  return ionKey(a.guess).localeCompare(ionKey(b.guess)) || guessKey(a.guess).localeCompare(guessKey(b.guess))
}

export function ionKey(guess: CompositionGuess) {
  return `${guess.anion}|${guess.monovalentSalt_mM}|${guess.pH}|${guess.mg_mM}`
}

function guessKey(guess: CompositionGuess) {
  return `${ionKey(guess)}|${guess.proteinCarrier}|${guess.reductant}`
}

function maeOf(observations: FitObservation[], guess: CompositionGuess): number | null {
  if (observations.length === 0) return null
  let abs = 0
  let n = 0
  for (const row of observations) {
    const mid = predictMid(row.observed, guess)
    if (mid === null || row.measured.mid === null) continue
    abs += Math.abs(mid - row.measured.mid)
    n += 1
  }
  return n === 0 ? null : abs / n
}

function round1(value: number) {
  return Math.round(value * 10) / 10
}

function splitHoldout(names: string[]): { train: Set<string>; holdout: Set<string>; method: '20pct' | 'loo' } {
  const sorted = [...names].toSorted((a, b) => a.localeCompare(b))
  if (sorted.length <= LOO_MAX_N) {
    return { train: new Set(sorted), holdout: new Set(), method: 'loo' }
  }
  const holdout = new Set<string>()
  for (let i = 4; i < sorted.length; i += 5) holdout.add(sorted[i]!)
  const train = new Set(sorted.filter((name) => !holdout.has(name)))
  return { train, holdout, method: '20pct' }
}

function analogDistance(guess: CompositionGuess, published: BufferComposition): number {
  const saltA = guess.monovalentSalt_mM
  const saltB = published.monovalentSalt_mM ?? 50
  const pHa = guess.pH
  const pHb = published.pH ?? 7.9
  const mgA = guess.mg_mM
  const mgB = published.mg_mM ?? 10
  const anionPenalty = guess.anion === published.anion ? 0 : published.anion === 'unknown' || published.anion === 'mixed' ? 2 : 1.4
  const publishedCarrier: ProteinCarrier = published.proteinCarrier
  const carrierPenalty =
    guess.proteinCarrier === 'none'
      ? publishedCarrier === 'none'
        ? 0
        : 0.35
      : publishedCarrier === 'none'
        ? 0.35
        : 0
  const reductantPenalty = reductantClass(guess.reductant) === reductantClass(published.reductant) ? 0 : 0.25
  return Math.abs(saltA - saltB) / 50 + Math.abs(pHa - pHb) / 0.5 + Math.abs(mgA - mgB) / 5 + anionPenalty + carrierPenalty + reductantPenalty
}

function reductantClass(value: Reductant) {
  return value === 'none' ? 'none' : 'present'
}

function closestAnalogs(guess: CompositionGuess): { label: string; distance: number }[] {
  const known = BUFFER_COMPOSITIONS.filter(
    (entry) => entry.known && !entry.proprietary && !entry.partial && (entry.anion === 'chloride' || entry.anion === 'acetate'),
  )
  return known
    .map((entry) => ({
      label: `${entry.vendor}:${entry.buffer}`,
      distance: analogDistance(guess, entry),
    }))
    .toSorted((a, b) => a.distance - b.distance || a.label.localeCompare(b.label))
}

function pickExamples(observations: FitObservation[], guess: CompositionGuess): ExampleResidual[] {
  const rows: ExampleResidual[] = []
  for (const row of observations) {
    const predictedMid = predictMid(row.observed, guess)
    if (predictedMid === null || row.measured.mid === null) continue
    rows.push({ enzyme: row.enzyme, measuredMid: row.measured.mid, predictedMid })
  }
  rows.sort((a, b) => Math.abs(a.predictedMid - a.measuredMid) - Math.abs(b.predictedMid - b.measuredMid))
  if (rows.length <= 5) return rows
  const bestTwo = rows.slice(0, 2)
  const worstTwo = rows.slice(-2).reverse()
  const mid = rows[Math.floor(rows.length / 2)]!
  const picked = [...bestTwo, mid, ...worstTwo]
  const seen = new Set<string>()
  return picked.filter((row) => {
    if (seen.has(row.enzyme)) return false
    seen.add(row.enzyme)
    return true
  })
}

function confidenceOf(args: { mae: number | null; n: number; tyingIonRecipes: number; analogUnique: boolean }): BufferFitResult['confidence'] {
  if (args.mae === null || args.n === 0) return 'none'
  if (args.n < 5 || args.mae > 25) return 'low'
  if (args.tyingIonRecipes > 4) return 'medium'
  if (args.mae <= 12 && args.analogUnique && args.tyingIonRecipes <= 2) return 'high'
  if (args.mae <= 20) return 'medium'
  return 'low'
}

function roundGuess(guess: CompositionGuess): CompositionGuess {
  return { ...guess }
}

function scaleGuess(guess: CompositionGuess, factor: number): CompositionGuess {
  return {
    ...guess,
    monovalentSalt_mM: guess.monovalentSalt_mM * factor,
    mg_mM: guess.mg_mM * factor,
  }
}

export function fitBufferObservations(
  observations: FitObservation[],
  options: {
    id: string
    vendor: EnzymeManufacturerId
    buffer: string
    grid: CompositionGuess[]
    tiePrefer?: TiePrefer
    extraNotes?: string[]
  },
): BufferFitResult {
  const notes = [...(options.extraNotes ?? [])]
  if (observations.length === 0) {
    return {
      id: options.id,
      vendor: options.vendor,
      buffer: options.buffer,
      nEnzymes: 0,
      mae: null,
      holdoutMae: null,
      holdoutN: 0,
      holdoutMethod: 'none',
      best: null,
      runnersUp: [],
      tyingIonRecipes: 0,
      analogPublishedBuffer: null,
      confidence: 'none',
      notes: [...notes, 'No enzymes with interpolatable proprietary activity and ≥2 known-composition points.'],
      examples: [],
    }
  }

  const fullRanked = rankGuesses(observations, options.grid, options.tiePrefer)
  const bestRanked = fullRanked[0]
  if (!bestRanked) {
    return {
      id: options.id,
      vendor: options.vendor,
      buffer: options.buffer,
      nEnzymes: observations.length,
      mae: null,
      holdoutMae: null,
      holdoutN: 0,
      holdoutMethod: 'none',
      best: null,
      runnersUp: [],
      tyingIonRecipes: 0,
      analogPublishedBuffer: null,
      confidence: 'none',
      notes: [...notes, 'Forward model produced no scorable candidates.'],
      examples: [],
    }
  }

  const near = fullRanked.filter((row) => row.mae <= bestRanked.mae + RUNNER_MAE_DELTA)
  const ionSeen = new Set<string>()
  const ionWinners: RankedGuess[] = []
  for (const row of near) {
    const key = ionKey(row.guess)
    if (ionSeen.has(key)) continue
    ionSeen.add(key)
    ionWinners.push(row)
  }

  const runnersUp: ScoredGuess[] = ionWinners
    .filter((row) => guessKey(row.guess) !== guessKey(bestRanked.guess))
    .slice(0, 5)
    .map((row) => ({ ...row.guess, mae: round1(row.mae) }))

  const { train, holdout, method } = splitHoldout(observations.map((row) => row.enzyme))
  let holdoutMae: number | null = null
  let holdoutN = 0
  let holdoutMethod: BufferFitResult['holdoutMethod'] = 'none'

  if (method === '20pct' && holdout.size > 0) {
    const trainObs = observations.filter((row) => train.has(row.enzyme))
    const holdObs = observations.filter((row) => holdout.has(row.enzyme))
    const trainBest = rankGuesses(trainObs, options.grid, options.tiePrefer)[0]
    if (trainBest) {
      holdoutMae = maeOf(holdObs, trainBest.guess)
      holdoutN = holdObs.length
      holdoutMethod = '20pct'
      if (ionKey(trainBest.guess) !== ionKey(bestRanked.guess)) {
        notes.push(
          `Holdout-selected ions (${formatGuess(trainBest.guess)}) differ from full-catalog ions (${formatGuess(bestRanked.guess)}).`,
        )
      }
    }
  } else if (observations.length >= 2 && observations.length <= LOO_MAX_N) {
    let abs = 0
    let n = 0
    for (const left of observations) {
      const rest = observations.filter((row) => row.enzyme !== left.enzyme)
      const looBest = rankGuesses(rest, options.grid, options.tiePrefer)[0]
      if (!looBest || left.measured.mid === null) continue
      const predicted = predictMid(left.observed, looBest.guess)
      if (predicted === null) continue
      abs += Math.abs(predicted - left.measured.mid)
      n += 1
    }
    holdoutMae = n === 0 ? null : abs / n
    holdoutN = n
    holdoutMethod = 'loo'
  }

  const analogs = closestAnalogs(bestRanked.guess)
  const analog = analogs[0] ?? null
  const analogUnique = Boolean(analog && (analogs[1] == null || analogs[1].distance - analog.distance >= 0.35))
  if (analog && analog.distance < 1.0) {
    notes.push(`Closest published analog: ${analog.label} (distance ${round1(analog.distance)}).`)
    if (!analogUnique && analogs[1] && analogs[1].distance < 1.0) notes.push(`Near-tied analog: ${analogs[1].label}.`)
  } else {
    notes.push('No close published analog on the salt/pH/Mg/anion grid.')
  }

  notes.unshift(`Most consistent with 1X ≈ ${formatGuess(bestRanked.guess)} (grid search; not an official recipe).`)
  if (ionWinners.length > 1) {
    notes.push(`${ionWinners.length} distinct salt/pH/Mg/anion recipes within ${RUNNER_MAE_DELTA} MAE of the best.`)
  }

  const mae = bestRanked.mae
  return {
    id: options.id,
    vendor: options.vendor,
    buffer: options.buffer,
    nEnzymes: observations.length,
    mae: round1(mae),
    holdoutMae: holdoutMae === null ? null : round1(holdoutMae),
    holdoutN,
    holdoutMethod,
    best: roundGuess(bestRanked.guess),
    runnersUp,
    tyingIonRecipes: ionWinners.length,
    analogPublishedBuffer: analog && analog.distance < 1.0 ? analog.label : null,
    confidence: confidenceOf({
      mae,
      n: observations.length,
      tyingIonRecipes: ionWinners.length,
      analogUnique,
    }),
    notes,
    examples: pickExamples(observations, bestRanked.guess).map((row) => ({
      enzyme: row.enzyme,
      measuredMid: round1(row.measuredMid),
      predictedMid: round1(row.predictedMid),
    })),
  }
}

function usbFLCount(enzymes: RestrictionEnzyme[]): number {
  const codes = ['f', 'g', 'h', 'j', 'k', 'l'] as const
  let n = 0
  for (const enzyme of enzymes) {
    const usb = enzyme.manufacturers.find((profile) => profile.id === 'usb')
    if (!usb) continue
    const hasNumeric = codes.some((code) => parseActivity(usb.bufferActivity[code])?.interpolatable)
    if (hasNumeric) n += 1
  }
  return n
}

export function fitProprietaryCatalog(enzymes: RestrictionEnzyme[]): ProprietaryCatalogFit {
  const buffers: BufferFitResult[] = []
  const observationsById = new Map<string, FitObservation[]>()

  for (const spec of TARGETS) {
    const observations = collectFitObservations(enzymes, spec)
    observationsById.set(spec.id, observations)
    const grid = buildCompositionGrid(spec)
    buffers.push(
      fitBufferObservations(observations, {
        id: spec.id,
        vendor: spec.vendor,
        buffer: spec.buffer,
        grid,
        tiePrefer: spec.tiePrefer,
        extraNotes: spec.extraNotes,
      }),
    )
  }

  const ub = buffers.find((entry) => entry.id === 'jena:ub')
  if (ub?.best) {
    for (const [id, factor, label] of [
      ['jena:ub05', 0.5, '0.5×'],
      ['jena:ub2', 2, '2×'],
    ] as const) {
      const obs = observationsById.get(id) ?? []
      const scaled = scaleGuess(ub.best, factor)
      const scaledMae = maeOf(obs, scaled)
      const target = buffers.find((entry) => entry.id === id)
      if (!target) continue
      if (scaledMae === null) {
        target.notes.push(`Scaled ${label} ions of 1× UB could not be scored (no ${label} observations).`)
      } else {
        target.notes.push(
          `1× UB ions scaled to ${label} (${formatGuess(scaled)}) score MAE ${round1(scaledMae)} on N=${obs.length}.`,
        )
      }
    }
  }

  const usbN = usbFLCount(enzymes)
  buffers.push({
    id: 'usb:f-l',
    vendor: 'usb',
    buffer: 'f-l',
    nEnzymes: usbN,
    mae: null,
    holdoutMae: null,
    holdoutN: 0,
    holdoutMethod: 'none',
    best: null,
    runnersUp: [],
    tyingIonRecipes: 0,
    analogPublishedBuffer: null,
    confidence: 'none',
    notes:
      usbN === 0
        ? ['USB F–L skipped: catalog enzymes do not report interpolatable activity in those columns.']
        : [`USB F–L have ${usbN} numeric listings but still no published composition; not fitted.`],
    examples: [],
  })

  return {
    generatedAt: new Date().toISOString(),
    model: 'inverse of salt×pH×anion interpolator (inferTargetActivity); discrete 1X grid search',
    buffers,
  }
}

/**
 * Fitted 1X ions used only for second-pass activity inference in unpublished
 * ROSE / ONE. Numbers match scripts/inferred-proprietary-buffer-composition.json
 * (low-confidence grid search; not official recipes).
 */
export type DoubleInferenceTarget = {
  vendor: EnzymeManufacturerId
  buffer: string
  label: string
  compositionConfidence: 'low'
  nEnzymes: number
  mae: number
  analog: string
  guess: CompositionGuess
}

export const DOUBLE_INFERENCE_TARGETS: DoubleInferenceTarget[] = [
  {
    vendor: 'sibenzyme',
    buffer: 'rose',
    label: 'ROSE',
    compositionConfidence: 'low',
    nEnzymes: 193,
    mae: 33.8,
    analog: 'SibEnzyme G',
    guess: {
      monovalentSalt_mM: 50,
      mg_mM: 10,
      pH: 7.6,
      anion: 'chloride',
      proteinCarrier: 'none',
      reductant: 'DTT',
    },
  },
  {
    vendor: 'eurx',
    buffer: 'one',
    label: 'ONE',
    compositionConfidence: 'low',
    nEnzymes: 56,
    mae: 27.5,
    analog: 'TaKaRa T / Tango-like',
    guess: {
      monovalentSalt_mM: 66,
      mg_mM: 10,
      pH: 7.9,
      anion: 'acetate',
      proteinCarrier: 'BSA',
      reductant: 'DTT',
    },
  },
]

export function doubleInferenceTarget(vendor: EnzymeManufacturerId, buffer: string): DoubleInferenceTarget | undefined {
  return DOUBLE_INFERENCE_TARGETS.find((entry) => entry.vendor === vendor && entry.buffer === buffer)
}

function clampPct(value: number) {
  return Math.max(0, Math.min(100, value))
}

export type DoubleInferredActivity = {
  inferredLo: number
  inferredHi: number
  interpolatorConfidence: 'high' | 'medium' | 'low'
  compositionConfidence: 'low'
  combinedConfidence: 'low'
  needsAdditive: boolean
  starRisk: boolean
  rationale: string
}

/** Second pass: interpolator % in a fitted unpublished 1X (composition then activity). */
export function inferDoubleProprietaryActivity(
  observed: ObservedPoint[],
  extras: {
    needsAdditive: string[]
    starInLowSalt: boolean
    preferredIsSpecific: boolean
  },
  vendor: EnzymeManufacturerId,
  buffer: string,
): DoubleInferredActivity | null {
  const spec = doubleInferenceTarget(vendor, buffer)
  if (!spec) return null
  const target = guessToComposition(spec.guess, spec.buffer)
  target.vendor = spec.vendor
  target.buffer = spec.buffer
  target.compositionSource = 'low'
  const prediction = inferTargetActivity(observed, target, extras)
  if (prediction.confidence === 'none') return null

  const widen = 15
  const inferredLo = Math.round(clampPct(prediction.inferredLo - widen))
  const inferredHi = Math.round(clampPct(prediction.inferredHi + widen))
  const rationale =
    `Double inference (not a published recipe). ${spec.label} 1X fitted as ${formatGuess(spec.guess)} ` +
    `(analog ${spec.analog}; composition MAE ${spec.mae} on N=${spec.nEnzymes}, confidence low). ` +
    `Enzyme interpolator ${prediction.confidence}: ${prediction.rationale}. ` +
    `Activity range widened ±${widen} for composition uncertainty.`

  return {
    inferredLo: Math.min(inferredLo, inferredHi),
    inferredHi: Math.max(inferredLo, inferredHi),
    interpolatorConfidence: prediction.confidence,
    compositionConfidence: spec.compositionConfidence,
    combinedConfidence: 'low',
    needsAdditive: Boolean(prediction.needsAdditive),
    starRisk: Boolean(prediction.starRisk),
    rationale,
  }
}

export function compactFitOutput(result: ProprietaryCatalogFit) {
  return {
    generatedAt: result.generatedAt,
    model: result.model,
    buffers: result.buffers.map((entry) => ({
      id: entry.id,
      nEnzymes: entry.nEnzymes,
      mae: entry.mae,
      holdoutMae: entry.holdoutMae,
      holdoutN: entry.holdoutN,
      holdoutMethod: entry.holdoutMethod,
      confidence: entry.confidence,
      analogPublishedBuffer: entry.analogPublishedBuffer,
      tyingIonRecipes: entry.tyingIonRecipes,
      best: entry.best,
      runnersUp: entry.runnersUp,
      notes: entry.notes,
      examples: entry.examples,
    })),
  }
}

