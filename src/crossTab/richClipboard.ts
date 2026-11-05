import { nowIso } from '../domain/sequence'
import type { RichClipboardFragment } from '../domain/richClipboard'
import { db } from '../storage/projects'

export const RICH_CLIPBOARD_ENTRY_ID = 'latest'
const SESSION_KEY = 'vibegene-rich-clipboard-id'
const MAX_AGE_MS = 24 * 60 * 60 * 1000

let inMemoryRichClipboard: RichClipboardFragment | null = null

function isFresh(fragment: RichClipboardFragment) {
  const copiedAt = Date.parse(fragment.copiedAt)
  return Number.isFinite(copiedAt) && Date.now() - copiedAt <= MAX_AGE_MS
}

export async function storeRichClipboard(
  input: Omit<RichClipboardFragment, 'id' | 'copiedAt'>,
): Promise<RichClipboardFragment> {
  const fragment: RichClipboardFragment = {
    ...input,
    id: RICH_CLIPBOARD_ENTRY_ID,
    copiedAt: nowIso(),
  }
  inMemoryRichClipboard = fragment
  await db.richClipboardFragments.put(fragment)
  sessionStorage.setItem(SESSION_KEY, fragment.id)
  return fragment
}

export async function getRichClipboardForPaste(): Promise<RichClipboardFragment | null> {
  if (inMemoryRichClipboard && isFresh(inMemoryRichClipboard)) {
    return inMemoryRichClipboard
  }
  const fragment = await db.richClipboardFragments.get(RICH_CLIPBOARD_ENTRY_ID)
  if (!fragment) {
    inMemoryRichClipboard = null
    return null
  }
  if (!isFresh(fragment)) {
    await clearRichClipboard()
    return null
  }
  inMemoryRichClipboard = fragment
  return fragment
}

export async function clearRichClipboard() {
  inMemoryRichClipboard = null
  await db.richClipboardFragments.delete(RICH_CLIPBOARD_ENTRY_ID)
  sessionStorage.removeItem(SESSION_KEY)
}
