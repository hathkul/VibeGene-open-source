import type { RouterInput, RouterOutput } from './wasmRouterProtocol'

export interface LabelRouterClient {
  route(input: RouterInput): Promise<RouterOutput>
  dispose(): void
}

export type CreateLabelRouterClient = () => LabelRouterClient | null
