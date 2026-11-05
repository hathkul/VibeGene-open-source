import { createId, nowIso } from '../domain/sequence'
import { db } from '../storage/projects'
import { postCrossTabMessage } from './channel'
import type { SharedFragment } from './types'

export async function shareFragment(input: Omit<SharedFragment, 'id' | 'sharedAt'>) {
  const fragment: SharedFragment = {
    ...input,
    id: createId('fragment'),
    sharedAt: nowIso(),
  }
  await db.sharedFragments.put(fragment)
  postCrossTabMessage({
    type: 'fragment-shared',
    fromTabId: fragment.fromTabId,
    fromRecordName: fragment.fromRecordName,
    fragmentId: fragment.id,
  })
  return fragment
}

export async function getSharedFragment(fragmentId: string): Promise<SharedFragment | null> {
  return (await db.sharedFragments.get(fragmentId)) ?? null
}

export async function clearSharedFragment(fragmentId: string) {
  await db.sharedFragments.delete(fragmentId)
}
