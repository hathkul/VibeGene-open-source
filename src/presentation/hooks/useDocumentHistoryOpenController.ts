import { useCallback } from 'react'
import {
  planConstructRecordFromHistoryNode,
  planHistoryRestrictionGelOpen,
} from '../../application/documentHistory/historyNodeOpenPlan'
import type { AgaroseGelDialogOpenOverrides } from '../../application/agaroseGel/agaroseGelDialogOpenPlan'
import type { HistoryNode, SequenceRecord } from '../../domain/types'
import type { OpenRecordOptions } from './useDocumentHandoffController'
import { initSnapGeneLzma } from '../../domain/snapgeneLzma'
import { hasCompressedSnapGeneHistoryDocument } from '../../domain/snapgeneHistoryPackets'

export type AgaroseGelWindowOpenOptions = AgaroseGelDialogOpenOverrides

type DocumentHistoryOpenInput = {
  record: SequenceRecord
}

type DocumentHistoryOpenPorts = {
  openRecordInNewTab: (source: SequenceRecord, options?: OpenRecordOptions) => void
  openAgaroseGelWindow: (options?: AgaroseGelWindowOpenOptions) => void
}

/** History-node construct and restriction-gel open commands. */
export function useDocumentHistoryOpenController(
  input: DocumentHistoryOpenInput,
  ports: DocumentHistoryOpenPorts,
) {
  const openHistoryConstruct = useCallback((node: HistoryNode) => {
    const open = () => ports.openRecordInNewTab(planConstructRecordFromHistoryNode(input.record, node))
    const payload = input.record.snapGeneNativeHistory?.nodePackets.find(packet => packet.nodeId === node.id)?.payload
    if (hasCompressedSnapGeneHistoryDocument(payload)) void initSnapGeneLzma().then(open)
    else open()
  }, [input.record, ports])

  const openHistoryRestrictionGel = useCallback((node: HistoryNode, enzymeNames: string[]) => {
    const plan = planHistoryRestrictionGelOpen(
      node,
      enzymeNames,
      input.record.snapGeneNativeHistory,
    )
    if (!plan) return
    ports.openAgaroseGelWindow({
      currentRecord: plan.source,
      initialSamples: plan.initialSamples,
      libraryMemberSources: [],
      currentSourceLabel: plan.source.name,
    })
  }, [input.record.snapGeneNativeHistory, ports])

  return { openHistoryConstruct, openHistoryRestrictionGel }
}
