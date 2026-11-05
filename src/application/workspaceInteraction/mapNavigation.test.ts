import { describe, expect, it } from 'vitest'
import { nextLibraryMapBrowseIndex } from './mapNavigation'

describe('nextLibraryMapBrowseIndex', () => {
  it('wraps consensus/member map navigation and ignores a single entry', () => {
    expect(nextLibraryMapBrowseIndex(0, -1, 3)).toBe(2)
    expect(nextLibraryMapBrowseIndex(2, 1, 3)).toBe(0)
    expect(nextLibraryMapBrowseIndex(0, 1, 1)).toBeNull()
  })
})
