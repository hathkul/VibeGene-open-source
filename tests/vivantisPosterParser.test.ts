import { describe, expect, it } from 'vitest'
import {
  calibrateLegendFromImage,
  classifyVivantisActivity,
  matchActivityLevel,
} from '../scripts/vivantis-poster-parser.ts'

describe('vivantis poster parser', () => {
  it('maps legend reference colors to activity levels', () => {
    expect(classifyVivantisActivity([105, 86, 56])).toBe('100')
    expect(classifyVivantisActivity([161, 126, 63])).toBe('75')
    expect(classifyVivantisActivity([194, 167, 145])).toBe('50')
    expect(classifyVivantisActivity([254, 237, 174])).toBe('25')
    expect(classifyVivantisActivity([255, 253, 228])).toBe('10')
    expect(classifyVivantisActivity([255, 255, 255])).toBe('0')
  })

  it('calibrates legend swatches from poster header row', () => {
    const data = new Uint8ClampedArray(630 * 800 * 4)
    const width = 630
    for (const [x, r, g, b] of [
      [75, 105, 86, 56],
      [105, 161, 126, 63],
      [135, 194, 167, 145],
    ] as const) {
      for (let dx = -2; dx <= 2; dx += 1) {
        const index = (44 * width + (x + dx)) * 4
        data[index] = r
        data[index + 1] = g
        data[index + 2] = b
        data[index + 3] = 255
      }
    }

    const legend = calibrateLegendFromImage(data, width)
    expect(matchActivityLevel([105, 86, 56], legend)).toBe('100')
    expect(matchActivityLevel([161, 126, 63], legend)).toBe('75')
    expect(matchActivityLevel([194, 167, 145], legend)).toBe('50')
  })
})
