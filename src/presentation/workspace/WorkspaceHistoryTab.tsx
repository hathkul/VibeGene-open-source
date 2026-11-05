import { HistoryTreePane } from '../../components/HistoryTreePane'
import type { HistoryNode, HistoryOligo, ProteinTranslationSource } from '../../domain/types'
import { MiniHistoryMap } from '../map'
import type { WorkspaceHistoryTabModel } from './workspaceHistoryTabViewModel'

export type WorkspaceHistoryTabCommands = {
  onManageHistory: () => void
  onManageProteinSourceHistory: () => void
  onOpenTranslationSourceDna: (source: ProteinTranslationSource) => void
  onOpenHistoryConstruct: (node: HistoryNode) => void
  onInspectHistoryOligo: (oligo: HistoryOligo) => void
  onOpenEnzymeInfo: (enzymeName: string) => void
  onOpenHistoryRestrictionGel: (node: HistoryNode, enzymeNames: string[]) => void
  onOpenAnnealedHistoryInsert: (node: HistoryNode, guideId: string) => void
}

export type WorkspaceHistoryTabProps = {
  model: WorkspaceHistoryTabModel
  commands: WorkspaceHistoryTabCommands
}

export function WorkspaceHistoryTab({ model, commands }: WorkspaceHistoryTabProps) {
  return (
    <div className="history-tab">
      {model.constructHistoryToolbar && (
        <div className="history-management-toolbar">
          <div>
            <strong>Construct history</strong>
            <span>{model.constructHistoryToolbar.subtitle}</span>
          </div>
          <button
            type="button"
            disabled={model.constructHistoryToolbar.manageDisabled}
            onClick={commands.onManageHistory}
          >
            Manage history…
          </button>
        </div>
      )}
      {model.proteinSourceToolbar && (
        <div className="history-management-toolbar">
          <div>
            <strong>Protein source DNA</strong>
            <span>Manage embedded source constructs, CDS payloads, references, ancestry, and traces.</span>
          </div>
          <button type="button" onClick={commands.onManageProteinSourceHistory}>
            Manage source DNA…
          </button>
        </div>
      )}
      {model.translationSources.length > 0 && (
        <div className="history-flow">
          <p><strong>Translated from CDS</strong></p>
          {model.translationSources.map((source) => (
            <div className="history-node" key={source.key}>
              <div>
                <strong>{source.projectName}</strong>
                <p>{source.detailLine}</p>
                <button
                  type="button"
                  disabled={source.openDisabled}
                  onClick={() => commands.onOpenTranslationSourceDna(source.source)}
                >
                  Open source DNA
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {model.tree ? (
        <HistoryTreePane
          key={model.tree.remountKey}
          root={model.tree.root}
          libraryRecipeMembers={model.tree.libraryRecipeMembers}
          onOpenConstruct={commands.onOpenHistoryConstruct}
          onInspectPrimer={commands.onInspectHistoryOligo}
          onInspectEnzyme={commands.onOpenEnzymeInfo}
          onInspectRestrictionDigest={commands.onOpenHistoryRestrictionGel}
          onOpenAnnealedInsert={commands.onOpenAnnealedHistoryInsert}
        />
      ) : model.operationsFallback ? (
        <div className="history-flow">
          {model.operationsFallback.showEmptyMessage && (
            <p className="history-empty">
              No construct history is recorded for this sequence. Import a SnapGene{' '}
              <code>.dna</code> file that carries a cloning history to see its family tree.
            </p>
          )}
          {model.operationsFallback.rows.map((operation) => (
            <div className="history-node" key={operation.id}>
              <div className="history-map">
                <MiniHistoryMap mapSize={130} record={model.operationsFallback!.mapRecord} />
              </div>
              <div>
                <strong>{operation.title}</strong>
                <p>{operation.summary}</p>
                <span>{operation.createdAtLabel}</span>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
