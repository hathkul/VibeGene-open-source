// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { APP_PREFERENCES_CHANGED_EVENT, DEFAULT_APP_PREFERENCES } from '../../domain/appPreferences'
import { createAppPreferencesExternalSync } from './createAppPreferencesExternalSync'

describe('createAppPreferencesExternalSync', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('applies browser preference change events', () => {
    const apply = vi.fn()
    const subscribe = createAppPreferencesExternalSync({
      isTauriRuntime: () => false,
      listenTauriPreferencesChanged: vi.fn(async () => () => {}),
    })
    const unsubscribe = subscribe(apply)
    window.dispatchEvent(
      new CustomEvent(APP_PREFERENCES_CHANGED_EVENT, {
        detail: { ...DEFAULT_APP_PREFERENCES, maxRecentFiles: 12 },
      }),
    )
    expect(apply).toHaveBeenCalledWith(expect.objectContaining({ maxRecentFiles: 12 }))
    unsubscribe()
  })
})
