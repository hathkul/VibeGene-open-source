import {
  APP_PREFERENCES_CHANGED_EVENT,
  normalizeAppPreferences,
  readAppPreferences,
  type AppPreferences,
} from '../../domain/appPreferences'

export type AppPreferencesExternalSyncOptions = {
  isTauriRuntime: () => boolean
  listenTauriPreferencesChanged: (handler: (preferences: AppPreferences) => void) => Promise<() => void>
}

/** Subscribes to cross-window preference updates from browser events and optional Tauri broadcasts. */
export function createAppPreferencesExternalSync(options: AppPreferencesExternalSyncOptions) {
  return (apply: (preferences: AppPreferences) => void) => {
    const onLocal = (event: Event) => {
      const detail = (event as CustomEvent<AppPreferences>).detail
      if (detail) apply(normalizeAppPreferences(detail))
      else apply(readAppPreferences())
    }
    window.addEventListener(APP_PREFERENCES_CHANGED_EVENT, onLocal)
    let cancelled = false
    let unlistenTauri: (() => void) | undefined
    if (options.isTauriRuntime()) {
      void options.listenTauriPreferencesChanged((preferences) => {
        apply(normalizeAppPreferences(preferences))
      }).then((stop) => {
        if (cancelled) stop()
        else unlistenTauri = stop
      })
    }
    return () => {
      cancelled = true
      window.removeEventListener(APP_PREFERENCES_CHANGED_EVENT, onLocal)
      unlistenTauri?.()
    }
  }
}
