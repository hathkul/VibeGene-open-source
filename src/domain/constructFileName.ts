/** Normalize a user-entered construct name (strip .dna, fall back to Untitled). */
export function normalizeConstructFileName(raw: string, fallback = 'Untitled'): string {
  const trimmed = raw.trim().replace(/\.dna$/i, '')
  return trimmed || fallback
}
