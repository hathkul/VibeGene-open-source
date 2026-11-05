import { describe, expect, it } from 'vitest'
import {
  DOCUMENT_BOOT_FILE_QUERY_PARAM_NAMES,
  DOCUMENT_BOOT_HISTORY_QUERY_PARAM_NAMES,
  parseDocumentBootQuery,
  resolvePendingIdbHandoffKey,
  shouldClearFileBootQueryParams,
  shouldSkipAsyncDocumentBootstrap,
  stripDocumentBootQueryParams,
} from './documentBootQuery'

describe('documentBootQuery', () => {
  it('parses boot query params from search', () => {
    expect(parseDocumentBootQuery('?history=k1&fileHandoff=f1&openPath=%2Ftmp%2Fa.dna&unsaved=1&saveToDatabase=1')).toEqual({
      historyKey: 'k1',
      fileHandoffKey: 'f1',
      openPath: '/tmp/a.dna',
      initiallyUnsaved: true,
      openSaveToDatabase: true,
    })
  })

  it('defers IndexedDB handoff when compact localStorage handoff was consumed', () => {
    expect(resolvePendingIdbHandoffKey('hist-1', { id: 'r1' })).toBeNull()
    expect(resolvePendingIdbHandoffKey('hist-1', null)).toBe('hist-1')
  })

  it('skips async bootstrap after sync handoff and clears file params when disk path is known', () => {
    expect(shouldSkipAsyncDocumentBootstrap(true)).toBe(true)
    expect(
      shouldClearFileBootQueryParams({ openedFromHandoff: true, workspaceDiskPath: '/tmp/a.dna' }),
    ).toBe(true)
    expect(
      shouldClearFileBootQueryParams({ openedFromHandoff: true, workspaceDiskPath: null }),
    ).toBe(false)
  })

  it('strips file and history boot query params from href', () => {
    const href = 'https://app.test/ws?fileHandoff=f&openPath=%2Fa&url=https%3A%2F%2Fx&history=h&unsaved=1&saveToDatabase=1#frag'
    expect(stripDocumentBootQueryParams(href, DOCUMENT_BOOT_FILE_QUERY_PARAM_NAMES)).toBe(
      '/ws?history=h&unsaved=1&saveToDatabase=1#frag',
    )
    expect(stripDocumentBootQueryParams(href, DOCUMENT_BOOT_HISTORY_QUERY_PARAM_NAMES)).toBe(
      '/ws?fileHandoff=f&openPath=%2Fa&url=https%3A%2F%2Fx#frag',
    )
  })
})
