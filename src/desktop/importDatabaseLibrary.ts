import { unzipSync } from 'fflate'
import { isTauriRuntime } from './tauriRuntime'
import { coerceBytes } from './fileIo'
import {
  importDatabaseFromVirtualFs,
  importFolderTreeFromVirtualFs,
  type ImportDatabaseResult,
  type ImportFolderResult,
  type VirtualFsEntry,
} from '../storage/databaseImport'
import { setTopLevelFolderSyncMapping } from '../storage/projectLibrary'

function joinPath(root: string, child: string): string {
  const sep = root.includes('\\') ? '\\' : '/'
  return `${root.replace(/[/\\]+$/, '')}${sep}${child}`
}

function fileNameFromPath(path: string): string {
  const parts = path.split(/[/\\]/)
  return parts[parts.length - 1] || path
}

async function readDirectoryTree(
  root: string,
  onProgress?: (done: number, total: number, name: string) => void,
): Promise<VirtualFsEntry[]> {
  const { readDir } = await import('@tauri-apps/plugin-fs')
  const out: VirtualFsEntry[] = []

  async function walk(absDir: string, relativeDir: string) {
    const entries = await readDir(absDir)
    for (const entry of entries) {
      const name = entry.name
      if (!name || name === '.' || name === '..') continue
      const abs = joinPath(absDir, name)
      const rel = relativeDir ? `${relativeDir}/${name}` : name
      if (entry.isDirectory) {
        await walk(abs, rel)
        continue
      }
      out.push({ relativePath: rel.replace(/\\/g, '/'), bytes: new Uint8Array() })
      if (out.length === 1 || out.length % 250 === 0) {
        onProgress?.(0, 0, `Scanning folder… ${out.length} files found`)
      }
    }
  }

  await walk(root, '')
  return out
}

function unzipToVirtualFs(bytes: Uint8Array): VirtualFsEntry[] {
  const unzipped = unzipSync(bytes)
  const out: VirtualFsEntry[] = []
  for (const [path, data] of Object.entries(unzipped)) {
    if (!path || path.endsWith('/')) continue
    out.push({
      relativePath: path.replace(/\\/g, '/').replace(/^\.\//, ''),
      bytes: data,
    })
  }
  return out
}

async function pickDirectory(title: string): Promise<string | null> {
  const { open } = await import('@tauri-apps/plugin-dialog')
  const selected = await open({ directory: true, multiple: false, title })
  if (!selected || Array.isArray(selected)) return null
  return selected
}

export type ImportDatabaseLibraryResult =
  | { ok: true; result: ImportDatabaseResult; source: string; sourceKind: 'directory' | 'zip' }
  | { ok: false; cancelled: true }
  | { ok: false; cancelled?: false; error: string }

export type ImportFolderLibraryResult =
  | { ok: true; result: ImportFolderResult; source: string }
  | { ok: false; cancelled: true }
  | { ok: false; cancelled?: false; error: string }

/** Desktop: pick export folder (Cancel → pick .zip). Web: pass a .zip File. */
export async function importDatabaseLibrary(
  source?: File | null,
  onProgress?: (done: number, total: number, name: string) => void,
): Promise<ImportDatabaseLibraryResult> {
  try {
    let entries: VirtualFsEntry[]
    let sourceLabel: string

    let sourceKind: 'directory' | 'zip'

    if (source) {
      const lower = source.name.toLowerCase()
      const bytes = coerceBytes(await source.arrayBuffer())
      if (!lower.endsWith('.zip')) {
        return { ok: false, error: 'Choose a VibeGene database export .zip' }
      }
      entries = unzipToVirtualFs(bytes)
      sourceLabel = source.name
      sourceKind = 'zip'
    } else if (isTauriRuntime()) {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const dir = await open({
        directory: true,
        multiple: false,
        title: 'Import database — select export folder (Cancel to pick a .zip)',
      })
      if (dir && !Array.isArray(dir)) {
        entries = await readDirectoryTree(dir)
        sourceLabel = dir
        sourceKind = 'directory'
      } else {
        const zipPath = await open({
          multiple: false,
          title: 'Import database — select export .zip',
          filters: [{ name: 'Zip archive', extensions: ['zip'] }],
        })
        if (!zipPath || Array.isArray(zipPath)) return { ok: false, cancelled: true }
        const { readFile } = await import('@tauri-apps/plugin-fs')
        entries = unzipToVirtualFs(coerceBytes(await readFile(zipPath)))
        sourceLabel = zipPath
        sourceKind = 'zip'
      }
    } else {
      return { ok: false, error: 'Choose a database export .zip to import' }
    }

    const result = await importDatabaseFromVirtualFs(entries, onProgress)
    return { ok: true, result, source: sourceLabel, sourceKind }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/** Desktop: pick a folder. Web: pass rootName + files from a webkitdirectory input. */
export async function importFolderLibrary(
  source?: { rootName: string; files: File[] } | null,
  onProgress?: (done: number, total: number, name: string) => void,
): Promise<ImportFolderLibraryResult> {
  try {
    let entries: VirtualFsEntry[]
    let rootName: string
    let sourceLabel: string
    let externalPath: string | null = null
    let loadBytes: ((entry: VirtualFsEntry) => Promise<Uint8Array>) | undefined

    if (source) {
      rootName = source.rootName
      sourceLabel = source.rootName
      entries = []
      for (const file of source.files) {
        const relative =
          (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
        const parts = relative.replace(/\\/g, '/').split('/')
        const trimmed = parts.length > 1 ? parts.slice(1).join('/') : parts[0]!
        if (!trimmed) continue
        entries.push({
          relativePath: trimmed,
          bytes: coerceBytes(await file.arrayBuffer()),
        })
      }
    } else if (isTauriRuntime()) {
      const dir = await pickDirectory('Import folder into database')
      if (!dir) return { ok: false, cancelled: true }
      rootName = fileNameFromPath(dir)
      sourceLabel = dir
      externalPath = dir
      entries = await readDirectoryTree(dir, onProgress)
      loadBytes = async (entry) => {
        const { readFile } = await import('@tauri-apps/plugin-fs')
        const path = entry.relativePath.split('/').reduce(joinPath, dir)
        return coerceBytes(await readFile(path))
      }
    } else {
      return { ok: false, error: 'Choose a folder to import' }
    }

    const result = await importFolderTreeFromVirtualFs(rootName, entries, onProgress, loadBytes)
    if (externalPath) {
      await setTopLevelFolderSyncMapping(result.rootFolderId, externalPath, {
        lastSyncedAt: new Date().toISOString(),
        importedContentsAreBaseline: true,
      })
    }
    return { ok: true, result, source: sourceLabel }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
