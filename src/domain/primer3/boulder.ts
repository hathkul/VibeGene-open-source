const SETTINGS_FILE_HEADER = 'Primer3 File - http://primer3.org'
const LEGACY_SETTINGS_FILE_HEADER = 'Primer3 File - http://primer3.sourceforge.net'
const SETTINGS_FILE_TYPE_LINE = 'P3_FILE_TYPE=settings'

function splitLines(text: string): string[] {
  return text.split(/\r?\n/)
}

export function formatBoulderRecord(tags: Record<string, string>): string {
  const lines: string[] = []
  for (const [tag, value] of Object.entries(tags)) {
    if (!tag || /[=\r\n]/.test(tag)) throw new Error(`Invalid Boulder-IO tag: ${JSON.stringify(tag)}`)
    if (/[\r\n]/.test(value)) throw new Error(`Boulder-IO value for ${tag} must not contain line breaks`)
    if (value === '') continue
    lines.push(`${tag}=${value}`)
  }
  lines.push('=')
  return `${lines.join('\n')}\n`
}

export function parseBoulderRecords(text: string): Record<string, string>[] {
  const records: Record<string, string>[] = []
  let current: Record<string, string> = {}
  let hasTags = false
  for (const line of splitLines(text)) {
    if (line === '=') {
      records.push(current)
      current = {}
      hasTags = false
      continue
    }
    const separator = line.indexOf('=')
    if (separator <= 0) continue
    current[line.slice(0, separator)] = line.slice(separator + 1)
    hasTags = true
  }
  if (hasTags) records.push(current)
  return records
}

export function parseBoulderRecord(text: string): Record<string, string> {
  return parseBoulderRecords(text)[0] ?? {}
}

export function parsePrimer3SettingsFile(text: string): Record<string, string> {
  const lines = splitLines(text.replace(/^\uFEFF/, ''))
  const header = lines[0]?.trim()
  if (header !== SETTINGS_FILE_HEADER && header !== LEGACY_SETTINGS_FILE_HEADER) {
    throw new Error(`Not a Primer3 settings file: the first line must be "${SETTINGS_FILE_HEADER}"`)
  }
  const fileType = lines[1]?.trim()
  if (fileType !== SETTINGS_FILE_TYPE_LINE) {
    throw new Error(`Not a Primer3 settings file: expected "${SETTINGS_FILE_TYPE_LINE}" on line 2`)
  }
  const tags: Record<string, string> = {}
  for (const line of lines.slice(2)) {
    if (line === '=') break
    // Primer3 itself only reads PRIMER_* lines from settings files; anything else (comments, P3_*) is skipped.
    if (!line.startsWith('PRIMER_')) continue
    const separator = line.indexOf('=')
    if (separator <= 0) continue
    tags[line.slice(0, separator)] = line.slice(separator + 1)
  }
  return tags
}

export function formatPrimer3SettingsFile(tags: Record<string, string>): string {
  const settings = Object.fromEntries(Object.entries(tags).filter(([tag]) => tag !== 'P3_FILE_TYPE'))
  return `${SETTINGS_FILE_HEADER}\n${SETTINGS_FILE_TYPE_LINE}\n\n${formatBoulderRecord(settings)}`
}
