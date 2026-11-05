import { describe, expect, it } from 'vitest'
import { labPlasmid } from '../../domain/fixtures'
import {
  gatewayCloningOpenStatus,
  gibsonAssemblyOpenStatus,
  mutagenesisOpenStatus,
  pcrOpenStatus,
  restrictionCloningOpenStatus,
  taGcCloningOpenStatus,
} from './cloningCompletionPresentation'

describe('cloningCompletionPresentation', () => {
  it('formats restriction cloning status for one and many products', () => {
    expect(restrictionCloningOpenStatus([labPlasmid])).toBe(
      `Opened cloning product ${labPlasmid.name} (${labPlasmid.sequence.length} bp).`,
    )
    expect(restrictionCloningOpenStatus([labPlasmid, labPlasmid])).toBe(
      'Opened 2 restriction-cloning products.',
    )
  })

  it('formats assembly method labels in product status', () => {
    expect(gibsonAssemblyOpenStatus([labPlasmid], 'nebuilder-hifi')).toContain('NEBuilder HiFi')
    expect(taGcCloningOpenStatus([labPlasmid], 'ta')).toContain('TA')
    expect(gatewayCloningOpenStatus([labPlasmid], 'bp')).toContain('BP')
  })

  it('formats mutagenesis and PCR status', () => {
    expect(mutagenesisOpenStatus(labPlasmid)).toContain('mutagenesis product')
    expect(pcrOpenStatus([labPlasmid])).toContain('Opened PCR product')
    expect(pcrOpenStatus([labPlasmid, labPlasmid])).toContain('Saving 2 PCR products')
  })
})
