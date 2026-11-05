import { createId } from '../sequence'
import type { Primer } from '../types'
import type { Primer3Oligo, Primer3Pair, Primer3Result } from './types'
import { PRIMER3_VERSION } from './index'

const DEFAULT_PRIMER_COLOR = '#7c3aed'

export type ToVibegenePrimersSelection = {
  /** 0-based pair rank, left-only rank, etc. */
  ranks: number[]
  /** When showing pairs, rank indexes PRIMER_PAIR; otherwise indexes left/right/internal list. */
  mode: 'pairs' | 'lefts' | 'rights' | 'internals'
}

function recordBaseName(recordName: string): string {
  const trimmed = recordName.trim()
  const withoutExt = trimmed.replace(/\.(dna|gb|gbk|fasta|fa|txt)$/i, '')
  const stem = withoutExt || trimmed || 'Record'
  return stem.slice(0, 80)
}

function formatTm(tm: number): string {
  return `${tm.toFixed(1)} °C`
}

function formatGc(gc: number): string {
  return `${Math.round(gc)}%`
}

function oligoDescription(
  oligo: Primer3Oligo,
  pair?: Primer3Pair,
): string {
  const parts = [`Primer3 ${PRIMER3_VERSION}`, `Tm ${formatTm(oligo.tm)}`, `GC ${formatGc(oligo.gcPercent)}`]
  if (pair?.productSize != null) {
    parts.push(`pair ${pair.rank + 1} product ${pair.productSize} bp`)
  } else {
    parts.push(`${oligo.kind} ${oligo.rank + 1}`)
  }
  return parts.join(' · ')
}

function oligoToPrimer(
  oligo: Primer3Oligo,
  baseName: string,
  pair?: Primer3Pair,
): Primer {
  const suffix =
    oligo.kind === 'left' ? '_F' : oligo.kind === 'right' ? '_R' : '_Probe'
  return {
    id: createId('primer'),
    name: `${baseName}_P3_${oligo.rank + 1}${suffix}`,
    sequence: oligo.sequence,
    color: DEFAULT_PRIMER_COLOR,
    description: oligoDescription(oligo, pair),
  }
}

export function toVibegenePrimers(
  recordName: string,
  result: Primer3Result,
  selection: ToVibegenePrimersSelection,
): Primer[] {
  const baseName = recordBaseName(recordName)
  const primers: Primer[] = []

  if (selection.mode === 'pairs') {
    for (const rank of selection.ranks) {
      const pair = result.pairs.find((p) => p.rank === rank)
      if (!pair) continue
      if (pair.left) primers.push(oligoToPrimer(pair.left, baseName, pair))
      if (pair.right) primers.push(oligoToPrimer(pair.right, baseName, pair))
      if (pair.internal) primers.push(oligoToPrimer(pair.internal, baseName, pair))
    }
    return primers
  }

  const list =
    selection.mode === 'lefts'
      ? result.lefts
      : selection.mode === 'rights'
        ? result.rights
        : result.internals

  for (const rank of selection.ranks) {
    const oligo = list.find((o) => o.rank === rank)
    if (oligo) primers.push(oligoToPrimer(oligo, baseName))
  }
  return primers
}
