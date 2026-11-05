import { dnaComparisonSourceFromSequence } from '../../domain/dnaComparisonImport'
import type { DnaComparisonSource } from '../../domain/dnaComparisonTypes'
import { proteinComparisonSourceFromSequence } from '../../domain/proteinComparisonImport'
import type { ProteinComparisonSource } from '../../domain/proteinAlignmentTypes'
import type { DatabaseAlignmentPickMode } from '../ports/hybridWindows'

export type DatabaseAlignmentIntakeConstruct = {
  name: string
  sequence: string
  molecule: 'dna' | 'rna' | 'protein'
}

export type DatabaseAlignmentIntakePlan =
  | { kind: 'status'; message: string }
  | {
      kind: 'dna-comparative-append'
      sources: DnaComparisonSource[]
      message: string
    }
  | {
      kind: 'dna-trace-align'
      entries: Array<{ name: string; sequence: string }>
      progressMessage: string
    }
  | {
      kind: 'protein-append'
      sources: ProteinComparisonSource[]
      message: string
    }

export function planDatabaseAlignmentIntake(input: {
  mode: DatabaseAlignmentPickMode
  constructs: DatabaseAlignmentIntakeConstruct[]
  dnaAlignmentMode: 'comparative' | 'trace'
}): DatabaseAlignmentIntakePlan {
  const { mode, constructs, dnaAlignmentMode } = input
  if (!constructs.length) {
    return { kind: 'status', message: 'No constructs were selected to add to alignment.' }
  }

  if (mode === 'dna') {
    const nucleotide = constructs.filter((entry) => entry.molecule !== 'protein')
    if (!nucleotide.length) {
      return { kind: 'status', message: 'Select DNA constructs to add to DNA alignment.' }
    }
    if (dnaAlignmentMode === 'comparative') {
      const sources = nucleotide.flatMap((entry) => {
        const source = dnaComparisonSourceFromSequence(entry.sequence, entry.name, entry.name)
        return source ? [source] : []
      })
      return {
        kind: 'dna-comparative-append',
        sources,
        message: `Added ${sources.length} DNA comparison sequence${sources.length === 1 ? '' : 's'} from Database.`,
      }
    }
    return {
      kind: 'dna-trace-align',
      entries: nucleotide.map((entry) => ({ name: entry.name, sequence: entry.sequence })),
      progressMessage: `Aligning ${nucleotide.length} Database construct${nucleotide.length === 1 ? '' : 's'}…`,
    }
  }

  const sources = constructs.flatMap((entry) => {
    const kind = entry.molecule === 'protein' ? 'protein' : 'dna'
    const source = proteinComparisonSourceFromSequence(entry.sequence, entry.name, kind, entry.name)
    return source ? [source] : []
  })
  if (!sources.length) {
    return { kind: 'status', message: 'No alignable sequences in the Database selection.' }
  }
  return {
    kind: 'protein-append',
    sources,
    message: `Added ${sources.length} comparison sequence${sources.length === 1 ? '' : 's'} from Database.`,
  }
}

export function databaseAlignmentTraceAddedStatus(addedCount: number, isLibrary: boolean): string {
  if (!addedCount) return 'No alignable DNA sequences in the Database selection.'
  if (isLibrary) {
    return `Added ${addedCount} member${addedCount === 1 ? '' : 's'} from Database.`
  }
  return `Added ${addedCount} alignment${addedCount === 1 ? '' : 's'} from Database.`
}
