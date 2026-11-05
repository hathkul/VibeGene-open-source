import type { SequenceRecord } from '../../../domain/types'
import type { DatabaseAlignmentPick, DatabaseLibraryMemberPick } from '../../ports/hybridWindows'

/** Neutral construct-pick context mirrored from hybrid window payloads. */
export type DatabaseManagerConstructPickContext = {
  multiple?: boolean
  topology?: SequenceRecord['topology']
  confirmLabel?: string
  cancelLabel?: string
  title?: string
  molecules?: Array<'dna' | 'protein'>
}

export type DatabaseManagerLibraryMemberPickContext = DatabaseLibraryMemberPick

export type DatabaseManagerAlignmentPickContext = DatabaseAlignmentPick

export type DatabaseManagerPickAvailability = {
  constructPick: DatabaseManagerConstructPickContext | null
  libraryMemberPick: DatabaseManagerLibraryMemberPickContext | null
  onAddConstructHandlers: boolean
  onAddLibraryMembersHandler: boolean
  alignmentPick: DatabaseManagerAlignmentPickContext | null
  onAddToAlignmentHandler: boolean
}
