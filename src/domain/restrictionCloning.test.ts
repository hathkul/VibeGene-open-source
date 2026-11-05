import { describe, expect, it } from 'vitest'
import { defaultDnaEnds } from './dnaEnds'
import { formatStickyEndPreview } from './restrictionCloning'

describe('formatStickyEndPreview', () => {
  it('shows the complementary bases for a downstream 5′ overhang', () => {
    const ends = defaultDnaEnds()
    ends.downstream.stickiness = 4

    expect(formatStickyEndPreview('AACCGCAT', ends, 'downstream', 6, 'GCAT')).toEqual({
      top: '...aacc',
      bottom: '...ttggcgta',
    })
  })

  it('shows the complementary bases for an upstream bottom-strand overhang', () => {
    const ends = defaultDnaEnds()
    ends.upstream.stickiness = -4

    expect(formatStickyEndPreview('GCATAACC', ends, 'upstream', 6, 'GCAT')).toEqual({
      top: '    aacc...',
      bottom: 'cgtattgg...',
    })
  })
})
