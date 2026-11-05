import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  catalogNameForJenaProduct,
  jenaBufferLabel,
  normalizeJenaActivityValue,
  parseJenaBufferActivity,
  parseJenaHeatInactivation,
  parseJenaIncubation,
  parseJenaMethylation,
} from '../scripts/fetch-jena-buffer-chart'

const root = dirname(fileURLToPath(import.meta.url))
const aluText = readFileSync(join(root, '../scripts/jena-pdf-text.txt'), 'utf8')
const bseText = readFileSync(join(root, '../scripts/jena-pdf-bsebi-text.txt'), 'utf8')

describe('normalizeJenaActivityValue', () => {
  it('normalizes ranges and low activity', () => {
    expect(normalizeJenaActivityValue('10-25')).toBe('10-25')
    expect(normalizeJenaActivityValue('<10')).toBe('<10')
    expect(normalizeJenaActivityValue('75-100')).toBe('75-100')
  })
})

describe('parseJenaBufferActivity', () => {
  it('parses AluI B1-B5 and UB activity', () => {
    const parsed = parseJenaBufferActivity(aluText)
    expect(parsed.preferredBuffer).toBe('ub')
    expect(parsed.bufferActivity).toMatchObject({
      b1: '100',
      b2: '100',
      b3: '75',
      b4: '10-25',
      b5: '75',
      ub: '100',
    })
  })

  it('parses BseBI with B2 optimum among legacy buffers', () => {
    const parsed = parseJenaBufferActivity(bseText)
    expect(parsed.bufferActivity.b2).toBe('100')
    expect(parsed.bufferActivity.ub).toBe('100')
    expect(parsed.preferredBuffer).toBe('ub')
  })
})

describe('parseJenaIncubation', () => {
  it('parses JBSpeed incubation times', () => {
    expect(parseJenaIncubation(aluText)).toMatchObject({ incubationC: 37, incubationMinutes: 10 })
    expect(parseJenaIncubation(bseText)).toMatchObject({ incubationC: 60, incubationMinutes: 10 })
  })
})

describe('parseJenaHeatInactivation', () => {
  it('parses heat inactivation from protocol text', () => {
    expect(parseJenaHeatInactivation(aluText)).toBe('65°C for 20 min')
  })
})

describe('parseJenaMethylation', () => {
  it('parses no inhibition notes', () => {
    expect(parseJenaMethylation(aluText)).toMatchObject({
      dam: 'No Effect',
      dcm: 'No Effect',
      ecoKI: 'No Effect',
    })
  })
})

describe('catalogNameForJenaProduct', () => {
  it('maps trade names to catalog enzymes', () => {
    const catalog = new Set(['BstNI', 'StuI', 'BamHI'])
    expect(catalogNameForJenaProduct('BseBI', ['BstNI', 'BstOI'], catalog)).toBe('BstNI')
    expect(catalogNameForJenaProduct('SseBI', ['AatI', 'StuI'], catalog)).toBe('StuI')
    expect(catalogNameForJenaProduct('BamHI', [], catalog)).toBe('BamHI')
  })
})

describe('jenaBufferLabel', () => {
  it('labels universal and legacy buffers', () => {
    expect(jenaBufferLabel('ub')).toBe('10× Universal Buffer (UB)')
    expect(jenaBufferLabel('b3')).toBe('10× Buffer B3')
  })
})
