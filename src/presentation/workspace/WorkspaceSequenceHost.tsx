import type { ComponentProps } from 'react'
import { DnaComparisonPane } from '../../components/DnaComparisonPane'
import { ProteinAlignmentPane } from '../../components/ProteinAlignmentPane'
import { TraceViewer } from '../../TraceViewer'
import { ProteinSequencePane, ProteinViewSidebar } from '../protein'
import { ViewSidebar } from '../dnaViewControls/ViewSidebar'
import { SequenceWorkspace } from '../sequence'
import { selectWorkspaceSequenceVariant } from './workspaceSequenceViewModel'

type ProteinSequenceProps = {
  sidebar: ComponentProps<typeof ProteinViewSidebar>
  alignment: ComponentProps<typeof ProteinAlignmentPane>
  sequence: ComponentProps<typeof ProteinSequencePane>
  alignmentsVisible: boolean
}

type DnaSequenceProps = {
  sidebar: ComponentProps<typeof ViewSidebar>
  comparison: ComponentProps<typeof DnaComparisonPane>
  sequence: Omit<ComponentProps<typeof SequenceWorkspace>, 'scrollHostRef'>
  comparisonVisible: boolean
  trace: ComponentProps<typeof TraceViewer> | null
}

export type WorkspaceSequenceHostProps = {
  mounted: boolean
  activeTab: string
  layoutClassName: string
  protein: ProteinSequenceProps | null
  dna: DnaSequenceProps | null
  /** Supplied as a direct JSX prop (not through the render-time view model) so the ref object never enters a render-scope function call. */
  sequenceScrollHostRef: ComponentProps<typeof SequenceWorkspace>['scrollHostRef']
}

/** Main Sequence-tab rendering host for protein, trace, comparative, and DNA workspaces. */
export function WorkspaceSequenceHost({ mounted, activeTab, layoutClassName, protein, dna, sequenceScrollHostRef }: WorkspaceSequenceHostProps) {
  const variant = selectWorkspaceSequenceVariant({
    mounted,
    activeTab,
    protein: protein ? { alignmentsVisible: protein.alignmentsVisible } : null,
    dna: dna ? { trace: dna.trace, comparisonVisible: dna.comparisonVisible } : null,
  })
  if (variant === 'hidden') return null
  return (
    <div className={`sequence-tab${layoutClassName}${activeTab === 'Sequence' ? '' : ' tab-panel-hidden'}`}>
      {protein && (variant === 'protein-alignment' || variant === 'protein-sequence') ? (
        <>
          <ProteinViewSidebar {...protein.sidebar} />
          {variant === 'protein-alignment'
            ? <ProteinAlignmentPane {...protein.alignment} />
            : <ProteinSequencePane {...protein.sequence} />
          }
        </>
      ) : dna?.trace ? (
        <TraceViewer {...dna.trace} />
      ) : dna ? (
        <>
          <ViewSidebar {...dna.sidebar} />
          {variant === 'dna-comparison'
            ? <DnaComparisonPane {...dna.comparison} />
            : <SequenceWorkspace {...dna.sequence} scrollHostRef={sequenceScrollHostRef} />
          }
        </>
      ) : null}
    </div>
  )
}
