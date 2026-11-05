export const KOFI_SUPPORT_BLOCKED_STATUS = 'Could not open Support page (popup blocked).'
export const KOFI_SUPPORT_OPENED_STATUS = 'Opened VibeGene Support on Ko-fi.'
export const NEW_VIBEGENE_WINDOW_OPENED_STATUS = 'Opened a new VibeGene window.'
export const NEW_VIBEGENE_WINDOW_BLOCKED_STATUS =
  'Could not open a new VibeGene window (popup blocked).'

export function planKofiSupportOpenedStatus(opened: boolean): string {
  return opened ? KOFI_SUPPORT_OPENED_STATUS : KOFI_SUPPORT_BLOCKED_STATUS
}

export function planKofiSupportErrorStatus(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return `Could not open Support page: ${message}`
}

/** Same-origin browser workspace URL; bootSplash=0 skips the launch splash. */
export function planNewWorkspaceBrowserUrl(origin: string, pathname: string): string {
  return `${origin}${pathname}?bootSplash=0`
}

export function planNewVibegeneWindowBrowserStatus(opened: boolean): string {
  return opened ? NEW_VIBEGENE_WINDOW_OPENED_STATUS : NEW_VIBEGENE_WINDOW_BLOCKED_STATUS
}

export function isNativeNewWorkspaceWindowOpened(
  openedNative: false | 'focused' | 'opened',
): openedNative is 'focused' | 'opened' {
  return openedNative !== false
}
