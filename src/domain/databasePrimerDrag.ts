import type { LibraryPrimer } from './libraryPrimer'

export const DATABASE_PRIMERS_DRAG_MIME = 'application/x-vibegene-database-primers'
const DATABASE_PRIMERS_DRAG_VERSION = 1

export type DatabasePrimersDragPayload = {
  version: 1
  primers: LibraryPrimer[]
}

export function encodeDatabasePrimersDragPayload(primers: readonly LibraryPrimer[]): string {
  return JSON.stringify({
    version: DATABASE_PRIMERS_DRAG_VERSION,
    primers: primers.map((primer) => ({
      name: primer.name,
      sequence: primer.sequence,
      ...(primer.color ? { color: primer.color } : {}),
      ...(primer.description ? { description: primer.description } : {}),
    })),
  })
}

export function decodeDatabasePrimersDragPayload(value: string | null | undefined): LibraryPrimer[] {
  if (!value) return []
  try {
    const payload = JSON.parse(value) as Partial<DatabasePrimersDragPayload>
    if (payload.version !== DATABASE_PRIMERS_DRAG_VERSION || !Array.isArray(payload.primers)) return []
    return payload.primers.filter((primer): primer is LibraryPrimer => (
      Boolean(primer)
      && typeof primer.name === 'string'
      && typeof primer.sequence === 'string'
      && primer.name.trim().length > 0
      && primer.sequence.trim().length > 0
      && (primer.color === undefined || typeof primer.color === 'string')
      && (primer.description === undefined || typeof primer.description === 'string')
    )).map((primer) => ({
      name: primer.name,
      sequence: primer.sequence,
      ...(primer.color ? { color: primer.color } : {}),
      ...(primer.description ? { description: primer.description } : {}),
    }))
  } catch {
    return []
  }
}
