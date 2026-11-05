// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  proteinResidueBoundaryAtClientX,
  proteinResidueBoundaryFromPointer,
  proteinResidueIndexFromHitElement,
} from '../src/domain/proteinSequenceSelection'

describe('proteinSequenceSelection', () => {
  it('snaps pointer x to nearest residue seam', () => {
    expect(proteinResidueBoundaryAtClientX(10, 100, 20, 109)).toBe(10)
    expect(proteinResidueBoundaryAtClientX(10, 100, 20, 110)).toBe(11)
    expect(proteinResidueBoundaryAtClientX(10, 100, 20, 119)).toBe(11)
  })

  it('reads residue index from hit targets inside the pane root', () => {
    const root = document.createElement('div')
    const cell = document.createElement('button')
    cell.className = 'protein-residue'
    cell.dataset.residueIndex = '42'
    root.append(cell)
    expect(proteinResidueIndexFromHitElement(cell, root)).toBe(42)
    expect(proteinResidueIndexFromHitElement(document.createElement('span'), root)).toBe(null)
  })

  it('resolves boundary from pointer coordinates via elementFromPoint', () => {
    const root = document.createElement('div')
    const cell = document.createElement('button')
    cell.className = 'protein-residue'
    cell.dataset.residueIndex = '5'
    root.append(cell)
    cell.getBoundingClientRect = () => ({
      left: 200,
      top: 0,
      width: 24,
      height: 20,
      right: 224,
      bottom: 20,
      x: 200,
      y: 0,
      toJSON: () => ({}),
    })
    const boundary = proteinResidueBoundaryFromPointer(218, 10, root, () => cell)
    expect(boundary).toBe(6)
  })
})
