import type { CommonFeatureTemplate } from '../../domain/commonFeatures'
import type { VibegeneEnzymeDisplayImport } from '../../domain/snapgeneEnzymeData'
import type { MwLadder } from '../../domain/mwLadders'
import type { SequenceRecord } from '../../domain/types'
import type { TraceFileRecord } from '../../domain/traceTypes'
import type { SettingsEnvelope } from '../../domain/settingsFile'
import { isTraceDocumentFileName } from '../../domain/traceDocumentFile'

export type ImportedFileInput = {
  fileName: string
  bytes: Uint8Array
  localPath?: string
}

export type ImportedProject = {
  record: SequenceRecord
  userCommonFeatures?: CommonFeatureTemplate[]
  displaySettings?: unknown
  customMwLadders?: MwLadder[]
}

export type ImportedFileParserPorts = {
  decodeText: (bytes: Uint8Array) => string
  isAb1: (bytes: Uint8Array) => boolean
  isSnapGene: (bytes: Uint8Array) => boolean
  parseTrace: (file: ImportedFileInput) => Promise<TraceFileRecord>
  parseSnapGene: (bytes: Uint8Array, fileName: string) => SequenceRecord
  parseSnapGeneTraces: (
    bytes: Uint8Array,
    sequence: string,
    topology: SequenceRecord['topology'],
    record: SequenceRecord,
  ) => Promise<TraceFileRecord[]>
  parseProjectJson: (text: string) => ImportedProject
  isSettingsFile: (value: unknown) => value is SettingsEnvelope
  parseSettingsJson: (text: string) => SettingsEnvelope
  importRequiresTopologyChoice: (text: string, fileName: string) => boolean
  parseSequenceBytes: (buffer: ArrayBuffer, fileName: string) => SequenceRecord
  enzymeDisplayFromSnapGeneRecord: (record: SequenceRecord) => VibegeneEnzymeDisplayImport | null
}

export type ImportProfilingPorts = {
  sync: <T>(name: string, run: () => T, detail: string) => T
  async: <T>(name: string, run: () => Promise<T>, detail: string) => Promise<T>
}

export type ImportProgressPorts = {
  /** Runs once a file is known not to be a standalone trace, before parsing starts. */
  onNonTraceImportStarted?: (file: ImportedFileInput) => void
  onSnapGeneParsed?: (record: SequenceRecord, file: ImportedFileInput) => void
}

export type PreparedImportedFile =
  | {
      kind: 'trace'
      file: ImportedFileInput
      trace: TraceFileRecord
    }
  | {
      kind: 'snapgene'
      file: ImportedFileInput
      record: SequenceRecord
      traces: TraceFileRecord[]
      enzymeDisplay: VibegeneEnzymeDisplayImport | null
    }
  | {
      kind: 'settings'
      file: ImportedFileInput
      settings: SettingsEnvelope
    }
  | {
      kind: 'project'
      file: ImportedFileInput
      project: ImportedProject
    }
  | {
      kind: 'topology-choice'
      file: ImportedFileInput
      record: SequenceRecord
    }
  | {
      kind: 'sequence'
      file: ImportedFileInput
      record: SequenceRecord
    }

function bytesAsArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer
}

function parseJsonOrNull(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

/**
 * Classify and parse a mounted-workspace import without committing React state.
 * The shell owns the resulting state transitions; parser and profiling ports keep
 * this workflow deterministic and independently testable.
 */
export async function prepareImportedFile(
  file: ImportedFileInput,
  parsers: ImportedFileParserPorts,
  profile: ImportProfilingPorts,
  progress?: ImportProgressPorts,
): Promise<PreparedImportedFile> {
  const { bytes, fileName } = file

  if (parsers.isAb1(bytes) || isTraceDocumentFileName(fileName)) {
    return {
      kind: 'trace',
      file,
      // Trace parsing historically only appears inside the encompassing importFile profile.
      trace: await parsers.parseTrace(file),
    }
  }

  progress?.onNonTraceImportStarted?.(file)

  if (parsers.isSnapGene(bytes)) {
    const record = profile.sync(
      'parseSnapGene',
      () => parsers.parseSnapGene(bytes, fileName),
      fileName,
    )
    progress?.onSnapGeneParsed?.(record, file)
    const traces = await profile.async(
      'parseSnapGeneTraces',
      () => parsers.parseSnapGeneTraces(bytes, record.sequence, record.topology, record),
      fileName,
    )
    return {
      kind: 'snapgene',
      file,
      record,
      traces,
      enzymeDisplay: parsers.enzymeDisplayFromSnapGeneRecord(record),
    }
  }

  const text = parsers.decodeText(bytes)
  if (text.trim().startsWith('{') && /\.json$/i.test(fileName)) {
    const parsedJson = parseJsonOrNull(text)
    if (parsers.isSettingsFile(parsedJson)) {
      return {
        kind: 'settings',
        file,
        settings: parsers.parseSettingsJson(text),
      }
    }
    return {
      kind: 'project',
      file,
      project: profile.sync('parseProjectJson', () => parsers.parseProjectJson(text), fileName),
    }
  }

  const needsTopologyChoice = parsers.importRequiresTopologyChoice(text, fileName)
  const record = profile.sync(
    'parseSequenceBytes',
    () => parsers.parseSequenceBytes(bytesAsArrayBuffer(bytes), fileName),
    fileName,
  )
  return {
    kind: needsTopologyChoice && record.molecule !== 'protein' ? 'topology-choice' : 'sequence',
    file,
    record,
  }
}
