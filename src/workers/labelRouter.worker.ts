import type { RouterInput, RouterOutput, RouterParams, RouterWorkerRequest, RouterWorkerResponse } from '../domain/wasmRouterProtocol'

type WasmRouteResult = {
  placed_count: number
  dropped_count: number
  violations_count: number
  placed: () => number[]
  anchor_x: () => number[]
  anchor_y: () => number[]
  elbow_x: () => number[]
  elbow_y: () => number[]
  end_x: () => number[]
  end_y: () => number[]
  box_l: () => number[]
  box_t: () => number[]
  box_r: () => number[]
  box_b: () => number[]
  score: () => number[]
}

type WasmRouteParamsCtor = new (
  seqLen: number,
  mapSize: number,
  center: number,
  radius: number,
  rulerContactOuter: number,
  rulerContactInner: number,
  featureProtectedRadius: number,
  maxLabels: number,
) => unknown

type WasmModule = {
  RouteParams: WasmRouteParamsCtor
  route_callouts: (
    params: unknown,
    posBp: Uint32Array,
    labelWPx: Float32Array,
    labelHPx: Float32Array,
    kind: Uint8Array,
    sideHint: Int8Array,
    priority: Float32Array,
    groupId: Uint32Array,
    flags: Uint32Array,
  ) => WasmRouteResult
}

const wasmModule: WasmModule | null = null

function createRouteParams(module: WasmModule, params: RouterParams) {
  return new module.RouteParams(
    params.seqLen,
    params.mapSize,
    params.center,
    params.radius,
    params.rulerContactOuter,
    params.rulerContactInner,
    params.featureProtectedRadius,
    params.maxLabels,
  )
}

function toTypedOutput(result: WasmRouteResult): RouterOutput {
  return {
    placedCount: result.placed_count,
    droppedCount: result.dropped_count,
    violationsCount: result.violations_count,
    placed: Uint8Array.from(result.placed()),
    anchorX: Float32Array.from(result.anchor_x()),
    anchorY: Float32Array.from(result.anchor_y()),
    elbowX: Float32Array.from(result.elbow_x()),
    elbowY: Float32Array.from(result.elbow_y()),
    endX: Float32Array.from(result.end_x()),
    endY: Float32Array.from(result.end_y()),
    boxL: Float32Array.from(result.box_l()),
    boxT: Float32Array.from(result.box_t()),
    boxR: Float32Array.from(result.box_r()),
    boxB: Float32Array.from(result.box_b()),
    score: Float32Array.from(result.score()),
  }
}

function routeFallback(input: RouterInput): RouterOutput {
  const n = input.posBp.length
  const placed = new Uint8Array(n)
  const anchorX = new Float32Array(n)
  const anchorY = new Float32Array(n)
  const elbowX = new Float32Array(n)
  const elbowY = new Float32Array(n)
  const endX = new Float32Array(n)
  const endY = new Float32Array(n)
  const boxL = new Float32Array(n)
  const boxT = new Float32Array(n)
  const boxR = new Float32Array(n)
  const boxB = new Float32Array(n)
  const score = new Float32Array(n)

  const maxLabels = Math.min(Math.max(0, input.params.maxLabels), n)
  const rank = [...Array(n).keys()].sort((a, b) => input.priority[b] - input.priority[a])

  for (let row = 0; row < n; row += 1) {
    const idx = rank[row]
    if (row >= maxLabels) continue
    const angle = (input.posBp[idx] / input.params.seqLen) * Math.PI * 2 - Math.PI / 2
    const ax = input.params.center + Math.cos(angle) * input.params.radius
    const ay = input.params.center + Math.sin(angle) * input.params.radius
    const side = input.sideHint[idx] >= 0 ? 1 : -1
    const ex = ax + side * 28
    const ey = ay
    const tx = side > 0 ? input.params.mapSize - input.labelWPx[idx] - 4 : input.labelWPx[idx] + 4
    const ty = Math.min(input.params.mapSize - 6, 8 + row * (input.labelHPx[idx] + 6))

    const left = side > 0 ? tx : tx - input.labelWPx[idx]
    const right = side > 0 ? tx + input.labelWPx[idx] : tx
    const top = ty - input.labelHPx[idx] * 0.5
    const bottom = ty + input.labelHPx[idx] * 0.5

    placed[idx] = 1
    anchorX[idx] = ax
    anchorY[idx] = ay
    elbowX[idx] = ex
    elbowY[idx] = ey
    endX[idx] = tx
    endY[idx] = ty
    boxL[idx] = left
    boxT[idx] = top
    boxR[idx] = right
    boxB[idx] = bottom
    score[idx] = input.priority[idx]
  }

  return {
    placedCount: Math.min(maxLabels, n),
    droppedCount: Math.max(0, n - maxLabels),
    violationsCount: 0,
    placed,
    anchorX,
    anchorY,
    elbowX,
    elbowY,
    endX,
    endY,
    boxL,
    boxT,
    boxR,
    boxB,
    score,
  }
}

function route(input: RouterInput): RouterOutput {
  if (!wasmModule) return routeFallback(input)
  const params = createRouteParams(wasmModule, input.params)
  const result = wasmModule.route_callouts(
    params,
    input.posBp,
    input.labelWPx,
    input.labelHPx,
    input.kind,
    input.sideHint,
    input.priority,
    input.groupId,
    input.flags,
  )
  return toTypedOutput(result)
}

const workerScope: Worker = self as unknown as Worker

workerScope.addEventListener('message', (event: MessageEvent<RouterWorkerRequest>) => {
  const { id, input } = event.data
  const output = route(input)
  const response: RouterWorkerResponse = { id, output }
  workerScope.postMessage(response)
})

export {}
