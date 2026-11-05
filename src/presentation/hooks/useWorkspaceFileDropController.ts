import { useTraceAlignment } from './traceAlignmentContext'
import { useCallback, useRef } from 'react'
import { appendAlignedTraceFiles } from '../../domain/traceFileWorkflow'
import { parseDnaComparisonFile } from '../../domain/dnaComparisonImport'
import type { DnaComparisonSource } from '../../domain/dnaComparisonTypes'
import { parseProteinComparisonFile } from '../../domain/proteinComparisonImport'
import { parseSequenceBytes } from '../../domain/parsers'
import { isAb1Bytes } from '../../domain/ab1Parser'
import { isSettingsFile } from '../../domain/settingsFile'
import { isTraceDocumentFileName, pairDroppedFiles } from '../../application/traceDocument'
import { isAlignmentTraceFileName } from '../../domain/alignmentTraceImport'
import { isSequenceOpenFileName } from '../../domain/fileFormats'
import { workspaceFileDropMode } from '../../domain/workspaceFileDrop'
import type { TraceFileRecord } from '../../domain/traceTypes'

export type WorkspaceFileDropContext = {
  blocked: boolean
  alignmentsVisible: boolean
  alignmentMode: 'trace' | 'comparative'
  molecule: 'dna' | 'rna' | 'protein'
  sequence: string
  topology: 'linear' | 'circular'
  traceFiles: TraceFileRecord[]
  dnaComparisonSources: DnaComparisonSource[]
}

type WorkspaceFileDropOptions = {
  contextRef: { current: WorkspaceFileDropContext }
  setStatus: (status: string) => void
  createDnaLibrary: (files: File[]) => Promise<void>
  updateDnaComparisonSources: (sources: DnaComparisonSource[]) => void
  updateProteinComparisonSources: (sources: Awaited<ReturnType<typeof parseProteinComparisonFile>>[]) => void
  onTraceFilesChange: (traces: TraceFileRecord[]) => void
  onAlignmentTracesAdded: (result: { scrollTemplateIndex?: number; scrollToTraceId?: string }) => void
  requestDocumentExit: (action: () => void | Promise<void>) => void | Promise<void>
  handleFile: (file: File, path?: string) => Promise<void>
  openTraceInNewWorkspace: (file: File, bytes: Uint8Array, path?: string) => Promise<void>
  openRecordInNewTab: (record: import('../../domain/types').SequenceRecord, path?: string) => void
  addImportOperation: (record: import('../../domain/types').SequenceRecord, fileName: string) => import('../../domain/types').SequenceRecord
  readFileBytes: (file: File) => Promise<Uint8Array>
  decodeText: (bytes: Uint8Array) => string
}

/** Owns multi-file drop routing; parsers and workspace/native actions stay injected. */
export function useWorkspaceFileDropController(options: WorkspaceFileDropOptions) {
  const alignPending = useTraceAlignment()
  const busyRef = useRef(false)

  const handleFiles = useCallback(async (files: File[], localPaths?: string[]) => {
    if (busyRef.current) return
    const ctx = options.contextRef.current
    if (ctx.blocked || !files.length) return
    const mode = workspaceFileDropMode({ alignmentsVisible: ctx.alignmentsVisible, molecule: ctx.molecule, files })
    busyRef.current = true
    try {
      if (mode === 'dna-library') {
        options.setStatus('Creating DNA library…')
        try {
          await options.createDnaLibrary(files)
        } catch (error) {
          options.setStatus(error instanceof Error ? error.message : 'Could not create DNA library.')
        }
        return
      }
      if (mode === 'dna-alignment') {
        if (ctx.alignmentMode === 'comparative') {
          const parsed: DnaComparisonSource[] = []
          const failures: string[] = []
          for (const file of files.filter((candidate) => isSequenceOpenFileName(candidate.name))) {
            try { parsed.push(await parseDnaComparisonFile(file)) }
            catch (error) { failures.push(`${file.name}: ${error instanceof Error ? error.message : 'could not parse'}`) }
          }
          if (!parsed.length) {
            options.setStatus(failures[0] ?? 'No supported DNA comparison files in drop.')
            return
          }
          options.updateDnaComparisonSources([...ctx.dnaComparisonSources, ...parsed])
          options.setStatus(failures.length
            ? `Added ${parsed.length} DNA comparison sequence${parsed.length === 1 ? '' : 's'}. ${failures.join(' · ')}`
            : `Added ${parsed.length} DNA comparison sequence${parsed.length === 1 ? '' : 's'}.`)
          return
        }
        const supported = files.filter((file) => isAlignmentTraceFileName(file.name))
        if (!supported.length) {
          options.setStatus('No supported alignment files in drop.')
          return
        }
        options.setStatus('Parsing alignment files…')
        const result = await appendAlignedTraceFiles(supported, ctx.sequence, ctx.traceFiles, { topology: ctx.topology, alignPending })
        if (!result.addedCount) {
          options.setStatus('No supported trace or sequence files found')
          return
        }
        options.onTraceFilesChange(result.traces)
        options.onAlignmentTracesAdded({ scrollTemplateIndex: result.scrollTemplateIndex ?? undefined, scrollToTraceId: result.scrollToTraceId ?? undefined })
        options.setStatus(`Added ${result.addedCount} alignment${result.addedCount === 1 ? '' : 's'}`)
        return
      }
      if (mode === 'protein-alignment') {
        const parsed: Awaited<ReturnType<typeof parseProteinComparisonFile>>[] = []
        const failures: string[] = []
        for (const file of files) {
          if (!isSequenceOpenFileName(file.name) && !/\.ab1$/i.test(file.name)) continue
          try { parsed.push(await parseProteinComparisonFile(file)) }
          catch (error) { failures.push(`${file.name}: ${error instanceof Error ? error.message : 'could not parse'}`) }
        }
        if (!parsed.length) {
          options.setStatus(failures[0] ?? 'No supported comparison files in drop.')
          return
        }
        options.updateProteinComparisonSources(parsed)
        options.setStatus(failures.length
          ? `Added ${parsed.length} comparison sequence${parsed.length === 1 ? '' : 's'}. ${failures.join(' · ')}`
          : `Added ${parsed.length} comparison sequence${parsed.length === 1 ? '' : 's'}.`)
        return
      }
      const supported = pairDroppedFiles(files, localPaths).filter(({ file }) => isSequenceOpenFileName(file.name))
      if (!supported.length) {
        options.setStatus('Dropped files are not supported sequence formats.')
        return
      }
      const [first, ...rest] = supported
      await options.requestDocumentExit(async () => {
        await options.handleFile(first!.file, first!.path)
        for (const { file, path } of rest) {
          try {
            const bytes = await options.readFileBytes(file)
            if (isAb1Bytes(bytes) || isTraceDocumentFileName(file.name)) {
              await options.openTraceInNewWorkspace(file, bytes, path)
              continue
            }
            if (/\.json$/i.test(file.name)) {
              let parsedJson: unknown = null
              try { parsedJson = JSON.parse(options.decodeText(bytes)) } catch { /* route as sequence below */ }
              if (isSettingsFile(parsedJson)) continue
            }
            options.openRecordInNewTab(options.addImportOperation(parseSequenceBytes(bytes.buffer as ArrayBuffer, file.name), file.name), path)
          } catch (error) {
            options.setStatus(`Could not open ${file.name}: ${error instanceof Error ? error.message : String(error)}`)
          }
        }
        if (rest.length) options.setStatus(`Opened ${supported.length} file${supported.length === 1 ? '' : 's'}.`)
      })
    } finally {
      busyRef.current = false
    }
  }, [alignPending, options])

  return { handleFiles }
}
