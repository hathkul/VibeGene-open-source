import { describe, expect, it } from 'vitest'
import { defaultConstructProperties } from '../../domain/constructProperties'
import {
  NEW_FILE_FROM_SELECTION_MISSING_STATUS,
  planNewDnaFileCreatedStatus,
  planNewFileFromSelectionConfirm,
  planNewFileFromSelectionDraft,
  planNewProteinFileCreatedStatus,
} from './newDocumentWorkflow'
import type { SequenceRecord } from '../../domain/types'

const pending = (): SequenceRecord => ({
  id: 'frag-1',
  name: 'Untitled fragment',
  molecule: 'dna',
  topology: 'linear',
  sequence: 'ACGTACGT',
  features: [],
  primers: [],
  history: {
    id: 'hist-1',
    name: 'Untitled fragment.dna',
    seqLen: 8,
    circular: false,
    operation: 'newFileFromSelection',
    resurrectable: false,
    hideHistory: false,
    oligos: [],
    regeneratedSites: [],
    inputSummaries: [],
    features: [],
    children: [],
  },
  constructProperties: defaultConstructProperties,
} as unknown as SequenceRecord)

describe('newDocumentWorkflow', () => {
  it('requires a selection before opening the naming dialog', () => {
    expect(planNewFileFromSelectionDraft(null)).toEqual({
      kind: 'missing-selection',
      status: NEW_FILE_FROM_SELECTION_MISSING_STATUS,
    })
  })

  it('names confirmed selection files and builds the status line', () => {
    const plan = planNewFileFromSelectionConfirm(pending(), 'insert.dna')
    expect(plan.record.name).toBe('insert.dna')
    expect(plan.record.history?.name).toBe('insert.dna.dna')
    expect(plan.status).toBe('Opened new file from selection: insert.dna (8 bp).')
  })

  it('formats new DNA and protein creation statuses', () => {
    const dna = pending()
    dna.name = 'vector'
    dna.topology = 'circular'
    expect(planNewDnaFileCreatedStatus(dna)).toBe('Created vector.dna (circular, 8 bp).')

    const protein = { ...pending(), molecule: 'protein' as const, name: 'enzyme' }
    expect(planNewProteinFileCreatedStatus(protein)).toBe('Created enzyme (8 aa).')
  })
})
