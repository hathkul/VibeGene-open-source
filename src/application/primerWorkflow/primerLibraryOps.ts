import type { PrimerListEntry } from '../../domain/primerExport'
import type { LibraryPrimer } from '../../domain/libraryPrimer'
import { normalizeDna } from '../../domain/sequence'

/** Parsed, non-empty member sequences usable as extra hybridization/detection templates. */
export function validLibraryMemberSequences(
  members: readonly { sequence: string; parseError?: string }[],
): string[] {
  return members
    .filter((member) => !member.parseError && member.sequence.length > 0)
    .map((member) => member.sequence)
}

/** Hybridization templates: the consensus sequence, plus member sequences when a library is open. */
export function libraryHybridizationTemplates(
  isLibrary: boolean,
  recordSequence: string,
  memberSequences: readonly string[],
): string[] {
  return isLibrary ? [recordSequence, ...memberSequences] : [recordSequence]
}

/** Normalize database-primer picks into import list entries, dropping empty sequences. */
export function databasePrimerListEntries(entries: readonly LibraryPrimer[]): PrimerListEntry[] {
  return entries
    .map((entry) => ({
      name: entry.name.trim() || 'Primer',
      sequence: normalizeDna(entry.sequence),
      color: entry.color,
      description: entry.description,
    }))
    .filter((entry) => entry.sequence.length > 0)
}

/**
 * Count candidates whose normalized sequence is already on the record — or repeated within
 * the candidate list itself (a duplicate after normalization counts as already present).
 */
export function countSkippedPresentPrimers(
  candidateSequences: readonly string[],
  existingPrimers: readonly { sequence: string }[],
): number {
  const seen = new Set(existingPrimers.map((primer) => normalizeDna(primer.sequence)))
  let skipped = 0
  for (const sequence of candidateSequences) {
    const normalized = normalizeDna(sequence)
    if (seen.has(normalized)) {
      skipped += 1
      continue
    }
    seen.add(normalized)
  }
  return skipped
}
