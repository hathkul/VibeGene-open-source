import { describe, expect, it } from 'vitest'
import {
  buildDarpinAnnotationPlan,
  isAutomaticDarpinAnnotation,
  replaceAutomaticDarpinAnnotations,
} from '../src/domain/darpinAnnotations'
import { detectDarpin } from '../src/domain/darpinDetection'
import type { SequenceFeature } from '../src/domain/types'

/** PDB 1MJ0 E3_5 consensus library DARPin (N3C). */
const e35 =
  'MRGSHHHHHHGSDLGKKLLEAARAGQDDEVRILMANGADVNATDNDGYTPLHLAASNGHLEIVEVLLKNGADVNASDLTGITPLHLAAATGHLEIVEVLLKHGADVNAYDNDGHTPLHLAAKYGHLEIVEVLLKHGADVNAQDKFGKTAFDISIDNGNEDLAEILQ'

/** PDB 2XEE NI3C full-consensus DARPin. */
const ni3c =
  'DLGKKLLEAARAGQDDEVRILMANGADVNAKDKDGYTPLHLAAREGHLEIVEVLLKAGADVNAKDKDGYTPLHLAAREGHLEIVEVLLKAGADVNAKDKDGYTPLHLAAREGHLEIVEVLLKAGADVNAQDKFGKTPFDLAIDNGNEDIAEVLQKAA'

/** PDB 2JAB anti-HER2 H10-2-G3 (N2C, framework mutations). */
const h10 =
  'MRGSHHHHHHGSDLGKKLLEAARAGQDDEVRILMANGADVNAKDEYGLTPLYLATAHGHLEIVEVLLKNGADVNAVDAIGFTPLHLAAFIGHLEIAEVLLKHGADVNAQDKFGKTAFDISIGNGNEDLAEILQKLN'

const antibodyHeavy =
  'QVQLVQSGAEVKRPGSSVTVSCKASGGSFSTYALSWVRQAPGRGLEWMGGVIPLLTITNYAPRFQGRITITADRSTSTAYLELNSLRPEDTAVYYCAREGTTGKPIGAFAHWGQGTLVTVSS'

describe('DARPin detection', () => {
  it('detects E3_5 as N3C with module.position numbering', () => {
    const detection = detectDarpin(e35)
    expect(detection.format).toBe('N3C')
    expect(detection.modules.map((module) => module.kind)).toEqual([
      'N-cap', 'internal', 'internal', 'internal', 'C-cap',
    ])
    expect(detection.positions[43]).toBe('1.1')
    expect(detection.positions[48]).toBe('1.6')
    expect(detection.paratopeIndices).toHaveLength(21)
    expect(detection.confidence).toBeGreaterThan(0.8)
  })

  it('detects full-consensus NI3C and anti-HER2 H10-2-G3', () => {
    expect(detectDarpin(ni3c).format).toBe('N3C')
    const her2 = detectDarpin(h10)
    expect(her2.format).toBe('N2C')
    expect(her2.modules.filter((module) => module.kind === 'internal')).toHaveLength(2)
  })

  it('rejects antibody variable domains', () => {
    expect(() => detectDarpin(antibodyHeavy)).toThrow(/No designed ankyrin repeat/)
  })
})

describe('DARPin annotation', () => {
  it('annotates domain, caps, internal repeats, and paratope residues', () => {
    const detection = detectDarpin(e35)
    const plan = buildDarpinAnnotationPlan(e35, detection)
    expect(plan.features.map((feature) => feature.name)).toEqual([
      'DARPin N3C',
      'N-cap',
      'IR1',
      'IR2',
      'IR3',
      'C-cap',
      'Paratope residues',
    ])
    expect(plan.features.every(isAutomaticDarpinAnnotation)).toBe(true)
    expect(plan.features.find((feature) => feature.name === 'Paratope residues')?.locations)
      .toHaveLength(21)
  })

  it('replaces prior automatic annotations while preserving user annotations', () => {
    const detection = detectDarpin(ni3c)
    const plan = buildDarpinAnnotationPlan(ni3c, detection)
    const manual: SequenceFeature = {
      id: 'manual-feature',
      name: 'User domain',
      type: 'region',
      color: '#123456',
      notes: 'Created by the user',
      locations: [{ start: 0, end: 5, strand: 'forward' }],
    }
    const first = replaceAutomaticDarpinAnnotations([manual], plan)
    const second = replaceAutomaticDarpinAnnotations(first, plan)
    expect(second[0]).toBe(manual)
    expect(second).toHaveLength(1 + plan.features.length)
  })
})
