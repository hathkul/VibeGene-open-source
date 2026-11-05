// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ENZYME_PREFERENCES_STORAGE_KEY,
  defaultEnzymePreferences,
  normalizeEnzymePreferences,
  saveEnzymePreferences,
} from './domain/enzymePreferences'
import {
  ENZYME_PREFERENCES_CHANGED_EVENT,
  createEnzymePreferencesExternalSync,
  persistWorkspaceEnzymePreferences,
} from './workspaceEnzymePreferences'

describe('persistWorkspaceEnzymePreferences', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('dispatches a same-tab enzyme preference change event after saving', () => {
    const dispatch = vi.spyOn(window, 'dispatchEvent')
    persistWorkspaceEnzymePreferences({ ...defaultEnzymePreferences, italicizeNames: true })
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: ENZYME_PREFERENCES_CHANGED_EVENT }),
    )
  })
})

describe('saveEnzymePreferences domain boundary', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not dispatch browser custom events', () => {
    const dispatch = vi.spyOn(window, 'dispatchEvent')
    saveEnzymePreferences({ ...defaultEnzymePreferences, boldUniqueCutters: true })
    expect(dispatch).not.toHaveBeenCalled()
  })
})

describe('createEnzymePreferencesExternalSync', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('applies browser enzyme preference change events', () => {
    const apply = vi.fn()
    const subscribe = createEnzymePreferencesExternalSync()
    const unsubscribe = subscribe(apply)
    window.dispatchEvent(
      new CustomEvent(ENZYME_PREFERENCES_CHANGED_EVENT, {
        detail: normalizeEnzymePreferences({ ...defaultEnzymePreferences, italicizeNames: true }),
      }),
    )
    expect(apply).toHaveBeenCalledWith(expect.objectContaining({ italicizeNames: true }))
    unsubscribe()
  })

  it('reloads preferences when another tab updates localStorage', () => {
    const apply = vi.fn()
    const subscribe = createEnzymePreferencesExternalSync()
    const unsubscribe = subscribe(apply)
    window.dispatchEvent(
      new StorageEvent('storage', { key: ENZYME_PREFERENCES_STORAGE_KEY, newValue: '{}' }),
    )
    expect(apply).toHaveBeenCalled()
    unsubscribe()
  })
})
