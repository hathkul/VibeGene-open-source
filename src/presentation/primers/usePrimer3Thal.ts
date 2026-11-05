import { useEffect, useState } from 'react'
import type { Primer3ThalInput } from '../../domain/primer3/thalProtocol'
import { runPrimer3Thal } from '../../primer3/thalClient'
import { displayPrimer3ThalResult, type Primer3ThalDisplayResult } from './primer3ThalForBinding'

type State =
  | { key: string; status: 'loading' }
  | { key: string; status: 'complete'; result: Primer3ThalDisplayResult }
  | { key: string; status: 'error'; reason: string }

export type Primer3ThalState =
  | { status: 'idle' }
  | { status: 'loading' }
  | Primer3ThalDisplayResult

export function usePrimer3Thal(input: Primer3ThalInput | null, unavailableReason?: string): Primer3ThalState {
  const key = input ? JSON.stringify(input) : ''
  const [state, setState] = useState<State | null>(null)

  useEffect(() => {
    if (unavailableReason || !input) return
    if (typeof Worker === 'undefined') return
    const controller = new AbortController()
    void runPrimer3Thal(input, { signal: controller.signal }).then((result) => {
      setState({ key, status: 'complete', result: displayPrimer3ThalResult(result) })
    }).catch((error: unknown) => {
      if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return
      setState({ key, status: 'error', reason: error instanceof Error ? error.message : String(error) })
    })
    return () => controller.abort()
    // `key` captures all primitive calculation inputs and prevents a fresh worker per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, Boolean(input), unavailableReason])

  if (unavailableReason) return { status: 'unavailable', reason: unavailableReason }
  if (!input) return { status: 'idle' }
  if (typeof Worker === 'undefined') return { status: 'unavailable', reason: 'Thermodynamic worker is unavailable in this environment' }
  if (!state || state.key !== key || state.status === 'loading') return { status: 'loading' }
  if (state.status === 'error') return { status: 'unavailable', reason: state.reason }
  return state.result
}
