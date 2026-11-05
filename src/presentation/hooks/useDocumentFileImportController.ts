import { useCallback } from 'react'
import type { PreparedImportedFile } from '../../application/documentImport/prepareImportedFile'
import type { MountedDocumentImportOptions } from '../../mountedDocumentImport'
import type { SequenceRecord } from '../../domain/types'
import type { TraceFileRecord } from '../../domain/traceTypes'
import type { SettingsEnvelope } from '../../domain/settingsFile'
import { formatSequenceLength } from '../../domain/moleculeCapabilities'

export type DocumentFileImportOptions = {
  prepareFile: (file: File, options: MountedDocumentImportOptions) => Promise<PreparedImportedFile>
  actionProfileAsync: <T>(name: string, category: string, run: () => Promise<T>, detail: string) => Promise<T>
  actionProfileSync: <T>(name: string, category: string, run: () => T, detail: string) => T
  setTraceDocument: (value: null) => void
  setStatus: (status: string) => void
  addImportOperation: (record: SequenceRecord, fileName: string) => SequenceRecord
  onTraceImport: (file: File, bytes: Uint8Array, localPath: string | undefined, trace: TraceFileRecord) => Promise<void>
  onSnapGeneImport: (prepared: Extract<PreparedImportedFile, { kind: 'snapgene' }>, fileName: string, localPath?: string) => void
  onSettingsImport: (settings: SettingsEnvelope, fileName: string) => void
  onProjectImport: (prepared: Extract<PreparedImportedFile, { kind: 'project' }>, fileName: string, localPath?: string) => void
  onSequenceImport: (record: SequenceRecord, fileName: string, localPath: string | undefined, needsTopologyChoice: boolean) => void
  /** Picked-file entry routing: settings JSON applies immediately; everything else confirms document exit before import. */
  readFileText: (file: File) => Promise<string>
  isSettingsFile: (value: unknown) => value is SettingsEnvelope
  parseSettingsJson: (text: string) => SettingsEnvelope
  applyLoadedSettings: (settings: SettingsEnvelope, fileName: string) => void
  requestDocumentExit: (action: () => void | Promise<void>) => void
}

/** Coordinates mounted-file classification and routes parsed results to injected workspace adapters. */
export function useDocumentFileImportController(options: DocumentFileImportOptions) {
  const handleFile = useCallback(async (file: File, localPath?: string) => {
    await options.actionProfileAsync(
      'importFile',
      'import',
      async () => {
        const prepared = await options.prepareFile(file, {
          localPath,
          profile: {
            sync: (name, run, detail) => options.actionProfileSync(name, 'import', run, detail),
            async: (name, run, detail) => options.actionProfileAsync(name, 'import', run, detail),
          },
          progress: {
            onNonTraceImportStarted: () => options.setTraceDocument(null),
            onSnapGeneParsed: (parsed) => {
              options.setStatus(`Imported ${file.name} (${formatSequenceLength(parsed.sequence.length, parsed.molecule)}). Parsing sequencing traces…`)
            },
          },
        })

        if (prepared.kind === 'trace') {
          await options.onTraceImport(file, prepared.file.bytes, localPath, prepared.trace)
          return
        }
        if (prepared.kind === 'snapgene') {
          options.onSnapGeneImport(prepared, file.name, localPath)
          return
        }
        if (prepared.kind === 'settings') {
          options.onSettingsImport(prepared.settings, file.name)
          return
        }
        if (prepared.kind === 'project') {
          options.onProjectImport(prepared, file.name, localPath)
          return
        }
        const imported = options.addImportOperation(prepared.record, file.name)
        options.onSequenceImport(imported, file.name, localPath, prepared.kind === 'topology-choice')
      },
      file.name,
    )
  }, [options])

  const openPickedFile = useCallback((file: File) => {
    if (/\.json$/i.test(file.name)) {
      void (async () => {
        try {
          const text = await options.readFileText(file)
          const parsed = JSON.parse(text) as unknown
          if (options.isSettingsFile(parsed)) {
            options.applyLoadedSettings(options.parseSettingsJson(text), file.name)
            return
          }
        } catch {
          // Fall through to normal import (project JSON / invalid JSON).
        }
        await options.requestDocumentExit(() => handleFile(file))
      })()
    } else {
      void options.requestDocumentExit(() => handleFile(file))
    }
  }, [options, handleFile])

  return { handleFile, openPickedFile }
}
