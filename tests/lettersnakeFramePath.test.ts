import { describe, expect, it } from 'vitest'
import { buildSnakeFrame } from '../src/domain/lettersnakeFramePath'

describe('lettersnakeFramePath v13', () => {
  it('builds a closed frame with a portal stem for a raised middle run', () => {
    const charW = 10
    const halfW = charW / 2
    const edgePad = charW * 0.25
    const halfH = 10
    const centers = [
      { x: 50, y: 50 },
      { x: 70, y: 50 },
      { x: 90, y: 30 },
      { x: 110, y: 50 },
      { x: 130, y: 50 },
    ]

    const { fills, outlines } = buildSnakeFrame(centers, halfW, halfH, edgePad, charW)

    expect(fills.length).toBeGreaterThan(0)
    expect(fills[0]).toContain('Z')
    expect(fills[0]).toMatch(/\bQ\b/)
    expect(outlines.length).toBeGreaterThanOrEqual(fills.length)
    // Raised letter cell is [85,95]; padded vertical borders sit 1/4 letter outside.
    // Corners are quadratic-rounded, so the original vertices remain as Q controls.
    expect(fills[0]).toContain('Q 82.5')
    expect(fills[0]).toContain('Q 97.5')
  })

  it('draws portal insertion notches for adjacent oversize inserts', () => {
    const charW = 10
    const halfW = charW / 2
    const edgePad = charW * 0.25
    const halfH = 10
    const centers = [
      { x: 50, y: 50 },
      { x: 70, y: 50 },
      { x: 75, y: 20, portal: true },
      { x: 80, y: 50 },
      { x: 130, y: 50 },
    ]

    const { fills, outlines } = buildSnakeFrame(centers, halfW, halfH, edgePad, charW, {
      includePortalNotches: true,
    })

    expect(fills.length).toBeGreaterThan(0)
    expect(outlines.length).toBeGreaterThan(fills.length)
    expect(outlines.some((path) => path.startsWith('M ') && !path.includes('Z'))).toBe(true)
  })
})
