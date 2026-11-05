// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_APP_PREFERENCES } from '../../domain/appPreferences'
import { useUtilityDialogsController } from './useUtilityDialogsController'

describe('useUtilityDialogsController', () => {
  let host: HTMLDivElement | undefined
  let root: ReturnType<typeof createRoot> | undefined

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })

  it('syncs preferences from external subscription updates', () => {
    let applyExternal: ((preferences: typeof DEFAULT_APP_PREFERENCES) => void) | undefined
    let controller: ReturnType<typeof useUtilityDialogsController> | undefined
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      controller = useUtilityDialogsController({
        initialRemoteSequenceOpenError: null,
        whatsNewVersion: '1.0.0',
        subscribeAppPreferencesExternalSync: (apply) => {
          applyExternal = apply
          return () => {}
        },
        preferenceSavePorts: {
          trimSessionDraftsToLimit: vi.fn(async () => {}),
          refreshSessionDrafts: vi.fn(async () => {}),
          trimRecentFilesToLimit: vi.fn(),
          refreshRecentFiles: vi.fn(),
        },
      })
      return null
    }
    act(() => { root!.render(<Harness />) })
    act(() => {
      applyExternal?.({
        ...DEFAULT_APP_PREFERENCES,
        maxRecentFiles: 7,
      })
    })
    expect(controller!.appPreferences.maxRecentFiles).toBe(7)
  })

  it('applies preference save effects through the strict application helper', async () => {
    const trimSessionDraftsToLimit = vi.fn(async () => {})
    const refreshSessionDrafts = vi.fn(async () => {})
    const trimRecentFilesToLimit = vi.fn()
    const refreshRecentFiles = vi.fn()
    let controller: ReturnType<typeof useUtilityDialogsController> | undefined
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      controller = useUtilityDialogsController({
        initialRemoteSequenceOpenError: null,
        whatsNewVersion: '1.0.0',
        subscribeAppPreferencesExternalSync: () => () => {},
        preferenceSavePorts: {
          trimSessionDraftsToLimit,
          refreshSessionDrafts,
          trimRecentFilesToLimit,
          refreshRecentFiles,
        },
      })
      return null
    }
    act(() => { root!.render(<Harness />) })
    act(() => {
      controller!.saveAppPreferences({
        ...DEFAULT_APP_PREFERENCES,
        maxUnsavedDrafts: 2,
        maxRecentFiles: 4,
      })
    })
    expect(trimSessionDraftsToLimit).toHaveBeenCalledWith(2)
    expect(trimRecentFilesToLimit).toHaveBeenCalledWith(4)
    expect(controller!.appPreferences.maxUnsavedDrafts).toBe(2)
  })

  it('retains boot remote-open error until cleared', () => {
    let controller: ReturnType<typeof useUtilityDialogsController> | undefined
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      controller = useUtilityDialogsController({
        initialRemoteSequenceOpenError: { message: 'Network failed' },
        whatsNewVersion: '1.0.0',
        subscribeAppPreferencesExternalSync: () => () => {},
        preferenceSavePorts: {
          trimSessionDraftsToLimit: vi.fn(async () => {}),
          refreshSessionDrafts: vi.fn(async () => {}),
          trimRecentFilesToLimit: vi.fn(),
          refreshRecentFiles: vi.fn(),
        },
      })
      return null
    }
    act(() => { root!.render(<Harness />) })
    expect(controller!.remoteSequenceOpenError?.message).toBe('Network failed')
    act(() => { controller!.setRemoteSequenceOpenError(null) })
    expect(controller!.remoteSequenceOpenError).toBeNull()
  })
})
