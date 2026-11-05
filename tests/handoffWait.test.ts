import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultConstructProperties } from '../src/domain/constructProperties'
import type { SequenceRecord } from '../src/domain/types'
import { db, putHandoffRecord, waitForHandoffRecord } from '../src/storage/projects'

const record: SequenceRecord = {
  id: 'product',
  name: 'Cloning product',
  description: '',
  molecule: 'dna',
  topology: 'circular',
  sequence: 'ATGC',
  features: [],
  primers: [],
  operations: [],
  construct: { ...defaultConstructProperties },
  createdAt: '',
  updatedAt: '',
}

beforeEach(async () => {
  await db.delete()
  await db.open()
})

afterEach(async () => {
  await db.delete()
})

describe('browser handoff wait', () => {
  it('loads a handoff committed just after its destination tab starts', async () => {
    const waiting = waitForHandoffRecord('delayed-handoff', 1_000)
    globalThis.setTimeout(() => void putHandoffRecord('delayed-handoff', record), 10)

    await expect(waiting).resolves.toMatchObject({
      record: expect.objectContaining({ id: 'product', sequence: 'ATGC' }),
    })
  })

  it('preserves the explicit database origin independently of record ids', async () => {
    await putHandoffRecord('database-origin', record, {
      kind: 'database',
      projectId: 'stored-project',
      folderId: null,
    })
    await expect(waitForHandoffRecord('database-origin', 1_000)).resolves.toMatchObject({
      record: expect.objectContaining({ id: 'product' }),
      documentOrigin: { kind: 'database', projectId: 'stored-project', folderId: null },
    })
  })

  it('times out even when IndexedDB leaves a read pending', async () => {
    const get = vi.spyOn(db.handoffs, 'get').mockImplementation(() => new Promise(() => {}))
    const startedAt = Date.now()

    await expect(waitForHandoffRecord('stalled-handoff', 30)).resolves.toBeNull()
    expect(Date.now() - startedAt).toBeLessThan(500)
    get.mockRestore()
  })
})
