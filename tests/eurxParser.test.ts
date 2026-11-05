import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  catalogNameForEurxProduct,
  eurxBufferLabel,
  normalizeEurxActivityValue,
  parseEurxHeatInactivation,
  parseEurxIncubation,
  parseEurxMethylation,
  preferredBufferFromReactionText,
} from '../scripts/fetch-eurx-buffer-chart'
import { eurxNotationFor } from '../scripts/eurx-recognition-chart'

const root = dirname(fileURLToPath(import.meta.url))
const ecoriText = readFileSync(join(root, '../scripts/eurx-pdf-ecori-text.txt'), 'utf8')
const salilsText = readFileSync(join(root, '../scripts/eurx-pdf-salils-text.txt'), 'utf8')

describe('normalizeEurxActivityValue', () => {
  it('normalizes NR and percentages', () => {
    expect(normalizeEurxActivityValue('NR')).toBe('NR')
    expect(normalizeEurxActivityValue('100%')).toBe('100%')
    expect(normalizeEurxActivityValue('–')).toBe('')
  })
})

describe('preferredBufferFromReactionText', () => {
  it('detects ONE and specialty buffers', () => {
    expect(preferredBufferFromReactionText(ecoriText)).toBe('one')
    expect(preferredBufferFromReactionText('1x CviJI Buffer')).toBe('cviJI')
    expect(preferredBufferFromReactionText('1x TspGWI Buffer')).toBe('tspGWI')
  })
})

describe('parseEurxIncubation', () => {
  it('parses reaction temperature from EURx PDF text', () => {
    expect(parseEurxIncubation(ecoriText)).toMatchObject({ incubationC: 37 })
    expect(parseEurxIncubation(salilsText)).toMatchObject({ incubationC: 37 })
  })
})

describe('parseEurxHeatInactivation', () => {
  it('parses heat inactivation from EURx PDF text', () => {
    expect(parseEurxHeatInactivation(ecoriText)).toBe('65°C for 20 min')
  })
})

describe('parseEurxMethylation', () => {
  it('parses no inhibition notes', () => {
    expect(parseEurxMethylation(salilsText)).toMatchObject({
      dam: 'No Effect',
      dcm: 'No Effect',
      ecoKI: 'No Effect',
    })
  })
})

describe('catalogNameForEurxProduct', () => {
  it('maps trade names to EURx catalog entries', () => {
    const catalog = new Set(['EcoRI', 'MluI', 'PmaCI'])
    expect(catalogNameForEurxProduct('EcoRI', 'EcoRI', catalog)).toBe('EcoRI')
    expect(catalogNameForEurxProduct('AcvI', 'PmaCI', catalog)).toBe('AcvI')
    expect(catalogNameForEurxProduct('MluILS', 'MluI', catalog)).toBe('MluILS')
  })
})

describe('eurxNotationFor', () => {
  it('resolves trade-name recognition', () => {
    expect(eurxNotationFor('SalILS', 'SalI')).toBe('G/TCGAC')
    expect(eurxNotationFor('TaqII', null)).toBe('GACCGA(11/9)')
  })
})

describe('eurxBufferLabel', () => {
  it('labels ONE and specialty buffers', () => {
    expect(eurxBufferLabel('one')).toBe('ONE Buffer')
    expect(eurxBufferLabel('cviJIStar')).toBe('CviJI(*) Buffer (2×)')
  })
})
