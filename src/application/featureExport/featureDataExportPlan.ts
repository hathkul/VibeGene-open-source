import { exportFeatureDataTsv, type FeatureExportField } from '../../domain/featureExport'
import { featureDisplayName } from '../../domain/genbankFeatureName'
import type { SequenceFeature } from '../../domain/types'
import type { TraceFileRecord } from '../../domain/traceTypes'

export function resolveFeatureDataExportLength(
  consensusLength: number,
  featureTabSelectionMemberId: string | null,
  traceFiles: readonly TraceFileRecord[],
): number {
  if (!featureTabSelectionMemberId) return consensusLength
  return traceFiles.find((trace) => trace.id === featureTabSelectionMemberId)?.sequence.length ?? consensusLength
}

export type FeatureDataExportPlan =
  | { kind: 'close-only' }
  | {
      kind: 'export'
      fileName: string
      contents: string
      mimeType: 'text/plain'
      status: string
    }

export function planFeatureDataExport(
  recordName: string,
  features: readonly SequenceFeature[],
  fields: readonly FeatureExportField[],
  exportLength: number,
): FeatureDataExportPlan {
  if (!features.length || !fields.length) return { kind: 'close-only' }
  const contents = exportFeatureDataTsv([...features], exportLength, [...fields])
  const baseName = recordName.replace(/\.dna$/i, '')
  const status = features.length === 1
    ? `Exported data for ${featureDisplayName(features[0]!)}.`
    : `Exported data for ${features.length} features.`
  return {
    kind: 'export',
    fileName: `Features from ${baseName}.txt`,
    contents,
    mimeType: 'text/plain',
    status,
  }
}

export type FeatureDataExportPorts = {
  download: (fileName: string, contents: string, mimeType: string) => void
  setStatus: (status: string) => void
  closeExportDialog: () => void
}

export function executeFeatureDataExportConfirm(
  plan: FeatureDataExportPlan,
  ports: FeatureDataExportPorts,
): void {
  if (plan.kind === 'close-only') {
    ports.closeExportDialog()
    return
  }
  ports.download(plan.fileName, plan.contents, plan.mimeType)
  ports.closeExportDialog()
  ports.setStatus(plan.status)
}
