import { useCallback, useMemo } from 'react'
import {
  gatewayCloningOpenStatus,
  gibsonAssemblyOpenStatus,
  mutagenesisOpenStatus,
  pcrOpenStatus,
  restrictionCloningOpenStatus,
  taGcCloningOpenStatus,
  blockedBatchProductOpenStatus,
} from '../../application/cloning/cloningCompletionPresentation'
import type { GibsonAssemblyMethod } from '../../domain/gibsonAssembly'
import type { GatewayCloningMethod } from '../../domain/gatewayBpCloning'
import type { TaGcCloningMethod } from '../../domain/taGcCloning'
import type { SequenceRecord } from '../../domain/types'
import type { BlockedBatchOpen } from './useCloningWorkspaceController'
import type { MassRestrictionBatchResult } from '../../cloning/MassRestrictionCloningDialogs'

type CloningOpenOptions = {
  batchResult?: MassRestrictionBatchResult
  open?: boolean
  statusMessage?: string
  activate?: boolean
}

export type CloningCompletionControllerSlice = {
  setRestrictionCloningOpen: (open: boolean) => void
  setGibsonAssemblyOpen: (open: boolean) => void
  setTaGcCloningOpen: (open: boolean) => void
  setMutagenesisOpen: (open: boolean) => void
  discardCloningDialog: (key: string) => void
  setMassRestrictionResult: (result: MassRestrictionBatchResult | null) => void
  setBlockedBatchOpen: (value: BlockedBatchOpen | null | ((current: BlockedBatchOpen | null) => BlockedBatchOpen | null)) => void
}

export type CloningCompletionHandlerPorts = {
  openUnsavedRecordsInNewTabs: (records: SequenceRecord[]) => void
  openRecordInNewTab: (
    record: SequenceRecord,
    options?: {
      activate?: boolean
      initiallyUnsaved?: boolean
      onOpenResult?: (opened: boolean) => void
    },
  ) => void
  setStatus: (message: string) => void
}

/** Cloning dialog completion: close retained sessions, open products, status sequencing. */
export function useCloningCompletionHandlers(
  cloning: CloningCompletionControllerSlice,
  ports: CloningCompletionHandlerPorts,
) {
  const applyBatchAndOpen = useCallback((
    products: SequenceRecord[],
    options: CloningOpenOptions | undefined,
  ) => {
    if (options?.batchResult) cloning.setMassRestrictionResult(options.batchResult)
    if (options?.open !== false) ports.openUnsavedRecordsInNewTabs(products)
  }, [cloning, ports])

  const onRestrictionClone = useCallback((
    key: string,
    products: SequenceRecord[],
    options?: CloningOpenOptions,
  ) => {
    cloning.setRestrictionCloningOpen(false)
    cloning.discardCloningDialog(key)
    applyBatchAndOpen(products, options)
    ports.setStatus(options?.statusMessage ?? restrictionCloningOpenStatus(products))
  }, [applyBatchAndOpen, cloning, ports])

  const onGibsonAssemble = useCallback((
    key: string,
    products: SequenceRecord[],
    assembledMethod: GibsonAssemblyMethod,
    options?: CloningOpenOptions,
  ) => {
    cloning.setGibsonAssemblyOpen(false)
    cloning.discardCloningDialog(key)
    applyBatchAndOpen(products, options)
    ports.setStatus(options?.statusMessage ?? gibsonAssemblyOpenStatus(products, assembledMethod))
  }, [applyBatchAndOpen, cloning, ports])

  const onTaGcClone = useCallback((
    key: string,
    products: SequenceRecord[],
    clonedMethod: TaGcCloningMethod,
    options?: CloningOpenOptions,
  ) => {
    cloning.setTaGcCloningOpen(false)
    cloning.discardCloningDialog(key)
    applyBatchAndOpen(products, options)
    ports.setStatus(options?.statusMessage ?? taGcCloningOpenStatus(products, clonedMethod))
  }, [applyBatchAndOpen, cloning, ports])

  const onGatewayClone = useCallback((
    products: SequenceRecord[],
    clonedMethod: GatewayCloningMethod,
    options?: CloningOpenOptions,
  ) => {
    if (options?.batchResult) cloning.setMassRestrictionResult(options.batchResult)
    if (options?.open !== false) {
      if (products.length > 1) ports.openUnsavedRecordsInNewTabs(products)
      else {
        products.forEach((product) => ports.openRecordInNewTab(product, {
          activate: options?.activate !== false,
          initiallyUnsaved: true,
        }))
      }
    }
    ports.setStatus(options?.statusMessage ?? gatewayCloningOpenStatus(products, clonedMethod))
  }, [cloning, ports])

  const onOpenBlockedProduct = useCallback((product: SequenceRecord) => {
    ports.openRecordInNewTab(product, {
      initiallyUnsaved: true,
      onOpenResult: (opened) => {
        if (!opened) return
        ports.setStatus(blockedBatchProductOpenStatus(product.name))
        cloning.setBlockedBatchOpen((current) => {
          if (!current) return null
          const products = current.products.filter((entry) => entry.id !== product.id)
          const openedCount = current.openedCount + 1
          if (!products.length) return null
          return { products, openedCount }
        })
      },
    })
  }, [cloning, ports])

  const onPcr = useCallback((
    products: SequenceRecord[],
    options?: CloningOpenOptions,
  ) => {
    if (options?.batchResult) cloning.setMassRestrictionResult(options.batchResult)
    if (options?.open !== false) ports.openUnsavedRecordsInNewTabs(products)
    if (options?.statusMessage) {
      ports.setStatus(options.statusMessage)
      return
    }
    const status = pcrOpenStatus(products)
    if (status) ports.setStatus(status)
  }, [cloning, ports])

  const onMutagenize = useCallback((product: SequenceRecord) => {
    cloning.setMutagenesisOpen(false)
    cloning.discardCloningDialog('mutagenesis')
    ports.openRecordInNewTab(product, { initiallyUnsaved: true })
    ports.setStatus(mutagenesisOpenStatus(product))
  }, [cloning, ports])

  return useMemo(() => ({
    cloningAssemblyHandlers: {
      onRestrictionClone,
      onGibsonAssemble,
      onTaGcClone,
      onGatewayClone,
      onOpenBlockedProduct,
    },
    cloningWorkflowHandlers: {
      onPcr,
      onMutagenize,
    },
  }), [onGatewayClone, onGibsonAssemble, onMutagenize, onOpenBlockedProduct, onPcr, onRestrictionClone, onTaGcClone])
}
