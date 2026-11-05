import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  buildRocheChartFromText,
  extractRocheNamesAndValues,
  rocheNameToCatalog,
} from '../scripts/fetch-roche-buffer-chart'

const root = dirname(fileURLToPath(import.meta.url))
const pdfText = readFileSync(join(root, '../scripts/roche-pdf-text.txt'), 'utf8')

describe('rocheNameToCatalog', () => {
  it('maps spaced Roche names to catalog names', () => {
    expect(rocheNameToCatalog('Eco RI')).toBe('EcoRI')
    expect(rocheNameToCatalog('Eco RV')).toBe('EcoRV')
    expect(rocheNameToCatalog('Bpu AI')).toBe('BpuAI')
    expect(rocheNameToCatalog('Sau 3A')).toBe('Sau3AI')
    expect(rocheNameToCatalog('Ksp 632')).toBe('Ksp632I')
  })
})

describe('extractRocheNamesAndValues', () => {
  it('parses both table sections with aligned value counts', () => {
    const sections = [
      ...pdfText.matchAll(
        /Enzyme\s+A\s+B\s+L\s+M\s+H\s+([\s\S]*?)(?=Enzyme\s+A\s+B\s+L\s+M\s+H|Table 4:\s+This table)/gi,
      ),
    ]
    expect(sections).toHaveLength(2)

    for (const section of sections) {
      const { names, values } = extractRocheNamesAndValues(section[1]!)
      expect(values.length).toBeGreaterThanOrEqual(names.length * 5)
    }
  })
})

describe('buildRocheChartFromText', () => {
  const chart = buildRocheChartFromText(pdfText)

  it('includes EcoRI with SuRE/Cut buffer H activity', () => {
    expect(chart.EcoRI?.preferredBuffer).toBe('h')
    expect(chart.EcoRI?.bufferActivity.h).toMatch(/100/)
  })

  it('includes BamHI with SuRE/Cut buffer B activity', () => {
    expect(chart.BamHI?.preferredBuffer).toBe('b')
    expect(chart.BamHI?.bufferActivity.b).toBe('100')
  })

  it('marks BSA-required enzymes', () => {
    expect(chart.HpaII?.requiresBsa).toBe(true)
    expect(chart.KpnI?.requiresBsa).toBe(true)
  })
})
