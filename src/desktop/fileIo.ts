import { projectFileLabelForFileName } from '../domain/fileFormats'
import { isTauriRuntime } from './tauriRuntime'

function browserDownloadBytes(fileName: string, contents: Uint8Array, type: string) {
  const payload = contents.buffer.slice(contents.byteOffset, contents.byteOffset + contents.byteLength) as ArrayBuffer
  const blob = new Blob([payload], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

function browserDownloadText(fileName: string, contents: string, type: string) {
  const blob = new Blob([contents], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  if (dot < 0) return ''
  return fileName.slice(dot + 1).toLowerCase()
}

/** Normalize Tauri invoke / fs payloads into a real byte buffer. */
export function coerceBytes(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return data
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  if (ArrayBuffer.isView(data)) {
    const view = data as ArrayBufferView
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
  }
  if (Array.isArray(data)) return Uint8Array.from(data as number[])
  throw new Error(`Unexpected binary payload (${typeof data})`)
}

export function bytesToFile(name: string, bytes: Uint8Array, type = 'application/octet-stream'): File {
  // Copy into a standalone ArrayBuffer so File/Blob never alias a detached IPC buffer.
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return new File([copy.buffer], name, { type })
}

/** Pick one native directory without changing any application sync preferences. */
export async function pickDesktopDirectory(title: string): Promise<string | null> {
  if (!isTauriRuntime()) return null
  const { open } = await import('@tauri-apps/plugin-dialog')
  const selected = await open({ directory: true, multiple: false, title })
  return !selected || Array.isArray(selected) ? null : selected
}

/**
 * Save bytes to a user-chosen path in Tauri, or trigger a browser download otherwise.
 * Returns the destination path when saved via the native dialog, or null if cancelled / browser download.
 */
export async function saveBytesAs(
  fileName: string,
  contents: Uint8Array,
  type = 'application/octet-stream',
  options?: { defaultPath?: string },
): Promise<string | null> {
  if (!isTauriRuntime()) {
    browserDownloadBytes(fileName, contents, type)
    return null
  }

  const { save } = await import('@tauri-apps/plugin-dialog')
  const { writeFile } = await import('@tauri-apps/plugin-fs')
  const ext = extensionOf(fileName)
  const path = await save({
    defaultPath: options?.defaultPath ?? fileName,
    filters: ext
      ? [{ name: projectFileLabelForFileName(fileName), extensions: [ext] }, { name: 'All files', extensions: ['*'] }]
      : undefined,
  })
  if (!path) return null
  await writeFile(path, contents)
  return path
}

/** Save text via native dialog in Tauri, or browser download otherwise. */
export async function saveTextAs(
  fileName: string,
  contents: string,
  type = 'text/plain',
  options?: { defaultPath?: string },
): Promise<string | null> {
  if (!isTauriRuntime()) {
    browserDownloadText(fileName, contents, type)
    return null
  }
  const bytes = new TextEncoder().encode(contents)
  return saveBytesAs(fileName, bytes, type, options)
}

export type OpenedDesktopFile = {
  path: string
  name: string
  bytes: Uint8Array
}

function fileNameFromPath(path: string): string {
  const parts = path.split(/[/\\]/)
  return parts[parts.length - 1] || path
}

async function readDesktopPaths(paths: string[]): Promise<OpenedDesktopFile[]> {
  if (!paths.length) return []
  const { invoke } = await import('@tauri-apps/api/core')
  const out: OpenedDesktopFile[] = []
  for (const path of paths) {
    try {
      const raw = await invoke<unknown>('read_user_file', { path })
      const data = coerceBytes(raw)
      if (data.byteLength === 0) {
        console.error('Opened file was empty', path)
        continue
      }
      out.push({ path, name: fileNameFromPath(path), bytes: data })
    } catch (error) {
      console.error('Failed to read opened file', path, error)
    }
  }
  return out
}

/**
 * Register dropped OS paths so `read_user_file` is allowed, then read their bytes.
 */
export async function readDroppedDesktopPaths(paths: string[]): Promise<OpenedDesktopFile[]> {
  if (!isTauriRuntime() || !paths.length) return []
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('register_user_file_paths', { paths })
  return readDesktopPaths(paths)
}

/** Overwrite an existing desktop path (registers the path for Tauri FS scope first). */
export async function writeBytesToPath(path: string, contents: Uint8Array): Promise<void> {
  if (!isTauriRuntime()) {
    throw new Error('Direct path writes are only available in the desktop app.')
  }
  const { invoke } = await import('@tauri-apps/api/core')
  const { writeFile } = await import('@tauri-apps/plugin-fs')
  await invoke('register_user_file_paths', { paths: [path] })
  await writeFile(path, contents)
}

export async function desktopPathExists(path: string): Promise<boolean> {
  if (!isTauriRuntime()) return false
  const { invoke } = await import('@tauri-apps/api/core')
  const { exists } = await import('@tauri-apps/plugin-fs')
  await invoke('register_user_file_paths', { paths: [path] })
  return exists(path)
}

/** Rename a desktop file in its current directory; returns the new absolute path. */
export async function renameDesktopFile(path: string, nextFileName: string): Promise<string> {
  if (!isTauriRuntime()) {
    throw new Error('Direct path renames are only available in the desktop app.')
  }
  const cleaned = nextFileName.trim().replace(/[/\\]/g, '')
  if (!cleaned) throw new Error('Enter a file name.')
  const { invoke } = await import('@tauri-apps/api/core')
  const { dirname, join } = await import('@tauri-apps/api/path')
  const { exists, rename } = await import('@tauri-apps/plugin-fs')
  const directory = await dirname(path)
  const destination = await join(directory, cleaned)
  if (destination === path) return path
  if (await exists(destination)) {
    throw new Error(`A file named “${cleaned}” already exists in that folder.`)
  }
  await invoke('register_user_file_paths', { paths: [path, destination] })
  await rename(path, destination)
  return destination
}

/** Write into a selected desktop folder without overwriting an existing file. */
export async function writeUniqueBytesToDirectory(
  directoryPath: string,
  fileName: string,
  contents: Uint8Array,
): Promise<string> {
  if (!isTauriRuntime()) {
    throw new Error('Folder exports are only available in the desktop app.')
  }
  const [{ join }, { exists }] = await Promise.all([
    import('@tauri-apps/api/path'),
    import('@tauri-apps/plugin-fs'),
  ])
  const dot = fileName.lastIndexOf('.')
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName
  const extension = dot > 0 ? fileName.slice(dot) : ''
  let candidate = await join(directoryPath, fileName)
  let copy = 2
  while (await exists(candidate)) {
    candidate = await join(directoryPath, `${stem} (${copy})${extension}`)
    copy += 1
  }
  await writeBytesToPath(candidate, contents)
  return candidate
}

/** Open a previously opened local file path on desktop. */
export async function openRecentLocalPath(path: string): Promise<File | null> {
  const files = await readDroppedDesktopPaths([path])
  if (!files[0]) return null
  return bytesToFile(files[0].name, files[0].bytes)
}

export type DesktopFileDropHandlers = {
  onHoverChange?: (active: boolean, position?: { x: number; y: number }) => void
  onFiles: (files: OpenedDesktopFile[], position?: { x: number; y: number }) => void | Promise<void>
}

/**
 * Subscribe to OS file drag/drop for the current Tauri webview.
 * HTML5 drag-and-drop does not receive OS files while Tauri drag-drop is enabled.
 */
export async function subscribeDesktopFileDrops(
  handlers: DesktopFileDropHandlers,
): Promise<() => void> {
  if (!isTauriRuntime()) return () => {}

  const { getCurrentWebview } = await import('@tauri-apps/api/webview')
  return getCurrentWebview().onDragDropEvent((event) => {
    const payload = event.payload
    if (payload.type === 'enter' || payload.type === 'over') {
      handlers.onHoverChange?.(true, payload.position)
      return
    }
    if (payload.type === 'leave') {
      handlers.onHoverChange?.(false)
      return
    }
    if (payload.type === 'drop') {
      handlers.onHoverChange?.(false)
      void (async () => {
        const files = await readDroppedDesktopPaths(payload.paths ?? [])
        if (files.length) await handlers.onFiles(files, payload.position)
      })()
    }
  })
}

/**
 * Subscribe to macOS/iOS/Android "Open With" / document opens.
 * Calls `onFiles` for cold-start pending paths and for warm opens while running.
 */
export async function subscribeDesktopOpenedFiles(
  onFiles: (files: OpenedDesktopFile[]) => void | Promise<void>,
): Promise<() => void> {
  if (!isTauriRuntime()) return () => {}

  const { invoke } = await import('@tauri-apps/api/core')
  const { listen } = await import('@tauri-apps/api/event')

  const deliver = async (paths: string[]) => {
    const files = await readDesktopPaths(paths)
    if (files.length) await onFiles(files)
  }

  try {
    const pending = await invoke<string[]>('take_pending_open_paths')
    if (pending.length) await deliver(pending)
  } catch (error) {
    console.error('Failed to take pending open paths', error)
  }

  const unlisten = await listen<string[]>('opened-files', (event) => {
    void deliver(event.payload ?? [])
  })

  return () => {
    unlisten()
  }
}
