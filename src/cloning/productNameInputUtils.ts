import type { MouseEvent } from 'react'

/** Select the basename stem (everything before the final extension). */
export function selectFileNameStem(input: HTMLInputElement) {
  const value = input.value
  const dot = value.lastIndexOf('.')
  if (dot <= 0) {
    input.select()
    return
  }
  input.setSelectionRange(0, dot)
}

/**
 * Double-click selects the pre-extension stem only (e.g. `Cloned` in `Cloned.dna`).
 * Deferred so it wins over the browser's default word/token selection.
 */
export function handleProductNameDoubleClick(event: MouseEvent<HTMLInputElement>) {
  const input = event.currentTarget
  const value = input.value
  const dot = value.lastIndexOf('.')
  if (dot <= 0) return
  event.preventDefault()
  window.setTimeout(() => {
    if (document.activeElement === input) selectFileNameStem(input)
  }, 0)
}
