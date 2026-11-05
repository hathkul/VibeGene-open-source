import { describe, expect, it } from 'vitest'
import { shouldHandleProteinSequenceEditorKey } from '../src/domain/proteinSequenceKeyboard'

describe('shouldHandleProteinSequenceEditorKey', () => {
  it('lets the residue editor handle keys only when no protein annotation is selected', () => {
    expect(shouldHandleProteinSequenceEditorKey(true, null, null)).toBe(true)
    expect(shouldHandleProteinSequenceEditorKey(true, 'feature-1', null)).toBe(false)
    expect(shouldHandleProteinSequenceEditorKey(true, null, 'bond-1')).toBe(false)
    expect(shouldHandleProteinSequenceEditorKey(false, null, null)).toBe(false)
  })
})
