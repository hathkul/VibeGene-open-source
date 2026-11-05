import type { SequenceRecord } from './domain/types'
import type { PrimerHybridizationParams } from './domain/primerHybridization'

export type PcrWorkspaceSelectionRange = {
  start: number
  end: number
}

export type PcrWorkspaceRenderArgs = {
  primerHybridization?: PrimerHybridizationParams
  record: SequenceRecord | null
  title?: string
  selectedRange: PcrWorkspaceSelectionRange | null
  selectedPrimerIds: string[]
  onRangeSelect?: (range: PcrWorkspaceSelectionRange) => void
  /** Click a primer callout/frame on map or sequence to fill Primer 1 / Primer 2. */
  onPrimerSelect?: (primerId: string) => void
}
