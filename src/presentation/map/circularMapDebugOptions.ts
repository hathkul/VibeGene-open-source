import { parseCircularRouterAlgorithm, type CircularRouterAlgorithm } from '../../domain/circularLaneRouter'

export type CircularMapDebugOptions = {
  useWasmRouter: boolean
  useWasmRouterRender: boolean
  routerBenchmarkEnabled: boolean
  routerProfileEnabled: boolean
  routerDebugEnabled: boolean
  routerPackedDebugEnabled: boolean
  circularRouterAlgorithm: CircularRouterAlgorithm
  circularRouterCompareEnabled: boolean
  ellipticOvoidK: number
  softRingFloorEnabled: boolean
}

/** Parse opt-in map diagnostics without coupling the renderer to window globals. */
export function parseCircularMapDebugOptions(search: string): CircularMapDebugOptions {
  const params = new URLSearchParams(search)
  const parseFlag = (name: string) => params.get(name) === '1'
  const rawOvoidK = params.get('ovoidK')
  const parsedOvoidK = rawOvoidK === null || rawOvoidK === '' ? 0 : Number(rawOvoidK)

  return {
    useWasmRouter: parseFlag('wasmRouter'),
    useWasmRouterRender: parseFlag('wasmRouterRender'),
    routerBenchmarkEnabled: parseFlag('routerBenchmark'),
    routerProfileEnabled: parseFlag('routerProfile'),
    routerDebugEnabled: parseFlag('routerDebug'),
    routerPackedDebugEnabled: parseFlag('routerPackedDebug'),
    circularRouterAlgorithm: parseCircularRouterAlgorithm(params.get('circularRouter')),
    circularRouterCompareEnabled: parseFlag('circularRouterCompare'),
    ellipticOvoidK: Number.isFinite(parsedOvoidK) ? Math.max(-0.85, Math.min(0.85, parsedOvoidK)) : 0,
    softRingFloorEnabled: params.get('softRingFloor') !== '0' && params.get('softRingFloor') !== 'false',
  }
}
