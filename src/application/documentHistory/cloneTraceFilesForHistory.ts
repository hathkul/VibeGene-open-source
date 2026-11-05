import type { TraceFileRecord } from '../../domain/traceTypes'

/** Deep-clones trace payloads stored on undo/redo snapshots. */
export function cloneTraceFilesForHistory(traces: TraceFileRecord[]): TraceFileRecord[] {
  return traces.map((trace) => ({
    ...trace,
    chromatogram: {
      ...trace.chromatogram,
      baseCalls: trace.chromatogram.baseCalls.slice(),
      ...(trace.chromatogram.qualNums ? { qualNums: trace.chromatogram.qualNums.slice() } : {}),
    },
    alignment: trace.alignment
      ? { ...trace.alignment, columns: trace.alignment.columns.slice() }
      : null,
    features: trace.features?.map((feature) => ({
      ...feature,
      locations: feature.locations.map((location) => ({ ...location })),
    })),
    reads: trace.reads?.map((read) => ({
      ...read,
      chromatogram: {
        ...read.chromatogram,
        baseCalls: read.chromatogram.baseCalls.slice(),
        ...(read.chromatogram.qualNums ? { qualNums: read.chromatogram.qualNums.slice() } : {}),
      },
      alignment: read.alignment
        ? { ...read.alignment, columns: read.alignment.columns.slice() }
        : null,
    })),
  }))
}
