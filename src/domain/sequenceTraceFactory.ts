import { createId, normalizeDna } from './sequence'
import type { TraceFileRecord } from './traceTypes'

export function emptyChromatogramForSequence(sequence: string) {
  const baseCalls = sequence.split('')
  return {
    aTrace: [] as number[],
    tTrace: [] as number[],
    gTrace: [] as number[],
    cTrace: [] as number[],
    basePos: [] as number[],
    baseCalls,
  }
}

export function traceRecordFromSequence(
  sequence: string,
  fileName: string,
  options?: { fileLastModified?: number; id?: string },
): TraceFileRecord {
  const normalized = normalizeDna(sequence)
  return {
    id: options?.id ?? createId('trace'),
    fileName,
    fileLastModified: options?.fileLastModified,
    sequence: normalized,
    chromatogram: emptyChromatogramForSequence(normalized),
    enabled: true,
    expanded: false,
    showAnnotations: false,
    alignment: null,
    parseError: normalized.length ? undefined : 'No sequence found',
  }
}
