import { describe, expect, it } from 'vitest'
import {
  buildVnarAnnotationPlan,
  isAutomaticVnarAnnotation,
  replaceAutomaticVnarAnnotations,
} from '../src/domain/vnarAnnotations'
import { detectVnar } from '../src/domain/vnarDetection'
import type { SequenceFeature } from '../src/domain/types'

/** PDB 1VES — wobbegong Type IV-like VNAR. */
const ves =
  'AWVDQTPRTATKETGESLTINCVLRDASFELKDTGWYRTKLGSTNEQSISIGGRYVETVNKGSKSFSLRISDLRVEDSGTYKCQAFYSLPLGDYNYSLLFRGEKGAGTALTVK'

/** PDB 2YWZ — wobbegong Type II VNAR (CDR1–CDR3 disulfide). */
const ywz =
  'AWVDQTPRTITKETGESLTIKCVLKDHSCGLSSTTWYRTQLGSTNEKTISIGGRYDETVDKGSKSFSLRISDLRVEDSGTYKCQADYSPSCYSYPSLESAVEGAGTVLTVK'

/** PDB 1T6V — nurse shark Type I VNAR. */
const t6v =
  'ARVDQTPRSVTKETGESLTINCVLRDASYALGSTCWYRKKSGEGNEESISKGGRYVETVNSGSKSFSLRINDLTVEDGGTYRCGLGVAGGYCDYALCSSRYAECGDGTAVTVN'

/** PDB 2I24 — nurse shark Type II VNAR. */
const i24 =
  'ARVDQTPQRITKETGESLTINCVVRDSRCVLSTGYWYRKPPGSRNEESISDGGRYVETVNRGSKSFSLRINDLTVKDSGTYRCKPESRYGSYDAVCAALNDQYGGGTVVTVN'

const antibodyHeavy =
  'QVQLVQSGAEVKRPGSSVTVSCKASGGSFSTYALSWVRQAPGRGLEWMGGVIPLLTITNYAPRFQGRITITADRSTSTAYLELNSLRPEDTAVYYCAREGTTGKPIGAFAHWGQGTLVTVSS'

describe('VNAR detection', () => {
  it('detects Type I, II, and IV VNARs with region numbering', () => {
    expect(detectVnar(t6v).vnarType).toBe('I')
    expect(detectVnar(ywz).vnarType).toBe('II')
    expect(detectVnar(i24).vnarType).toBe('II')
    const typeIv = detectVnar(ves)
    expect(typeIv.vnarType).toBe('IV')
    expect(typeIv.positions.some((label) => label?.startsWith('HV2.'))).toBe(true)
    expect(typeIv.positions.some((label) => label?.startsWith('CDR3.'))).toBe(true)
    expect(typeIv.confidence).toBeGreaterThan(0.7)
  })

  it('rejects antibody variable domains', () => {
    expect(() => detectVnar(antibodyHeavy)).toThrow(/No VNAR/)
  })
})

describe('VNAR annotation', () => {
  it('annotates domain, FR/HV/CDR regions, and disulfides', () => {
    const detection = detectVnar(ywz)
    const plan = buildVnarAnnotationPlan(ywz, detection)
    expect(plan.features[0]?.name).toBe('VNAR type II')
    expect(plan.features.map((feature) => feature.name)).toEqual(expect.arrayContaining([
      'FR1', 'CDR1', 'HV2', 'HV4', 'CDR3', 'FR4',
    ]))
    expect(plan.features.every(isAutomaticVnarAnnotation)).toBe(true)
    expect(plan.missingCanonicalBond).toBe(false)
    expect(plan.bonds.length).toBeGreaterThanOrEqual(1)
  })

  it('replaces prior automatic annotations while preserving user annotations', () => {
    const detection = detectVnar(ves)
    const plan = buildVnarAnnotationPlan(ves, detection)
    const manual: SequenceFeature = {
      id: 'manual-feature',
      name: 'User domain',
      type: 'region',
      color: '#123456',
      notes: 'Created by the user',
      locations: [{ start: 0, end: 5, strand: 'forward' }],
    }
    const first = replaceAutomaticVnarAnnotations([manual], [], plan)
    const second = replaceAutomaticVnarAnnotations(first.features, first.bonds, plan)
    expect(second.features.filter((feature) => feature.id === 'manual-feature')).toHaveLength(1)
    expect(second.features.filter(isAutomaticVnarAnnotation)).toHaveLength(plan.features.length)
  })
})
