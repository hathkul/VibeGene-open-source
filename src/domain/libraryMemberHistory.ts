import { matchPackedLibraryMemberIndexes } from './libraryMemberPackMatch'
import type {
  LibraryMemberHistoryEntry,
  LibraryMemberHistoryPooledNode,
  LibraryMemberHistoryPool,
  LibraryMemberHistoryReference,
} from './dnaComparisonTypes'
import type { TraceFileRecord } from './traceTypes'
import type { HistoryNode, SequenceRecord } from './types'

export type PackedLibraryMemberHistory = {
  entries: LibraryMemberHistoryReference[]
  pool: LibraryMemberHistoryPool
}

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/** JSON.stringify equivalent with stable object-key ordering for content addressing. */
function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((entry) => stableJson(entry)).join(',')}]`
  const entries = Object.entries(value)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(',')}}`
}

/** FNV-1a 64-bit is deterministic in browser and desktop runtimes; collisions are checked below. */
function historyContentHash(value: string): string {
  let hash = 0xcbf29ce484222325n
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index))
    hash = BigInt.asUintN(64, hash * 0x100000001b3n)
  }
  return hash.toString(16).padStart(16, '0')
}

function isHistoryReference(entry: LibraryMemberHistoryEntry): entry is LibraryMemberHistoryReference {
  return 'historyRef' in entry && typeof entry.historyRef === 'string'
}

function internHistoryNode(
  node: HistoryNode,
  nodes: Record<string, LibraryMemberHistoryPooledNode>,
  refsByContent: Map<string, string>,
  contentByRef: Map<string, string>,
): string {
  const children = node.children.map((child) => internHistoryNode(child, nodes, refsByContent, contentByRef))
  // Do not clone descendants here: this function visits every subtree already,
  // and cloning `node` wholesale turns a long shared lineage quadratic.
  const local = { ...node } as Partial<HistoryNode>
  delete local.children
  const pooled = { ...jsonClone(local), children } as LibraryMemberHistoryPooledNode
  const content = stableJson(pooled)
  const existing = refsByContent.get(content)
  if (existing) return existing

  const base = `history:${historyContentHash(content)}`
  let ref = base
  let collision = 2
  while (contentByRef.has(ref) && contentByRef.get(ref) !== content) {
    ref = `${base}-${collision}`
    collision += 1
  }
  nodes[ref] = pooled
  refsByContent.set(content, ref)
  contentByRef.set(ref, content)
  return ref
}

/**
 * Compact every repeated history subtree once. Member roots remain independently
 * addressable while shared vector/ancestor subtrees are pooled by content.
 */
export function packLibraryMemberHistory(traces: readonly TraceFileRecord[]): PackedLibraryMemberHistory {
  const nodes: Record<string, LibraryMemberHistoryPooledNode> = {}
  const refsByContent = new Map<string, string>()
  const contentByRef = new Map<string, string>()
  const entries = traces.flatMap((trace) => {
    if (!trace.history) return []
    return [{
      memberId: trace.id,
      fileName: trace.fileName,
      historyRef: internHistoryNode(trace.history, nodes, refsByContent, contentByRef),
    }]
  })
  return { entries, pool: { version: 1, nodes } }
}

function isPooledNode(value: unknown): value is LibraryMemberHistoryPooledNode {
  return Boolean(value && typeof value === 'object' && Array.isArray((value as { children?: unknown }).children))
}

function clonePooledHistory(
  ref: string,
  pool: LibraryMemberHistoryPool,
  visiting = new Set<string>(),
): HistoryNode | undefined {
  if (visiting.has(ref)) return undefined
  const pooled = pool.nodes[ref]
  if (!isPooledNode(pooled)) return undefined
  const nextVisiting = new Set(visiting)
  nextVisiting.add(ref)
  const children: HistoryNode[] = []
  for (const childRef of pooled.children) {
    if (typeof childRef !== 'string') return undefined
    const child = clonePooledHistory(childRef, pool, nextVisiting)
    if (!child) return undefined
    children.push(child)
  }
  // Clone on every expansion: members must never share mutable HistoryNode objects.
  return { ...jsonClone(pooled), children } as HistoryNode
}

export function normalizeLibraryMemberHistoryStorage(
  entries: readonly LibraryMemberHistoryEntry[] | undefined,
  pool: LibraryMemberHistoryPool | undefined,
): { entries: LibraryMemberHistoryEntry[]; pool?: LibraryMemberHistoryPool } {
  const normalizedPool = pool?.version === 1 && pool.nodes && typeof pool.nodes === 'object'
    ? {
        version: 1 as const,
        nodes: Object.fromEntries(
          Object.entries(pool.nodes)
            .filter(([, node]) => isPooledNode(node) && node.children.every((child) => typeof child === 'string'))
            .map(([ref, node]) => [ref, jsonClone(node)]),
        ),
      }
    : undefined
  const normalizedEntries: LibraryMemberHistoryEntry[] = []
  for (const entry of entries ?? []) {
    if (!entry || typeof entry.memberId !== 'string' || !entry.memberId) continue
    const fileName = typeof entry.fileName === 'string' && entry.fileName.trim() ? entry.fileName.trim() : undefined
    if (isHistoryReference(entry)) {
      if (normalizedPool?.nodes[entry.historyRef]) {
        normalizedEntries.push({ memberId: entry.memberId, ...(fileName ? { fileName } : {}), historyRef: entry.historyRef })
      }
      continue
    }
    if ('history' in entry && entry.history && typeof entry.history === 'object') {
      normalizedEntries.push({ memberId: entry.memberId, ...(fileName ? { fileName } : {}), history: entry.history })
    }
  }
  return {
    entries: normalizedEntries,
    ...(normalizedEntries.some(isHistoryReference) && normalizedPool && Object.keys(normalizedPool.nodes).length
      ? { pool: normalizedPool }
      : {}),
  }
}

export function hydrateLibraryMemberHistoryOntoTraces(
  record: Pick<SequenceRecord, 'dna'>,
  traces: TraceFileRecord[],
): TraceFileRecord[] {
  const packed = record.dna?.libraryMemberHistory
  if (!packed?.length) return traces
  const matched = matchPackedLibraryMemberIndexes(traces, packed)
  return traces.map((trace, index) => {
    const packIndex = matched[index]
    const entry = packIndex == null ? undefined : packed[packIndex]
    const history = entry && isHistoryReference(entry)
      ? (record.dna?.libraryMemberHistoryPool
          ? clonePooledHistory(entry.historyRef, record.dna.libraryMemberHistoryPool)
          : undefined)
      : entry && 'history' in entry && entry.history
        ? jsonClone(entry.history)
        : undefined
    return history ? { ...trace, history } : trace
  })
}
