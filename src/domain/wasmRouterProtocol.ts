export type RouterKind = 0 | 1 | 2
export type RouterSideHint = -1 | 0 | 1

export const ROUTER_KIND = {
  enzyme: 0 as RouterKind,
  primer: 1 as RouterKind,
  feature: 2 as RouterKind,
} as const

export type RouterParams = {
  seqLen: number
  mapSize: number
  center: number
  radius: number
  rulerContactOuter: number
  rulerContactInner: number
  featureProtectedRadius: number
  maxLabels: number
}

export type RouterInput = {
  params: RouterParams
  posBp: Uint32Array
  labelWPx: Float32Array
  labelHPx: Float32Array
  kind: Uint8Array
  sideHint: Int8Array
  priority: Float32Array
  groupId: Uint32Array
  flags: Uint32Array
}

export type RouterOutput = {
  placedCount: number
  droppedCount: number
  violationsCount: number
  placed: Uint8Array
  anchorX: Float32Array
  anchorY: Float32Array
  elbowX: Float32Array
  elbowY: Float32Array
  endX: Float32Array
  endY: Float32Array
  boxL: Float32Array
  boxT: Float32Array
  boxR: Float32Array
  boxB: Float32Array
  score: Float32Array
}

export type RouterWorkerRequest = {
  id: number
  input: RouterInput
}

export type RouterWorkerResponse = {
  id: number
  output: RouterOutput
}
