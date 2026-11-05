import { describe, expect, it } from 'vitest'
import {
  isLastWorkspaceSessionWindow,
  isWorkspaceWindowLabel,
  requiresSingleWorkspaceQuitGuard,
} from '../src/desktop/workspaceWindows'

describe('workspace window labels', () => {
  it('treats the first editor and extra document windows as workspaces', () => {
    expect(isWorkspaceWindowLabel('main')).toBe(true)
    expect(isWorkspaceWindowLabel('workspace-123-1')).toBe(true)
    expect(isWorkspaceWindowLabel('hybrid-database')).toBe(false)
    expect(isWorkspaceWindowLabel('hybrid-new-dna-file')).toBe(false)
  })
})

describe('last workspace session window', () => {
  it('recognizes database and startup only sessions', () => {
    expect(isLastWorkspaceSessionWindow('hybrid-database', 0)).toBe(true)
    expect(isLastWorkspaceSessionWindow('hybrid-startup', 0)).toBe(true)
    expect(isLastWorkspaceSessionWindow('hybrid-database', 1)).toBe(false)
  })

  it('only treats the final editor as the end of an editor session', () => {
    expect(isLastWorkspaceSessionWindow('main', 1)).toBe(true)
    expect(isLastWorkspaceSessionWindow('workspace-123-1', 2)).toBe(false)
    expect(isLastWorkspaceSessionWindow('hybrid-preferences', 0)).toBe(false)
  })

  it('requires a single editor before native Quit can proceed', () => {
    expect(requiresSingleWorkspaceQuitGuard(0)).toBe(false)
    expect(requiresSingleWorkspaceQuitGuard(1)).toBe(false)
    expect(requiresSingleWorkspaceQuitGuard(2)).toBe(true)
  })
})
