import { describe, expect, it } from 'vitest'
import { designPreLinearizedOligos } from './crisprOligoDesign'

const target = 'GACCTGATCGTACGTTAGCA'
const reverseTarget = 'TGCTAACGTACGATCAGGTC'

describe('pre-linearized sgRNA oligo design', () => {
  it('constructs GeneArt junctions and keeps the promoter-supplied G out of the sense oligo', () => {
    expect(designPreLinearizedOligos('geneart', `  ${target.toLowerCase()}\n`)).toMatchObject({
      ok: true,
      normalizedTarget: target,
      expressedGuide: `G${target}`,
      sense: `${target}GTTTT`,
      antisense: `${reverseTarget}CGGTG`,
    })
    expect(designPreLinearizedOligos('geneart', target.slice(1))).toMatchObject({ ok: true })
  })

  it('constructs the newer Guide-it CACC/AAAC junction, including a complementary C for an added G', () => {
    expect(designPreLinearizedOligos('guide-it-sgrna1', target)).toMatchObject({
      ok: true,
      expressedGuide: target,
      sense: `CACC${target}`,
      antisense: `AAAC${reverseTarget}`,
    })
    const noG = 'ACGTACGTACGTACGTACGT'
    expect(designPreLinearizedOligos('guide-it-sgrna1', noG)).toMatchObject({
      ok: true,
      expressedGuide: `G${noG}`,
      sense: `CACCG${noG}`,
      antisense: `AAAC${noG}C`,
    })
  })

  it('uses the distinct original Guide-it CCGG and SaCas9 ACCG junctions', () => {
    expect(designPreLinearizedOligos('guide-it-ccgg', target)).toMatchObject({
      ok: true,
      sense: `CCGG${target}`,
      antisense: `AAAC${reverseTarget}`,
    })
    expect(designPreLinearizedOligos('aavpro-sacas9', `${target}AC`)).toMatchObject({
      ok: true,
      sense: `ACCG${target}AC`,
      antisense: `AAACGT${reverseTarget}`,
    })
  })

  it('rejects invalid bases and lengths before generating sequences', () => {
    expect(designPreLinearizedOligos('geneart', 'ACGT')).toMatchObject({ ok: false, error: expect.stringContaining('19–20 nt') })
    expect(designPreLinearizedOligos('guide-it-ccgg', `${target}A`)).toMatchObject({ ok: false, error: expect.stringContaining('20 nt') })
    expect(designPreLinearizedOligos('aavpro-sacas9', `${target}ACG`)).toMatchObject({ ok: false, error: expect.stringContaining('20–22 nt') })
    expect(designPreLinearizedOligos('geneart', `${target}N`)).toMatchObject({ ok: false, error: expect.stringContaining('only A, C, G, and T') })
  })
})
