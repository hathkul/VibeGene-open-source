import type { DnaComparisonWorkerRequest, DnaComparisonWorkerResponse } from '../../domain/dnaComparisonProtocol'
import type { ProteinAlignmentWorkerRequest, ProteinAlignmentWorkerResponse } from '../../domain/proteinAlignmentProtocol'
import type { RestrictionScanWorkerRequest, RestrictionScanWorkerResponse } from '../../domain/restrictionScanProtocol'

export type WorkerStream<Request, Response> = (
  request: Request,
  onMessage: (response: Response) => void,
  onError: (error: Error) => void,
) => () => void

export type DnaComparisonStream = WorkerStream<DnaComparisonWorkerRequest, DnaComparisonWorkerResponse>
export type ProteinComparisonStream = WorkerStream<ProteinAlignmentWorkerRequest, ProteinAlignmentWorkerResponse>
export type RestrictionScanStream = WorkerStream<RestrictionScanWorkerRequest, RestrictionScanWorkerResponse>
