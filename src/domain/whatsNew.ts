import appPackage from '../../package.json'

/** Keep About, What's New, and diagnostics aligned with the built app version. */
export const APP_VERSION = appPackage.version
export const WHATS_NEW_VERSION = APP_VERSION

const STORAGE_KEY = 'vibegene:lastSeenWhatsNewVersion'

export type WhatsNewSection = {
  title: string
  body: string
}

export const WHATS_NEW_SECTIONS: WhatsNewSection[] = [
  {
    title: 'Search in Database',
    body: 'Find sequences, primers, and coding sequences in the Database window. Search within the current location or across the Database to get to the items you need faster.',
  },
]

export function shouldShowWhatsNew(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== WHATS_NEW_VERSION
  } catch {
    return true
  }
}

export function dismissWhatsNew(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, WHATS_NEW_VERSION)
  } catch {
    /* ignore quota / private mode */
  }
}
