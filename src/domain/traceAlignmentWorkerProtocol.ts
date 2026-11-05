import type { TraceTemplateAlignment } from './traceTypes'

export type TraceAlignmentWorkerRequest = {
  index: number
  traceSequence: string
  templateSequence: string
  topology?: 'linear' | 'circular'
}

export type TraceAlignmentWorkerResponse = {
  index: number
  alignment: TraceTemplateAlignment | null
  error?: string
}
