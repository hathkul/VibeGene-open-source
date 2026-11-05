export type DatabaseManagerProjectExportFormat = 'dna' | 'gb' | 'fasta'

export type DatabaseManagerExportSelectionRoute = {
  projectIds: readonly string[]
  format: DatabaseManagerProjectExportFormat
}

export function databaseManagerExportSelectionRoute(
  projectIds: readonly string[],
  format: DatabaseManagerProjectExportFormat,
): DatabaseManagerExportSelectionRoute {
  return { projectIds, format }
}

export function databaseManagerDeleteSelectionProjectIds(
  projectIds: readonly string[],
): readonly string[] {
  return projectIds
}

export function databaseManagerRenameSelectionProjectId(
  projectIds: readonly string[],
): string | null {
  return projectIds.length === 1 ? projectIds[0]! : null
}
