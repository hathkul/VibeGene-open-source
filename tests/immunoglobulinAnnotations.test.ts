import { describe, expect, it } from 'vitest'
import {
  buildImmunoglobulinAnnotationPlan,
  replaceAutomaticImmunoglobulinAnnotations,
} from '../src/domain/immunoglobulinAnnotations'
import { detectImmunoglobulinNumbering } from '../src/domain/immunoglobulinNumbering'
import type { ProteinBond, SequenceFeature } from '../src/domain/types'

const heavyChain = 'QVQLVQSGAEVKRPGSSVTVSCKASGGSFSTYALSWVRQAPGRGLEWMGGVIPLLTITNYAPRFQGRITITADRSTSTAYLELNSLRPEDTAVYYCAREGTTGKPIGAFAHWGQGTLVTVSS'
const kappaChain = 'DIQMTQSPSSLSASVGDRVTITCRASQDVNTAVAWYQQKPGKAPKLLIYSASFLYSGVPSRFSGSRSGTDFTLTISSLQPEDFATYYCQQHYTTPPTFGQGTKVEIK'

async function withKabatResidues(sequence: string, replacements: Record<string, string>) {
  const numbering = await detectImmunoglobulinNumbering(sequence, 'kabat', 'H')
  const residues = [...sequence]
  for (const [position, residue] of Object.entries(replacements)) {
    const index = numbering.positions.indexOf(position)
    if (index < 0) throw new Error(`Kabat position ${position} was not found in the test sequence.`)
    residues[index] = residue
  }
  return residues.join('')
}

describe('immunoglobulin annotation', () => {
  it('creates IMGT FR/CDR features and the canonical V-domain disulfide', async () => {
    const numbering = await detectImmunoglobulinNumbering(heavyChain, 'imgt', 'H')
    const plan = buildImmunoglobulinAnnotationPlan(heavyChain, numbering)

    expect(plan.features.map((feature) => feature.name)).toEqual([
      'FR1', 'CDR1', 'FR2', 'CDR2', 'FR3', 'CDR3', 'FR4',
    ])
    expect(plan.features.find((feature) => feature.name === 'CDR3')?.locations).toEqual([{
      start: numbering.positions.indexOf('105'),
      end: numbering.positions.indexOf('117') + 1,
      strand: 'forward',
    }])
    expect(plan.bonds).toHaveLength(1)
    expect(plan.bonds[0].endpoints).toEqual([
      { residue: numbering.positions.indexOf('23') },
      { residue: numbering.positions.indexOf('104') },
    ])
  })

  it('uses chain-specific Kabat boundaries for light chains', async () => {
    const numbering = await detectImmunoglobulinNumbering(kappaChain, 'kabat', 'K')
    const plan = buildImmunoglobulinAnnotationPlan(kappaChain, numbering)
    const ranges = Object.fromEntries(plan.features.map((feature) => [feature.name, feature.locations[0]]))

    expect(ranges.FR1).toMatchObject({ start: 0, end: 23 })
    expect(ranges.CDR1).toMatchObject({ start: 23, end: 34 })
    expect(ranges.CDR2).toMatchObject({ start: 49, end: 56 })
    expect(ranges.CDR3).toMatchObject({ start: 88, end: 97 })
    expect(plan.bonds[0].endpoints).toEqual([{ residue: 22 }, { residue: 87 }])
  })

  it('replaces prior automatic annotations while preserving user annotations', async () => {
    const numbering = await detectImmunoglobulinNumbering(heavyChain, 'imgt', 'H')
    const firstPlan = buildImmunoglobulinAnnotationPlan(heavyChain, numbering)
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
    const first = replaceAutomaticImmunoglobulinAnnotations(
      [manualFeature],
      [manualBond],
      firstPlan,
    )
    const second = replaceAutomaticImmunoglobulinAnnotations(
      first.features,
      first.bonds,
      buildImmunoglobulinAnnotationPlan(heavyChain, numbering),
    )

    expect(second.features).toHaveLength(8)
    expect(second.bonds).toHaveLength(2)
    expect(second.features[0]).toBe(manualFeature)
    expect(second.bonds[0]).toBe(manualBond)
  })

  it('marks VHH domains, hallmark residues, and an unambiguous extra CDR disulfide', async () => {
    const vhhWithExtraCysteines = await withKabatResidues(heavyChain, {
      33: 'C',
      37: 'F',
      44: 'E',
      45: 'R',
      47: 'G',
      100: 'C',
    })
    const numbering = await detectImmunoglobulinNumbering(vhhWithExtraCysteines, 'kabat', 'auto')
    const plan = buildImmunoglobulinAnnotationPlan(vhhWithExtraCysteines, numbering)

    expect(numbering.vhh?.subtype).toBe('VHH')
    expect(plan.features.map((feature) => feature.name)).toContain('VHH domain')
    const hallmarks = plan.features.find((feature) => feature.name === 'VHH hallmarks')
    expect(hallmarks?.locations).toHaveLength(4)
    expect(plan.predictedAdditionalBond).toBe(true)
    expect(plan.bonds.map((bond) => bond.name)).toEqual([
      'Canonical V-domain disulfide',
      'Predicted VHH CDR disulfide',
    ])
    expect(plan.bonds[1].endpoints).toEqual([
      { residue: numbering.positions.indexOf('33') },
      { residue: numbering.positions.indexOf('100') },
    ])
  })
})
