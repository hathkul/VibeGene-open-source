// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  estimateLibraryMemberPlaceholderHeight,
  libraryBrowseNavKeys,
  libraryBrowseNearViewportKeys,
  libraryBrowseViewportKey,
  stepLibraryBrowseNavKey,
} from '../src/domain/libraryBrowseViewport'

describe('libraryBrowseNavKeys', () => {
  it('prefixes consensus null before member ids', () => {
    expect(libraryBrowseNavKeys(['a', 'b'])).toEqual([null, 'a', 'b'])
  })

  it('can omit consensus', () => {
    expect(libraryBrowseNavKeys(['a', 'b'], { includeConsensus: false })).toEqual(['a', 'b'])
  })
})

describe('stepLibraryBrowseNavKey', () => {
  it('wraps across consensus and members', () => {
    const keys = libraryBrowseNavKeys(['a', 'b'])
    expect(stepLibraryBrowseNavKey(keys, null, 1)).toBe('a')
    expect(stepLibraryBrowseNavKey(keys, 'a', 1)).toBe('b')
    expect(stepLibraryBrowseNavKey(keys, 'b', 1)).toBe(null)
    expect(stepLibraryBrowseNavKey(keys, null, -1)).toBe('b')
  })
})

describe('libraryBrowseViewportKey', () => {
  it('returns the block containing the upper viewport anchor', () => {
    const stack = document.createElement('div')
    Object.defineProperty(stack, 'getBoundingClientRect', {
      value: () => ({ top: 0, bottom: 200, height: 200, left: 0, right: 100, width: 100, x: 0, y: 0, toJSON() {} }),
    })

    const consensus = document.createElement('section')
    consensus.dataset.libraryKey = 'consensus'
    Object.defineProperty(consensus, 'getBoundingClientRect', {
      value: () => ({ top: -50, bottom: 40, height: 90, left: 0, right: 100, width: 100, x: 0, y: -50, toJSON() {} }),
    })

    const member = document.createElement('section')
    member.dataset.libraryKey = 'm1'
    Object.defineProperty(member, 'getBoundingClientRect', {
      value: () => ({ top: 40, bottom: 180, height: 140, left: 0, right: 100, width: 100, x: 0, y: 40, toJSON() {} }),
    })

    stack.append(consensus, member)
    // Anchor at ~44px falls inside member block.
    expect(libraryBrowseViewportKey(stack)).toBe('m1')
  })

  it('prepares only member blocks near the scroll viewport', () => {
    const stack = document.createElement('div')
    Object.defineProperty(stack, 'getBoundingClientRect', {
      value: () => ({ top: 0, bottom: 200, height: 200 }),
    })
    for (const [key, top, bottom] of [
      ['consensus', 0, 150],
      ['near', 160, 500],
      ['later', 900, 1200],
    ] as const) {
      const block = document.createElement('section')
      block.dataset.libraryKey = key
      Object.defineProperty(block, 'getBoundingClientRect', { value: () => ({ top, bottom }) })
      stack.append(block)
    }
    expect(libraryBrowseNearViewportKeys(stack, 200)).toEqual(['near'])
    expect(libraryBrowseNearViewportKeys(stack, 800)).toEqual(['near', 'later'])
  })

  it('reserves scroll height for members before their rows mount', () => {
    expect(estimateLibraryMemberPlaceholderHeight(0)).toBe(320)
    expect(estimateLibraryMemberPlaceholderHeight(800)).toBe(1600)
  })
})
