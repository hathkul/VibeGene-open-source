import { telemetryApiBase } from './telemetry'

type TurnstileOptions = {
  sitekey: string
  action: string
  callback: (token: string) => void
  'expired-callback': () => void
  'error-callback': () => void
}

type TurnstileApi = {
  render(element: HTMLElement, options: TurnstileOptions): string
  reset(widgetId: string): void
  remove(widgetId: string): void
}

type TurnstileWindow = Window & { turnstile?: TurnstileApi }

let scriptPromise: Promise<TurnstileApi> | null = null

async function sitekey(): Promise<string> {
  const response = await fetch(`${telemetryApiBase()}/api/v1/config`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  })
  if (!response.ok) throw new Error('Verification configuration is unavailable.')
  const value: unknown = await response.json()
  if (
    typeof value !== 'object' ||
    value === null ||
    !('turnstileSitekey' in value) ||
    typeof value.turnstileSitekey !== 'string' ||
    !value.turnstileSitekey
  ) {
    throw new Error('Verification is not configured yet.')
  }
  return value.turnstileSitekey
}

function loadTurnstile(): Promise<TurnstileApi> {
  const existing = (window as TurnstileWindow).turnstile
  if (existing) return Promise.resolve(existing)
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
    const finish = () => {
      const api = (window as TurnstileWindow).turnstile
      if (api) resolve(api)
      else reject(new Error('Human verification did not load.'))
    }
    const prior = document.querySelector<HTMLScriptElement>('script[data-vibegene-turnstile]')
    if (prior) {
      prior.addEventListener('load', finish, { once: true })
      prior.addEventListener('error', () => reject(new Error('Human verification did not load.')), { once: true })
      return
    }
    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true
    script.defer = true
    script.dataset.vibegeneTurnstile = 'true'
    script.addEventListener('load', finish, { once: true })
    script.addEventListener('error', () => reject(new Error('Human verification did not load.')), { once: true })
    document.head.appendChild(script)
  })
  return scriptPromise
}

export async function mountBugReportTurnstile(
  element: HTMLElement,
  callbacks: { verified: (token: string) => void; expired: () => void; failed: () => void },
): Promise<{ reset: () => void; dispose: () => void }> {
  const [api, publicSitekey] = await Promise.all([loadTurnstile(), sitekey()])
  const widgetId = api.render(element, {
    sitekey: publicSitekey,
    action: 'bug_report',
    callback: callbacks.verified,
    'expired-callback': callbacks.expired,
    'error-callback': callbacks.failed,
  })
  return {
    reset: () => api.reset(widgetId),
    dispose: () => api.remove(widgetId),
  }
}
