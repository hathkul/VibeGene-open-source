import { describe, expect, it } from 'vitest'
import { labPlasmid } from '../../domain/fixtures'
import { traceRecordFromSequence } from '../../domain/sequenceTraceFactory'
import type { SequenceFeature } from '../../domain/types'
import {
  executeFeatureDataExportConfirm,
  planFeatureDataExport,
  resolveFeatureDataExportLength,
} from './featureDataExportPlan'

const feature: SequenceFeature = {
  id: 'feature-1',
  type: 'CDS',
  name: 'LDLR',
  color: labPlasmid.features.find((entry) => entry.type === 'CDS')!.color,
  locations: [{ start: 86, end: 2669, strand: 'forward' }],
}

describe('resolveFeatureDataExportLength', () => {
  it('uses consensus length when no member is selected', () => {
    expect(resolveFeatureDataExportLength(5000, null, [])).toBe(5000)
  })

  it('uses the selected member sequence length when present', () => {
    const member = traceRecordFromSequence('A'.repeat(321), 'read.ab1', { id: 'member-1' })
    expect(resolveFeatureDataExportLength(labPlasmid.sequence.length, member.id, [member])).toBe(321)
  })

  it('falls back to consensus length when the member id is missing', () => {
    expect(resolveFeatureDataExportLength(5000, 'missing', [])).toBe(5000)
  })
})

describe('planFeatureDataExport', () => {
  it('returns close-only when features or fields are empty', () => {
    expect(planFeatureDataExport('pUC19.dna', [], ['name'], 100)).toEqual({ kind: 'close-only' })
    expect(planFeatureDataExport('pUC19.dna', [feature], [], 100)).toEqual({ kind: 'close-only' })
  })

  it('builds filename, TSV contents, mime type, and pluralized status', () => {
    const plan = planFeatureDataExport('pUC19.dna', [feature, { ...feature, id: 'feature-2', name: 'AmpR' }], ['name', 'location'], 5000)
    expect(plan).toMatchObject({
      kind: 'export',
      fileName: 'Features from pUC19.txt',
      mimeType: 'text/plain',
      status: 'Exported data for 2 features.',
    })
    if (plan.kind === 'export') {
      expect(plan.contents).toContain('LDLR')
      expect(plan.contents).toContain('AmpR')
    }
  })

  it('uses singular status and strips .dna from the filename base', () => {
    const plan = planFeatureDataExport('construct.DNA', [feature], ['name'], 5000)
    expect(plan).toMatchObject({
      kind: 'export',
      fileName: 'Features from construct.txt',
      status: 'Exported data for LDLR.',
    })
  })
})

describe('executeFeatureDataExportConfirm', () => {
  it('closes without download on close-only plans', () => {
    const callOrder: string[] = []
    executeFeatureDataExportConfirm({ kind: 'close-only' }, {
      download: () => callOrder.push('download'),
      closeExportDialog: () => callOrder.push('close'),
      setStatus: () => callOrder.push('status'),
    })
    expect(callOrder).toEqual(['close'])
  })

  it('downloads before closing and setting status on export plans', () => {
    const callOrder: string[] = []
    executeFeatureDataExportConfirm({
      kind: 'export',
      fileName: 'Features from pUC19.txt',
      contents: 'LDLR\t1..2',
      mimeType: 'text/plain',
      status: 'Exported data for LDLR.',
    }, {
      download: () => callOrder.push('download'),
      closeExportDialog: () => callOrder.push('close'),
      setStatus: () => callOrder.push('status'),
    })
    expect(callOrder).toEqual(['download', 'close', 'status'])
  })
})
