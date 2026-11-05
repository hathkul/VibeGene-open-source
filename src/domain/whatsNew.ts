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
    title: 'More accurate trace alignments',
    body: 'Large deletions are better represented in sequencing trace alignments, with improved chromatogram display around gaps and on reverse strands.',
  },
  {
    title: 'Sequencing traces preserved',
    body: 'SnapGene trace visibility is preserved, and sequencing traces are retained in cloning history and when cloning between windows.',
  },
  {
    title: 'Richer feature notes and qualifiers',
    body: 'Format feature notes and qualifier values, edit repeated qualifiers separately, and insert symbols from the new symbol picker.',
  },
  {
    title: 'Clearer enzyme cut sites',
    body: 'Restriction cuts beyond the ends of linear sequences and negative coordinates are handled more accurately. Enzyme hints are better positioned on screen.',
  },
  {
    title: 'Document names in window titles',
    body: 'The current document filename appears in the workspace window title, making open windows easier to identify.',
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
