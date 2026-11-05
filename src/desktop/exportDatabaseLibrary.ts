import { zipSync } from 'fflate'
import { isTauriRuntime } from './tauriRuntime'
import {
  buildDatabaseExportBundle,
  DATABASE_EXPORT_MANIFEST_NAME,
  encodeDatabaseExportManifest,
  sanitizePathSegment,
  type DatabaseExportBundle,
} from '../storage/databaseExport'

export type ExportDatabaseLibraryResult =
  | { ok: true; mode: 'directory'; path: string; projectCount: number; folderCount: number }
  | { ok: true; mode: 'zip'; fileName: string; projectCount: number; folderCount: number }
  | { ok: false; cancelled: true }
  | { ok: false; cancelled?: false; error: string }

function joinPath(root: string, relativePath: string): string {
  const sep = root.includes('\\') ? '\\' : '/'
  const normalized = relativePath.replace(/\\/g, '/').split('/').filter(Boolean)
  return [root.replace(/[/\\]+$/, ''), ...normalized].join(sep)
}

function parentDir(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const index = normalized.lastIndexOf('/')
  if (index <= 0) return filePath
  const parent = normalized.slice(0, index)
  return filePath.includes('\\') ? parent.replace(/\//g, '\\') : parent
}

function folderPathFromManifest(bundle: DatabaseExportBundle, folderId: string): string {
  const byId = new Map(bundle.manifest.folders.map((folder) => [folder.id, folder]))
  const parts: string[] = []
  let cursor: string | null = folderId
  const guard = new Set<string>()
  while (cursor && !guard.has(cursor)) {
    guard.add(cursor)
    const folder = byId.get(cursor)
    if (!folder) break
    parts.unshift(sanitizePathSegment(folder.name, 'Folder'))
    cursor = folder.parentId
  }
  return parts.join('/')
}

async function writeBundleToDirectory(root: string, bundle: DatabaseExportBundle): Promise<void> {
  const { mkdir, writeFile } = await import('@tauri-apps/plugin-fs')

  for (const folder of bundle.manifest.folders) {
    const relative = folderPathFromManifest(bundle, folder.id)
    if (!relative) continue
    await mkdir(joinPath(root, relative), { recursive: true })
  }

  const dirs = new Set<string>()
  for (const file of bundle.files) {
    const full = joinPath(root, file.relativePath)
    const dir = parentDir(full)
    if (dir && dir !== root) dirs.add(dir)
  }
  for (const dir of dirs) {
    await mkdir(dir, { recursive: true })
  }

  for (const file of bundle.files) {
    await writeFile(joinPath(root, file.relativePath), file.bytes)
  }
  await writeFile(
    joinPath(root, DATABASE_EXPORT_MANIFEST_NAME),
    encodeDatabaseExportManifest(bundle.manifest),
  )
}

function bundleToZipBytes(bundle: DatabaseExportBundle): Uint8Array {
  const entries: Record<string, Uint8Array> = {
    [DATABASE_EXPORT_MANIFEST_NAME]: encodeDatabaseExportManifest(bundle.manifest),
  }
  for (const file of bundle.files) {
    entries[file.relativePath] = file.bytes
  }
  for (const folder of bundle.manifest.folders) {
    const relative = folderPathFromManifest(bundle, folder.id)
    if (!relative) continue
    const hasChild = Object.keys(entries).some(
      (key) => key === relative || key.startsWith(`${relative}/`),
    )
    if (!hasChild) {
      entries[`${relative}/.keep`] = new Uint8Array()
    }
  }
  return zipSync(entries, { level: 6 })
}

function browserDownloadZip(fileName: string, bytes: Uint8Array) {
  const payload = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const blob = new Blob([payload], { type: 'application/zip' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

/**
 * Export the entire library: folder tree of `.dna` files + `vibegene-database.json`.
 * Desktop writes into a user-chosen directory; web downloads a zip.
 */
export async function exportDatabaseLibrary(
  onProgress?: (done: number, total: number, name: string) => void,
): Promise<ExportDatabaseLibraryResult> {
  try {
    const bundle = await buildDatabaseExportBundle(onProgress)

    if (isTauriRuntime()) {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Export VibeGene database',
      })
      if (!selected || Array.isArray(selected)) {
        return { ok: false, cancelled: true }
      }
      await writeBundleToDirectory(selected, bundle)
      return {
        ok: true,
        mode: 'directory',
        path: selected,
        projectCount: bundle.manifest.projects.length,
        folderCount: bundle.manifest.folders.length,
      }
    }

    const stamp = new Date().toISOString().slice(0, 10)
    const fileName = `vibegene-database-${stamp}.zip`
    browserDownloadZip(fileName, bundleToZipBytes(bundle))
    return {
      ok: true,
      mode: 'zip',
      fileName,
      projectCount: bundle.manifest.projects.length,
      folderCount: bundle.manifest.folders.length,
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
