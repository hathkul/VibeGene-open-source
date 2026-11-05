import {
  defaultDnaEnds,
  normalizeDnaEnds,
  resolveDnaEnds,
  type DnaEnds,
} from './dnaEnds'
import { clipFeaturesForRange } from './richClipboard'
import { createId, nowIso, sanitizeDna, sanitizeProtein, type StrandPairSelection } from './sequence'
import type {
  HistoryNode,
  RestrictionEnzyme,
  RestrictionSite,
  SequenceRecord,
} from './types'

function formatEnzymeLabel(name: string) {
  const trimmed = name.trim()
  if (!trimmed) return ''
  return trimmed.startsWith('<') ? trimmed : `<${trimmed}>`
}

function stubEnzyme(name: string): RestrictionEnzyme {
  return {
    name,
    notation: name,
    recognition: 'N',
    cutTop: 0,
    cutBottom: 0,
    type: 'II',
    overhang: { type: 'blunt', sequence: null, length: 0 },
    manufacturers: [],
    notes: [],
  }
}

/**
 * Map a source molecule's sticky ends onto a half-open fragment [start, end).
 * Overhang bases that fall inside the fragment stay single-stranded; ends that
 * do not touch a source overhang become blunt.
 */
export function dnaEndsForFragmentRange(
  source: Pick<SequenceRecord, 'dnaEnds' | 'topology' | 'sequence'>,
  start: number,
  end: number,
): DnaEnds {
  const length = source.sequence.length
  if (source.topology !== 'linear' || length <= 0 || end <= start) return defaultDnaEnds()
  const sourceEnds = normalizeDnaEnds(resolveDnaEnds(source))
  const upAbs = Math.abs(sourceEnds.upstream.stickiness)
  const downAbs = Math.abs(sourceEnds.downstream.stickiness)

  let upstreamStickiness = 0
  let upstreamEnzyme: string | undefined
  if (upAbs > 0 && start < upAbs) {
    const remaining = Math.min(end, upAbs) - start
    if (remaining > 0) {
      upstreamStickiness = Math.sign(sourceEnds.upstream.stickiness) * remaining
      // Keep the enzyme label only when the fragment still includes the original tip.
      if (start === 0) upstreamEnzyme = sourceEnds.upstream.enzymeName
    }
  }

  let downstreamStickiness = 0
  let downstreamEnzyme: string | undefined
  const downStart = length - downAbs
  if (downAbs > 0 && end > downStart) {
    const remaining = end - Math.max(start, downStart)
    if (remaining > 0) {
      downstreamStickiness = Math.sign(sourceEnds.downstream.stickiness) * remaining
      if (end === length) downstreamEnzyme = sourceEnds.downstream.enzymeName
    }
  }

  return {
    upstream: {
      modification: start === 0 ? sourceEnds.upstream.modification : 'fivePrimePhosphorylated',
      stickiness: upstreamStickiness,
      ...(upstreamEnzyme ? { enzymeName: upstreamEnzyme } : {}),
    },
    downstream: {
      modification: end === length ? sourceEnds.downstream.modification : 'fivePrimePhosphorylated',
      stickiness: downstreamStickiness,
      ...(downstreamEnzyme ? { enzymeName: downstreamEnzyme } : {}),
    },
  }
}

/**
 * Synthetic restriction sites used to draw `<Enzyme>` labels at sticky ends
 * (SnapGene RegeneratedSite-style markers).
 */
export function regeneratedEndRestrictionSites(
  ends: DnaEnds | undefined,
  sequenceLength: number,
): RestrictionSite[] {
  if (!ends || sequenceLength <= 0) return []
  const normalized = normalizeDnaEnds(ends)
  const sites: RestrictionSite[] = []
  const upstreamName = normalized.upstream.enzymeName?.trim()
  if (upstreamName) {
    const abs = Math.max(1, Math.abs(normalized.upstream.stickiness))
    sites.push({
      enzyme: stubEnzyme(formatEnzymeLabel(upstreamName)),
      start: 0,
      end: Math.min(sequenceLength, abs),
      match: '',
      cutTop: 0,
      cutBottom: normalized.upstream.stickiness >= 0 ? abs : 0,
    })
  }
  const downstreamName = normalized.downstream.enzymeName?.trim()
  if (downstreamName) {
    const abs = Math.max(1, Math.abs(normalized.downstream.stickiness))
    const start = Math.max(0, sequenceLength - abs)
    sites.push({
      enzyme: stubEnzyme(formatEnzymeLabel(downstreamName)),
      start,
      end: sequenceLength,
      match: '',
      cutTop: start,
      cutBottom: sequenceLength,
    })
  }
  return sites
}

export type NewFileFromSelectionInput = {
  source: SequenceRecord
  /** Plain duplex selection (blunt fragment). */
  selectedRange?: { start: number; end: number } | null
  /** Two-enzyme cut selection (sticky fragment). */
  cutStrandSelection?: StrandPairSelection | null
  /** Left/right enzymes when cut selection came from restriction labels. */
  cutEnzymes?: { upstream: RestrictionSite; downstream: RestrictionSite } | null
}

/**
 * Build a linear SequenceRecord from the current selection.
 * Two-enzyme cut selections produce sticky ends and `<Enzyme>` regenerated-site labels.
 */
export function createRecordFromSelection(input: NewFileFromSelectionInput): SequenceRecord | null {
  const { source, selectedRange, cutStrandSelection, cutEnzymes } = input
  const timestamp = nowIso()

  if (source.molecule === 'protein' && selectedRange && selectedRange.end > selectedRange.start) {
    const sequence = sanitizeProtein(source.sequence.slice(selectedRange.start, selectedRange.end)).toUpperCase()
    if (!sequence) return null
    const name = `${source.name} (${selectedRange.start + 1} - ${selectedRange.end})`.trim() || 'Untitled protein'
    const protein = source.protein
    return {
      ...source,
      id: createId('protein'),
      name,
      description: `Fragment from ${source.name}`,
      topology: 'linear',
      sequence,
      protein: protein ? {
        ...protein,
        numberingStart: (protein.numberingStart ?? 1) + selectedRange.start,
        comparisonSources: [],
        comparisonAlignmentCache: [],
        comparisonVariableRegions: (protein.comparisonVariableRegions ?? [])
          .map((region) => ({
            ...region,
            id: createId('protein-variable'),
            start: Math.max(region.start, selectedRange.start) - selectedRange.start,
            end: Math.min(region.end, selectedRange.end) - selectedRange.start,
          }))
          .filter((region) => region.end > region.start),
        bonds: protein.bonds
          .filter((bond) => bond.endpoints.every((endpoint) =>
            !endpoint.chainId && endpoint.residue >= selectedRange.start && endpoint.residue < selectedRange.end))
          .map((bond) => ({
            ...bond,
            id: createId('protein-bond'),
            endpoints: bond.endpoints.map((endpoint) => ({
              ...endpoint,
              residue: endpoint.residue - selectedRange.start,
            })) as typeof bond.endpoints,
          })),
      } : undefined,
      features: clipFeaturesForRange(source.features, selectedRange.start, selectedRange.end),
      primers: [],
      operations: [{
        id: createId('op'),
        type: 'newFileFromSelection',
        summary: `New protein file from selection (${sequence.length} aa)`,
        createdAt: timestamp,
      }],
      history: undefined,
      dnaEnds: undefined,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
  }

  // Prefer sticky two-enzyme fragment when both cut selection and enzyme pair are present.
  if (cutStrandSelection && cutEnzymes) {
    const { forward, reverse } = cutStrandSelection
    const fragStart = Math.min(forward.start, reverse.start)
    const fragEnd = Math.max(forward.end, reverse.end)
    if (fragEnd <= fragStart) return null

    const sequence = sanitizeDna(source.sequence.slice(fragStart, fragEnd))
    if (!sequence) return null

    const upstreamStickiness = reverse.start - forward.start
    const downstreamStickiness = reverse.end - forward.end

    const leftIsFirst =
      Math.min(cutEnzymes.upstream.cutTop, cutEnzymes.upstream.cutBottom) <=
      Math.min(cutEnzymes.downstream.cutTop, cutEnzymes.downstream.cutBottom)
    const upstreamEnzyme = leftIsFirst ? cutEnzymes.upstream : cutEnzymes.downstream
    const downstreamEnzyme = leftIsFirst ? cutEnzymes.downstream : cutEnzymes.upstream

    const upstreamName = upstreamEnzyme.enzyme.name
    const downstreamName = downstreamEnzyme.enzyme.name

    const dnaEnds: DnaEnds = {
      upstream: {
        modification: 'fivePrimePhosphorylated',
        stickiness: upstreamStickiness,
        enzymeName: upstreamName,
      },
      downstream: {
        modification: 'fivePrimePhosphorylated',
        stickiness: downstreamStickiness,
        enzymeName: downstreamName,
      },
    }

    const leftPosLabel = `${upstreamName} (${Math.min(upstreamEnzyme.cutTop, upstreamEnzyme.cutBottom) + 1})`
    const rightPosLabel = `${downstreamName} (${Math.min(downstreamEnzyme.cutTop, downstreamEnzyme.cutBottom) + 1})`
    const name = `${source.name} (${leftPosLabel} - ${rightPosLabel})`.trim() || 'Untitled'

    const regeneratedSites = [
      {
        name: formatEnzymeLabel(upstreamName),
        pos: 0,
        siteCount: 1,
        blunt: upstreamStickiness === 0,
      },
      {
        name: formatEnzymeLabel(downstreamName),
        pos: Math.max(0, sequence.length - Math.max(1, Math.abs(downstreamStickiness || 1))),
        siteCount: 1,
        blunt: downstreamStickiness === 0,
      },
    ]

    const history: HistoryNode = {
      id: createId('history'),
      name: `${name}.dna`,
      seqLen: sequence.length,
      circular: false,
      operation: 'newFileFromSelection',
      resurrectable: false,
      hideHistory: false,
      upstreamModification: 'FivePrimePhosphorylated',
      downstreamModification: 'FivePrimePhosphorylated',
      upstreamStickiness,
      downstreamStickiness,
      oligos: [],
      regeneratedSites,
      inputSummaries: [
        {
          manipulation: 'select',
          name1: upstreamName,
          name2: downstreamName,
          val1: String(Math.min(upstreamEnzyme.cutTop, upstreamEnzyme.cutBottom) + 1),
          val2: String(Math.min(downstreamEnzyme.cutTop, downstreamEnzyme.cutBottom) + 1),
          siteCount1: '1',
          siteCount2: '1',
        },
      ],
      features: [],
      sequence,
      children: source.history
        ? [
            {
              ...source.history,
              resurrectable: true,
            },
          ]
        : [],
    }

    return {
      id: createId('seq'),
      name,
      description: `Fragment from ${source.name}`,
      molecule: 'dna',
      topology: 'linear',
      sequence,
      features: clipFeaturesForRange(source.features, fragStart, fragEnd),
      primers: [],
      operations: [
        {
          id: createId('op'),
          type: 'newFileFromSelection',
          summary: `New file from selection (${sequence.length} bp)`,
          createdAt: timestamp,
        },
      ],
      history,
      dnaEnds,
      construct: { ...source.construct },
      createdAt: timestamp,
      updatedAt: timestamp,
    }
  }

  if (selectedRange && selectedRange.end > selectedRange.start) {
    const sequence = sanitizeDna(source.sequence.slice(selectedRange.start, selectedRange.end))
    if (!sequence) return null
    const name = `${source.name} (${selectedRange.start + 1} - ${selectedRange.end})`.trim() || 'Untitled'
    const dnaEnds = dnaEndsForFragmentRange(source, selectedRange.start, selectedRange.end)
    const regeneratedSites = [
      ...(dnaEnds.upstream.stickiness !== 0 && dnaEnds.upstream.enzymeName
        ? [
            {
              name: formatEnzymeLabel(dnaEnds.upstream.enzymeName),
              pos: 0,
              siteCount: 1,
              blunt: false,
            },
          ]
        : []),
      ...(dnaEnds.downstream.stickiness !== 0 && dnaEnds.downstream.enzymeName
        ? [
            {
              name: formatEnzymeLabel(dnaEnds.downstream.enzymeName),
              pos: Math.max(0, sequence.length - Math.max(1, Math.abs(dnaEnds.downstream.stickiness))),
              siteCount: 1,
              blunt: false,
            },
          ]
        : []),
    ]
    return {
      id: createId('seq'),
      name,
      description: `Fragment from ${source.name}`,
      molecule: 'dna',
      topology: 'linear',
      sequence,
      features: clipFeaturesForRange(source.features, selectedRange.start, selectedRange.end),
      primers: [],
      operations: [
        {
          id: createId('op'),
          type: 'newFileFromSelection',
          summary: `New file from selection (${sequence.length} bp)`,
          createdAt: timestamp,
        },
      ],
      history: {
        id: createId('history'),
        name: `${name}.dna`,
        seqLen: sequence.length,
        circular: false,
        operation: 'newFileFromSelection',
        resurrectable: false,
        hideHistory: false,
        upstreamModification:
          dnaEnds.upstream.modification === 'covalentlyClosed'
            ? 'CovalentlyClosed'
            : dnaEnds.upstream.modification === 'unmodified'
              ? 'Unmodified'
              : 'FivePrimePhosphorylated',
        downstreamModification:
          dnaEnds.downstream.modification === 'covalentlyClosed'
            ? 'CovalentlyClosed'
            : dnaEnds.downstream.modification === 'unmodified'
              ? 'Unmodified'
              : 'FivePrimePhosphorylated',
        upstreamStickiness: dnaEnds.upstream.stickiness,
        downstreamStickiness: dnaEnds.downstream.stickiness,
        oligos: [],
        regeneratedSites,
        inputSummaries: [
          {
            manipulation: 'select',
            val1: String(selectedRange.start + 1),
            val2: String(selectedRange.end),
          },
        ],
        features: [],
        sequence,
        children: source.history ? [{ ...source.history, resurrectable: true }] : [],
      },
      dnaEnds,
      construct: { ...source.construct },
      createdAt: timestamp,
      updatedAt: timestamp,
    }
  }

  return null
}
