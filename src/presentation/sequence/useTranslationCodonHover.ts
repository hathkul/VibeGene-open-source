import { useState } from 'react'

type HoveredCodon = {
  positions: readonly number[]
  strand: 'forward' | 'reverse'
}

/** Shares hovered translated-codon positions with the corresponding DNA row. */
export function useTranslationCodonHover() {
  return useState<HoveredCodon | null>(null)
}
