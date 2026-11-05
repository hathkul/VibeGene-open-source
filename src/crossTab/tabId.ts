import { createId } from '../domain/sequence'

const TAB_ID_KEY = 'vibegene:tab-id'

export function getTabId(): string {
  try {
    const existing = window.sessionStorage.getItem(TAB_ID_KEY)
    if (existing) return existing
    const created = createId('tab')
    window.sessionStorage.setItem(TAB_ID_KEY, created)
    return created
  } catch {
    return createId('tab')
  }
}
