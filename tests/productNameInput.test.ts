import { describe, expect, it, vi } from 'vitest'
import { selectFileNameStem } from '../src/cloning/productNameInputUtils'

describe('selectFileNameStem', () => {
  it('selects only the pre-extension stem', () => {
    const input = {
      value: 'Cloned Product.dna',
      select: vi.fn(),
      setSelectionRange: vi.fn(),
    } as unknown as HTMLInputElement

    selectFileNameStem(input)

    expect(input.setSelectionRange).toHaveBeenCalledWith(0, 'Cloned Product'.length)
    expect(input.select).not.toHaveBeenCalled()
  })

  it('selects the whole value when there is no extension', () => {
    const input = {
      value: 'Untitled',
      select: vi.fn(),
      setSelectionRange: vi.fn(),
    } as unknown as HTMLInputElement

    selectFileNameStem(input)

    expect(input.select).toHaveBeenCalled()
    expect(input.setSelectionRange).not.toHaveBeenCalled()
  })
})
