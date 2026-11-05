import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  buildPromegaChart,
  heatInactivationFromPromegaSymbol,
  normalizePromegaActivityValue,
  parsePromegaBufferText,
  promegaBufferLabel,
  suppliedBufferCode,
} from '../scripts/fetch-promega-buffer-chart'

const root = dirname(fileURLToPath(import.meta.url))
const pdfText = readFileSync(join(root, '../scripts/promega-pdf-text.txt'), 'utf8')

describe('normalizePromegaActivityValue', () => {
  it('normalizes ranges, star activity, and low activity', () => {
    expect(normalizePromegaActivityValue('50–75%')).toBe('50-75')
    expect(normalizePromegaActivityValue('100%*')).toBe('100*')
    expect(normalizePromegaActivityValue('<10%')).toBe('<10')
    expect(normalizePromegaActivityValue('>125%**')).toBe('>125*')
    expect(normalizePromegaActivityValue('n.d.')).toBe('')
  })
})

describe('suppliedBufferCode', () => {
  it('maps supplied buffer letters', () => {
    expect(suppliedBufferCode('H')).toBe('h')
    expect(suppliedBufferCode('K')).toBe('k')
    expect(suppliedBufferCode('I-PpoI')).toBeNull()
  })
})

describe('parsePromegaBufferText', () => {
  it('parses EcoRI supplied buffer H with multicore activity', () => {
    const rows = parsePromegaBufferText(pdfText)
    const eco = rows.find((row) => row.catalogName === 'EcoRI')
    expect(eco).toMatchObject({
      catalogName: 'EcoRI',
      preferredBuffer: 'h',
      incubationC: 37,
      bufferActivity: {
        h: '100',
        multicore: '100*',
      },
    })
  })

  it('parses AccIII rows with n.d. activity cells', () => {
    const rows = parsePromegaBufferText(pdfText)
    const acc = rows.find((row) => row.catalogName === 'AccIII')
    expect(acc?.preferredBuffer).toBe('f')
    expect(acc?.incubationC).toBe(65)
    expect(acc?.bufferActivity.a).toBe('<10')
  })

  it('parses TaqI at 65°C with buffer E', () => {
    const rows = parsePromegaBufferText(pdfText)
    const taq = rows.find((row) => row.catalogName === 'TaqI')
    expect(taq?.preferredBuffer).toBe('e')
    expect(taq?.incubationC).toBe(65)
  })
})

describe('heatInactivationFromPromegaSymbol', () => {
  it('maps Promega heat inactivation symbols', () => {
    expect(heatInactivationFromPromegaSymbol('+')).toBe('65°C for 15 min')
    expect(heatInactivationFromPromegaSymbol('–')).toBeNull()
    expect(heatInactivationFromPromegaSymbol('+/–')).toBe('65°C for 15 min (partial inactivation)')
  })
})

describe('buildPromegaChart', () => {
  it('builds profiles with alsoKnownAs and labels', () => {
    const chart = buildPromegaChart(pdfText)
    expect(Object.keys(chart).length).toBeGreaterThan(90)
    expect(chart.BbuI?.alsoKnownAs).toBe('SphI')
    expect(chart.BbuI?.suppliedBuffer).toBe(promegaBufferLabel('a'))
    expect(chart['I-PpoI']).toBeUndefined()
  })
})
