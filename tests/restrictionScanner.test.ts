import { describe, expect, it } from 'vitest'
import {
  enzymes,
  findRestrictionSites,
  findRestrictionSitesLegacy,
} from '../src/domain/enzymes'
import { labPlasmid } from '../src/domain/fixtures'
import type { RestrictionSite } from '../src/domain/types'

function siteKey(site: RestrictionSite) {
  return [
    site.enzyme.name,
    site.start,
    site.end,
    site.cutTop,
    site.cutBottom,
    site.match,
    site.methylationDisplay ?? '',
  ].join('\0')
}

describe('compiled restriction scanner', () => {
  it('matches the legacy scanner for the full catalog', () => {
    const options = {
      construct: labPlasmid.construct,
      topology: labPlasmid.topology,
      annotateMethylation: true,
      noCache: true,
    } as const
    const legacy = findRestrictionSitesLegacy(labPlasmid.sequence, enzymes, options)
    const compiled = findRestrictionSites(labPlasmid.sequence, enzymes, options)
    expect(compiled.map(siteKey)).toEqual(legacy.map(siteKey))
  })

  it('orders equal-position enzyme sites independently of the host locale', () => {
    const ecoRI = enzymes.find((enzyme) => enzyme.name === 'EcoRI')!
    const catalog = [
      { ...ecoRI, name: 'a' },
      { ...ecoRI, name: 'A' },
    ]

    expect(findRestrictionSites('GAATTC', catalog, { topology: 'linear', noCache: true }).map((site) => site.enzyme.name)).toEqual(['A', 'a'])
    expect(findRestrictionSitesLegacy('GAATTC', catalog, { topology: 'linear' }).map((site) => site.enzyme.name)).toEqual(['A', 'a'])
  })

  it('finds origin-spanning sites only for circular DNA', () => {
    const ecoRI = enzymes.find((enzyme) => enzyme.name === 'EcoRI')!
    const sequence = 'AATTCG'
    expect(findRestrictionSites(sequence, [ecoRI], { topology: 'linear', noCache: true })).toHaveLength(0)
    const circular = findRestrictionSites(sequence, [ecoRI], { topology: 'circular', noCache: true })
    expect(circular).toHaveLength(1)
    expect(circular[0]?.start).toBe(5)
    expect(circular[0]?.end).toBe(5)
  })

  it('caps retained counts for fast unique previews', () => {
    const ecoRI = enzymes.find((enzyme) => enzyme.name === 'EcoRI')!
    const sequence = 'GAATTCAAAGAATTCAAAGAATTC'
    const sites = findRestrictionSites(sequence, [ecoRI], {
      topology: 'linear',
      maxSitesPerEnzyme: 2,
      noCache: true,
    })
    expect(sites).toHaveLength(2)
  })
})
