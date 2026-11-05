import { describe, expect, it } from 'vitest'
import { normalizeProteinDocumentData } from '../../domain/constructProperties'
import { cloneFixture } from '../../domain/fixtures'
import type { HistoryNode, SequenceRecord } from '../../domain/types'
import { buildWorkspaceHistoryTabModel } from './workspaceHistoryTabViewModel'

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

describe('buildWorkspaceHistoryTabModel', () => {
  it('shows DNA construct toolbar and empty fallback when no history tree exists', () => {
    const model = buildWorkspaceHistoryTabModel({ record: dnaRecord(), traceFiles: [] })
    expect(model.constructHistoryToolbar).toEqual({
      subtitle: 'No ancestry tree is currently stored.',
      manageDisabled: true,
    })
    expect(model.proteinSourceToolbar).toBe(false)
    expect(model.tree).toBeNull()
    expect(model.operationsFallback?.showEmptyMessage).toBe(true)
    expect(model.operationsFallback?.rows).toEqual([])
  })

  it('disables manage history when DNA has operations but no stored tree', () => {
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
    expect(model.constructHistoryToolbar?.manageDisabled).toBe(false)
    expect(model.operationsFallback?.rows[0]?.title).toBe('pUC19')
  })

  it('omits DNA construct toolbar for protein records and surfaces translation sources', () => {
    const model = buildWorkspaceHistoryTabModel({
      record: dnaRecord({
        molecule: 'protein',
        protein: normalizeProteinDocumentData({
          translationDerivation: {
            kind: 'translated-cds',
            createdAt: '2026-01-01T00:00:00.000Z',
            sources: [{
              projectName: 'Source plasmid',
              sequenceDigest: 'abc',
              retention: 'reference-only',
            }],
          },
        }, 4),
      }),
      traceFiles: [],
    })
    expect(model.constructHistoryToolbar).toBeNull()
    expect(model.proteinSourceToolbar).toBe(true)
    expect(model.translationSources[0]?.detailLine).toBe('Database reference only')
    expect(model.translationSources[0]?.openDisabled).toBe(true)
  })

  it('formats CDS detail lines and unavailable translation copy', () => {
    const withCds = buildWorkspaceHistoryTabModel({
      record: dnaRecord({
        molecule: 'protein',
        protein: normalizeProteinDocumentData({
          translationDerivation: {
            kind: 'translated-cds',
            createdAt: '2026-01-01T00:00:00.000Z',
            sources: [{
              projectName: 'Plasmid',
              sequenceDigest: 'abc',
              cds: {
                featureName: 'GFP',
                locations: [],
                translation: { geneticCode: 'Standard', firstCodonAsMet: true, readingFrame: 1, consecutiveNumbering: false, segmentNumbering: [] },
                nucleotideSequence: 'ATGC'.repeat(250),
                includedTerminalStop: false,
              },
            }],
          },
        }, 4),
      }),
      traceFiles: [],
    })
    expect(withCds.translationSources[0]?.detailLine).toBe(`GFP · ${(1000).toLocaleString()} nt`)

    const unavailable = buildWorkspaceHistoryTabModel({
      record: dnaRecord({
        molecule: 'protein',
        protein: normalizeProteinDocumentData({
          translationDerivation: {
            kind: 'translated-cds',
            createdAt: '2026-01-01T00:00:00.000Z',
            sources: [{ projectName: 'Missing CDS', sequenceDigest: 'abc' }],
          },
        }, 4),
      }),
      traceFiles: [],
    })
    expect(unavailable.translationSources[0]?.detailLine).toBe('Database reference only')
  })

  it('uses record name for the first operation row and operation.type for later rows', () => {
    const model = buildWorkspaceHistoryTabModel({
      record: dnaRecord({
        operations: [
          { id: 'op-1', type: 'import', summary: 'First', createdAt: '2026-01-01T00:00:00.000Z' },
          { id: 'op-2', type: 'digest', summary: 'Second', createdAt: '2026-01-02T00:00:00.000Z' },
        ],
      }),
      traceFiles: [],
    })
    expect(model.operationsFallback?.rows.map((row) => row.title)).toEqual(['pUC19', 'digest'])
  })

  it('includes only library recipe members with supported member history operations', () => {
    const memberHistory = historyNode({
      id: 'member-hist',
      name: 'Member',
      operation: 'insertFragment',
    })
    const model = buildWorkspaceHistoryTabModel({
      record: dnaRecord({
        history: historyNode({
          id: 'library-root',
          name: 'Library',
          operation: 'cloneLibrary',
        }),
      }),
      traceFiles: [
        { id: 'keep', fileName: 'keep.ab1', history: memberHistory } as never,
        { id: 'skip', fileName: 'skip.ab1', history: { ...memberHistory, operation: 'import' } } as never,
        { id: 'none', fileName: 'none.ab1' } as never,
      ],
    })
    expect(model.tree?.libraryRecipeMembers).toEqual([{
      id: 'keep',
      name: 'keep.ab1',
      history: memberHistory,
    }])
  })

  it('prefers the history tree branch and omits flat operations', () => {
    const model = buildWorkspaceHistoryTabModel({
      record: dnaRecord({
        history: historyNode({
          id: 'hist-1',
          name: 'Root',
          operation: 'import',
        }),
        operations: [{ id: 'op-1', type: 'edit', summary: 'Edited', createdAt: '2026-01-01T00:00:00.000Z' }],
      }),
      traceFiles: [],
    })
    expect(model.tree?.remountKey).toBe('rec-1:hist-1')
    expect(model.operationsFallback).toBeNull()
  })
})
