import { isFolderScopedPrimerListFileName, isFolderScopedSyncFileName } from '../domain/fileFormats'
import { rejectedSequenceDocumentReason } from '../domain/parsers'
import { isPrimerListTabText } from '../domain/primerExport'
import { normalizeFolderSyncRelativePath } from '../storage/databaseSync'
import type {
  FolderScopedSyncDependencies,
  FolderScopedSyncFolderScan,
  FolderScopedSyncScannedFile,
} from '../storage/folderScopedSyncService'
import { hashSyncSourceBytes } from '../storage/syncSourceHash'
import { coerceBytes } from './fileIo'

const authorizedRoots = new Set<string>()
async function authorizeRoot(root: string): Promise<void> {
  if (authorizedRoots.has(root)) return
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('authorize_folder_sync', { path: root })
  authorizedRoots.add(root)
}

function joinPath(root: string, relativePath: string): string {
  const normalized = normalizeFolderSyncRelativePath(relativePath)
  if (!normalized || normalized.split('/').includes('..')) {
    throw new Error('Unsafe folder sync relative path')
  }
  const separator = root.includes('\\') ? '\\' : '/'
  return [
    root.replace(/[/\\]+$/, ''),
    ...normalized.split('/').filter(Boolean),
  ].join(separator)
}

function parentDir(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const slash = normalized.lastIndexOf('/')
  const parent = slash > 0 ? normalized.slice(0, slash) : normalized
  return path.includes('\\') ? parent.replace(/\//g, '\\') : parent
}

function isSupportedSequencePath(relativePath: string): boolean {
  return isFolderScopedSyncFileName(relativePath)
}

async function readFile(externalPath: string, relativePath: string): Promise<Uint8Array> {
  await authorizeRoot(externalPath)
  const { readFile: read } = await import('@tauri-apps/plugin-fs')
  return coerceBytes(await read(joinPath(externalPath, relativePath)))
}

async function fileExists(externalPath: string, relativePath: string): Promise<boolean> {
  await authorizeRoot(externalPath)
  const { exists } = await import('@tauri-apps/plugin-fs')
  return exists(joinPath(externalPath, relativePath))
}

async function deleteFile(externalPath: string, relativePath: string): Promise<void> {
  await authorizeRoot(externalPath)
  const { remove } = await import('@tauri-apps/plugin-fs')
  await remove(joinPath(externalPath, relativePath))
}

async function scanFolder(externalPath: string): Promise<FolderScopedSyncFolderScan> {
  await authorizeRoot(externalPath)
  const { readDir, readFile: read } = await import('@tauri-apps/plugin-fs')
  const diskFiles: FolderScopedSyncScannedFile[] = []
  const primerListFiles: FolderScopedSyncScannedFile[] = []
  const decoder = new TextDecoder()

  async function walk(absoluteDirectory: string, relativeDirectory: string): Promise<void> {
    const entries = await readDir(absoluteDirectory)
    entries.sort((left, right) => (left.name ?? '').localeCompare(right.name ?? ''))
    for (const entry of entries) {
      const name = entry.name
      if (!name || name === '.' || name === '..') continue
      const relativePath = relativeDirectory ? `${relativeDirectory}/${name}` : name
      const absolutePath = joinPath(externalPath, relativePath)
      if (entry.isDirectory) {
        await walk(absolutePath, relativePath)
        continue
      }
      if (isSupportedSequencePath(relativePath)) {
        const bytes = coerceBytes(await read(absolutePath))
        if (rejectedSequenceDocumentReason(bytes)) continue
        diskFiles.push({
          relativePath: normalizeFolderSyncRelativePath(relativePath),
          // Retain the hash/path, loading bytes again only for changed files.
          bytes: new Uint8Array(),
          contentHash: await hashSyncSourceBytes(bytes),
        })
        continue
      }
      if (!isFolderScopedPrimerListFileName(relativePath)) continue
      const bytes = coerceBytes(await read(absolutePath))
      if (!isPrimerListTabText(decoder.decode(bytes))) continue
      primerListFiles.push({
        relativePath: normalizeFolderSyncRelativePath(relativePath),
        bytes,
        contentHash: await hashSyncSourceBytes(bytes),
      })
    }
  }

  await walk(externalPath, '')
  return { diskFiles, primerListFiles }
}

/** Find baseline matches without retaining a full-folder scan in WebView memory. */
async function findFilesByContentHash(
  externalPath: string,
  expectedHash: string,
): Promise<string[] | null> {
  await authorizeRoot(externalPath)
  const { readDir, readFile: read } = await import('@tauri-apps/plugin-fs')
  const matches: string[] = []
  let inspectedEntries = 0
  const maxEntries = 20_000
  const maxDepth = 64

  async function walk(absoluteDirectory: string, relativeDirectory: string, depth: number): Promise<boolean> {
    if (depth > maxDepth) return false
    const entries = await readDir(absoluteDirectory)
    entries.sort((left, right) => (left.name ?? '').localeCompare(right.name ?? ''))
    for (const entry of entries) {
      inspectedEntries += 1
      if (inspectedEntries > maxEntries) return false
      const name = entry.name
      if (!name || name === '.' || name === '..') continue
      const relativePath = relativeDirectory ? `${relativeDirectory}/${name}` : name
      const absolutePath = joinPath(externalPath, relativePath)
      if (entry.isDirectory) {
        if (!(await walk(absolutePath, relativePath, depth + 1))) return false
        continue
      }
      if (!isSupportedSequencePath(relativePath)) continue
      const bytes = coerceBytes(await read(absolutePath))
      if ((await hashSyncSourceBytes(bytes)) === expectedHash) {
        matches.push(normalizeFolderSyncRelativePath(relativePath))
        if (matches.length > 1) return true
      }
    }
    return true
  }

  const complete = await walk(externalPath, '', 0)
  return complete ? matches : null
}

async function writeFile(
  externalPath: string,
  relativePath: string,
  bytes: Uint8Array,
): Promise<{ contentHash: string }> {
  await authorizeRoot(externalPath)
  const { mkdir, readFile: read, rename, writeFile: write } = await import(
    '@tauri-apps/plugin-fs'
  )
  const target = joinPath(externalPath, relativePath)
  const directory = parentDir(target)
  await mkdir(directory, { recursive: true })

  const suffix =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const temporary = `${target}.vibegene-${suffix}.tmp`
  const expectedHash = await hashSyncSourceBytes(bytes)
  await write(temporary, new Uint8Array(bytes))
  const temporaryBytes = coerceBytes(await read(temporary))
  if ((await hashSyncSourceBytes(temporaryBytes)) !== expectedHash) {
    throw new Error(`Could not verify temporary write for ${relativePath}`)
  }
  await rename(temporary, target)
  // The temporary payload was verified before the atomic rename; reading the
  // target back again duplicates the same full-file allocation and hash.
  return { contentHash: expectedHash }
}

export const desktopFolderScopedSyncIo: Pick<
  FolderScopedSyncDependencies,
  'scanFolder' | 'readFile' | 'writeFile'
> & {
  fileExists: typeof fileExists
  deleteFile: typeof deleteFile
  findFilesByContentHash: typeof findFilesByContentHash
} = {
  scanFolder,
  readFile,
  writeFile,
  fileExists,
  deleteFile,
  findFilesByContentHash,
}
