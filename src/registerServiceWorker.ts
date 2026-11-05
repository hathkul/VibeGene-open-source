import { isTauriRuntime } from './desktop/tauriRuntime'

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return
  // Desktop Tauri shells use a custom asset protocol. Vite does not reliably
  // expose TAURI_ENV_PLATFORM to client code, so detect the runtime itself.
  if (isTauriRuntime()) return

  window.addEventListener('load', () => {
    let refreshing = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // New SW claimed the page (e.g. after a release). Reload once to pick up fresh HTML/splash.
      if (refreshing) return
      refreshing = true
      window.location.reload()
    })

    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        registration.update().catch(() => {
          /* offline / blocked update checks are fine */
        })
      })
      .catch(() => {
        // The app still works online if service worker registration is blocked.
      })
  })
}
