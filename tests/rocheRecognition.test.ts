import { describe, expect, it } from 'vitest'
import { rocheNotationFor, rocheRecognitionChart } from '../scripts/roche-recognition-chart'
import { parseNebRecognition } from '../src/domain/enzymeParser'

describe('rocheRecognitionChart', () => {
  it('parses every Roche recognition entry', () => {
    for (const [name, notation] of rocheRecognitionChart) {
      const parsed = parseNebRecognition(notation)
      expect(parsed.recognition.length, name).toBeGreaterThan(0)
    }
  })

  it('includes NdeII and BpuAI as separate enzymes', () => {
    expect(rocheNotationFor('NdeII')).toBe('/GATC')
    expect(rocheNotationFor('BpuAI')).toBe('GAAGAC(2/6)')
  })
})

describe('Roche isoschizomer separation', () => {
  it('gives NdeII and Sau3AI the same site but separate recognition entries', () => {
    const ndeII = parseNebRecognition(rocheNotationFor('NdeII')!)
    const sau3AI = parseNebRecognition('/GATC')
    expect(ndeII.recognition).toBe(sau3AI.recognition)
  })
})
