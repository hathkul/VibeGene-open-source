import { describe, expect, it, vi } from 'vitest'
import {
  executeSharedFragmentDismiss,
  executeSharedFragmentInsert,
  SHARED_FRAGMENT_DISMISSED_STATUS,
  SHARED_FRAGMENT_INSERT_MISSING_SELECTION_STATUS,
  type PendingSharedFragmentRef,
} from './sharedFragmentCommandPlan'

const fragment: PendingSharedFragmentRef = {
  id: 'fragment-1',
  fromRecordName: 'pUC19',
  sequence: 'ACGT',
}

describe('sharedFragmentCommandPlan', () => {
  it('inserts before clearing pending storage and sets the shared-fragment status', () => {
    const order: string[] = []
    const insertSequence = vi.fn((sequence: string) => {
      order.push(`insert:${sequence}`)
      order.push('history:focus-scroll')
      return true
    })
    const clearPending = vi.fn(() => order.push('clearPending'))
    const clearStorage = vi.fn((fragmentId: string) => order.push(`clearStorage:${fragmentId}`))
    const setStatus = vi.fn((status: string) => order.push(`status:${status}`))

    executeSharedFragmentInsert(fragment, { insertSequence, clearPending, clearStorage, setStatus })

    expect(order).toEqual([
      'insert:ACGT',
      'history:focus-scroll',
      'clearPending',
      'clearStorage:fragment-1',
      'status:Inserted 4 bp from pUC19.',
    ])
  })

  it('reports missing selection without clearing storage', () => {
    const clearPending = vi.fn()
    const clearStorage = vi.fn()
    executeSharedFragmentInsert(fragment, {
      insertSequence: () => false,
      clearPending,
      clearStorage,
      setStatus: vi.fn(),
    })
    expect(clearPending).not.toHaveBeenCalled()
    expect(clearStorage).not.toHaveBeenCalled()
  })

  it('uses the exact missing-selection status message', () => {
    const setStatus = vi.fn()
    executeSharedFragmentInsert(fragment, {
      insertSequence: () => false,
      clearPending: vi.fn(),
      clearStorage: vi.fn(),
      setStatus,
    })
    expect(setStatus).toHaveBeenCalledWith(SHARED_FRAGMENT_INSERT_MISSING_SELECTION_STATUS)
  })

  it('dismisses pending fragments before clearing storage', () => {
    const order: string[] = []
    executeSharedFragmentDismiss(fragment, {
      clearPending: () => order.push('clearPending'),
      clearStorage: (fragmentId) => order.push(`clearStorage:${fragmentId}`),
      setStatus: (status) => order.push(`status:${status}`),
    })
    expect(order).toEqual([
      'clearPending',
      'clearStorage:fragment-1',
      `status:${SHARED_FRAGMENT_DISMISSED_STATUS}`,
    ])
  })
})
