import { describe, expect, it } from 'vitest'
import { BoundedCache } from '../src/domain/boundedCache'

describe('BoundedCache', () => {
  it('reuses recent values and evicts the least recently used entry', () => {
    const cache = new BoundedCache<number>(2)
    cache.set('first', 1)
    cache.set('second', 2)
    expect(cache.get('first')).toBe(1)
    cache.set('third', 3)
    expect(cache.get('second')).toBeUndefined()
    expect(cache.get('first')).toBe(1)
    expect(cache.get('third')).toBe(3)
  })

  it('replaces a value without evicting another key', () => {
    const cache = new BoundedCache<number>(2)
    cache.set('first', 1)
    cache.set('first', 2)
    cache.set('second', 3)
    expect(cache.get('first')).toBe(2)
    expect(cache.get('second')).toBe(3)
  })
})
