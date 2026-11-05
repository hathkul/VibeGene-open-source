import { bytesToFile, readDroppedDesktopPaths } from './fileIo'
import { isTauriRuntime } from './tauriRuntime'
import type { NativeConvertToLibraryMemberPickResult } from '../application/ports/dnaLibraryCommandPorts'

/** Desktop file picker for convert-to-library member ingestion. */
export async function pickNativeConvertToLibraryMemberFiles(): Promise<NativeConvertToLibraryMemberPickResult> {
  if (!isTauriRuntime()) return { kind: 'cancelled' }
  const { open } = await import('@tauri-apps/plugin-dialog')
  const selected = await open({
    title: 'Convert to library — add member files',
    multiple: true,
    directory: false,
    filters: [
      { name: 'Trace / sequence files', extensions: ['ab1', 'seq', 'txt', 'fasta', 'fa', 'fna', 'gb', 'gbk', 'genbank'] },
      { name: 'All files', extensions: ['*'] },
    ],
  })
  if (!selected) return { kind: 'cancelled' }
  const paths = Array.isArray(selected) ? selected : [selected]
  const opened = await readDroppedDesktopPaths(paths)
  if (!opened.length) return { kind: 'unreadable' }
  return { kind: 'files', files: opened.map((file) => bytesToFile(file.name, file.bytes)) }
}
