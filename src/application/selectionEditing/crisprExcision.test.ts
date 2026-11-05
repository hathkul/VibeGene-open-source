import { describe, expect, it } from 'vitest'
import { cloneFixture } from '../../domain/fixtures'
import { themeFixturePalette } from '../../test-support/themeFixturePalette'
import { createSgRNAFeatures, findSgRNATargets, groupSgRNAFeatures, SGRNA_PRESETS } from '../../domain/sgrna'
import { reverseComplement } from '../../domain/sequence'
import { applyCrisprExcision, planCrisprExcision } from './crisprExcision'

const guideA = 'ACGTACGTACGTACGTACGA'
const guideB = 'GCTAGCTAGCTAGCTAGCTA'
function setup(topology: 'linear' | 'circular' = 'linear') {
  const sequence = `TTT${guideA}AGG${'T'.repeat(8)}${guideB}TGGAAAA`
  const features = [guideA, guideB].flatMap((spacer, index) => {
    const hit = findSgRNATargets(sequence, spacer, topology, SGRNA_PRESETS[0]!)[0]!
    return createSgRNAFeatures(hit, { id: `guide-${index}`, name: `Guide ${index}`, nuclease: 'SpCas9', pamMotif: 'NGG', pamSide: '3prime', spacer })
  })
  const record = { ...cloneFixture(), sequence, topology, features, primers: [] }
  const guides = groupSgRNAFeatures(features)
  return { record, guides }
}

describe('CRISPR excision', () => {
  it('plans two Cas12a sites and a mixed Cas9/Cas12a pair', () => {
    const sequence = `CCCTTTA${guideA}AAAAAA${'C'.repeat(10)}TTTT${guideB}AAAAAA${'C'.repeat(10)}${guideA}AGGAAA`
    const features = [
      { spacer: guideA, options: { ...SGRNA_PRESETS[2]!, pamMotif: 'TTTN' }, name: 'Cas12a A' },
      { spacer: guideB, options: { ...SGRNA_PRESETS[2]!, pamMotif: 'TTTN' }, name: 'Cas12a B' },
      { spacer: guideA, options: SGRNA_PRESETS[0]!, name: 'Cas9' },
    ].flatMap(({ spacer, options, name }) => {
      const hit = findSgRNATargets(sequence, spacer, 'linear', options)[0]!
      return createSgRNAFeatures(hit, { id: name, name, nuclease: options.id, pamMotif: options.pamMotif, pamSide: options.pamSide, spacer })
    })
    const record = { ...cloneFixture(), sequence, topology: 'linear' as const, features, primers: [] }
    const annotations = groupSgRNAFeatures(features)
    const pair = planCrisprExcision(record, annotations.slice(0, 2))!
    expect(pair.sites.map((site) => site.bottom - site.top)).toEqual([5, 5])
    const mixed = planCrisprExcision(record, [annotations[1]!, annotations[2]!])!
    expect(mixed.sites.map((site) => site.bottom - site.top)).toEqual([5, 0])
  })
  it('removes the interval between cuts and invalidates cut guide annotations', () => {
    const { record, guides } = setup()
    const plan = planCrisprExcision(record, guides)!
    expect(plan.cuts).toEqual([20, 51])
    const edited = applyCrisprExcision(record, plan, 'between')
    expect(edited.sequence).toBe(record.sequence.slice(0, 20) + record.sequence.slice(51))
    expect(edited.features).toEqual([])
    expect(edited.topology).toBe('linear')
    expect(() => applyCrisprExcision(record, plan, 'across-origin')).toThrow()
  })

  it('removes either arc of a circular molecule and keeps its topology', () => {
    const { record, guides } = setup('circular')
    const plan = planCrisprExcision(record, guides)!
    const between = applyCrisprExcision(record, plan, 'between')
    const across = applyCrisprExcision(record, plan, 'across-origin')
    expect(between.sequence).toBe(record.sequence.slice(0, 20) + record.sequence.slice(51))
    expect(across.sequence).toBe(record.sequence.slice(20, 51))
    expect(across.topology).toBe('circular')
    expect(across.features).toEqual([])
  })

  it('rejects stale, unsupported, incomplete, and identical selections', () => {
    const { record, guides } = setup()
    expect(planCrisprExcision(record, [guides[0]!])).toBeNull()
    expect(planCrisprExcision(record, [guides[0]!, guides[0]!])).toBeNull()
    const altered = { ...record, sequence: `${record.sequence.slice(0, 5)}A${record.sequence.slice(6)}` }
    expect(planCrisprExcision(altered, guides)).toBeNull()
    const missingPam = { ...record, features: record.features.filter((feature) => feature.id !== guides[0]!.pam!.id) }
    expect(planCrisprExcision(missingPam, guides)).toBeNull()
  })

  it('accepts a reverse-strand guide and retains unaffected feature coordinates', () => {
    const sequence = `AAA${guideA}AGG${'T'.repeat(8)}CCA${reverseComplement(guideB)}AAAA`
    const guides = [guideA, guideB].flatMap((spacer, index) => createSgRNAFeatures(
      findSgRNATargets(sequence, spacer, 'linear', SGRNA_PRESETS[0]!)[0]!,
      { id: `g${index}`, name: `g${index}`, nuclease: 'SpCas9', pamMotif: 'NGG', pamSide: '3prime', spacer },
    ))
    const feature = { id: 'retained', name: 'retained', type: 'misc_feature', color: themeFixturePalette.gray, locations: [{ start: sequence.length - 4, end: sequence.length, strand: 'forward' as const }] }
    const record = { ...cloneFixture(), sequence, topology: 'linear' as const, features: [...guides, feature], primers: [] }
    const plan = planCrisprExcision(record, groupSgRNAFeatures(guides))!
    expect(plan.cuts).toEqual([20, 40])
    const result = applyCrisprExcision(record, plan, 'between')
    expect(result.features.find((item) => item.id === 'retained')?.locations[0]).toMatchObject({ start: sequence.length - 24, end: sequence.length - 20 })
  })
})
