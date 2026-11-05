import { describe, expect, it } from 'vitest'
import { cloneFixture } from '../../domain/fixtures'
import { planImportedWorkspaceInit, planProjectImportCommit, planSnapGeneImportCommit } from './importCommitPlan'
import type { VibegeneEnzymeDisplayImport } from '../../domain/snapgeneEnzymeData'

function libraryRecord() {
  const record = cloneFixture()
  return { ...record, dna: { ...record.dna, documentRole: 'library' as const } }
}

describe('import commit plans', () => {
  it('plans workspace init from the first feature with cleared primer intent', () => {
    const record = cloneFixture()
    const plan = planImportedWorkspaceInit(record)
    expect(plan.selection).toEqual({ kind: 'neutral' })
    expect(plan.showLibraryAlignments).toBe(false)
  })

  it('plans empty selection when the record has no features', () => {
    const record = { ...cloneFixture(), features: [] }
    const plan = planImportedWorkspaceInit(record)
    expect(plan.selection).toEqual({ kind: 'neutral' })
    expect(plan.showLibraryAlignments).toBe(false)
  })

  it('requests library alignments only for DNA library records', () => {
    expect(planImportedWorkspaceInit(cloneFixture()).showLibraryAlignments).toBe(false)
    expect(planImportedWorkspaceInit(libraryRecord()).showLibraryAlignments).toBe(true)
  })

  it('builds SnapGene status with and without sequencing traces', () => {
    const record = cloneFixture()
    const withoutTraces = planSnapGeneImportCommit({ record, fileName: 'plasmid.dna', traceCount: 0, enzymeDisplay: null })
    expect(withoutTraces.status).toBe(`Imported plasmid.dna (${withoutTraces.status.match(/\((.*)\)/)?.[1]}).`)
    expect(withoutTraces.status).not.toContain('sequencing traces')
    const withTraces = planSnapGeneImportCommit({ record, fileName: 'plasmid.dna', traceCount: 2, enzymeDisplay: null })
    expect(withTraces.status).toContain('2 sequencing traces')
    expect(withTraces.status).toContain('plasmid.dna')
  })

  it('carries the SnapGene enzyme-display intent through the plan', () => {
    const record = cloneFixture()
    const enzymeDisplay: VibegeneEnzymeDisplayImport = { set: 'all', supplierSetId: null }
    const plan = planSnapGeneImportCommit({ record, fileName: 'plasmid.dna', traceCount: 0, enzymeDisplay })
    expect(plan.enzymeDisplay).toEqual(enzymeDisplay)
    const without = planSnapGeneImportCommit({ record, fileName: 'plasmid.dna', traceCount: 0, enzymeDisplay: null })
    expect(without.enzymeDisplay).toBeNull()
  })

  it('builds project status with each extra and joins them with " and "', () => {
    const record = cloneFixture()
    const full = planProjectImportCommit({
      record,
      fileName: 'project.vbgp',
      commonFeatureCount: 3,
      customMwLadderCount: 2,
      hasVisualSettings: true,
    })
    expect(full.extras).toEqual(['3 common features', '2 custom MW markers', 'visual settings'])
    expect(full.status).toContain('with 3 common features and 2 custom MW markers and visual settings.')
    const plain = planProjectImportCommit({ record, fileName: 'project.vbgp', commonFeatureCount: 0, customMwLadderCount: 0, hasVisualSettings: false })
    expect(plain.extras).toEqual([])
    expect(plain.status).not.toContain(' with ')
    expect(plain.status).toContain('Imported project.vbgp')
  })

  it('keeps single-extra project status wording and selection intent', () => {
    const record = cloneFixture()
    const plan = planProjectImportCommit({ record, fileName: 'project.vbgp', commonFeatureCount: 1, customMwLadderCount: 0, hasVisualSettings: false })
    expect(plan.status).toContain('with 1 common features.')
    expect(plan.selection).toEqual({ kind: 'neutral' })
  })
})
