import {
  formatGelMatrixLabel,
  formatGelPercent,
  listDigestFragmentsFromCuts,
  type DigestedFragment,
  type DnaGelMatrix,
} from '../../domain/agaroseGel'
import {
  listAgaroseGelMemberSources,
  padAgaroseGelEnzymeSlots,
  type AgaroseGelDnaSource,
} from '../../domain/agaroseGelLibrary'
import { isDnaLibraryRecord } from '../../domain/dnaLibrary'
import { enzymes, findRestrictionSites } from '../../domain/enzymes'
import { listPcrAmplicons } from '../../domain/pcr'
import { resolveDisplayableLayoutsForPrimer } from '../../domain/primerSequenceLayout'
import { normalizeDna } from '../../domain/sequence'
import type { MwLadder } from '../../domain/mwLadders'
import type { Primer, PrimerBindingLayout, SequenceRecord, Strand } from '../../domain/types'

export type GelDigestMode = 'cut' | 'pcr'

export type GelSampleLane = {
  kind: 'sample'
  record: SequenceRecord | null
  sourceLabel: string
  digestMode: GelDigestMode
  enzymeNames: string[]
  /** Up to two primer ids for PCR mode. */
  primerIds: string[]
}

export type GelMwLane = {
  kind: 'mw'
  ladderId: string
}

export type GelLane = GelMwLane | GelSampleLane

export type GelDisplayBand = DigestedFragment | {
  id: string
  length: number
  mass: number
  start: number
  end: number
  wraps: false
}

export function createEmptyGelSample(): GelSampleLane {
  return {
    kind: 'sample',
    record: null,
    sourceLabel: '',
    digestMode: 'cut',
    enzymeNames: ['', '', '', ''],
    primerIds: [],
  }
}

/** One lane source from a plain construct, or one per library member. */
export function gelSourcesFromRecord(record: SequenceRecord, labelHint?: string): AgaroseGelDnaSource[] {
  if (isDnaLibraryRecord(record)) return listAgaroseGelMemberSources(record)
  const name = record.name.trim() || labelHint?.trim() || 'Construct'
  return [{ label: labelHint?.trim() || `${name}`, record }]
}

export function createInitialGelLanes(
  samples: AgaroseGelDnaSource[],
  laneCount: number,
  defaultLadderId: string,
): GelLane[] {
  const lanes: GelLane[] = [{ kind: 'mw', ladderId: defaultLadderId }]
  for (const sample of samples) {
    lanes.push({
      kind: 'sample',
      record: sample.record,
      sourceLabel: sample.label,
      digestMode: 'cut',
      enzymeNames: padAgaroseGelEnzymeSlots(sample.enzymeNames),
      primerIds: [],
    })
  }
  if (samples.length === 0) lanes.push(createEmptyGelSample())
  while (lanes.length < Math.max(2, laneCount)) lanes.push(createEmptyGelSample())
  return lanes.slice(0, Math.max(2, laneCount))
}

export function enzymesUseLabel(names: string[]): string {
  return names.join(' + ')
}

export function sampleGelLaneLabel(lane: GelSampleLane): string {
  if (!lane.record) return '(empty)'
  if (lane.digestMode === 'pcr') {
    const primers = lane.primerIds
      .map((id) => lane.record!.primers.find((primer) => primer.id === id)?.name)
      .filter(Boolean)
    if (primers.length === 0) return `${lane.record.name} · PCR`
    return `${lane.record.name} · PCR ${primers.join(' + ')}`
  }
  const enzymesUsed = lane.enzymeNames.filter(Boolean)
  if (enzymesUsed.length === 0) return lane.record.name
  return `${lane.record.name} · ${enzymesUseLabel(enzymesUsed)}`
}

export function listGelLaneFragments(lane: GelSampleLane): DigestedFragment[] {
  if (!lane.record) return []
  if (lane.digestMode === 'pcr') return listPcrLaneFragments(lane.record, lane.primerIds)
  const enzymeNames = lane.enzymeNames.filter(Boolean)
  if (enzymeNames.length === 0) {
    return listDigestFragmentsFromCuts(lane.record.sequence.length, [], lane.record.topology)
  }
  const selected = enzymes.filter((enzyme) => enzymeNames.includes(enzyme.name))
  const sites = findRestrictionSites(lane.record.sequence, selected, {
    construct: lane.record.construct,
    topology: lane.record.topology,
  })
  return listDigestFragmentsFromCuts(
    lane.record.sequence.length,
    sites.map((site) => site.cutTop),
    lane.record.topology,
  )
}

export function computeGelSampleBands(lane: GelSampleLane): number[] {
  return listGelLaneFragments(lane).map((fragment) => fragment.length)
}

function listPcrLaneFragments(record: SequenceRecord, primerIds: string[]): DigestedFragment[] {
  const primers = primerIds
    .map((id) => record.primers.find((primer) => primer.id === id))
    .filter((primer): primer is Primer => Boolean(primer))
  if (primers.length < 2) return []
  const first = primers[0]!
  const second = primers[1]!
  const amplicons = [
    ...listPcrAmplicons(
      record,
      { name: first.name, sequence: first.sequence, phosphorylated: false },
      { name: second.name, sequence: second.sequence, phosphorylated: false },
    ),
    ...listPcrAmplicons(
      record,
      { name: second.name, sequence: second.sequence, phosphorylated: false },
      { name: first.name, sequence: first.sequence, phosphorylated: false },
    ),
  ]
  const seen = new Set<string>()
  const fragments: DigestedFragment[] = []
  for (const amplicon of amplicons) {
    if (seen.has(amplicon.id)) continue
    seen.add(amplicon.id)
    fragments.push({
      id: amplicon.id,
      start: amplicon.regionStart,
      end: amplicon.regionEnd,
      length: amplicon.productSize,
      wraps: amplicon.regionEnd < amplicon.regionStart,
    })
  }
  return fragments.sort((a, b) => b.length - a.length || a.start - b.start)
}

type GelPrimerSite = {
  primer: Primer
  strand: Strand
  start: number
  end: number
}

function annealedLayoutBounds(layout: PrimerBindingLayout): { start: number; end: number } {
  const annealed = layout.components.filter(
    (component): component is { primerBases: string; templateStart: number; templateEnd: number } =>
      component.templateStart !== undefined && component.templateEnd !== undefined,
  )
  if (!annealed.length) return { start: layout.templateStart, end: layout.templateEnd }
  return {
    start: Math.min(...annealed.map((component) => component.templateStart)),
    end: Math.max(...annealed.map((component) => component.templateEnd)),
  }
}

function listGelPrimerSites(record: SequenceRecord): GelPrimerSite[] {
  const template = normalizeDna(record.sequence)
  const sites: GelPrimerSite[] = []
  for (const primer of record.primers) {
    for (const layout of resolveDisplayableLayoutsForPrimer(template, primer)) {
      const bounds = annealedLayoutBounds(layout)
      sites.push({ primer, strand: layout.strand, start: bounds.start, end: bounds.end })
    }
  }
  return sites
}

function primaryStrandForPrimer(sites: GelPrimerSite[]): Strand | null {
  if (sites.some((site) => site.strand === 'forward')) return 'forward'
  if (sites.some((site) => site.strand === 'reverse')) return 'reverse'
  return null
}

function uniquePrimersById(primers: Primer[]): Primer[] {
  const seen = new Set<string>()
  const unique: Primer[] = []
  for (const primer of primers) {
    if (seen.has(primer.id)) continue
    seen.add(primer.id)
    unique.push(primer)
  }
  return unique
}

/** First-primer choices are sorted by display name. */
export function listFirstPcrPrimerOptions(record: SequenceRecord): Primer[] {
  return [...record.primers].sort((a, b) => a.name.localeCompare(b.name))
}

/** Opposed-direction PCR partners, constrained by linear/circular topology. */
export function listSecondPcrPrimerOptions(record: SequenceRecord, firstPrimerId: string): Primer[] {
  const sites = listGelPrimerSites(record)
  const firstSites = sites.filter((site) => site.primer.id === firstPrimerId)
  const role = primaryStrandForPrimer(firstSites)
  if (!role) return []
  const opposite: Strand = role === 'forward' ? 'reverse' : 'forward'
  const firstAnchors = firstSites.filter((site) => site.strand === role)
  const candidates = sites.filter((site) => site.primer.id !== firstPrimerId && site.strand === opposite)
  const compatible =
    record.topology === 'circular'
      ? candidates
      : candidates.filter((candidate) =>
          role === 'forward'
            ? firstAnchors.some((anchor) => candidate.start >= anchor.end)
            : firstAnchors.some((anchor) => candidate.end <= anchor.start),
        )
  return uniquePrimersById(compatible.map((site) => site.primer)).sort((a, b) => a.name.localeCompare(b.name))
}

export function listGelLaneBands(
  lane: GelMwLane,
  resolveLadder: (ladderId: string) => MwLadder,
): Extract<GelDisplayBand, { mass: number }>[]
export function listGelLaneBands(
  lane: GelSampleLane,
  resolveLadder: (ladderId: string) => MwLadder,
): DigestedFragment[]
export function listGelLaneBands(
  lane: GelLane,
  resolveLadder: (ladderId: string) => MwLadder,
): GelDisplayBand[] {
  if (lane.kind === 'sample') return listGelLaneFragments(lane)
  return resolveLadder(lane.ladderId).fragments.map((fragment, fragmentIndex) => ({
    id: `mw-${fragmentIndex}-${fragment.lengthBp}`,
    length: fragment.lengthBp,
    mass: fragment.mass,
    start: 0,
    end: 0,
    wraps: false,
  }))
}

export function buildGelFragmentListText(
  lanes: GelLane[],
  gelPercent: number,
  gelMatrix: DnaGelMatrix,
  resolveLadder: (ladderId: string) => MwLadder,
): string {
  const lines: string[] = [`${formatGelPercent(gelPercent, gelMatrix)}% ${formatGelMatrixLabel(gelMatrix)}`, '']
  lanes.forEach((lane, index) => {
    if (lane.kind === 'mw') {
      const ladder = resolveLadder(lane.ladderId)
      lines.push(`MW\t${ladder.name}\t${ladder.fragments.map((fragment) => fragment.lengthBp).join(', ')}`)
      return
    }
    const label = lane.record ? sampleGelLaneLabel(lane) : '(empty)'
    const bands = computeGelSampleBands(lane)
    lines.push(`${index}\t${label}\t${bands.join(', ') || '—'}`)
  })
  return lines.join('\n')
}

export function buildGelBandPrintHtml(
  lanes: GelLane[],
  resolveLadder: (ladderId: string) => MwLadder,
): string {
  return lanes.map((lane, index) => {
    if (lane.kind === 'mw') {
      const ladder = resolveLadder(lane.ladderId)
      const items = ladder.fragments
        .filter((fragment) => fragment.format !== 'hidden')
        .map((fragment) => `<li>${fragment.lengthBp.toLocaleString()} bp</li>`)
        .join('')
      return `<div class="lane-block">
          <div class="lane-title">MW · ${ladder.name}</div>
          ${items ? `<ol>${items}</ol>` : '<div class="empty">No bands</div>'}
        </div>`
    }
    if (!lane.record) {
      return `<div class="lane-block">
          <div class="lane-title">Lane ${index}</div>
          <div class="empty">(empty)</div>
        </div>`
    }
    const enzymesUsed = lane.digestMode === 'cut' ? lane.enzymeNames.filter(Boolean) : []
    const primersUsed = lane.digestMode === 'pcr'
      ? lane.primerIds.map((id) => lane.record!.primers.find((primer) => primer.id === id)?.name).filter(Boolean)
      : []
    const meta = lane.digestMode === 'pcr'
      ? primersUsed.length ? `PCR ${primersUsed.join(' + ')}` : 'amplify by PCR'
      : enzymesUsed.length ? `cut with ${enzymesUseLabel(enzymesUsed)}` : ''
    const items = listGelLaneFragments(lane)
      .map((fragment) => `<li>${fragment.length.toLocaleString()} bp</li>`)
      .join('')
    return `<div class="lane-block">
        <div class="lane-title">Lane ${index} · ${lane.record.name}</div>
        ${meta ? `<div class="lane-meta">${meta}</div>` : ''}
        ${items ? `<ol>${items}</ol>` : '<div class="empty">No fragments</div>'}
      </div>`
  }).join('')
}
