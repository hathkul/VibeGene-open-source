/** Stable alphabetical key from construct/file names a primer appears in. */
export function primerFileNamesSortKey(primer: { sources: readonly { projectName: string }[] }): string {
  return primer.sources
    .map((source) => source.projectName)
    .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }))
    .join('\0')
}

export function proteinFileNamesSortKey(protein: { sources: readonly { projectName: string }[] }): string {
  return primerFileNamesSortKey(protein)
}
