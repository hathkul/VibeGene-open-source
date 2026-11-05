import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  buildTakaraChart,
  heatInactivationFromInactivationRow,
  normalizeTakaraActivityValue,
  parseBufferChartHtml,
  preferredBufferFromRow,
  takaraAlsoKnownAsFromTitle,
  takaraBufferLabel,
  takaraNameToCatalog,
} from '../scripts/fetch-takara-buffer-chart'

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const bufferHtml = readFileSync(join(fixtureDir, 'takara-chart.html'), 'utf8')
const inactivationHtml = readFileSync(join(fixtureDir, 'takara-inact3.html'), 'utf8')

describe('takaraNameToCatalog', () => {
  it('normalizes spaced inactivation names', () => {
    expect(takaraNameToCatalog('Aat II')).toBe('AatII')
    expect(takaraNameToCatalog('EcoRI')).toBe('EcoRI')
    expect(takaraNameToCatalog('BlnI (AvrII)')).toBe('BlnI')
  })

  it('extracts isoschizomer aliases from titles', () => {
    expect(takaraAlsoKnownAsFromTitle('BlnI (AvrII)')).toBe('AvrII')
    expect(takaraAlsoKnownAsFromTitle('EcoRI')).toBeNull()
  })
})

describe('normalizeTakaraActivityValue', () => {
  it('marks parenthetical values as star activity', () => {
    expect(normalizeTakaraActivityValue('(100)')).toBe('100*')
    expect(normalizeTakaraActivityValue('80*')).toBe('80*')
    expect(normalizeTakaraActivityValue('100')).toBe('100')
    expect(normalizeTakaraActivityValue('<20')).toBe('<20')
  })
})

describe('parseBufferChartHtml', () => {
  it('parses EcoRI supplied buffer H and basal activity', () => {
    const rows = parseBufferChartHtml(bufferHtml)
    const eco = rows.find((row) => row.catalogName === 'EcoRI')
    expect(eco).toMatchObject({
      catalogName: 'EcoRI',
      preferredBuffer: 'h',
      bufferActivity: {
        h: '100',
        basal: '120',
      },
    })
  })

  it('parses AccIII basal supplied buffer', () => {
    const rows = parseBufferChartHtml(bufferHtml)
    const acc = rows.find((row) => row.catalogName === 'AccIII')
    expect(acc?.preferredBuffer).toBe('basal')
    expect(acc?.bufferActivity.basal).toBe('100')
  })

  it('parses BlnI supplied buffer K', () => {
    const rows = parseBufferChartHtml(bufferHtml)
    const bln = rows.find((row) => row.catalogName === 'BlnI')
    expect(bln?.preferredBuffer).toBe('k')
  })
})

describe('preferredBufferFromRow', () => {
  it('uses blue supplied buffer cells', () => {
    const preferred = preferredBufferFromRow(
      ['20', '100', '40', '100', '20', '120'],
      [null, null, null, '#B4F7FA', null, null],
    )
    expect(preferred).toBe('k')
  })
})

describe('heatInactivationFromInactivationRow', () => {
  it('prefers 70°C when inactivated there', () => {
    expect(heatInactivationFromInactivationRow('+', '–')).toBe('70°C for 15 min')
    expect(heatInactivationFromInactivationRow('–', 'NT')).toBe('60°C for 15 min')
    expect(heatInactivationFromInactivationRow('+', '+')).toBeNull()
  })
})

describe('buildTakaraChart', () => {
  it('builds profiles with heat inactivation and labels', () => {
    const chart = buildTakaraChart(bufferHtml, inactivationHtml, new Map([['BlnI', 'AvrII']]))
    expect(chart.EcoRI?.heatInactivation).toBe('60°C for 15 min')
    expect(chart.BlnI?.alsoKnownAs).toBe('AvrII')
    expect(chart.BlnI?.suppliedBuffer).toBe(takaraBufferLabel('k'))
    expect(chart.TaqI?.incubationC).toBe(65)
  })
})
