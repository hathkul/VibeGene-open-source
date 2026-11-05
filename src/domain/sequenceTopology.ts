import type { Topology } from './types'

/** Read circular/linear from a GenBank LOCUS line; null if absent. */
export function detectGenBankTopology(text: string): Topology | null {
  const locusLine = text.match(/^LOCUS\s+.+$/m)?.[0] ?? ''
  if (/\bcircular\b/i.test(locusLine)) return 'circular'
  if (/\blinear\b/i.test(locusLine)) return 'linear'
  return null
}

/** Read circular/linear from an EMBL ID line; null if absent. */
export function detectEmblTopology(text: string): Topology | null {
  const idLine = text.match(/^ID\s+.+$/m)?.[0] ?? ''
  if (/\bcircular\b/i.test(idLine)) return 'circular'
  if (/\blinear\b/i.test(idLine)) return 'linear'
  return null
}

/**
 * Plain `.seq` text and Sanger `.ab1` chromatograms open as linear DNA
 * without asking circular vs linear.
 */
export function opensAsLinearDnaFileName(fileName: string): boolean {
  const base = fileName.replace(/\\/g, '/').split('/').pop() ?? fileName
  const lower = base.toLowerCase()
  return lower.endsWith('.seq') || lower.endsWith('.ab1')
}

/**
 * True when the import format does not carry topology, so the user should choose
 * linear vs circular before the document is opened.
 *
 * SnapGene `.dna` and Vibegene project JSON always carry topology.
 * `.seq` and `.ab1` open as linear DNA without prompting.
 * FASTA, raw sequence text, GenBank/EMBL without circular/linear do not.
 */
export function importRequiresTopologyChoice(text: string, fileName?: string): boolean {
  if (fileName && opensAsLinearDnaFileName(fileName)) return false
  const trimmed = text.trim()
  if (!trimmed) return false
  if (trimmed.startsWith('{')) return false
  if (trimmed.startsWith('>')) return true
  if (/^LOCUS\s+/m.test(trimmed)) return detectGenBankTopology(trimmed) == null
  if (/^ID\s+\S+/m.test(trimmed) && /^SQ\s+/m.test(trimmed)) return detectEmblTopology(trimmed) == null
  return true
}
