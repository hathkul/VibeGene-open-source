import { describe, expect, it } from 'vitest'
import {
  applyBinderNumbering,
  BINDER_TYPE_OPTIONS,
  detectBinderStructure,
  numberingSchemesForBinder,
  selectBinderStructure,
} from '../src/domain/binderStructure'

const heavyChain =
  'QVQLVQSGAEVKRPGSSVTVSCKASGGSFSTYALSWVRQAPGRGLEWMGGVIPLLTITNYAPRFQGRITITADRSTSTAYLELNSLRPEDTAVYYCAREGTTGKPIGAFAHWGQGTLVTVSS'
const kappaChain =
  'DIQMTQSPSSLSASVGDRVTITCRASQDVNTAVAWYQQKPGKAPKLLIYSASFLYSGVPSRFSGSRSGTDFTLTISSLQPEDFATYYCQQHYTTPPTFGQGTKVEIK'
const linker = 'GGGGSGGGGSGGGGS'
const vhvl = heavyChain + linker + kappaChain
const e35 =
  'MRGSHHHHHHGSDLGKKLLEAARAGQDDEVRILMANGADVNATDNDGYTPLHLAASNGHLEIVEVLLKNGADVNASDLTGITPLHLAAATGHLEIVEVLLKHGADVNAYDNDGHTPLHLAAKYGHLEIVEVLLKHGADVNAQDKFGKTAFDISIDNGNEDLAEILQ'

describe('binder structure detection', () => {
  it('prefers scFv over a single immunoglobulin domain', async () => {
    const structure = await detectBinderStructure(vhvl)
    expect(structure.kind).toBe('scfv')
    expect(structure.label).toContain('VH-VL')
    expect(numberingSchemesForBinder(structure.kind).map((scheme) => scheme.id)).toEqual(['imgt', 'kabat'])
  })

  it('detects immunoglobulin and DARPin structures', async () => {
    const ig = await detectBinderStructure(heavyChain)
    expect(ig.kind).toBe('immunoglobulin')
    expect(ig.label).toMatch(/VH|VHH/)

    const darpin = await detectBinderStructure(e35)
    expect(darpin.kind).toBe('darpin')
    expect(darpin.label).toContain('N3C')
    expect(numberingSchemesForBinder(darpin.kind)).toEqual([{ id: 'darpin', label: 'Module' }])
  })

  it('applies scheme-specific numbering after structure detection', async () => {
    const scfv = await detectBinderStructure(vhvl)
    const numbered = await applyBinderNumbering(vhvl, scfv, 'kabat')
    expect(numbered.kind).toBe('scfv')
    expect(numbered.schemeId).toBe('kabat')
    expect(numbered.positions[0]).toBe('VH.1')

    const ig = await detectBinderStructure(kappaChain)
    const igNumbered = await applyBinderNumbering(kappaChain, ig, 'imgt')
    expect(igNumbered.kind).toBe('immunoglobulin')
    expect(igNumbered.data.chain).toBe('K')

    const darpin = await detectBinderStructure(e35)
    const darpinNumbered = await applyBinderNumbering(e35, darpin, 'darpin')
    expect(darpinNumbered.kind).toBe('darpin')
    expect(darpinNumbered.positions.some((label) => label?.startsWith('1.'))).toBe(true)
  })

  it('lists recognized binder types and supports manual selection', async () => {
    expect(BINDER_TYPE_OPTIONS.map((option) => option.id)).toEqual([
      'scfv', 'immunoglobulin', 'VH', 'VHH', 'VL',
      'tcr', 'TCR-AB', 'TCR-GD', 'TCR-A', 'TCR-B', 'TCR-G', 'TCR-D',
      'vnar', 'darpin',
    ])

    const vh = await selectBinderStructure(heavyChain, 'VH')
    expect(vh.kind).toBe('immunoglobulin')
    expect(vh.manual).toBe(true)
    expect(vh.immunoglobulinChain).toBe('H')

    const scfv = await selectBinderStructure(vhvl, 'scfv')
    expect(scfv.kind).toBe('scfv')
    expect(scfv.manual).toBe(true)

    await expect(selectBinderStructure(heavyChain, 'darpin')).rejects.toThrow()

    const vnarSeq =
      'AWVDQTPRTITKETGESLTIKCVLKDHSCGLSSTTWYRTQLGSTNEKTISIGGRYDETVDKGSKSFSLRISDLRVEDSGTYKCQADYSPSCYSYPSLESAVEGAGTVLTVK'
    const vnar = await selectBinderStructure(vnarSeq, 'vnar')
    expect(vnar.kind).toBe('vnar')
    expect(vnar.label).toContain('type')
    const numbered = await applyBinderNumbering(vnarSeq, vnar, 'vnar')
    expect(numbered.kind).toBe('vnar')
    expect(numbered.positions.some((label) => label?.startsWith('HV2.'))).toBe(true)
  })
})

describe('binder structure VNAR auto-detect', () => {
  it('detects VNAR domains in preference to immunoglobulin when motifs are strong', async () => {
    const vnarSeq =
      'AWVDQTPRTITKETGESLTIKCVLKDHSCGLSSTTWYRTQLGSTNEKTISIGGRYDETVDKGSKSFSLRISDLRVEDSGTYKCQADYSPSCYSYPSLESAVEGAGTVLTVK'
    const structure = await detectBinderStructure(vnarSeq)
    expect(structure.kind).toBe('vnar')
    expect(numberingSchemesForBinder(structure.kind)).toEqual([{ id: 'vnar', label: 'VNAR' }])
  })
})
