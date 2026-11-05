export const PRIMER_COLOR_OPTIONS = [
  { value: '#7c3aed', label: 'Purple' },
  { value: '#000000', label: 'Black' },
  { value: '#0ea5e9', label: 'Blue' },
  { value: '#dc2626', label: 'Red' },
  { value: '#16a34a', label: 'Green' },
] as const

/**
 * Primer colours are persisted in records and later used as SVG paint values.
 * CSS custom-property references are valid in stylesheet declarations, but are
 * not portable as record data (and render as black when used as an SVG fill in
 * a separate Tauri document).
 */
export function normalizePrimerColor(value: unknown): string {
  const color = typeof value === 'string' ? value.trim() : ''
  return color && !/^var\(/i.test(color) ? color : PRIMER_COLOR_OPTIONS[0].value
}
