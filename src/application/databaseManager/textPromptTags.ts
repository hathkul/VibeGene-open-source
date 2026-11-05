function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of tags) {
    const tag = raw.trim().replace(/\s+/g, ' ')
    if (!tag) continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(tag)
  }
  return result.sort((a, b) => a.localeCompare(b))
}

export function parsePromptTagList(raw: string): string[] {
  return normalizeTags(raw.split(/[,;]/))
}

export function formatPromptTagList(tags: string[]): string {
  return normalizeTags(tags).join(', ')
}
