import { describe, expect, it } from 'vitest'
import { formatEnzymeSetTxt, parseEnzymeSetTxt, mergeEnzymeNameLists, overlapEnzymeNameLists } from '../src/domain/enzymeSetFile'
import { parseCustomEnzymeSetsXml, serializeCustomEnzymeSetsXml } from '../src/domain/snapgeneCustomEnzymeSets'
import { enzymeNamesForStandardSet } from '../src/domain/manageEnzymeSets'

describe('enzymeSetFile', () => {
  it('formats SnapGene-style wrapped enzyme set text', () => {
    const names = [
      'AarI',
      'AatII',
      'AbsI',
      'AccI',
      'Acc65I',
      'AclI',
      'AcuI',
      'AfeI',
      'AflII',
      'AflIII',
      'AgeI',
      'AhdI',
      'BamHI',
      'EcoRI',
      'HindIII',
      'NdeI',
      'NotI',
      'PstI',
      'XbaI',
    ]
    const text = formatEnzymeSetTxt('6+ Cutters', names)
    expect(text.startsWith('6+ Cutters\n\n')).toBe(true)
    const bodyLines = text.trim().split('\n').slice(2)
    expect(bodyLines.some((line) => line.endsWith(','))).toBe(true)
    expect(bodyLines.every((line) => line.length <= 79)).toBe(true)
    const parsed = parseEnzymeSetTxt(text)
    expect(parsed.name).toBe('6+ Cutters')
    expect(parsed.enzymeNames).toEqual([...names].toSorted((left, right) => left.localeCompare(right)))
  })

  it('parses sample export without inventing unknown enzymes', () => {
    const parsed = parseEnzymeSetTxt('Demo\n\nEcoRI, BamHI, NotARealEnzyme\n')
    expect(parsed.enzymeNames).toEqual(['BamHI', 'EcoRI'])
  })

  it('merges and overlaps enzyme lists', () => {
    expect(mergeEnzymeNameLists([['EcoRI', 'BamHI'], ['BamHI', 'NdeI']])).toEqual(['BamHI', 'EcoRI', 'NdeI'])
    expect(overlapEnzymeNameLists([['EcoRI', 'BamHI'], ['BamHI', 'NdeI']])).toEqual(['BamHI'])
  })
})

describe('snapgeneCustomEnzymeSets', () => {
  it('round-trips file-local enzyme sets as block 14 XML', () => {
    const xml = serializeCustomEnzymeSetsXml([
      { id: 'saved-1', name: 'My Set', enzymeNames: ['EcoRI', 'BamHI'] },
    ])
    expect(xml).toContain('<CustomEnzymeSets>')
    expect(xml).toContain('name="My Set"')
    const parsed = parseCustomEnzymeSetsXml(xml)
    expect(parsed).toHaveLength(1)
    expect(parsed[0]?.name).toBe('My Set')
    expect(parsed[0]?.enzymeNames).toEqual(['BamHI', 'EcoRI'])
  })
})

describe('manageEnzymeSets', () => {
  it('resolves unique cutters from parental counts', () => {
    const names = enzymeNamesForStandardSet('unique', {
      EcoRI: 1,
      BamHI: 2,
      NdeI: 1,
      HindIII: 0,
    })
    expect(names).toEqual(['EcoRI', 'NdeI'])
  })
})
