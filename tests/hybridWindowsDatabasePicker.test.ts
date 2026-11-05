// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  cancelDatabaseConstructPick,
  readHybridPayload,
  writeHybridPayload,
} from '../src/desktop/hybridWindows'

describe('Database construct-picker payload lifecycle', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('clears the matching picker while preserving the rest of the Database payload', async () => {
    writeHybridPayload('database', {
      currentRecordId: 'vector-1',
      alignmentPick: null,
      constructPick: {
        requestId: 'picker-1',
        targetRecordId: 'vector-1',
        multiple: true,
      },
    })

    await expect(cancelDatabaseConstructPick('picker-1')).resolves.toBe(true)
    expect(readHybridPayload('database')).toEqual({
      currentRecordId: 'vector-1',
      alignmentPick: null,
      constructPick: null,
    })
  })

  it('does not let stale cleanup cancel a newer picker request', async () => {
    writeHybridPayload('database', {
      currentRecordId: 'vector-2',
      alignmentPick: null,
      constructPick: {
        requestId: 'picker-new',
        targetRecordId: 'vector-2',
        multiple: true,
      },
    })

    await expect(cancelDatabaseConstructPick('picker-old')).resolves.toBe(false)
    expect(readHybridPayload('database')?.constructPick?.requestId).toBe('picker-new')
  })
})

describe('Database library-member picker payload', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('stores a library member pick independently of cloning', () => {
    writeHybridPayload('database', {
      currentRecordId: 'lib-1',
      alignmentPick: null,
      constructPick: null,
      libraryMemberPick: { targetRecordId: 'lib-1' },
    })
    expect(readHybridPayload('database')?.libraryMemberPick).toEqual({ targetRecordId: 'lib-1' })
  })
})
