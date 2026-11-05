import { shouldCreateDnaLibraryFromOpenDrop } from './dnaLibrary'
import type { MoleculeType } from './types'

export type WorkspaceFileDropMode = 'open' | 'dna-alignment' | 'protein-alignment' | 'dna-library'

/**
 * Route OS / browser file drops on the main workspace.
 * Alignment mode sends supported files into the active alignment instead of opening a new document.
 * Multi-file drops of only AB1/.seq/.txt (with alignments off) create a DNA library.
 */
export function workspaceFileDropMode(options: {
  alignmentsVisible: boolean
  molecule: MoleculeType
  files?: readonly File[]
}): WorkspaceFileDropMode {
  if (!options.alignmentsVisible) {
    if (options.files && shouldCreateDnaLibraryFromOpenDrop(options.files)) return 'dna-library'
    return 'open'
  }
  if (options.molecule === 'protein') return 'protein-alignment'
  if (options.molecule === 'dna') return 'dna-alignment'
  return 'open'
}

export function dataTransferHasFiles(types: ArrayLike<string> | Iterable<string>): boolean {
  return Array.from(types as ArrayLike<string>).includes('Files')
}
