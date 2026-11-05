import { describe, expect, it } from 'vitest'
import { defaultConstructProperties, effectiveHostMethylation, methylationForStrain } from '../src/domain/constructProperties'
import {
  annotateRestrictionSiteMethylation,
  enzymeMethylationSensitivity,
  formatEnzymeLabelName,
  parseMethylationSensitivity,
  resolveSiteMethylationDisplay,
} from '../src/domain/methylation'
import { methylationDisplayStrings } from '../src/domain/methylationRules'
import { findRestrictionSites } from '../src/domain/enzymes'
import { enzymes } from '../src/domain/enzymes'

describe('parseMethylationSensitivity', () => {
  it('classifies blocked, required, and neutral notes', () => {
    expect(parseMethylationSensitivity('No Effect')).toBe('none')
    expect(parseMethylationSensitivity('Blocked by Dam methylation')).toBe('blocked')
    expect(parseMethylationSensitivity('Requires Dam methylation')).toBe('required')
    expect(parseMethylationSensitivity('Potential inhibition (CpG)')).toBe('blocked')
    expect(parseMethylationSensitivity('Sensitive; NEB chart substrate is dam-')).toBe('none')
  })
})

describe('resolveSiteMethylationDisplay', () => {
  const mboi = enzymes.find((enzyme) => enzyme.name === 'MboI')
  const dpni = enzymes.find((enzyme) => enzyme.name === 'DpnI')
  const xbai = enzymes.find((enzyme) => enzyme.name === 'XbaI')
  const mspji = enzymes.find((enzyme) => enzyme.name === 'MspJI')

  it('blocks Dam-sensitive enzymes when GATC is methylated', () => {
    expect(mboi).toBeTruthy()
    const sequence = `AAAA${'N'.repeat(20)}GATC${'N'.repeat(20)}AAAA`
    const sites = findRestrictionSites(sequence, [mboi!])
    expect(sites.length).toBeGreaterThan(0)
    const annotated = annotateRestrictionSiteMethylation(sites, sequence, {
      ...defaultConstructProperties,
      syntheticDna: true,
      hostMethylation: { dam: true, dcm: false, ecoKI: false },
    })
    expect(annotated[0]?.methylationDisplay).toBe('blocked')
  })

  it('does not block BamHI on Dam-methylated GATC', () => {
    const bamhi = enzymes.find((enzyme) => enzyme.name === 'BamHI')
    expect(bamhi).toBeTruthy()
    const sequence = `AAAA${'N'.repeat(20)}GGATCC${'N'.repeat(20)}AAAA`
    const sites = findRestrictionSites(sequence, [bamhi!])
    expect(sites.length).toBeGreaterThan(0)
    const annotated = annotateRestrictionSiteMethylation(sites, sequence, {
      ...defaultConstructProperties,
      syntheticDna: true,
      hostMethylation: { dam: true, dcm: false, ecoKI: false },
    })
    expect(annotated[0]?.methylationDisplay).toBe('normal')
  })

  it('blocks XbaI only when overlapping Dam context is present', () => {
    expect(xbai).toBeTruthy()
    const blockedSequence = `AAAA${'N'.repeat(10)}GATCTAGA${'N'.repeat(10)}AAAA`
    const normalSequence = `AAAA${'N'.repeat(10)}TTCTAGA${'N'.repeat(10)}AAAA`
    const host = { dam: true, dcm: false, ecoKI: false }
    const blockedSites = findRestrictionSites(blockedSequence, [xbai!])
    const normalSites = findRestrictionSites(normalSequence, [xbai!])
    expect(blockedSites.length).toBeGreaterThan(0)
    expect(normalSites.length).toBeGreaterThan(0)
    expect(resolveSiteMethylationDisplay(blockedSites[0]!, blockedSequence, host)).toBe('blocked')
    expect(resolveSiteMethylationDisplay(normalSites[0]!, normalSequence, host)).toBe('normal')
  })

  it('requires methylation for DpnI on methylated GATC', () => {
    expect(dpni).toBeTruthy()
    const sequence = `AAAA${'N'.repeat(20)}GATC${'N'.repeat(20)}AAAA`
    const sites = findRestrictionSites(sequence, [dpni!])
    expect(sites.length).toBeGreaterThan(0)
    const host = { dam: true, dcm: false, ecoKI: false }
    expect(resolveSiteMethylationDisplay(sites[0]!, sequence, host)).toBe('methyl-required-available')
    expect(resolveSiteMethylationDisplay(sites[0]!, sequence, { dam: false, dcm: false, ecoKI: false })).toBe(
      'methyl-required-unavailable',
    )
  })

  it('only reports MspJI sites with overlapping Dcm context', () => {
    expect(mspji).toBeTruthy()
    const withDcm = `AAAA${'N'.repeat(5)}CCAGG${'N'.repeat(5)}AAAA`
    const bareCnnr = `AAAA${'N'.repeat(5)}ACGTA${'N'.repeat(5)}AAAA`
    const construct = {
      ...defaultConstructProperties,
      syntheticDna: true,
      hostMethylation: { dam: true, dcm: true, ecoKI: false },
    }
    const withDcmSites = findRestrictionSites(withDcm, [mspji!], { construct })
    const bareSites = findRestrictionSites(bareCnnr, [mspji!], { construct })
    expect(withDcmSites.length).toBeGreaterThan(0)
    expect(bareSites.length).toBe(0)
  })

  it('clears methylation when natural DNA is selected', () => {
    const construct = {
      ...defaultConstructProperties,
      syntheticDna: false,
      hostMethylation: { dam: true, dcm: true, ecoKI: true },
    }
    expect(effectiveHostMethylation(construct)).toEqual({ dam: false, dcm: false, ecoKI: false })
  })

  it('applies host methylation when synthetic DNA is selected', () => {
    const construct = {
      ...defaultConstructProperties,
      syntheticDna: true,
      hostMethylation: { dam: true, dcm: false, ecoKI: true },
    }
    expect(effectiveHostMethylation(construct)).toEqual({ dam: true, dcm: false, ecoKI: true })
  })
})

describe('formatEnzymeLabelName', () => {
  it('adds an asterisk for blocked and methyl-required-available sites', () => {
    expect(formatEnzymeLabelName('MboI', 'blocked')).toBe('MboI*')
    expect(formatEnzymeLabelName('DpnI', 'methyl-required-available')).toBe('DpnI*')
    expect(formatEnzymeLabelName('EcoRI', 'normal')).toBe('EcoRI')
    expect(formatEnzymeLabelName('CviJI(*)', 'blocked')).toBe('CviJI(*)*')
  })
})

describe('methylationForStrain', () => {
  it('returns Dam+/Dcm+ for DH5α and Dam+/Dcm− EcoKI− for GT116', () => {
    expect(methylationForStrain('dh5alpha')).toEqual({ dam: true, dcm: true, ecoKI: true })
    expect(methylationForStrain('gt116')).toEqual({ dam: true, dcm: false, ecoKI: false })
  })

  it('sets SURE/SURE2 as Dam+/Dcm+ EcoKI− (not dam−/dcm−)', () => {
    expect(methylationForStrain('sure')).toEqual({ dam: true, dcm: true, ecoKI: false })
    expect(methylationForStrain('sure2')).toEqual({ dam: true, dcm: true, ecoKI: false })
  })

  it('sets dam−/dcm− strains correctly including EcoKI methylase', () => {
    expect(methylationForStrain('jm110')).toEqual({ dam: false, dcm: false, ecoKI: true })
    expect(methylationForStrain('gm2163')).toEqual({ dam: false, dcm: false, ecoKI: true })
    expect(methylationForStrain('er2925')).toEqual({ dam: false, dcm: false, ecoKI: true })
  })

  it('clears EcoKI for ΔhsdRMS cloning strains and keeps Dam+/Dcm+', () => {
    expect(methylationForStrain('top10')).toEqual({ dam: true, dcm: true, ecoKI: false })
    expect(methylationForStrain('dh10b')).toEqual({ dam: true, dcm: true, ecoKI: false })
    expect(methylationForStrain('stbl3')).toEqual({ dam: true, dcm: true, ecoKI: false })
    expect(methylationForStrain('neb-stable')).toEqual({ dam: true, dcm: true, ecoKI: false })
  })

  it('keeps B-strain expression hosts as Dam+/Dcm− EcoKI−', () => {
    expect(methylationForStrain('bl21')).toEqual({ dam: true, dcm: false, ecoKI: false })
    expect(methylationForStrain('rosetta')).toEqual({ dam: true, dcm: false, ecoKI: false })
  })
})

describe('enzymeMethylationSensitivity', () => {
  it('reads structured methylation rules for DpnI and XbaI', () => {
    const dpni = enzymes.find((enzyme) => enzyme.name === 'DpnI')
    const xbai = enzymes.find((enzyme) => enzyme.name === 'XbaI')
    const nari = enzymes.find((enzyme) => enzyme.name === 'NarI')
    expect(dpni).toBeTruthy()
    expect(xbai).toBeTruthy()
    expect(nari).toBeTruthy()
    expect(enzymeMethylationSensitivity(dpni!).dam).toBe('required')
    expect(enzymeMethylationSensitivity(xbai!).dam).toBe('blocked')
    expect(enzymeMethylationSensitivity(nari!).dam).toBe('none')
  })
})

describe('methylationDisplayStrings', () => {
  it('uses solid descriptions instead of NEB chart substrate notes', () => {
    expect(methylationDisplayStrings({ name: 'XbaI', recognition: 'TCTAGA' }).dam).toBe(
      'Blocked by Dam methylation (overlapping GATC)',
    )
    expect(methylationDisplayStrings({ name: 'NarI', recognition: 'GGCGCC' }).dam).toBe('No Effect')
    expect(methylationDisplayStrings({ name: 'SexAI', recognition: 'ACCWGGT' }).dcm).toBe(
      'Blocked by Dcm methylation (overlapping CCWGG)',
    )
    expect(methylationDisplayStrings({ name: 'BsaI', recognition: 'GGTCTC' }).dcm).toBe(
      'Blocked by Dcm methylation (overlapping CCWGG)',
    )
    expect(methylationDisplayStrings({ name: 'StuI', recognition: 'AGGCCT' }).dcm).toBe(
      'Blocked by Dcm methylation (overlapping CCWGG)',
    )
  })
})

describe('overlapping Dcm blocking', () => {
  const host = { dam: false, dcm: true, ecoKI: false }

  it('blocks BsaI when GGTCTC overlaps a Dcm site', () => {
    const bsaI = enzymes.find((enzyme) => enzyme.name === 'BsaI')
    expect(bsaI).toBeTruthy()
    const sequence = `AAAA${'N'.repeat(5)}GGTCTCCAGG${'N'.repeat(5)}AAAA`
    const sites = findRestrictionSites(sequence, [bsaI!])
    expect(sites.length).toBeGreaterThan(0)
    expect(resolveSiteMethylationDisplay(sites[0]!, sequence, host)).toBe('blocked')
  })

  it('blocks BsmFI when GGGAC overlaps a Dcm site', () => {
    const bsmfi = enzymes.find((enzyme) => enzyme.name === 'BsmFI')
    expect(bsmfi).toBeTruthy()
    const sequence = `AAAA${'N'.repeat(5)}GGGACCAGG${'N'.repeat(5)}AAAA`
    const sites = findRestrictionSites(sequence, [bsmfi!])
    expect(sites.length).toBeGreaterThan(0)
    expect(resolveSiteMethylationDisplay(sites[0]!, sequence, host)).toBe('blocked')
  })

  it('blocks StuI only when overlapping Dcm context is present', () => {
    const stui = enzymes.find((enzyme) => enzyme.name === 'StuI')
    expect(stui).toBeTruthy()
    const blockedSequence = `AAAA${'N'.repeat(5)}CCAGGCCT${'N'.repeat(5)}AAAA`
    const normalSequence = `AAAA${'N'.repeat(5)}TTAGGCCT${'N'.repeat(5)}AAAA`
    const blockedSites = findRestrictionSites(blockedSequence, [stui!])
    const normalSites = findRestrictionSites(normalSequence, [stui!])
    expect(blockedSites.length).toBeGreaterThan(0)
    expect(normalSites.length).toBeGreaterThan(0)
    expect(resolveSiteMethylationDisplay(blockedSites[0]!, blockedSequence, host)).toBe('blocked')
    expect(resolveSiteMethylationDisplay(normalSites[0]!, normalSequence, host)).toBe('normal')
  })

  it('does not mark PvuI as Dcm-blocked without overlap context', () => {
    const pvui = enzymes.find((enzyme) => enzyme.name === 'PvuI')
    expect(pvui).toBeTruthy()
    expect(methylationDisplayStrings(pvui!).dcm).toBe('No Effect')
    const sequence = `AAAA${'N'.repeat(5)}CGATCG${'N'.repeat(5)}AAAA`
    const sites = findRestrictionSites(sequence, [pvui!])
    expect(sites.length).toBeGreaterThan(0)
    expect(resolveSiteMethylationDisplay(sites[0]!, sequence, host)).toBe('normal')
  })
})
