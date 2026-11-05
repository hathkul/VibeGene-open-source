import type { AlleleFit } from './fit'
import type { IndependentReadFit } from './readComparison'

export type AlleleGroupResult = { label: string; traceNames: string[]; result?: AlleleFit; error?: string; independentReads?: IndependentReadFit[] }
/** Zero-based variant indices per allele: 0 is the reported edit, 1+ are alternatives. */
export type AlleleVariantSelection = Readonly<Record<number, readonly number[]>>

/** A completed analysis and the user's export choices, tied to the analyzed reference. */
export type SavedSangerAlleleAnalysis = {
  version: 1
  referenceSequence: string
  results: AlleleGroupResult[]
  variantSelections: Record<string, AlleleVariantSelection>
  selectedGroups: string[]
}

/** Ignore unrecognized or malformed metadata from imported files. */
export function normalizeSavedSangerAlleleAnalysis(value: unknown): SavedSangerAlleleAnalysis | undefined {
  if (!value || typeof value !== 'object') return undefined
  const data = value as SavedSangerAlleleAnalysis
  if (data.version !== 1 || typeof data.referenceSequence !== 'string' || !Array.isArray(data.results) || !Array.isArray(data.selectedGroups) || !data.variantSelections || typeof data.variantSelections !== 'object' || Array.isArray(data.variantSelections)) return undefined
  const validEdit = (edit: unknown): boolean => {
    if (!edit || typeof edit !== 'object') return false
    const e = edit as { start: number; end: number; inserted: unknown; label: unknown }
    return Number.isInteger(e.start) && Number.isInteger(e.end) && e.start >= 0 && e.start <= e.end && e.end <= data.referenceSequence.length && typeof e.inserted === 'string' && typeof e.label === 'string'
  }
  const validFit = (fit: AlleleFit): boolean => !!fit && Number.isFinite(fit.fit) && Number.isFinite(fit.positions) && Array.isArray(fit.perRead) && fit.perRead.every((read) => read && typeof read.name === 'string' && Number.isFinite(read.fit)) && Array.isArray(fit.warnings) && fit.warnings.every((warning) => typeof warning === 'string') && Array.isArray(fit.alleles) && fit.alleles.every((allele) => allele && validEdit(allele.edit) && Number.isFinite(allele.fraction) && typeof allele.ambiguous === 'boolean' && Array.isArray(allele.alternatives) && allele.alternatives.every((alternative) => alternative && validEdit(alternative.edit) && (alternative.reason === 'same-profile' || alternative.reason === 'similar-fit')))
  for (const group of data.results) {
    if (!group || typeof group.label !== 'string' || !Array.isArray(group.traceNames) || !group.traceNames.every((name) => typeof name === 'string')) return undefined
    if (group.error !== undefined && typeof group.error !== 'string') return undefined
    if (group.independentReads !== undefined && (!Array.isArray(group.independentReads) || group.independentReads.length !== 2 || !group.independentReads.every((read) => read && typeof read.name === 'string' && (read.orientation === 'forward' || read.orientation === 'reverse' || read.orientation === 'unknown') && (read.result ? validFit(read.result) && read.error === undefined : typeof read.error === 'string')))) return undefined
    const fit = group.result
    if (!fit) { if (!group.error) return undefined; continue }
    if (!validFit(fit)) return undefined
  }
  if (new Set(data.results.map((group) => group.label)).size !== data.results.length || !data.selectedGroups.every((name) => typeof name === 'string' && data.results.some((group) => group.label === name))) return undefined
  for (const [label, selection] of Object.entries(data.variantSelections)) {
    const group = data.results.find((entry) => entry.label === label)
    if (!group?.result || !selection || typeof selection !== 'object' || Array.isArray(selection)) return undefined
    for (const [key, indices] of Object.entries(selection)) {
      const allele = group.result.alleles[Number(key)]
      if (!/^\d+$/.test(key) || !allele || !Array.isArray(indices) || !indices.every((index) => Number.isInteger(index) && index >= 0 && index <= allele.alternatives.length)) return undefined
    }
  }
  return data
}
