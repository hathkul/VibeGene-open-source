import { useMemo, type ComponentProps } from 'react'
import type { PrimerFrameDisplay } from '../../domain/primerSequenceLayout'
import type { SequenceRecord } from '../../domain/types'
import { mergePrimerFrameDisplayOverrides, usePrimer3PrimerFrameDisplays } from '../primers/usePrimer3PrimerFrameDisplays'
import { SequenceRows } from './SequenceRows'

export function PrimerRefinedSequenceRows({
  refinementRecord,
  refinementSequence,
  eligiblePrimerFrameDisplays,
  refine = true,
  ...rowProps
}: ComponentProps<typeof SequenceRows> & {
  refinementRecord?: SequenceRecord
  refinementSequence?: string
  eligiblePrimerFrameDisplays?: PrimerFrameDisplay[]
  refine?: boolean
}) {
  const calculationRecord = useMemo(() => refinementRecord ?? (refinementSequence === undefined
    ? rowProps.record
    : { ...rowProps.record, sequence: refinementSequence }), [refinementRecord, refinementSequence, rowProps.record])
  const refinedDisplays = usePrimer3PrimerFrameDisplays(
    calculationRecord,
    eligiblePrimerFrameDisplays ?? rowProps.primerFrameDisplays,
    refine,
  )
  const primerFrameDisplays = eligiblePrimerFrameDisplays
    ? mergePrimerFrameDisplayOverrides(rowProps.primerFrameDisplays, refinedDisplays)
    : refinedDisplays
  return <SequenceRows {...rowProps} primerFrameDisplays={primerFrameDisplays} />
}
