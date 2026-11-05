import {
  exportFasta,
  exportGenBank,
  exportGenPept,
  exportProjectJson,
  exportSnapGene,
} from './parsers'
import { exportSnapGeneProtein } from './snapgeneProtein'
import type { SnapGeneExportOptions } from './snapgeneEnzymeExport'
import type { SequenceRecord } from './types'

export type ProjectFileFormat =
  | 'snapgene'
  | 'snapgene-protein'
  | 'genbank'
  | 'genpept'
  | 'embl'
  | 'fasta'
  | 'vibegene-json'
  | 'plain-text'
  | 'ab1'
  | 'unknown'

export type ProjectFileFamily =
  | 'snapgene'
  | 'genbank'
  | 'embl'
  | 'fasta'
  | 'vibegene'
  | 'plain-sequence'
  | 'unknown'

export type ProjectFileSerializeOptions = {
  snapGene?: SnapGeneExportOptions
}

export type ProjectFileSerializationResult =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; error: string }

export type ProjectFileFormatDefinition = {
  format: ProjectFileFormat
  family: ProjectFileFamily
  label: string
  extensions: readonly string[]
  readable: boolean
  writable: boolean
  serialize?: (
    record: SequenceRecord,
    options?: ProjectFileSerializeOptions,
  ) => Uint8Array
  unsupportedWriteReason?: string
}

const textEncoder = new TextEncoder()

function encodeText(value: string): Uint8Array {
  return textEncoder.encode(value)
}

export const PROJECT_FILE_FORMATS: Readonly<
  Record<ProjectFileFormat, ProjectFileFormatDefinition>
> = {
  snapgene: {
    format: 'snapgene',
    family: 'snapgene',
    label: 'SnapGene DNA',
    extensions: ['dna'],
    readable: true,
    writable: true,
    serialize: (record, options) => exportSnapGene(record, options?.snapGene),
  },
  'snapgene-protein': {
    format: 'snapgene-protein',
    family: 'snapgene',
    label: 'SnapGene Protein',
    extensions: ['prot'],
    readable: true,
    writable: true,
    serialize: (record) => exportSnapGeneProtein(record),
  },
  genbank: {
    format: 'genbank',
    family: 'genbank',
    label: 'GenBank',
    extensions: [
      'gb',
      'gbk',
      'gbff',
      'gbank',
      'gbs',
      'gbwithparts',
      'gen',
      'genbank',
      'ape',
      'flat',
    ],
    readable: true,
    writable: true,
    serialize: (record) => encodeText(exportGenBank(record)),
  },
  genpept: {
    format: 'genpept',
    family: 'genbank',
    label: 'GenPept Protein',
    extensions: ['gp', 'gpff'],
    readable: true,
    writable: true,
    serialize: (record) => encodeText(exportGenPept(record)),
  },
  embl: {
    format: 'embl',
    family: 'embl',
    label: 'EMBL',
    extensions: ['embl', 'emb', 'ebl', 'dat'],
    readable: true,
    writable: false,
    unsupportedWriteReason:
      'VibeGene can read EMBL files but cannot safely export EMBL yet.',
  },
  fasta: {
    format: 'fasta',
    family: 'fasta',
    label: 'FASTA',
    extensions: ['fasta', 'fa', 'fas', 'fna', 'ffn', 'fsa', 'mpfa', 'faa', 'aa', 'pep', 'protein'],
    readable: true,
    writable: true,
    serialize: (record) => encodeText(exportFasta(record)),
  },
  'vibegene-json': {
    format: 'vibegene-json',
    family: 'vibegene',
    label: 'VibeGene JSON',
    extensions: ['json'],
    readable: true,
    writable: true,
    serialize: (record) => encodeText(`${exportProjectJson(record)}\n`),
  },
  'plain-text': {
    format: 'plain-text',
    family: 'plain-sequence',
    label: 'Plain sequence',
    extensions: ['seq', 'txt'],
    readable: true,
    writable: true,
    serialize: (record) => encodeText(`${record.sequence}\n`),
  },
  ab1: {
    format: 'ab1',
    family: 'plain-sequence',
    label: 'AB1 chromatogram',
    extensions: ['ab1'],
    readable: true,
    writable: false,
    unsupportedWriteReason: 'AB1 chromatogram files cannot be written from VibeGene.',
  },
  unknown: {
    format: 'unknown',
    family: 'unknown',
    label: 'Unknown format',
    extensions: [],
    readable: false,
    writable: false,
    unsupportedWriteReason: 'The original file format is unknown and cannot be overwritten.',
  },
}

const FORMAT_BY_EXTENSION = new Map<string, ProjectFileFormat>(
  Object.values(PROJECT_FILE_FORMATS).flatMap((definition) =>
    definition.extensions.map((extension) => [
      extension.toLowerCase(),
      definition.format,
    ]),
  ),
)

export function fileExtension(fileName: string): string {
  const basename = fileName.replace(/\\/g, '/').split('/').pop() ?? ''
  const dot = basename.lastIndexOf('.')
  return dot > 0 && dot < basename.length - 1
    ? basename.slice(dot + 1).toLowerCase()
    : ''
}

export function inferProjectFileFormat(fileName: string): ProjectFileFormat {
  return FORMAT_BY_EXTENSION.get(fileExtension(fileName)) ?? 'unknown'
}

export function projectFileFormatDefinition(
  format: ProjectFileFormat,
): ProjectFileFormatDefinition {
  return PROJECT_FILE_FORMATS[format]
}

export function projectFileFormatLabel(format: ProjectFileFormat): string {
  return projectFileFormatDefinition(format).label
}

export function projectFileLabelForFileName(fileName: string): string {
  const extension = fileExtension(fileName)
  if (!extension) return 'All files'
  const format = inferProjectFileFormat(fileName)
  return format === 'unknown' ? extension.toUpperCase() : projectFileFormatLabel(format)
}

export function canWriteProjectFileFormat(format: ProjectFileFormat): boolean {
  return projectFileFormatDefinition(format).writable
}

export function serializeProjectFile(
  format: ProjectFileFormat,
  record: SequenceRecord,
  options?: ProjectFileSerializeOptions,
): ProjectFileSerializationResult {
  const definition = projectFileFormatDefinition(format)
  if (!definition.writable || !definition.serialize) {
    return {
      ok: false,
      error:
        definition.unsupportedWriteReason ??
        `${definition.label} files cannot be safely written.`,
    }
  }
  try {
    return { ok: true, bytes: definition.serialize(record, options) }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : `${definition.label} export failed.`,
    }
  }
}

/**
 * Sequence document formats Vibegene opens via File → Open.
 * Aligned with SnapGene's common text interchange formats.
 */
export const SEQUENCE_OPEN_EXTENSIONS = Object.values(PROJECT_FILE_FORMATS)
  .filter((definition) => definition.readable)
  .flatMap((definition) => definition.extensions.map((extension) => `.${extension}`))

export function isIosWebFilePicker(): boolean {
  if (typeof navigator === 'undefined') return false
  const platform = navigator.platform ?? ''
  const userAgent = navigator.userAgent ?? ''
  const maxTouchPoints = navigator.maxTouchPoints ?? 0
  const isiPhoneLike = /iPhone|iPad|iPod/i.test(userAgent)
  const isTouchMac = platform === 'MacIntel' && maxTouchPoints > 1
  return isiPhoneLike || isTouchMac
}

/**
 * Comma-separated list for `<input accept="…">`.
 *
 * iPhone/iPad Safari can gray out valid scientific sequence files when the picker
 * is filtered only by uncommon filename extensions, so on iOS web we omit the
 * accept filter and validate the selected file after picking instead.
 */
export const SEQUENCE_OPEN_ACCEPT = isIosWebFilePicker() ? undefined : SEQUENCE_OPEN_EXTENSIONS.join(',')

export function isSequenceOpenFileName(fileName: string): boolean {
  return projectFileFormatDefinition(inferProjectFileFormat(fileName)).readable
}

/**
 * Extensions that open as linear DNA without asking circular vs linear
 * (plain `.seq` text and Sanger `.ab1` chromatograms).
 */
export { opensAsLinearDnaFileName } from './sequenceTopology'

/**
 * Files folder sync will copy as constructs. `.json` sidecars stay openable via File → Open.
 * `.txt` primer lists are scanned separately and stored on Database folders, not as constructs.
 */
export function isFolderScopedSyncFileName(fileName: string): boolean {
  const name = fileName.replace(/\\/g, '/').split('/').pop() ?? ''
  if (!name || name.startsWith('.') || name === '.keep') return false
  const lower = name.toLowerCase()
  if (lower.endsWith('.json') || lower.endsWith('.txt')) return false
  return isSequenceOpenFileName(name)
}

export function isFolderScopedPrimerListFileName(fileName: string): boolean {
  const name = fileName.replace(/\\/g, '/').split('/').pop() ?? ''
  if (!name || name.startsWith('.') || name === '.keep') return false
  return name.toLowerCase().endsWith('.txt')
}
