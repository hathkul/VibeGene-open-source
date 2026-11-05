import { alignTracesWithWorkers } from '../workerAdapters/traceAlignment'
import { createDnaLibraryFromFiles, DEFAULT_DNA_LIBRARY_NAME } from '../domain/dnaLibrary'
import { createId } from '../domain/sequence'
import type { SequenceRecord } from '../domain/types'
import { putFileOpenHandoff } from '../storage/fileOpenHandoff'
import { putHandoffRecord } from '../storage/projects'
import { bytesToFile, readDroppedDesktopPaths } from './fileIo'
import { openOrFocusHybridWindow } from './hybridWindows'
import { isTauriRuntime } from './tauriRuntime'
import { openNewWorkspaceWindow, openWorkspaceWindow, openWorkspaceWindowWithHandoff } from './workspaceWindow'

/** Open a construct in a brand-new workspace window (never reuse the focused editor). */
export async function openRecordInNewWorkspaceWindow(
  record: SequenceRecord,
  options?: { title?: string; initiallyUnsaved?: boolean },
): Promise<boolean> {
  const key = createId('hist')
  await putHandoffRecord(key, record)
  const opened = await openWorkspaceWindowWithHandoff(key, {
    title: options?.title ?? record.name,
    focus: true,
    initiallyUnsaved: options?.initiallyUnsaved,
  })
  return opened !== false
}

/**
 * Create a DNA library from files and open it in a new workspace window.
 * Embeds members on the record so the handoff boots with traces.
 */
export async function createDnaLibraryInNewWindow(files: File[]): Promise<SequenceRecord> {
  const { record, members } = await createDnaLibraryFromFiles(files, {
    name: files.length === 1 ? files[0]!.name : DEFAULT_DNA_LIBRARY_NAME,
    topology: 'linear',
    alignPending: alignTracesWithWorkers,
  })
  const withTraces: SequenceRecord = { ...record, traceFiles: members }
  const opened = await openRecordInNewWorkspaceWindow(withTraces, {
    title: withTraces.name,
    initiallyUnsaved: true,
  })
  if (!opened) {
    throw new Error('Could not open the DNA library in a new window.')
  }
  return withTraces
}

/** Native file picker → DNA library in a new workspace (no App / hidden input required). */
export async function pickAndCreateDnaLibraryInNewWindow(): Promise<SequenceRecord | null> {
  if (!isTauriRuntime()) return null
  const { open } = await import('@tauri-apps/plugin-dialog')
  const selected = await open({
    title: 'New DNA library',
    multiple: true,
    directory: false,
    filters: [
      { name: 'Trace / sequence files', extensions: ['ab1', 'seq', 'txt'] },
      { name: 'All files', extensions: ['*'] },
    ],
  })
  if (!selected) return null
  const paths = Array.isArray(selected) ? selected : [selected]
  const opened = await readDroppedDesktopPaths(paths)
  if (!opened.length) {
    throw new Error('Could not read the selected files.')
  }
  const files = opened.map((file) => bytesToFile(file.name, file.bytes))
  return createDnaLibraryInNewWindow(files)
}

/** Native File → Open picker that opens the chosen local file in its own workspace. */
export async function pickAndOpenSequenceFileInNewWorkspaceWindow(): Promise<boolean> {
  if (!isTauriRuntime()) return false
  const { open } = await import('@tauri-apps/plugin-dialog')
  const selected = await open({
    title: 'Open sequence file',
    multiple: false,
    directory: false,
    filters: [
      {
        name: 'Sequence and construct files',
        extensions: [
          'dna', 'prot', 'gb', 'gbk', 'gbff', 'gbank', 'gbs', 'gbwithparts', 'gen', 'genbank', 'ape', 'flat',
          'gp', 'gpff', 'embl', 'emb', 'ebl', 'dat', 'fasta', 'fa', 'fas', 'fna', 'ffn', 'fsa', 'mpfa',
          'faa', 'aa', 'pep', 'protein', 'seq', 'txt', 'ab1', 'json',
        ],
      },
      { name: 'All files', extensions: ['*'] },
    ],
  })
  if (!selected || Array.isArray(selected)) return false

  const [file] = await readDroppedDesktopPaths([selected])
  if (!file) return false

  const fileHandoff = createId('fopen')
  await putFileOpenHandoff(fileHandoff, {
    path: file.path,
    name: file.name,
    bytes: file.bytes,
  })
  const opened = await openWorkspaceWindow({
    searchParams: { fileHandoff, openPath: file.path },
    title: `${file.name} — from disk`,
    focus: true,
    documentKey: { kind: 'file', path: file.path },
  })
  return opened !== false
}

/**
 * Handle File → New * / New window without requiring a workspace webview.
 * Returns true when the action was fully handled here.
 */
export async function tryHandleGlobalNewFileMenuAction(action: string): Promise<boolean> {
  switch (action) {
    case 'file.new-dna': {
      await openOrFocusHybridWindow('new-dna-file')
      return true
    }
    case 'file.new-protein': {
      await openOrFocusHybridWindow('new-protein-file')
      return true
    }
    case 'file.new-dna-library': {
      try {
        await pickAndCreateDnaLibraryInNewWindow()
      } catch (error) {
        console.error('Could not create DNA library from menu', error)
      }
      return true
    }
    case 'file.new-window': {
      await openNewWorkspaceWindow()
      return true
    }
    default:
      return false
  }
}
