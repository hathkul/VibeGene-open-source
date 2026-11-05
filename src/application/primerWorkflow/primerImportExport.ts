import type { Primer } from '../../domain/types'
import { validLibraryMemberSequences } from './primerLibraryOps'

/**
 * Extra hybridization templates and existing primers contributed by library members during
 * primer import; undefined for a plain (non-library) construct.
 */
export function libraryPrimerImportOptions(
  isLibrary: boolean,
  members: readonly { sequence: string; parseError?: string; primers?: Primer[] }[],
): { additionalTemplates: string[]; additionalExistingPrimers: Primer[] } | undefined {
  if (!isLibrary) return undefined
  return {
    additionalTemplates: validLibraryMemberSequences(members),
    additionalExistingPrimers: members.flatMap((member) => member.primers ?? []),
  }
}

/** Export plan for grouped sgRNA annotations; null when the selection is empty. */
export function sgRnaExportPlan(
  guides: readonly { guide: { name: string } }[],
  recordName: string,
): { fileName: string; status: string } | null {
  if (!guides.length) return null
  const baseName = recordName.replace(/\.dna$/i, '')
  return {
    fileName: `sgRNAs from ${baseName}.txt`,
    status: guides.length === 1
      ? `Exported sgRNA ${guides[0]!.guide.name}.`
      : `Exported ${guides.length} sgRNAs.`,
  }
}
