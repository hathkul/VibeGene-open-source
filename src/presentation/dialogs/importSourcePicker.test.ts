import { describe, expect, it } from 'vitest'
import { snapshotImportSourceTabs } from './importSourcePickerModel'

describe('snapshotImportSourceTabs', () => {
  it('sorts by source name and uses tab id as a stable tie-breaker', () => {
    expect(snapshotImportSourceTabs([
      { tabId: 'b', name: 'Zeta', molecule: 'dna' },
      { tabId: 'c', name: 'Alpha', molecule: 'dna' },
      { tabId: 'a', name: 'Alpha', molecule: 'dna' },
    ])).toMatchObject([
      { tabId: 'a', name: 'Alpha' },
      { tabId: 'c', name: 'Alpha' },
      { tabId: 'b', name: 'Zeta' },
    ])
  })
})
