import { createContext, useContext } from 'react'
import { alignPendingTraces } from '../../domain/traceFileWorkflow'

export const TraceAlignmentContext = createContext(alignPendingTraces)
export const useTraceAlignment = () => useContext(TraceAlignmentContext)
