import {
  alignImmunumDomain,
  type ImmunoglobulinNumberingScheme,
  type ImmunumChainCode,
} from './immunoglobulinNumbering'

export type TcrNumberingScheme = 'imgt'
export type TcrChain = 'A' | 'B' | 'G' | 'D'
export type TcrChainSelection = 'auto' | 'AB' | 'GD' | TcrChain

export type TcrNumbering = {
  scheme: TcrNumberingScheme
  chain: TcrChain
  confidence: number
  queryStart: number
  queryEnd: number
  /** Numbering label for each reference residue; null outside the detected V-domain. */
  positions: Array<string | null>
}

export function tcrChainLabel(chain: TcrChain) {
  if (chain === 'A') return 'α'
  if (chain === 'B') return 'β'
  if (chain === 'G') return 'γ'
  return 'δ'
}

export function tcrStructureLabel(chain: TcrChain) {
  return `TCR ${tcrChainLabel(chain)}`
}

function chainsForSelection(selection: TcrChainSelection): ImmunumChainCode[] {
  if (selection === 'auto') return ['A', 'B', 'G', 'D']
  if (selection === 'AB') return ['A', 'B']
  if (selection === 'GD') return ['G', 'D']
  return [selection]
}

/** Detect and number a TCR variable domain locally; sequence data never leaves the app. */
export async function detectTcrNumbering(
  sequenceInput: string,
  scheme: TcrNumberingScheme = 'imgt',
  chainSelection: TcrChainSelection = 'auto',
): Promise<TcrNumbering> {
  // Immunum supports Kabat only as an antibody-derived mapping; TCR uses IMGT.
  if (scheme !== 'imgt') {
    throw new Error('TCR numbering currently supports IMGT only.')
  }

  const alignment = await alignImmunumDomain(
    sequenceInput,
    chainsForSelection(chainSelection),
    scheme as ImmunoglobulinNumberingScheme,
  )
  if (
    alignment.chain !== 'A'
    && alignment.chain !== 'B'
    && alignment.chain !== 'G'
    && alignment.chain !== 'D'
  ) {
    throw new Error('The detected domain is not a TCR α, β, γ, or δ chain.')
  }

  return {
    scheme,
    chain: alignment.chain,
    confidence: alignment.confidence,
    queryStart: alignment.queryStart,
    queryEnd: alignment.queryEnd,
    positions: alignment.positions,
  }
}
