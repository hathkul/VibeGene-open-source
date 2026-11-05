import { describe, expect, it } from 'vitest'
import { enzymes, findRestrictionSites } from './enzymes'
import { defaultEnzymePreferences, enzymePoolForSettings } from './enzymePreferences'
import { buildManageStandardItems, enzymeNamesForStandardSet, parseManageSetKey } from './manageEnzymeSets'
import { filterRestrictionSitesForEnzymeSet } from './restrictionSiteFilters'
import { snapGeneExportOptionsFromEnzymeDisplay } from './snapgeneEnzymeData'
import { cloneFixture } from './fixtures'
import { isTypeIisEnzyme } from './typeIisEnzymes'

const settings = { set: 'type-iis' as const, selectedNames: [], supplierSetId: null }

describe('Type IIS built-in enzyme set', () => {
  it('selects single-sided flanking cutters rather than within-site and Type IIB enzymes', () => {
    const names = enzymePoolForSettings(settings, defaultEnzymePreferences).map((enzyme) => enzyme.name)
    for (const name of ['BsaI', 'BsmBI', 'BbsI', 'SapI', 'FokI']) expect(names).toContain(name)
    for (const name of ['EcoRI', 'AciI', 'BbvCI', 'AloI', 'BcgI']) expect(names).not.toContain(name)
    expect(enzymes.find((enzyme) => enzyme.name === 'AciI')?.type).toBe('IIS')
    expect(isTypeIisEnzyme(enzymes.find((enzyme) => enzyme.name === 'AciI')!)).toBe(false)
  })

  it('uses the full set for management and export, including noncutters', () => {
    const names = enzymeNamesForStandardSet('type-iis', {})
    expect(names).toContain('BsaI')
    expect(parseManageSetKey('standard:type-iis')).toEqual({ scope: 'standard', id: 'type-iis' })
    expect(buildManageStandardItems({}).find((item) => item.label === 'Type IIS')?.enzymeNames).toEqual(names)
    const exported = snapGeneExportOptionsFromEnzymeDisplay(settings, cloneFixture())
    expect(exported.customEnzymeNames).toContain('BsaI')
    expect(exported.customEnzymeNames).not.toContain('EcoRI')
  })

  it('filters restriction sites using the same set rule', () => {
    const catalog = enzymes.filter((enzyme) => ['EcoRI', 'BsaI'].includes(enzyme.name))
    const sites = findRestrictionSites(`AAAAAGGTCTCAAAAAGAATTCAAAAA`, catalog)
    expect(new Set(sites.map((site) => site.enzyme.name))).toEqual(new Set(['BsaI', 'EcoRI']))
    expect(new Set(filterRestrictionSitesForEnzymeSet(sites, settings).map((site) => site.enzyme.name))).toEqual(new Set(['BsaI']))
  })
})
