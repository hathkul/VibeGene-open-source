import { useMemo, type ComponentProps, type ReactNode } from 'react'
import type { SequenceRecord } from '../../domain/types'
import type { TraceFileRecord } from '../../domain/traceTypes'
import type { SelectionRange } from '../sequence'
import type { PrimerHybridizationParams } from '../../domain/primerHybridization'
import type { PcrDialog } from '../../PcrDialog'
import { MutagenesisDialog } from '../../MutagenesisDialog'
import { lazyDialog } from '../../ui/lazyDialog'
import type { CloningDialogLifecycle } from '../hooks/useCloningWorkspaceController'

const LazyPcrDialog = lazyDialog(
  () => import('../../PcrDialog'),
  (module) => module.PcrDialog,
)
function RetainedDialogHost({ active, children }: { active: boolean; children: ReactNode }) {
  return <div className="retained-dialog-host" hidden={!active} aria-hidden={active ? undefined : true}>{children}</div>
}

type PcrCallback = ComponentProps<typeof PcrDialog>['onPcr']
type MutagenesisCallback = ComponentProps<typeof MutagenesisDialog>['onMutagenize']

export type CloningWorkflowDialogsHostProps = {
  record: SequenceRecord
  traceFiles: TraceFileRecord[]
  tabId: string
  pcrOpen: boolean
  pcrInvocation: number
  pcrRetained: boolean
  setPcrOpen: (open: boolean) => void
  selectedRange: SelectionRange | null
  selectedPrimerIds: string[]
  primerHybridization: PrimerHybridizationParams
  onPcr: PcrCallback
  pcrRenderWorkspace: ComponentProps<typeof PcrDialog>['renderWorkspace']
  lifecycle: CloningDialogLifecycle
  mutagenesisOpen: boolean
  mutagenesisRetained: boolean
  setMutagenesisOpen: (open: boolean) => void
  onMutagenize: MutagenesisCallback
  mutagenesisRenderWorkspace: ComponentProps<typeof MutagenesisDialog>['renderWorkspace']
}

/** Keeps retained PCR and mutagenesis dialogs mounted while App supplies lifecycle adapters. */
export function CloningWorkflowDialogsHost(props: CloningWorkflowDialogsHostProps) {
  const source = useMemo(() => ({ ...props.record, traceFiles: props.traceFiles }), [props.record, props.traceFiles])
  return (
    <>
      {props.pcrRetained && <RetainedDialogHost active={props.pcrOpen}><LazyPcrDialog key={props.pcrInvocation} active={props.pcrOpen} currentRecord={source} currentTabId={props.tabId} initialSelectedRange={props.selectedRange && props.selectedRange.start !== props.selectedRange.end ? props.selectedRange : null} initialPrimerIds={props.selectedPrimerIds.slice(0, 2)} primerHybridization={props.primerHybridization} onCancel={() => props.setPcrOpen(false)} onPcr={props.onPcr} renderWorkspace={props.pcrRenderWorkspace} onLoadError={props.lifecycle.onPcrLoadError} /></RetainedDialogHost>}
      {props.mutagenesisRetained && <RetainedDialogHost active={props.mutagenesisOpen}><MutagenesisDialog active={props.mutagenesisOpen} currentRecord={source} currentTabId={props.tabId} primerHybridization={props.primerHybridization} onCancel={() => props.setMutagenesisOpen(false)} onMutagenize={props.onMutagenize} renderWorkspace={props.mutagenesisRenderWorkspace} /></RetainedDialogHost>}
    </>
  )
}
