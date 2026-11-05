import { describe, expect, it } from 'vitest'
import { dataTransferHasFiles, workspaceFileDropMode } from '../src/domain/workspaceFileDrop'

describe('workspaceFileDropMode', () => {
  it('opens documents when alignment mode is off', () => {
    expect(workspaceFileDropMode({ alignmentsVisible: false, molecule: 'dna' })).toBe('open')
    expect(workspaceFileDropMode({ alignmentsVisible: false, molecule: 'protein' })).toBe('open')
  })

  it('creates a DNA library from multi AB1/.seq drops when alignments are off', () => {
    const files = [new File([''], 'a.ab1'), new File([''], 'b.seq')]
    expect(workspaceFileDropMode({ alignmentsVisible: false, molecule: 'dna', files })).toBe('dna-library')
  })

  it('routes DNA and protein drops into alignment when visible', () => {
    expect(workspaceFileDropMode({ alignmentsVisible: true, molecule: 'dna' })).toBe('dna-alignment')
    expect(workspaceFileDropMode({ alignmentsVisible: true, molecule: 'protein' })).toBe('protein-alignment')
  })

  it('falls back to open for RNA even if alignments are visible', () => {
    expect(workspaceFileDropMode({ alignmentsVisible: true, molecule: 'rna' })).toBe('open')
  })
})

describe('dataTransferHasFiles', () => {
  it('detects the Files drag type', () => {
    expect(dataTransferHasFiles(['Files'])).toBe(true)
    expect(dataTransferHasFiles(['text/plain'])).toBe(false)
  })
})
