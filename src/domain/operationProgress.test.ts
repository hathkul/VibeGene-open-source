import { describe, expect, it, vi } from 'vitest'
import { beginOperationProgress, cancelOperationProgress, getOperationProgress } from './operationProgress'

describe('operation progress cancellation', () => {
  it('exposes cancellation only while a cancellable operation is active', () => {
    const cancel = vi.fn()
    const progress = beginOperationProgress('Long task', 10, { onCancel: cancel })
    const id = getOperationProgress()!.id

    expect(getOperationProgress()?.cancellable).toBe(true)
    expect(cancelOperationProgress(id)).toBe(true)
    expect(cancel).toHaveBeenCalledOnce()

    progress.finish()
    expect(cancelOperationProgress(id)).toBe(false)
    expect(getOperationProgress()).toBeNull()
  })
})
