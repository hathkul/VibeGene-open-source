import { describe, expect, it } from 'vitest'
import { buildAppDatabaseManagerSidebarChromeSlice } from './sidebarModel'

describe('database manager sidebar chrome', () => {
  it('shows tag empty message only when tag list is empty', () => {
    const withTags = buildAppDatabaseManagerSidebarChromeSlice({
      viewMode: 'dna',
      browse: { kind: 'all' },
      selectedProjectCount: 0,
      sidebarTagCount: 2,
      busy: false,
    })
    expect(withTags.tagsSection.showEmptyMessage).toBe(false)

    const empty = buildAppDatabaseManagerSidebarChromeSlice({
      viewMode: 'primers',
      browse: { kind: 'all' },
      selectedProjectCount: 0,
      sidebarTagCount: 0,
      busy: false,
    })
    expect(empty.tagsSection.showEmptyMessage).toBe(true)
    expect(empty.tagsSection.emptyMessage).toBe('No primer tags yet.')
  })
})
