import { adjustDnaEndsForSequenceReplacement, dnaEndsProvenanceAfterSequenceReplacement } from '../../domain/dnaEnds'
import { syncTranslatedFeaturesNotes } from '../../domain/featureQualifiers'
import { mergeRichClipboardAnnotations } from '../../domain/richClipboard'
import {
  clearSequenceEditOperation,
  netSequenceReplacement,
  recordSequenceEditInHistory,
  sequenceEditOperationMeta,
  upsertSequenceEditOperation,
} from '../../domain/snapgeneHistoryExport'
import { applySequenceReplacementAnnotations } from '../../domain/sequence'
import type { RichClipboardFragment } from '../../domain/richClipboard'
import type { SequenceRecord } from '../../domain/types'

export type SequenceEditReplacement = {
  start: number
  end: number
  insertedLength: number
}

export type SequenceEditTransitionInput = {
  nextSequence: string
  replacement: SequenceEditReplacement
  richFragment?: RichClipboardFragment | null
}

/**
 * Apply the deterministic document-side half of a sequence edit.
 * Profiling, history-stack capture, and selection movement remain presentation ports.
 */
export function applySequenceEditTransition(
  current: SequenceRecord,
  input: SequenceEditTransitionInput,
): SequenceRecord {
  const { nextSequence, replacement, richFragment } = input
  const annotations = applySequenceReplacementAnnotations(
    current,
    replacement.start,
    replacement.end,
    replacement.insertedLength,
  )
  const merged = richFragment
    ? mergeRichClipboardAnnotations(
        { ...current, features: annotations.features, primers: annotations.primers },
        richFragment,
        replacement.start,
      )
    : annotations
  const edited: SequenceRecord = {
    ...current,
    sequence: nextSequence,
    features: syncTranslatedFeaturesNotes(merged.features, nextSequence, current.topology),
    primers: merged.primers,
    ...(current.dnaEnds || current.topology === 'linear'
      ? {
          dnaEnds: adjustDnaEndsForSequenceReplacement(
            current.dnaEnds,
            replacement.start,
            replacement.end,
            replacement.insertedLength,
            current.sequence.length,
          ),
        }
      : {}),
  }
  if (edited.dnaEnds) {
    edited.dnaEndsProvenance = dnaEndsProvenanceAfterSequenceReplacement(
      current,
      replacement.start,
      replacement.end,
      replacement.insertedLength,
      edited.dnaEnds,
    )
  }

  const wasEditSession = Boolean(current.history?.editSession)
  const history = recordSequenceEditInHistory(current.history, current, edited, replacement)
  const withHistory = { ...edited, history }
  if (wasEditSession && !history.editSession) return clearSequenceEditOperation(withHistory)

  const snapshotSequence = history.editSession ? history.children[0]?.sequence : undefined
  const net = typeof snapshotSequence === 'string'
    ? netSequenceReplacement(snapshotSequence, edited.sequence)
    : replacement
  const meta = sequenceEditOperationMeta(net)
  return upsertSequenceEditOperation(withHistory, meta.type, meta.summary)
}
