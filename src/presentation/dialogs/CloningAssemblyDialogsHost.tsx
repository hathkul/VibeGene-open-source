import { useMemo, type ComponentProps, type ReactNode } from 'react'
import type { SequenceRecord } from '../../domain/types'
import type { TraceFileRecord } from '../../domain/traceTypes'
import type { RestrictionSite } from '../../domain/types'
import type { PrimerHybridizationParams } from '../../domain/primerHybridization'
import type { CloningWorkspaceEnzymeSet } from '../../cloningWorkspaceTypes'
import type { CloningAssemblyMode } from '../../domain/restrictionCloning'
import type { GibsonAssemblyMethod } from '../../domain/gibsonAssembly'
import type { TaGcCloningMethod } from '../../domain/taGcCloning'
import type { GatewayCloningMethod } from '../../domain/gatewayBpCloning'
import type { SelectionRange } from '../sequence'
import type { AgaroseGelDnaSource } from '../../domain/agaroseGelLibrary'
import type { BlockedBatchOpen, CloningDialogLifecycle } from '../hooks/useCloningWorkspaceController'
import type { MassRestrictionBatchResult } from '../../cloning/MassRestrictionCloningDialogs'
import type { RestrictionCloningDialog } from '../../RestrictionCloningDialog'
import type { GibsonAssemblyDialog } from '../../GibsonAssemblyDialog'
import type { TaGcCloningDialog } from '../../TaGcCloningDialog'
import type { GatewayCloningDialog } from '../../GatewayCloningDialog'
import { lazyDialog } from '../../ui/lazyDialog'
import type { CloningWorkspaceRenderArgs } from '../../cloningWorkspaceTypes'

// Both mass-restriction dialogs live in one chunk; share a single import
// promise between their lazy wrappers so opening them together issues one
// module request (and so test doubles resolve consistently for both).
let massRestrictionDialogsPromise: Promise<typeof import('../../cloning/MassRestrictionCloningDialogs')> | null = null
const loadMassRestrictionDialogs = () =>
  (massRestrictionDialogsPromise ??= import('../../cloning/MassRestrictionCloningDialogs'))
const LazyMassRestrictionResultsDialog = lazyDialog(
  loadMassRestrictionDialogs,
  (module) => module.MassRestrictionResultsDialog,
)
const LazyBlockedBatchOpenDialog = lazyDialog(
  loadMassRestrictionDialogs,
  (module) => module.BlockedBatchOpenDialog,
)
const LazyAgaroseGelDialog = lazyDialog(
  () => import('../../AgaroseGelDialog'),
  (module) => module.AgaroseGelDialog,
)

const LazyRestrictionCloningDialog = lazyDialog(
  () => import('../../RestrictionCloningDialog'),
  (module) => module.RestrictionCloningDialog,
)
const LazyGibsonAssemblyDialog = lazyDialog(
  () => import('../../GibsonAssemblyDialog'),
  (module) => module.GibsonAssemblyDialog,
)
const LazyTaGcCloningDialog = lazyDialog(
  () => import('../../TaGcCloningDialog'),
  (module) => module.TaGcCloningDialog,
)
const LazyGatewayCloningDialog = lazyDialog(
  () => import('../../GatewayCloningDialog'),
  (module) => module.GatewayCloningDialog,
)

function RetainedDialogHost({ active, children }: { active: boolean; children: ReactNode }) {
  return <div className="retained-dialog-host" hidden={!active} aria-hidden={active ? undefined : true}>{children}</div>
}

export type CloningAssemblyDialogsHostProps = {
  record: SequenceRecord
  traceFiles: TraceFileRecord[]
  tabId: string
  selectedRange: SelectionRange | null
  retainedCloningDialogs: ReadonlySet<string>
  renderWorkspace: (args: CloningWorkspaceRenderArgs) => ReactNode
  primerHybridization: PrimerHybridizationParams
  lifecycle: CloningDialogLifecycle
  restrictionCloningOpen: boolean
  restrictionCloningMode: CloningAssemblyMode
  initialEnzymeSet: CloningWorkspaceEnzymeSet
  initialVectorSites: RestrictionSite[]
  onRestrictionClone: (key: string, ...args: Parameters<ComponentProps<typeof RestrictionCloningDialog>['onClone']>) => void
  gibsonAssemblyOpen: boolean
  gibsonAssemblyMethod: GibsonAssemblyMethod
  onGibsonAssemble: (key: string, ...args: Parameters<ComponentProps<typeof GibsonAssemblyDialog>['onAssemble']>) => void
  taGcCloningOpen: boolean
  taGcCloningMethod: TaGcCloningMethod
  onTaGcClone: (key: string, ...args: Parameters<ComponentProps<typeof TaGcCloningDialog>['onClone']>) => void
  gatewayCloningOpen: boolean
  gatewayCloningMethod: GatewayCloningMethod
  onGatewayClone: ComponentProps<typeof GatewayCloningDialog>['onClone']
  massRestrictionResult: MassRestrictionBatchResult | null
  blockedBatchOpen: BlockedBatchOpen | null
  onOpenBlockedProduct: (product: SequenceRecord) => void
  agaroseGelOpen: boolean
  agaroseGelSnapshot: {
    currentRecord: SequenceRecord
    currentTabId: string
    openedAt: number
    initialSamples: AgaroseGelDnaSource[]
    libraryMemberSources: AgaroseGelDnaSource[]
    currentSourceLabel: string
  } | null
  onCloseAgaroseGel: () => void
}

/** Renders retained cloning, batch-result, blocked-open, and gel dialogs. */
export function CloningAssemblyDialogsHost(props: CloningAssemblyDialogsHostProps) {
  const libraryRecord = useMemo(() => ({ ...props.record, traceFiles: props.traceFiles }), [props.record, props.traceFiles])
  const renderWorkspace = (args: CloningWorkspaceRenderArgs) => props.renderWorkspace({
    ...args,
    primerHybridization: args.primerHybridization ?? props.primerHybridization,
  })
  const lifecycle = props.lifecycle
  return (
    <>
      {Array.from(props.retainedCloningDialogs).filter((key) => key.startsWith('restriction:')).map((key) => {
        const mode = key.slice('restriction:'.length) as CloningAssemblyMode
        const active = props.restrictionCloningOpen && props.restrictionCloningMode === mode
        return <RetainedDialogHost key={key} active={active}><LazyRestrictionCloningDialog active={active} currentRecord={libraryRecord} currentTabId={props.tabId} initialMode={mode} initialEnzymeSet={props.initialEnzymeSet} initialVectorSites={props.initialVectorSites} onCancel={() => lifecycle.cancelRestrictionCloning(key)} onClone={(...args) => props.onRestrictionClone(key, ...args)} renderWorkspace={renderWorkspace} onLoadError={lifecycle.onRestrictionCloningLoadError} /></RetainedDialogHost>
      })}
      {Array.from(props.retainedCloningDialogs).filter((key) => key.startsWith('gibson:')).map((key) => {
        const method = key.slice('gibson:'.length) as GibsonAssemblyMethod
        const active = props.gibsonAssemblyOpen && props.gibsonAssemblyMethod === method
        return <RetainedDialogHost key={key} active={active}><LazyGibsonAssemblyDialog active={active} currentRecord={libraryRecord} currentTabId={props.tabId} assemblyMethod={method} primerHybridization={props.primerHybridization} onCancel={lifecycle.cancelGibsonAssembly} onAssemble={(...args) => props.onGibsonAssemble(key, ...args)} renderWorkspace={renderWorkspace} onLoadError={lifecycle.onGibsonAssemblyLoadError} /></RetainedDialogHost>
      })}
      {Array.from(props.retainedCloningDialogs).filter((key) => key.startsWith('ta-gc:')).map((key) => {
        const method = key.slice('ta-gc:'.length) as TaGcCloningMethod
        const active = props.taGcCloningOpen && props.taGcCloningMethod === method
        return <RetainedDialogHost key={key} active={active}><LazyTaGcCloningDialog active={active} currentRecord={libraryRecord} currentTabId={props.tabId} cloningMethod={method} primerHybridization={props.primerHybridization} onCancel={lifecycle.cancelTaGcCloning} onClone={(...args) => props.onTaGcClone(key, ...args)} renderWorkspace={renderWorkspace} onLoadError={lifecycle.onTaGcCloningLoadError} /></RetainedDialogHost>
      })}
      {Array.from(props.retainedCloningDialogs).filter((key) => key.startsWith('gateway:')).map((key) => {
        const method = key.slice('gateway:'.length) as GatewayCloningMethod
        const active = props.gatewayCloningOpen && props.gatewayCloningMethod === method
        return <RetainedDialogHost key={key} active={active}><LazyGatewayCloningDialog active={active} currentRecord={libraryRecord} currentTabId={props.tabId} cloningMethod={method} initialSelectedRange={props.selectedRange && props.selectedRange.start !== props.selectedRange.end ? props.selectedRange : null} primerHybridization={props.primerHybridization} onCancel={lifecycle.cancelGatewayCloning} onClone={props.onGatewayClone} renderWorkspace={renderWorkspace} onLoadError={lifecycle.onGatewayCloningLoadError} /></RetainedDialogHost>
      })}
      {props.massRestrictionResult && <LazyMassRestrictionResultsDialog result={props.massRestrictionResult} onClose={lifecycle.closeMassRestriction} onLoadError={lifecycle.onMassRestrictionLoadError} />}
      {props.blockedBatchOpen && <LazyBlockedBatchOpenDialog products={props.blockedBatchOpen.products} openedCount={props.blockedBatchOpen.openedCount} onOpen={props.onOpenBlockedProduct} onDiscard={lifecycle.discardBlockedBatch} onLoadError={lifecycle.onBlockedBatchLoadError} />}
      {props.agaroseGelOpen && props.agaroseGelSnapshot && <LazyAgaroseGelDialog key={props.agaroseGelSnapshot.openedAt} currentRecord={props.agaroseGelSnapshot.currentRecord} currentTabId={props.agaroseGelSnapshot.currentTabId} initialSamples={props.agaroseGelSnapshot.initialSamples} libraryMemberSources={props.agaroseGelSnapshot.libraryMemberSources} currentSourceLabel={props.agaroseGelSnapshot.currentSourceLabel} onClose={props.onCloseAgaroseGel} renderWorkspace={renderWorkspace} onLoadError={() => { props.onCloseAgaroseGel(); lifecycle.reportLazyLoadFailure('Could not load the agarose gel dialog.') }} />}
    </>
  )
}
