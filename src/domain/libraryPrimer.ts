/** Primer metadata shared by database/library workflows and its editor UI. */
export type LibraryPrimer = {
  name: string
  sequence: string
  color?: string
  description?: string
  specificity?: import('./primer3/specificity').SavedPrimerSpecificity
  commonId?: string
}

export type LibraryPrimerSource = 'construct' | 'common'
