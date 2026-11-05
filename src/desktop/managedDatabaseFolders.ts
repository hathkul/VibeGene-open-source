import { isTauriRuntime } from './tauriRuntime'

export const MANAGED_DATABASE_FOLDERS_DIR = 'database-folders'

function normalizeFolderId(folderId: string): string {
  const trimmed = folderId.trim()
  if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) {
    throw new Error('Invalid managed database folder id')
  }
  return trimmed
}

export function normalizeManagedDatabaseRelativePath(relativePath: string): string {
  if (!relativePath || /^[\\/]/.test(relativePath) || /^[A-Za-z]:/.test(relativePath)) {
    throw new Error('Managed database path must be relative')
  }
  const parts = relativePath.replace(/\\/g, '/').split('/')
  if (
    parts.some(
      (part) =>
        !part ||
        part === '.' ||
        part === '..' ||
        part.includes('\0') ||
        /[<>:"|?*]/.test(part),
    )
  ) {
    throw new Error('Invalid managed database relative path')
  }
  return parts.join('/')
}

/** Path relative to Tauri's AppData base directory. */
export function managedDatabaseFilePath(folderId: string, relativePath: string): string {
  return `${MANAGED_DATABASE_FOLDERS_DIR}/${normalizeFolderId(folderId)}/${normalizeManagedDatabaseRelativePath(relativePath)}`
}

function parentPath(path: string): string {
  const slash = path.lastIndexOf('/')
  return slash > 0 ? path.slice(0, slash) : path
}

/** Mirror exact bytes into app-managed storage. Returns false in the web app. */
export async function writeManagedDatabaseFile(
  folderId: string,
  relativePath: string,
  bytes: Uint8Array,
): Promise<boolean> {
  if (!isTauriRuntime()) return false
  const path = managedDatabaseFilePath(folderId, relativePath)
  const [{ BaseDirectory }, { mkdir, writeFile }] = await Promise.all([
    import('@tauri-apps/api/path'),
    import('@tauri-apps/plugin-fs'),
  ])
  await mkdir(parentPath(path), { recursive: true, baseDir: BaseDirectory.AppData })
  await writeFile(path, new Uint8Array(bytes), { baseDir: BaseDirectory.AppData })
  return true
}

/** Read managed bytes, or null when absent/not running in Tauri. */
export async function readManagedDatabaseFile(
  folderId: string,
  relativePath: string,
): Promise<Uint8Array | null> {
  if (!isTauriRuntime()) return null
  const path = managedDatabaseFilePath(folderId, relativePath)
  const [{ BaseDirectory }, { exists, readFile }] = await Promise.all([
    import('@tauri-apps/api/path'),
    import('@tauri-apps/plugin-fs'),
  ])
  if (!(await exists(path, { baseDir: BaseDirectory.AppData }))) return null
  return new Uint8Array(await readFile(path, { baseDir: BaseDirectory.AppData }))
}

/** Remove one mirrored file. Returns false when absent or in the web app. */
export async function deleteManagedDatabaseFile(
  folderId: string,
  relativePath: string,
): Promise<boolean> {
  if (!isTauriRuntime()) return false
  const path = managedDatabaseFilePath(folderId, relativePath)
  const [{ BaseDirectory }, { exists, remove }] = await Promise.all([
    import('@tauri-apps/api/path'),
    import('@tauri-apps/plugin-fs'),
  ])
  if (!(await exists(path, { baseDir: BaseDirectory.AppData }))) return false
  await remove(path, { baseDir: BaseDirectory.AppData })
  return true
}

/** Remove all managed files for a top-level folder. */
export async function deleteManagedDatabaseFolder(folderId: string): Promise<boolean> {
  if (!isTauriRuntime()) return false
  const path = `${MANAGED_DATABASE_FOLDERS_DIR}/${normalizeFolderId(folderId)}`
  const [{ BaseDirectory }, { exists, remove }] = await Promise.all([
    import('@tauri-apps/api/path'),
    import('@tauri-apps/plugin-fs'),
  ])
  if (!(await exists(path, { baseDir: BaseDirectory.AppData }))) return false
  await remove(path, { recursive: true, baseDir: BaseDirectory.AppData })
  return true
}
