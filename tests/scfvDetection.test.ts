import { describe, expect, it } from 'vitest'
import {
  buildScfvAnnotationPlan,
  isAutomaticScfvAnnotation,
  replaceAutomaticScfvAnnotations,
} from '../src/domain/scfvAnnotations'
import { detectScfv } from '../src/domain/scfvDetection'
import type { ProteinBond, SequenceFeature } from '../src/domain/types'

const heavyChain =
  'QVQLVQSGAEVKRPGSSVTVSCKASGGSFSTYALSWVRQAPGRGLEWMGGVIPLLTITNYAPRFQGRITITADRSTSTAYLELNSLRPEDTAVYYCAREGTTGKPIGAFAHWGQGTLVTVSS'
const kappaChain =
  'DIQMTQSPSSLSASVGDRVTITCRASQDVNTAVAWYQQKPGKAPKLLIYSASFLYSGVPSRFSGSRSGTDFTLTISSLQPEDFATYYCQQHYTTPPTFGQGTKVEIK'
const linker = 'GGGGSGGGGSGGGGS'
const vhvl = heavyChain + linker + kappaChain
const vlvh = kappaChain + linker + heavyChain

describe('scFv detection', () => {
  it('detects VH-linker-VL orientation with combined numbering', async () => {
    const detection = await detectScfv(vhvl, 'imgt')
    expect(detection.orientation).toBe('VH-VL')
    expect(detection.format).toContain('VH-VL')
    expect(detection.linkerSequence).toBe(linker)
    expect(detection.positions[0]).toBe('VH.1')
    expect(detection.positions[heavyChain.length]).toBe('Lnk.1')
    expect(detection.positions[heavyChain.length + linker.length]).toBe('VL.1')
    expect(detection.heavy.chain).toBe('H')
    expect(detection.light.chain).toBe('K')
    expect(detection.confidence).toBeGreaterThan(0.5)
  })

  it('detects VL-linker-VH orientation and supports Kabat', async () => {
    const detection = await detectScfv(vlvh, 'kabat')
    expect(detection.orientation).toBe('VL-VH')
    expect(detection.numberingScheme).toBe('kabat')
    expect(detection.positions[0]).toBe('VL.1')
    expect(detection.positions[kappaChain.length + linker.length]).toMatch(/^VH\./)
  })

  it('rejects single variable domains and non-Ig proteins', async () => {
    await expect(detectScfv(heavyChain, 'imgt')).rejects.toThrow(/scFv/)
    await expect(detectScfv('MKTIIALSYIFCLVFADYKDDDDK', 'imgt')).rejects.toThrow()
  })
})

describe('scFv annotation', () => {
  it('annotates scFv, domains, linker, FR/CDR regions, and disulfides', async () => {
    const detection = await detectScfv(vhvl, 'imgt')
    const plan = buildScfvAnnotationPlan(vhvl, detection)
    const names = plan.features.map((feature) => feature.name)
    expect(names).toContain('scFv VH-VL')
    expect(names).toContain('VH domain')
    expect(names).toContain('VL (κ) domain')
    expect(names).toContain('Linker')
    expect(names).toContain('VH CDR3')
    expect(names).toContain('VL CDR3')
    expect(plan.features.every(isAutomaticScfvAnnotation)).toBe(true)
    expect(plan.bonds.length).toBeGreaterThanOrEqual(2)
    expect(plan.bonds.every(isAutomaticScfvAnnotation)).toBe(true)
  })

  it('replaces prior automatic annotations while preserving user annotations', async () => {
    const detection = await detectScfv(vhvl, 'imgt')
    const plan = buildScfvAnnotationPlan(vhvl, detection)
    const manualFeature: SequenceFeature = {
      id: 'manual-feature',
      name: 'User domain',
      type: 'region',
      color: '#123456',
      notes: 'Created by the user',
      locations: [{ start: 0, end: 5, strand: 'forward' }],
    }
    const manualBond: ProteinBond = {
      id: 'manual-bond',
      name: 'User bond',
      type: 'other',
      endpoints: [{ residue: 1 }, { residue: 2 }],
      notes: 'Created by the user',
    }
    const first = replaceAutomaticScfvAnnotations([manualFeature], [manualBond], plan)
    const second = replaceAutomaticScfvAnnotations(first.features, first.bonds, plan)
    expect(second.features[0]).toBe(manualFeature)
    expect(second.bonds[0]).toBe(manualBond)
    expect(second.features).toHaveLength(1 + plan.features.length)
    expect(second.bonds).toHaveLength(1 + plan.bonds.length)
  })
})
