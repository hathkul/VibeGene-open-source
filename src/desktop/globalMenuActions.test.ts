import { expect, it, vi } from 'vitest'
import { SOURCE_REPOSITORY_URL } from '../domain/externalLinks'
import { openExternalUrl } from './openExternalUrl'
import {
  getNoWorkspaceMenuActionDisposition,
  shouldOpenFileInNewWorkspaceFromWindow,
  tryHandleGlobalStandaloneMenuAction,
} from './globalMenuActions'

vi.mock('./openExternalUrl', () => ({ openExternalUrl: vi.fn(async () => true) }))

it('opens the source repository even without a workspace', async () => {
  expect(getNoWorkspaceMenuActionDisposition('help.source-code')).toBe('global')
  expect(await tryHandleGlobalStandaloneMenuAction('help.source-code')).toBe(true)
  expect(openExternalUrl).toHaveBeenCalledWith(SOURCE_REPOSITORY_URL)
})

it('routes the Telegram popup through a workspace when none is open', () => {
  expect(getNoWorkspaceMenuActionDisposition('help.telegram-group')).toBe('workspace')
})

it('opens File → Open in a new workspace when the Database window is focused', () => {
  expect(shouldOpenFileInNewWorkspaceFromWindow('file.open', 'hybrid-database')).toBe(true)
  expect(shouldOpenFileInNewWorkspaceFromWindow('file.open', 'workspace-123')).toBe(false)
  expect(shouldOpenFileInNewWorkspaceFromWindow('file.save', 'hybrid-database')).toBe(false)
})
