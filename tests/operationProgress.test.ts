import { describe, expect, it, vi } from 'vitest'
import {
  beginOperationProgress,
  getOperationProgress,
  subscribeOperationProgress,
} from '../src/domain/operationProgress'

describe('operationProgress', () => {
  it('reports updates and restores a previous operation when the latest finishes', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeOperationProgress(listener)
    const first = beginOperationProgress('Opening library', 3)
    const firstId = getOperationProgress()?.id
    const second = beginOperationProgress('Rebuilding consensus', 2)
    expect(getOperationProgress()).toMatchObject({ label: 'Rebuilding consensus', completed: 0, total: 2 })
    first.update(1, 3, '1 of 3')
    expect(getOperationProgress()?.label).toBe('Rebuilding consensus')
    second.update(1, 2, '1 of 2')
    expect(getOperationProgress()).toMatchObject({ completed: 1, detail: '1 of 2' })
    second.finish()
    expect(getOperationProgress()).toMatchObject({ id: firstId, completed: 1, detail: '1 of 3' })
    first.finish()
    expect(getOperationProgress()).toBeNull()
    expect(listener).toHaveBeenCalledTimes(6)
    unsubscribe()
  })
})
