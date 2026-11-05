import { describe, expect, it } from 'vitest'
import {
  buildTcrAnnotationPlan,
  isAutomaticTcrAnnotation,
  replaceAutomaticTcrAnnotations,
} from '../src/domain/tcrAnnotations'
import { detectTcrNumbering } from '../src/domain/tcrNumbering'
import {
  detectBinderStructure,
  selectBinderStructure,
} from '../src/domain/binderStructure'
import type { ProteinBond, SequenceFeature } from '../src/domain/types'

/** immunum fixture 1AO7_D (human TRA). */
const tra =
  'KEVEQNSGPLSVPEGAIASLNCTYSDRGSQSFFWYRQYSGKSPELIMSIYSNGDKEDGRFTAQLNKASQYVSLLIRDSQPSDSATYLCAVTTDSWGKLQFGAGTQVVVTP'
/** immunum fixture 1AO7_E (human TRB). */
const trb =
  'GVTQTPKFQVLKTGQSMTLQCAQDMNHEYMSWYRQDPGMGLRLIHYSVGAGITDQGEVPNGYNVSRSTTEDFPLRLLSAAPSQTSVYFCASRPGLAGGRPEQYFGPGTRLTVTE'
/** immunum fixture 1HXM_B (human TRG). */
const trg =
  'AGHLEQPQISSTKTLSKTARLECVVSGITISATSVYWYRERPGEVIQFLVSISYDGTVRKESGIPSGKFEVDRIPETSTSTLTIHNVEKQDIATYYCALWEAQQEGLKKIKVFGPGTKLIITD'
/** immunum fixture 4LFH_D (human TRD). */
const trd =
  'QKVTQAQSSVSMPVRKAVTLNCLYETSWWSYYIFWYKQLPSKEMIFLIRQGSDEQNAKSGRYSVNFKKAAKSVALTISALQLEDSAKYFCALGDPGGNLTDKLIFGKGTRVTVEP'

const antibodyHeavy =
  'QVQLVQSGAEVKRPGSSVTVSCKASGGSFSTYALSWVRQAPGRGLEWMGGVIPLLTITNYAPRFQGRITITADRSTSTAYLELNSLRPEDTAVYYCAREGTTGKPIGAFAHWGQGTLVTVSS'

describe('TCR numbering', () => {
  it('detects TRA/TRB/TRG/TRD chains with IMGT numbering', async () => {
    await expect(detectTcrNumbering(tra, 'imgt', 'A')).resolves.toMatchObject({ chain: 'A', scheme: 'imgt' })
    await expect(detectTcrNumbering(trb, 'imgt', 'B')).resolves.toMatchObject({ chain: 'B' })
    await expect(detectTcrNumbering(trg, 'imgt', 'G')).resolves.toMatchObject({ chain: 'G' })
    await expect(detectTcrNumbering(trd, 'imgt', 'D')).resolves.toMatchObject({ chain: 'D' })

    const autoBeta = await detectTcrNumbering(trb, 'imgt', 'auto')
    expect(autoBeta.chain).toBe('B')
    expect(autoBeta.positions[autoBeta.queryStart]).toBeTruthy()
    expect(trb[autoBeta.positions.indexOf('23')]).toBe('C')
    expect(trb[autoBeta.positions.indexOf('104')]).toBe('C')
  })

  it('supports α/β and γ/δ group filters and rejects antibodies', async () => {
    await expect(detectTcrNumbering(tra, 'imgt', 'AB')).resolves.toMatchObject({ chain: 'A' })
    await expect(detectTcrNumbering(trg, 'imgt', 'GD')).resolves.toMatchObject({ chain: 'G' })
    await expect(detectTcrNumbering(antibodyHeavy, 'imgt', 'auto')).rejects.toThrow()
  })
})

describe('TCR annotation', () => {
  it('annotates TCR domain, FR/CDR regions, and canonical disulfide', async () => {
    const numbering = await detectTcrNumbering(trb, 'imgt', 'B')
    const plan = buildTcrAnnotationPlan(trb, numbering)
    expect(plan.features.map((feature) => feature.name)).toEqual([
      'TCR β domain',
      'FR1', 'CDR1', 'FR2', 'CDR2', 'FR3', 'CDR3', 'FR4',
    ])
    expect(plan.features.every(isAutomaticTcrAnnotation)).toBe(true)
    expect(plan.bonds).toHaveLength(1)
    expect(plan.missingCanonicalBond).toBe(false)
  })

  it('replaces prior automatic annotations while preserving user annotations', async () => {
    const numbering = await detectTcrNumbering(tra, 'imgt', 'A')
    const plan = buildTcrAnnotationPlan(tra, numbering)
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
    const first = replaceAutomaticTcrAnnotations([manualFeature], [manualBond], plan)
    const second = replaceAutomaticTcrAnnotations(first.features, first.bonds, plan)
    expect(second.features[0]).toBe(manualFeature)
    expect(second.bonds[0]).toBe(manualBond)
  })
})

describe('binder structure TCR integration', () => {
  it('auto-detects and manually selects TCR chains', async () => {
    const detected = await detectBinderStructure(trb)
    expect(detected.kind).toBe('tcr')
    expect(detected.label).toBe('TCR β')

    const selected = await selectBinderStructure(tra, 'TCR-A')
    expect(selected.kind).toBe('tcr')
    expect(selected.manual).toBe(true)
    expect(selected.tcrChain).toBe('A')

    const ab = await selectBinderStructure(trb, 'TCR-AB')
    expect(ab.tcrChain).toBe('AB')
  })
})
