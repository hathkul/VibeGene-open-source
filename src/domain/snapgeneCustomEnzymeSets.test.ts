import { describe, expect, it } from 'vitest'
import { defaultEnzymePreferences, normalizeEnzymePreferences } from './enzymePreferences'
import { parseCustomEnzymeSetsXml, serializeCustomEnzymeSetsXml } from './snapgeneCustomEnzymeSets'

describe('SnapGene custom enzyme sets', () => {
  it('reads native self-closing sets and preserves unavailable names', () => {
    const sets = parseCustomEnzymeSetsXml('<?xml version="1.0"?><CustomEnzymeSets><CustomEnzymeSet type="1" name="Test &amp; more" enzymeNames="EcoRI AasI BamHI"/><CustomEnzymeSet type="2" name="Unsaved Enzyme Set" enzymeNames="EcoRI AasI BamHI"/></CustomEnzymeSets>')
    expect(sets.map(({ name, enzymeNames }) => ({ name, enzymeNames }))).toEqual([
      { name: 'Test & more', enzymeNames: ['AasI', 'BamHI', 'EcoRI'] },
      { name: 'Unsaved Enzyme Set', enzymeNames: ['AasI', 'BamHI', 'EcoRI'] },
    ])
    const xml = serializeCustomEnzymeSetsXml(sets)
    expect(xml).toContain('<CustomEnzymeSet type="1" name="Test &amp; more" enzymeNames="AasI BamHI EcoRI"/>')
    expect(xml).toContain('<CustomEnzymeSet type="2" name="Unsaved Enzyme Set"')
    expect(parseCustomEnzymeSetsXml(xml).map((set) => set.enzymeNames)).toEqual(sets.map((set) => set.enzymeNames))
    expect(normalizeEnzymePreferences({ ...defaultEnzymePreferences, savedEnzymeSets: sets }).savedEnzymeSets[0]?.enzymeNames).toContain('AasI')
  })

  it('continues to read older VibeGene set XML', () => {
    const sets = parseCustomEnzymeSetsXml('<CustomEnzymeSets><EnzymeSet name="old"><Enzyme name="EcoRI"/><Enzyme name="BamHI"/></EnzymeSet></CustomEnzymeSets>')
    expect(sets[0]?.enzymeNames).toEqual(['BamHI', 'EcoRI'])
  })
})
