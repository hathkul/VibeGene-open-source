import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_APP_PREFERENCES } from '../../domain/appPreferences'
import { applySavedAppPreferences } from './applySavedAppPreferences'

describe('applySavedAppPreferences', () => {
  it('updates preferences and trims drafts and recent files to the saved limits', async () => {
    const setAppPreferences = vi.fn()
    const trimSessionDraftsToLimit = vi.fn(async () => {})
    const refreshSessionDrafts = vi.fn(async () => {})
    const trimRecentFilesToLimit = vi.fn()
    const refreshRecentFiles = vi.fn()
    const preferences = {
      ...DEFAULT_APP_PREFERENCES,
      maxUnsavedDrafts: 3,
      maxRecentFiles: 5,
    }

    applySavedAppPreferences(preferences, {
      setAppPreferences,
      trimSessionDraftsToLimit,
      refreshSessionDrafts,
      trimRecentFilesToLimit,
      refreshRecentFiles,
    })

    expect(setAppPreferences).toHaveBeenCalledWith(preferences)
    expect(trimSessionDraftsToLimit).toHaveBeenCalledWith(3)
    expect(trimRecentFilesToLimit).toHaveBeenCalledWith(5)
    expect(refreshRecentFiles).toHaveBeenCalled()
    await Promise.resolve()
    expect(refreshSessionDrafts).toHaveBeenCalled()
  })

  it('still trims and refreshes recent files when draft trimming rejects', async () => {
    const setAppPreferences = vi.fn()
    const trimSessionDraftsToLimit = vi.fn(async () => {
      throw new Error('draft trim failed')
    })
    const refreshSessionDrafts = vi.fn(async () => {})
    const trimRecentFilesToLimit = vi.fn()
    const refreshRecentFiles = vi.fn()

    applySavedAppPreferences(
      { ...DEFAULT_APP_PREFERENCES, maxUnsavedDrafts: 2, maxRecentFiles: 8 },
      {
        setAppPreferences,
        trimSessionDraftsToLimit,
        refreshSessionDrafts,
        trimRecentFilesToLimit,
        refreshRecentFiles,
      },
    )

    expect(trimRecentFilesToLimit).toHaveBeenCalledWith(8)
    expect(refreshRecentFiles).toHaveBeenCalled()
    await Promise.resolve()
    expect(refreshSessionDrafts).not.toHaveBeenCalled()
  })
})
