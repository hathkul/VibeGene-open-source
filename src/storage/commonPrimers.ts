import { createId, normalizeDna, nowIso } from '../domain/sequence'
import { db, type StoredCommonPrimer } from './projects'
import { primerIdentityKey } from './databasePrimers'

export type CommonPrimerDraft = {
  id?: string
  name: string
  sequence: string
  color?: string
  description?: string
  specificity?: import('../domain/primer3/specificity').SavedPrimerSpecificity
}

function normalizeDraft(draft: CommonPrimerDraft): Omit<StoredCommonPrimer, 'id' | 'updatedAt'> {
  return {
    name: draft.name.trim() || 'Primer',
    sequence: normalizeDna(draft.sequence),
    color: draft.color?.trim() || '#7c3aed',
    description: draft.description ?? '',
    ...('specificity' in draft ? { specificity: draft.specificity } : {}),
  }
}

export async function listCommonPrimers(): Promise<StoredCommonPrimer[]> {
  const rows = await db.commonPrimers.toArray()
  return rows.sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }),
  )
}

export async function getCommonPrimer(id: string): Promise<StoredCommonPrimer | undefined> {
  return db.commonPrimers.get(id)
}

export async function setCommonPrimerSpecificity(id: string, specificity: StoredCommonPrimer['specificity']): Promise<void> {
  const updated = await db.commonPrimers.update(id, { specificity, updatedAt: nowIso() })
  if (!updated) throw new Error('The common primer no longer exists.')
}

export async function findCommonPrimerByIdentity(
  name: string,
  sequence: string,
): Promise<StoredCommonPrimer | undefined> {
  const key = primerIdentityKey(name, sequence)
  const rows = await db.commonPrimers.toArray()
  return rows.find((row) => primerIdentityKey(row.name, row.sequence) === key)
}

export async function upsertCommonPrimer(draft: CommonPrimerDraft): Promise<StoredCommonPrimer> {
  const next = normalizeDraft(draft)
  if (!next.sequence) throw new Error('Primer sequence is empty')

  const existingById = draft.id ? await db.commonPrimers.get(draft.id) : undefined
  const existingByIdentity = existingById
    ? undefined
    : await findCommonPrimerByIdentity(next.name, next.sequence)
  const existing = existingById ?? existingByIdentity
  const row: StoredCommonPrimer = {
    id: existing?.id ?? createId('common-primer'),
    specificity: existing?.specificity,
    ...next,
    updatedAt: nowIso(),
  }
  await db.commonPrimers.put(row)
  return row
}

export async function addCommonPrimers(
  drafts: CommonPrimerDraft[],
): Promise<{ added: StoredCommonPrimer[]; skipped: number }> {
  const added: StoredCommonPrimer[] = []
  let skipped = 0
  for (const draft of drafts) {
    const next = normalizeDraft(draft)
    if (!next.sequence) continue
    const existing = await findCommonPrimerByIdentity(next.name, next.sequence)
    if (existing) {
      skipped += 1
      continue
    }
    added.push(await upsertCommonPrimer(next))
  }
  return { added, skipped }
}

export async function deleteCommonPrimers(ids: string[]): Promise<number> {
  let deleted = 0
  for (const id of ids) {
    if (!id) continue
    await db.commonPrimers.delete(id)
    deleted += 1
  }
  return deleted
}

/**
 * Make Common primers match exactly the given drafts (by name+sequence identity).
 * Used by Sync and clean up database so false positives from older imports are removed.
 */
export async function replaceCommonPrimersWith(
  drafts: CommonPrimerDraft[],
): Promise<{ added: number; kept: number; removed: number }> {
  const wanted = new Map<string, Omit<StoredCommonPrimer, 'id' | 'updatedAt'>>()
  for (const draft of drafts) {
    const next = normalizeDraft(draft)
    if (!next.sequence) continue
    wanted.set(primerIdentityKey(next.name, next.sequence), next)
  }

  const existing = await listCommonPrimers()
  let kept = 0
  let removed = 0
  for (const row of existing) {
    const key = primerIdentityKey(row.name, row.sequence)
    if (wanted.has(key)) {
      kept += 1
      wanted.delete(key)
      continue
    }
    await db.commonPrimers.delete(row.id)
    removed += 1
  }

  let added = 0
  for (const draft of wanted.values()) {
    await upsertCommonPrimer(draft)
    added += 1
  }
  return { added, kept, removed }
}
