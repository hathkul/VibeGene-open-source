export type OperationProgress = {
  id: number
  label: string
  completed: number
  total: number | null
  detail?: string
  cancellable?: boolean
}

type Listener = () => void

const active = new Map<number, OperationProgress>()
const cancelCallbacks = new Map<number, () => void>()
const listeners = new Set<Listener>()
let nextId = 0
let snapshot: OperationProgress | null = null

function publish() {
  snapshot = [...active.values()].at(-1) ?? null
  listeners.forEach((listener) => listener())
}

export function getOperationProgress(): OperationProgress | null {
  return snapshot
}

export function subscribeOperationProgress(listener: Listener): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function cancelOperationProgress(id: number): boolean {
  const cancel = cancelCallbacks.get(id)
  if (!cancel) return false
  cancel()
  return true
}

export function beginOperationProgress(
  label: string,
  total: number | null = null,
  options?: { onCancel?: () => void },
) {
  const id = ++nextId
  active.set(id, { id, label, completed: 0, total, cancellable: Boolean(options?.onCancel) })
  if (options?.onCancel) cancelCallbacks.set(id, options.onCancel)
  publish()
  let finished = false
  return {
    update(completed: number, nextTotal = total, detail?: string) {
      if (finished) return
      const previous = active.get(id)
      if (!previous) return
      active.set(id, {
        ...previous,
        completed: Math.max(0, completed),
        total: nextTotal,
        detail,
      })
      publish()
    },
    finish() {
      if (finished) return
      finished = true
      active.delete(id)
      cancelCallbacks.delete(id)
      publish()
    },
  }
}
