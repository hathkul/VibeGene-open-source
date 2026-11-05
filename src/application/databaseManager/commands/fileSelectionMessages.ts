export function fileRenameSuccessStatus(input: {
  fileName: string
  constructName: string
}): string {
  return `Renamed file to “${input.fileName}”. Construct name remains “${input.constructName}”.`
}

export function folderRenameSuccessStatus(name: string): string {
  return `Renamed folder to “${name}”.`
}

export function folderDeleteSuccessStatus(name: string): string {
  return `Deleted folder “${name}”.`
}

export function projectTagsUpdateStatus(input: { count: number; cleared: boolean }): string {
  if (input.cleared) {
    return `Cleared tags on ${input.count} file${input.count === 1 ? '' : 's'}.`
  }
  return `Updated tags on ${input.count} file${input.count === 1 ? '' : 's'}.`
}

export function primerTagsUpdateStatus(input: { count: number; cleared: boolean }): string {
  if (input.cleared) {
    return `Cleared tags on ${input.count} primer${input.count === 1 ? '' : 's'}.`
  }
  return `Updated tags on ${input.count} primer${input.count === 1 ? '' : 's'}.`
}

export function commonPrimerAddStatus(input: {
  addedNames: readonly string[]
  skipped: number
}): string | 'already-common' {
  const { added, skipped } = { added: input.addedNames, skipped: input.skipped }
  if (!added.length && skipped > 0) return 'already-common'
  const addedNote =
    added.length === 1
      ? `Added “${added[0]!}” to Common primers.`
      : `Added ${added.length} primer${added.length === 1 ? '' : 's'} to Common primers.`
  const skippedNote = skipped > 0 ? ` Skipped ${skipped} already in the library.` : ''
  return `${addedNote}${skippedNote}`
}

export function commonPrimerRemoveStatus(count: number): string {
  return `Removed ${count} primer${count === 1 ? '' : 's'} from Common primers.`
}

export function proteinCopyStatus(input: { count: number; singleName: string | null }): string {
  if (input.count === 1 && input.singleName) {
    return `Copied “${input.singleName}” to the clipboard.`
  }
  return `Copied ${input.count} proteins to the clipboard.`
}
