import { useCallback, useState } from 'react'
import type { GibsonAssemblyMethod } from '../../domain/gibsonAssembly'
import type { GatewayCloningMethod } from '../../domain/gatewayBpCloning'
import type { CloningAssemblyMode } from '../../domain/restrictionCloning'
import type { SequenceRecord } from '../../domain/types'
import type { TaGcCloningMethod } from '../../domain/taGcCloning'
import type { MassRestrictionBatchResult } from '../../cloning/MassRestrictionCloningDialogs'

export type BlockedBatchOpen = {
  products: SequenceRecord[]
  openedCount: number
}

/**
 * Lists the retained dialog keys of one family (e.g. 'gibson' or 'gibson:'). A
 * key belongs to the family only when it equals the family name or starts with
 * the family name followed by ':', so a key like 'pcr-multiplex' is not swept
 * up by the 'pcr' family. Used when a failed lazy chunk load must drop that
 * family's retained shells so reopening re-mounts the lazy boundary instead of
 * leaving a crashed shell behind.
 */
export function retainedKeysForFamily(retained: ReadonlySet<string>, familyPrefix: string): string[] {
  const family = familyPrefix.endsWith(':') ? familyPrefix.slice(0, -1) : familyPrefix
  return [...retained].filter((key) => key === family || key.startsWith(`${family}:`))
}

/**
 * Close/reset and lazy-load-failure callbacks for the cloning, batch, and PCR
 * dialogs. Owned here so dialog hosts and App only forward the bundle.
 */
export type CloningDialogLifecycle = {
  cancelRestrictionCloning: (key: string) => void
  cancelGibsonAssembly: () => void
  cancelTaGcCloning: () => void
  cancelGatewayCloning: () => void
  closeMassRestriction: () => void
  discardBlockedBatch: () => void
  reportLazyLoadFailure: (message: string) => void
  onRestrictionCloningLoadError: () => void
  onGibsonAssemblyLoadError: () => void
  onTaGcCloningLoadError: () => void
  onGatewayCloningLoadError: () => void
  onMassRestrictionLoadError: () => void
  onBlockedBatchLoadError: () => void
  onPcrLoadError: () => void
}

/** Owns the retained-dialog lifecycle shared by cloning, mutagenesis, and PCR workspaces. */
export function useCloningWorkspaceController(ports: { reportLazyLoadFailure: (message: string) => void }) {
  const [restrictionCloningOpen, setRestrictionCloningOpen] = useState(false)
  const [restrictionCloningMode, setRestrictionCloningMode] = useState<CloningAssemblyMode>('insert')
  const [massRestrictionResult, setMassRestrictionResult] = useState<MassRestrictionBatchResult | null>(null)
  const [blockedBatchOpen, setBlockedBatchOpen] = useState<BlockedBatchOpen | null>(null)
  const [gibsonAssemblyOpen, setGibsonAssemblyOpen] = useState(false)
  const [gibsonAssemblyMethod, setGibsonAssemblyMethod] = useState<GibsonAssemblyMethod>('nebuilder-hifi')
  const [taGcCloningOpen, setTaGcCloningOpen] = useState(false)
  const [taGcCloningMethod, setTaGcCloningMethod] = useState<TaGcCloningMethod>('ta')
  const [gatewayCloningOpen, setGatewayCloningOpen] = useState(false)
  const [gatewayCloningMethod, setGatewayCloningMethod] = useState<GatewayCloningMethod>('bp')
  const [mutagenesisOpen, setMutagenesisOpen] = useState(false)
  const [pcrOpen, setPcrOpen] = useState(false)
  const [pcrInvocation, setPcrInvocation] = useState(0)
  const [retainedCloningDialogs, setRetainedCloningDialogs] = useState<Set<string>>(() => new Set())

  const retainCloningDialog = useCallback((key: string) => {
    setRetainedCloningDialogs((current) => {
      if (current.has(key)) return current
      const next = new Set(current)
      next.add(key)
      return next
    })
  }, [])

  const discardCloningDialog = useCallback((key: string) => {
    setRetainedCloningDialogs((current) => {
      if (!current.has(key)) return current
      const next = new Set(current)
      next.delete(key)
      return next
    })
  }, [])

  const discardCloningDialogFamily = useCallback((family: string) => {
    setRetainedCloningDialogs((current) => {
      const keys = retainedKeysForFamily(current, family)
      if (!keys.length) return current
      const next = new Set(current)
      for (const key of keys) next.delete(key)
      return next
    })
  }, [])

  const cloningDialogLifecycle: CloningDialogLifecycle = {
    cancelRestrictionCloning: (key) => {
      setRestrictionCloningOpen(false)
      discardCloningDialog(key)
    },
    cancelGibsonAssembly: () => setGibsonAssemblyOpen(false),
    cancelTaGcCloning: () => setTaGcCloningOpen(false),
    cancelGatewayCloning: () => setGatewayCloningOpen(false),
    closeMassRestriction: () => setMassRestrictionResult(null),
    discardBlockedBatch: () => setBlockedBatchOpen(null),
    reportLazyLoadFailure: ports.reportLazyLoadFailure,
    // On a failed chunk load, drop the family's retained shells so reopening
    // re-mounts the lazy boundary and re-reports the failure (React.lazy
    // caches the rejection), then surface a status message.
    onRestrictionCloningLoadError: () => {
      setRestrictionCloningOpen(false)
      discardCloningDialogFamily('restriction:')
      ports.reportLazyLoadFailure('Could not load the restriction cloning dialog.')
    },
    onGibsonAssemblyLoadError: () => {
      setGibsonAssemblyOpen(false)
      discardCloningDialogFamily('gibson:')
      ports.reportLazyLoadFailure('Could not load the assembly dialog.')
    },
    onTaGcCloningLoadError: () => {
      setTaGcCloningOpen(false)
      discardCloningDialogFamily('ta-gc:')
      ports.reportLazyLoadFailure('Could not load the TA/GC cloning dialog.')
    },
    onGatewayCloningLoadError: () => {
      setGatewayCloningOpen(false)
      discardCloningDialogFamily('gateway:')
      ports.reportLazyLoadFailure('Could not load the Gateway cloning dialog.')
    },
    onMassRestrictionLoadError: () => {
      setMassRestrictionResult(null)
      ports.reportLazyLoadFailure('Could not load the batch results dialog.')
    },
    onBlockedBatchLoadError: () => {
      setBlockedBatchOpen(null)
      ports.reportLazyLoadFailure('Could not load the batch results dialog.')
    },
    onPcrLoadError: () => {
      setPcrOpen(false)
      discardCloningDialogFamily('pcr')
      ports.reportLazyLoadFailure('Could not load the PCR dialog.')
    },
  }

  const openRestrictionCloning = useCallback((mode: CloningAssemblyMode) => {
    retainCloningDialog(`restriction:${mode}`)
    setRestrictionCloningMode(mode)
    setRestrictionCloningOpen(true)
  }, [retainCloningDialog])

  const openGibsonAssembly = useCallback((method: GibsonAssemblyMethod) => {
    retainCloningDialog(`gibson:${method}`)
    setGibsonAssemblyMethod(method)
    setGibsonAssemblyOpen(true)
  }, [retainCloningDialog])

  const openTaGcCloning = useCallback((method: TaGcCloningMethod) => {
    retainCloningDialog(`ta-gc:${method}`)
    setTaGcCloningMethod(method)
    setTaGcCloningOpen(true)
  }, [retainCloningDialog])

  const openGatewayCloning = useCallback((method: GatewayCloningMethod) => {
    retainCloningDialog(`gateway:${method}`)
    setGatewayCloningMethod(method)
    setGatewayCloningOpen(true)
  }, [retainCloningDialog])

  const openRetainedPcr = useCallback(() => {
    retainCloningDialog('pcr')
    setPcrInvocation((current) => current + 1)
    setPcrOpen(true)
  }, [retainCloningDialog])

  const openRetainedMutagenesis = useCallback(() => {
    retainCloningDialog('mutagenesis')
    setMutagenesisOpen(true)
  }, [retainCloningDialog])

  return {
    restrictionCloningOpen,
    setRestrictionCloningOpen,
    restrictionCloningMode,
    massRestrictionResult,
    setMassRestrictionResult,
    blockedBatchOpen,
    setBlockedBatchOpen,
    gibsonAssemblyOpen,
    setGibsonAssemblyOpen,
    gibsonAssemblyMethod,
    taGcCloningOpen,
    setTaGcCloningOpen,
    taGcCloningMethod,
    gatewayCloningOpen,
    setGatewayCloningOpen,
    gatewayCloningMethod,
    mutagenesisOpen,
    setMutagenesisOpen,
    pcrOpen,
    setPcrOpen,
    pcrInvocation,
    retainedCloningDialogs,
    discardCloningDialog,
    cloningDialogLifecycle,
    openRestrictionCloning,
    openGibsonAssembly,
    openTaGcCloning,
    openGatewayCloning,
    openRetainedPcr,
    openRetainedMutagenesis,
  }
}
