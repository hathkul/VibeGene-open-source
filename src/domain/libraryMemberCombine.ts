import { suggestGroupedMemberName } from './libraryMemberReads'
import type { TraceFileRecord } from './traceTypes'

export type ProposedLibraryCombineGroup = {
  /** Case-folded unique name used as the bucket key. */
  stemKey: string
  /** Display unique name (from the first matched file). */
  stem: string
  suggestedName: string
  memberIds: string[]
  /** Prefer this id as the surviving clone shell (usually Read 1). */
  keepMemberId: string
  fileNames: string[]
  /** Which pattern slot each member matched (parallel to memberIds). */
  slots: number[]
}

export type LibraryNameConventionPart =
  | { kind: 'unique_name' }
  | { kind: 'tag' }
  | { kind: 'irrelevant' }
  | { kind: 'literal'; value: string }

export type LibraryReadNameMatch = {
  uniqueName: string
  slot: number
  tag: string
}

const CONVENTION_TOKEN_RE = /<(unique_name|tag|irrelevant)>/gi

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Parse a convention like `<unique_name>_<tag>_<irrelevant>` into ordered parts. */
export function parseLibraryNameConvention(convention: string): LibraryNameConventionPart[] {
  const parts: LibraryNameConventionPart[] = []
  let lastIndex = 0
  const source = convention.trim()
  if (!source) return parts

  CONVENTION_TOKEN_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = CONVENTION_TOKEN_RE.exec(source)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ kind: 'literal', value: source.slice(lastIndex, match.index) })
    }
    const kind = match[1]!.toLowerCase() as 'unique_name' | 'tag' | 'irrelevant'
    parts.push({ kind })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < source.length) {
    parts.push({ kind: 'literal', value: source.slice(lastIndex) })
  }
  return parts
}

export function validateLibraryNameConvention(parts: readonly LibraryNameConventionPart[]): string | null {
  if (!parts.length) return 'Enter a name convention using <unique_name>, <tag>, and optional <irrelevant>.'
  const uniqueCount = parts.filter((part) => part.kind === 'unique_name').length
  const tagCount = parts.filter((part) => part.kind === 'tag').length
  if (uniqueCount !== 1) return 'Convention must include exactly one <unique_name>.'
  if (tagCount !== 1) return 'Convention must include exactly one <tag>.'
  return null
}

/**
 * Build a regex from the convention. `<unique_name>` uses exact length when
 * uniqueNameLength > 0, otherwise a non-greedy run. `<tag>` matches any configured
 * read tag. `<irrelevant>` matches anything (ignored for grouping).
 */
export function buildLibraryNameConventionRegex(
  parts: readonly LibraryNameConventionPart[],
  tags: readonly string[],
  uniqueNameLength: number,
): { regex: RegExp; uniqueGroup: number; tagGroup: number } | null {
  if (validateLibraryNameConvention(parts)) return null
  const tagAlternation = tags
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map(escapeRegExp)
    .toSorted((a, b) => b.length - a.length)
  if (tagAlternation.length < 1) return null

  let pattern = '^'
  let groupIndex = 1
  let uniqueGroup = -1
  let tagGroup = -1

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index]!
    if (part.kind === 'literal') {
      pattern += escapeRegExp(part.value)
      continue
    }
    if (part.kind === 'unique_name') {
      pattern += uniqueNameLength > 0 ? `(.{${uniqueNameLength}})` : '(.+?)'
      uniqueGroup = groupIndex
      groupIndex += 1
      continue
    }
    if (part.kind === 'tag') {
      pattern += `(${tagAlternation.join('|')})`
      tagGroup = groupIndex
      groupIndex += 1
      continue
    }
    // irrelevant: greedy at end, otherwise non-greedy until the next anchored part
    const isLast = index === parts.length - 1
    pattern += isLast ? '.*' : '.+?'
  }
  pattern += '$'

  try {
    return {
      regex: new RegExp(pattern, 'i'),
      uniqueGroup,
      tagGroup,
    }
  } catch {
    return null
  }
}

/**
 * Match a file name against the convention + read tags.
 * Returns the shared unique name and which read slot the tag maps to.
 */
export function matchLibraryReadName(
  fileName: string,
  options: {
    convention: string
    tags: readonly string[]
    uniqueNameLength?: number
  },
): LibraryReadNameMatch | null {
  const base = fileName.replace(/\.[^.]+$/, '')
  if (!base.trim()) return null

  const tags = options.tags.map((tag) => tag.trim())
  const parts = parseLibraryNameConvention(options.convention)
  const built = buildLibraryNameConventionRegex(parts, tags, Math.max(0, options.uniqueNameLength ?? 0))
  if (!built) return null

  const match = built.regex.exec(base)
  if (!match) return null
  const uniqueName = match[built.uniqueGroup]?.trim()
  const tag = match[built.tagGroup]
  if (!uniqueName || !tag) return null

  const slot = tags.findIndex((entry) => entry.toLowerCase() === tag.toLowerCase())
  if (slot < 0) return null
  return { uniqueName, slot, tag }
}

/** @deprecated Prefer matchLibraryReadName with a name convention. */
export function matchLibraryReadPattern(
  fileName: string,
  patterns: readonly string[],
): { stem: string; slot: number } | null {
  const base = fileName.replace(/\.[^.]+$/, '')
  if (!base.trim()) return null
  let best: { slot: number; start: number; end: number; patternLength: number } | null = null
  for (const [slot, raw] of patterns.entries()) {
    const pattern = raw.trim()
    if (!pattern) continue
    const re = new RegExp(
      `(^|[._\\-\\s])(${escapeRegExp(pattern)})(?=$|[._\\-\\s])`,
      'ig',
    )
    let match: RegExpExecArray | null
    while ((match = re.exec(base)) !== null) {
      const token = match[2]!
      const start = match.index + match[1]!.length
      const end = start + token.length
      if (
        !best
        || token.length > best.patternLength
        || (token.length === best.patternLength && slot < best.slot)
      ) {
        best = { slot, start, end, patternLength: token.length }
      }
    }
  }
  if (!best) return null
  const stem = `${base.slice(0, best.start)}${base.slice(best.end)}`
    .replace(/[._\-\s]+/g, ' ')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/^[._\-\s]+|[._\-\s]+$/g, '')
  if (!stem) return null
  return { stem, slot: best.slot }
}

function isCombinableLibraryMember(member: TraceFileRecord) {
  if (member.parseError && !member.sequence) return false
  if ((member.reads?.length ?? 0) > 1) return false
  return true
}

/**
 * Propose clone groups from top-level library members using a name convention
 * and per-read tags. Within each unique name, keeps at most one member per tag
 * slot (first wins), capped at `maxReads`, and only returns groups with ≥ 2 members.
 */
export function proposeLibraryMemberCombineGroups(
  members: readonly TraceFileRecord[],
  options: {
    maxReads: number
    patterns: readonly string[]
    /** Template with <unique_name>, <tag>, optional <irrelevant> in any order. */
    convention?: string
    /** Exact unique-name length; 0 means flexible. */
    uniqueNameLength?: number
  },
): ProposedLibraryCombineGroup[] {
  const maxReads = Math.max(2, Math.floor(options.maxReads) || 2)
  const patterns = options.patterns.slice(0, maxReads).map((pattern) => pattern.trim())
  if (patterns.filter(Boolean).length < 2) return []

  const convention = options.convention?.trim() || '<unique_name>_<tag>_<irrelevant>'
  const uniqueNameLength = Math.max(0, Math.floor(options.uniqueNameLength ?? 0) || 0)
  const parts = parseLibraryNameConvention(convention)
  if (validateLibraryNameConvention(parts)) return []

  type BucketEntry = { member: TraceFileRecord; slot: number; stem: string }
  const buckets = new Map<string, BucketEntry[]>()

  for (const member of members) {
    if (!isCombinableLibraryMember(member)) continue
    const matched = matchLibraryReadName(member.fileName, {
      convention,
      tags: patterns,
      uniqueNameLength,
    })
    if (!matched) continue
    const key = matched.uniqueName.toLowerCase()
    const list = buckets.get(key) ?? []
    list.push({ member, slot: matched.slot, stem: matched.uniqueName })
    buckets.set(key, list)
  }

  const groups: ProposedLibraryCombineGroup[] = []
  for (const [, entries] of buckets) {
    const bySlot = new Map<number, BucketEntry>()
    for (const entry of entries) {
      if (entry.slot >= maxReads) continue
      if (bySlot.has(entry.slot)) continue
      bySlot.set(entry.slot, entry)
    }
    const chosen = [...bySlot.entries()]
      .toSorted((a, b) => a[0] - b[0])
      .map(([, entry]) => entry)
      .slice(0, maxReads)
    if (chosen.length < 2) continue

    const fileNames = chosen.map((entry) => entry.member.fileName)
    const memberIds = chosen.map((entry) => entry.member.id)
    const slots = chosen.map((entry) => entry.slot)
    const keep = chosen.find((entry) => entry.slot === 0) ?? chosen[0]!
    groups.push({
      stemKey: keep.stem.toLowerCase(),
      stem: keep.stem,
      suggestedName: keep.stem || suggestGroupedMemberName(fileNames),
      memberIds,
      keepMemberId: keep.member.id,
      fileNames,
      slots,
    })
  }

  return groups.toSorted((a, b) => a.stem.localeCompare(b.stem))
}
