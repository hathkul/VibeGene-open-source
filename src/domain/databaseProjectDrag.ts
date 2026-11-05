export const DATABASE_PROJECTS_DRAG_MIME = 'application/x-vibegene-database-projects'
const DATABASE_PROJECTS_DRAG_VERSION = 1

export type DatabaseProjectsDragPayload = {
  version: 1
  projectIds: string[]
}

export function encodeDatabaseProjectsDragPayload(projectIds: readonly string[]): string {
  return JSON.stringify({
    version: DATABASE_PROJECTS_DRAG_VERSION,
    projectIds: [...new Set(projectIds)].filter((id) => id.trim().length > 0),
  })
}

export function decodeDatabaseProjectsDragPayload(value: string | null | undefined): string[] {
  if (!value) return []
  try {
    const payload = JSON.parse(value) as Partial<DatabaseProjectsDragPayload>
    if (payload.version !== DATABASE_PROJECTS_DRAG_VERSION || !Array.isArray(payload.projectIds)) return []
    return [...new Set(payload.projectIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0))]
  } catch {
    return []
  }
}
