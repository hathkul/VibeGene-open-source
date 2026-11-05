import { describe, expect, it } from 'vitest'
import type { PrimerFrameDisplay } from '../../domain/primerSequenceLayout'
import { primerPreviewWindow } from './primerPreviewWindow'
import { themeFixturePalette } from '../../test-support/themeFixturePalette'

function display(strand: 'forward' | 'reverse', start: number, end: number, tailLength: number): PrimerFrameDisplay {
  const templateIndices = Array.from({ length: end - start }, (_, i) => strand === 'forward' ? start + i : end - 1 - i)
  return {
    primerId: 'p', name: 'Primer', color: themeFixturePalette.purple, strand, sequence: '', templateSpanStart: start, templateSpanEnd: end,
    selectRange: { start, end },
    glyphs: [
      ...Array.from({ length: tailLength }, () => ({ char: 'A', kind: 'overhang' as const, row: 0.5 })),
      ...templateIndices.map((templateIndex) => ({ char: 'C', kind: 'annealed' as const, row: 0, templateIndex })),
    ],
  }
}

describe('primer preview window', () => {
  it('reserves the full forward 5′ overhang at the sequence start', () => {
    const view = primerPreviewWindow(display('forward', 0, 22, 12), { start: 0, end: 22 }, 100, 57)
    expect(view.range.start).toBe(0)
    expect(view.left).toBeGreaterThanOrEqual(12)
    expect(view.right).toBe(0)
  })

  it('reserves the equivalent reverse 5′ overhang at the sequence end', () => {
    const view = primerPreviewWindow(display('reverse', 78, 100, 12), { start: 78, end: 100 }, 100, 57)
    expect(view.range.end).toBe(100)
    expect(view.right).toBeGreaterThanOrEqual(12)
    expect(view.left).toBe(0)
  })

  it('uses template context instead of adding gutters for an internal primer', () => {
    const view = primerPreviewWindow(display('forward', 40, 62, 6), { start: 40, end: 62 }, 100, 57)
    expect(view.left).toBe(0)
    expect(view.right).toBe(0)
  })

  it('keeps oversized tails reachable even when the whole frame cannot fit', () => {
    const view = primerPreviewWindow(display('forward', 0, 22, 80), { start: 0, end: 22 }, 100, 40)
    expect(view.left).toBeGreaterThanOrEqual(80)
    expect(view.range).toEqual({ start: 0, end: 22 })
  })
})
