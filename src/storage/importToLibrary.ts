import { importBytesIntoLibrary } from './databaseImport'

export type LibraryImportResult =
  | { ok: true; name: string; id: string }
  | { ok: false; fileName: string; error: string }

export type LibraryImportSuccess = Extract<LibraryImportResult, { ok: true }>
export type LibraryImportFailure = Extract<LibraryImportResult, { ok: false }>

/**
 * Parse a dropped/opened sequence file and save it into the IndexedDB library.
 * Does not open the editor. Settings JSON is rejected. Uncertain topology defaults to circular.
 */
export async function importFileIntoLibrary(
  file: File,
  folderId: string | null = null,
): Promise<LibraryImportResult> {
  try {
    return await importBytesIntoLibrary(
      file.name,
      new Uint8Array(await file.arrayBuffer()),
      { folderId, tags: [] },
    )
  } catch (error) {
    return {
      ok: false,
      fileName: file.name,
      error: error instanceof Error ? error.message : 'Could not import file',
    }
  }
}

export async function importFilesIntoLibrary(
  files: File[],
  folderId: string | null = null,
): Promise<{ saved: LibraryImportSuccess[]; failed: LibraryImportFailure[] }> {
  const saved: LibraryImportSuccess[] = []
  const failed: LibraryImportFailure[] = []
  for (const file of files) {
    const result = await importFileIntoLibrary(file, folderId)
    if (result.ok) saved.push(result)
    else failed.push(result)
  }
  return { saved, failed }
}
