// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizeProteinDocumentData } from '../../domain/constructProperties'
import { cloneFixture } from '../../domain/fixtures'
import type { HistoryNode, HistoryOligo, ProteinTranslationSource, SequenceRecord } from '../../domain/types'
import { WorkspaceHistoryTab, type WorkspaceHistoryTabCommands } from './WorkspaceHistoryTab'
import { buildWorkspaceHistoryTabModel } from './workspaceHistoryTabViewModel'

type CapturedHistoryTreePaneProps = {
  onOpenConstruct: (node: HistoryNode) => void
  onInspectPrimer: (oligo: HistoryOligo) => void
  onInspectEnzyme: (enzymeName: string) => void
  onInspectRestrictionDigest?: (node: HistoryNode, enzymeNames: string[]) => void
  onOpenAnnealedInsert?: (node: HistoryNode, guideId: string) => void
}

const capturedHistoryTreePane = vi.hoisted(() => ({
  props: null as CapturedHistoryTreePaneProps | null,
}))

vi.mock('../../components/HistoryTreePane', () => ({
  HistoryTreePane: (props: CapturedHistoryTreePaneProps) => {
    capturedHistoryTreePane.props = props
    return <div data-testid="history-tree-pane" />
  },
}))

vi.mock('../map', () => ({
  MiniHistoryMap: () => <div data-testid="mini-history-map" />,
}))

function dnaRecord(overrides: Partial<SequenceRecord> = {}): SequenceRecord {
  return {
    ...cloneFixture(),
    id: 'rec-1',
    name: 'pUC19',
    sequence: 'ACGT',
    features: [],
    primers: [],
    operations: [],
    ...overrides,
  }
}

function historyNode(
  partial: Partial<HistoryNode> & Pick<HistoryNode, 'id' | 'name' | 'operation'>,
): HistoryNode {
  return {
    seqLen: 4,
    circular: false,
    resurrectable: false,
    hideHistory: false,
    oligos: [],
    regeneratedSites: [],
    inputSummaries: [],
    features: [],
    children: [],
    ...partial,
  }
}

function makeCommands(): WorkspaceHistoryTabCommands {
  return {
    onManageHistory: vi.fn(),
    onManageProteinSourceHistory: vi.fn(),
    onOpenTranslationSourceDna: vi.fn(),
    onOpenHistoryConstruct: vi.fn(),
    onInspectHistoryOligo: vi.fn(),
    onOpenEnzymeInfo: vi.fn(),
    onOpenHistoryRestrictionGel: vi.fn(),
    onOpenAnnealedHistoryInsert: vi.fn(),
  }
}

describe('WorkspaceHistoryTab', () => {
  let root: Root | null = null
  let host: HTMLElement | null = null

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
    root = null
    host = null
    capturedHistoryTreePane.props = null
  })

  function render(model: ReturnType<typeof buildWorkspaceHistoryTabModel>, commands: WorkspaceHistoryTabCommands) {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root!.render(<WorkspaceHistoryTab model={model} commands={commands} />))
    return host
  }

  it('disables manage history and source-open actions in the disabled branches', () => {
    const commands = makeCommands()
    const emptyModel = buildWorkspaceHistoryTabModel({ record: dnaRecord(), traceFiles: [] })
    const emptyDom = render(emptyModel, commands)
    const manageButton = emptyDom.querySelector('.history-management-toolbar button') as HTMLButtonElement
    expect(manageButton.disabled).toBe(true)
    act(() => manageButton.click())
    expect(commands.onManageHistory).not.toHaveBeenCalled()

    const blockedSource: ProteinTranslationSource = {
      projectName: 'Blocked',
      sequenceDigest: 'abc',
      retention: 'reference-only',
    }
    const proteinModel = buildWorkspaceHistoryTabModel({
      record: dnaRecord({
        molecule: 'protein',
        protein: normalizeProteinDocumentData({
          translationDerivation: {
            kind: 'translated-cds',
            createdAt: '2026-01-01T00:00:00.000Z',
            sources: [blockedSource],
          },
        }, 4),
      }),
      traceFiles: [],
    })
    act(() => root!.unmount())
    root = null
    host!.remove()
    const proteinDom = render(proteinModel, commands)
    const openSourceButton = proteinDom.querySelector('.history-flow button') as HTMLButtonElement
    expect(openSourceButton.disabled).toBe(true)
    act(() => openSourceButton.click())
    expect(commands.onOpenTranslationSourceDna).not.toHaveBeenCalled()
  })

  it('passes the original translation source object to onOpenTranslationSourceDna', () => {
    const commands = makeCommands()
    const source: ProteinTranslationSource = {
      projectName: 'Src',
      sequenceDigest: 'digest-1',
      projectId: 'proj-42',
    }
    const model = buildWorkspaceHistoryTabModel({
      record: dnaRecord({
        molecule: 'protein',
        protein: normalizeProteinDocumentData({
          translationDerivation: {
            kind: 'translated-cds',
            createdAt: '2026-01-01T00:00:00.000Z',
            sources: [source],
          },
        }, 4),
      }),
      traceFiles: [],
    })
    const dom = render(model, commands)
    act(() => (dom.querySelector('.history-flow button') as HTMLButtonElement).click())
    expect(commands.onOpenTranslationSourceDna).toHaveBeenCalledWith({
      ...source,
      retention: 'reference-only',
    })
  })

  it('forwards HistoryTreePane callbacks with exact construct, oligo, enzyme, digest, and annealed payloads', () => {
    const commands = makeCommands()
    const model = buildWorkspaceHistoryTabModel({
      record: dnaRecord({
        history: historyNode({
          id: 'hist-root',
          name: 'Root',
          operation: 'import',
        }),
      }),
      traceFiles: [],
    })
    render(model, commands)
    const props = capturedHistoryTreePane.props!
    const constructNode = historyNode({
      id: 'node-construct',
      name: 'Child',
      operation: 'pcr',
      resurrectable: true,
    })
    const oligo: HistoryOligo = { name: 'fwd', sequence: 'ACGT' }
    props.onOpenConstruct(constructNode)
    props.onInspectPrimer(oligo)
    props.onInspectEnzyme('EcoRI')
    props.onInspectRestrictionDigest?.(constructNode, ['EcoRI', 'BamHI'])
    props.onOpenAnnealedInsert?.(constructNode, 'guide-7')
    expect(commands.onOpenHistoryConstruct).toHaveBeenCalledWith(constructNode)
    expect(commands.onInspectHistoryOligo).toHaveBeenCalledWith(oligo)
    expect(commands.onOpenEnzymeInfo).toHaveBeenCalledWith('EcoRI')
    expect(commands.onOpenHistoryRestrictionGel).toHaveBeenCalledWith(constructNode, ['EcoRI', 'BamHI'])
    expect(commands.onOpenAnnealedHistoryInsert).toHaveBeenCalledWith(constructNode, 'guide-7')
  })

  it('routes manage history when the DNA toolbar action is enabled', () => {
    const commands = makeCommands()
    const model = buildWorkspaceHistoryTabModel({
      record: dnaRecord({
        operations: [{
          id: 'op-1',
          type: 'import',
          summary: 'Imported',
          createdAt: '2026-01-01T00:00:00.000Z',
        }],
      }),
      traceFiles: [],
    })
    const dom = render(model, commands)
    const button = dom.querySelector('.history-management-toolbar button') as HTMLButtonElement
    act(() => button.click())
    expect(commands.onManageHistory).toHaveBeenCalledTimes(1)
  })

  it('renders empty DNA fallback copy when there are no operations', () => {
    const model = buildWorkspaceHistoryTabModel({ record: dnaRecord(), traceFiles: [] })
    const dom = render(model, makeCommands())
    expect(dom.textContent).toContain('No construct history is recorded for this sequence')
    expect(dom.querySelector('[data-testid="mini-history-map"]')).toBeNull()
  })

  it('renders operation rows with minimap when no history tree exists', () => {
    const model = buildWorkspaceHistoryTabModel({
      record: dnaRecord({
        operations: [{
          id: 'op-1',
          type: 'import',
          summary: 'Imported from file',
          createdAt: '2026-01-02T12:00:00.000Z',
        }],
      }),
      traceFiles: [],
    })
    const dom = render(model, makeCommands())
    expect(dom.querySelector('[data-testid="mini-history-map"]')).not.toBeNull()
    expect(dom.textContent).toContain('Imported from file')
  })
})
