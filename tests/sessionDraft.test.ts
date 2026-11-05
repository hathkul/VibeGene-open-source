import 'fake-indexeddb/auto'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { normalizeAppPreferences } from '../src/domain/appPreferences'
import { defaultConstructProperties } from '../src/domain/constructProperties'
import type { SequenceRecord } from '../src/domain/types'
import { db } from '../src/storage/projects'
import {
  clearSessionDraftForRecord,
  getSessionDraft,
  isSessionDraftId,
  listSessionDrafts,
  saveSessionDraft,
  sessionDraftIdForRecord,
} from '../src/storage/sessionDraft'

function record(id: string, sequence = 'ATGC'): SequenceRecord {
  return {
    id,
    name: `Draft ${id}`,
    description: '',
    molecule: 'dna',
    topology: 'circular',
    sequence,
    features: [],
    primers: [],
    operations: [],
    construct: { ...defaultConstructProperties },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('session draft helpers', () => {
  it('identifies draft ids', () => {
    expect(isSessionDraftId('__vibegene-draft__:abc')).toBe(true)
    expect(isSessionDraftId('__vibegene-session-draft__')).toBe(true)
    expect(isSessionDraftId('project-1')).toBe(false)
  })

  it('builds stable draft ids from record ids', () => {
    expect(sessionDraftIdForRecord('seq-123')).toBe('__vibegene-draft__:seq-123')
  })

  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  afterAll(async () => {
    await db.delete()
  })

  it('keeps one draft per document, trims the oldest drafts, and clears a saved document draft', async () => {
    await saveSessionDraft(record('one'), 3)
    await saveSessionDraft(record('two'), 3)
    await saveSessionDraft(record('one', 'ATGCA'), 3)

    expect((await listSessionDrafts()).map((draft) => draft.id).sort()).toEqual([
      sessionDraftIdForRecord('one'),
      sessionDraftIdForRecord('two'),
    ])
    await expect(getSessionDraft(sessionDraftIdForRecord('one'))).resolves.toMatchObject({
      record: { sequence: 'ATGCA' },
    })

    await clearSessionDraftForRecord('one')
    expect((await listSessionDrafts()).map((draft) => draft.id)).toEqual([
      sessionDraftIdForRecord('two'),
    ])

    // A one-draft preference evicts the older remaining draft rather than
    // collapsing every unsaved document into a shared recovery record.
    await new Promise((resolve) => setTimeout(resolve, 2))
    await saveSessionDraft(record('three'), 1)
    expect((await listSessionDrafts()).map((draft) => draft.id)).toEqual([
      sessionDraftIdForRecord('three'),
    ])
  })
})

describe('maxUnsavedDrafts preference', () => {
  it('defaults to 10 and clamps user values', () => {
    expect(normalizeAppPreferences(null).maxUnsavedDrafts).toBe(10)
    expect(normalizeAppPreferences({ maxUnsavedDrafts: 0 }).maxUnsavedDrafts).toBe(1)
    expect(normalizeAppPreferences({ maxUnsavedDrafts: 99 }).maxUnsavedDrafts).toBe(50)
  })
})
