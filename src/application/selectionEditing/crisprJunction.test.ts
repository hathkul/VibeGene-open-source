import { describe, expect, it } from 'vitest'
import { cloneFixture } from '../../domain/fixtures'
import type { SgRNAAnnotation } from '../../domain/sgrna'
import { applyCrisprExcision, type CrisprCutSite, type CrisprExcisionPlan } from './crisprExcision'
import { previewCrisprJunction, type JunctionSettings } from './crisprJunction'

const guide = { id: 'dummy' } as SgRNAAnnotation
function setup(sequence: string, topology: 'linear' | 'circular' = 'linear') {
  const record = { ...cloneFixture(), sequence, topology, features: [], primers: [] }
  const sites: [CrisprCutSite, CrisprCutSite] = [{ top: 4, bottom: 9, guide }, { top: 14, bottom: 19, guide }]
  const plan: CrisprExcisionPlan = { cuts: [4, 14], sites, guides: [guide, guide] }
  return { record, plan, sites }
}
function simulate(sequence: string, settings: Pick<JunctionSettings, 'leftFill' | 'rightFill'>) {
  const { record, plan, sites } = setup(sequence)
  const result = previewCrisprJunction(record, plan, { ...settings, sites, arc: 'between' })
  return { record, result }
}

describe('CRISPR junction simulation', () => {
  it('joins complementary 5′ sticky ends without duplicating the overlap', () => {
    const sequence = 'GGGGACGTATTTTTACGTACCCC'
    const { record, result } = simulate(sequence, { leftFill: 0, rightFill: 0 })
    expect(result.preview).toMatchObject({ leftRemaining: 'ACGTA', rightRemaining: 'ACGTA', sequence: sequence.slice(0, 4) + sequence.slice(14) })
    expect(applyCrisprExcision(record, result.preview!.deletionPlan, result.preview!.deletionArc).sequence).toBe(result.preview!.sequence)
  })

  it('supports complete and partial filling and refuses incompatible sticky ends', () => {
    const sequence = 'GGGGAAAAATTTTTAAAAACCCC'
    expect(simulate(sequence, { leftFill: 5, rightFill: 5 }).result.preview?.sequence).toBe(sequence.slice(0, 9) + sequence.slice(14))
    const partial = simulate(sequence, { leftFill: 2, rightFill: 2 }).result.preview!
    expect(partial).toMatchObject({ leftRemaining: 'AAA', rightRemaining: 'AAA', sequence: sequence.slice(0, 6) + sequence.slice(14) })
    const incompatible = simulate('GGGGACGTATTTTTTGCATCCCC', { leftFill: 0, rightFill: 0 }).result
    expect(incompatible.preview).toBeNull()
    expect(incompatible.error).toMatch(/incompatible/)
    expect(incompatible.ends?.leftRemaining).toBe('ACGTA')
  })

  it('allows a blunt Cas9 end to join a completely filled Cas12a end', () => {
    const { record, plan, sites } = setup('GGGGACGTATTTTTAAAAACCCC')
    sites[1].bottom = sites[1].top
    expect(previewCrisprJunction(record, plan, { sites, arc: 'between', leftFill: 5, rightFill: 0 }).preview?.sequence).toBe(record.sequence.slice(0, 9) + record.sequence.slice(14))
    expect(previewCrisprJunction(record, plan, { sites, arc: 'between', leftFill: 0, rightFill: 0 }).error).toMatch(/incompatible/)
  })

  it('handles either circular arc and cuts spanning the origin', () => {
    const { record, plan, sites } = setup('GGGGAAAAATTTTTAAAAACCCC', 'circular')
    const result = previewCrisprJunction(record, plan, { sites, arc: 'across-origin', leftFill: 5, rightFill: 5 }).preview!
    expect(result.sequence).toBe(record.sequence.slice(4, 19))
    expect(applyCrisprExcision(record, result.deletionPlan, result.deletionArc).sequence).toBe(result.sequence)
    const wrapSites: [CrisprCutSite, CrisprCutSite] = [{ top: 5, bottom: 10, guide }, { top: 21, bottom: 3, guide }]
    const wrap = previewCrisprJunction(record, plan, { sites: wrapSites, arc: 'across-origin', leftFill: 5, rightFill: 5 }).preview!
    expect(wrap.sequence).toBe(record.sequence.slice(0, 3) + record.sequence.slice(5))
    expect(applyCrisprExcision(record, wrap.deletionPlan, wrap.deletionArc).sequence).toBe(wrap.sequence)
  })

  it('rejects overlapping, invalid, and mismatched cuts', () => {
    const { record, plan, sites } = setup('GGGGAAAAATTTTTAAAAACCCC')
    expect(previewCrisprJunction(record, plan, { sites, arc: 'between', leftFill: 2, rightFill: 1 }).error).toMatch(/incompatible/)
    const overlap: [CrisprCutSite, CrisprCutSite] = [{ ...sites[0], bottom: 16 }, sites[1]]
    expect(previewCrisprJunction(record, plan, { sites: overlap, arc: 'between', leftFill: 0, rightFill: 0 }).preview).toBeNull()
    const inverted: [CrisprCutSite, CrisprCutSite] = [{ ...sites[0], bottom: 3 }, sites[1]]
    expect(previewCrisprJunction(record, plan, { sites: inverted, arc: 'between', leftFill: 0, rightFill: 0 }).preview).toBeNull()
  })
})
