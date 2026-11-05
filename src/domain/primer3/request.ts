import { formatBoulderRecord } from './boulder'
import {
  PRIMER3_COORDINATE_TAGS,
  PRIMER3_RESERVED_TAGS,
  Primer3InputError,
  type BuiltPrimer3Input,
  type Primer3CoordinateFormat,
  type Primer3LibrarySource,
  type Primer3Request,
  type Primer3TemplateMapping,
} from './types'

export const PRIMER3_BUILTIN_HUMREP_PATH = '/primer3_libs/humrep_and_simple.txt'
export const PRIMER3_CUSTOM_MISPRIMING_PATH = '/user_libs/mispriming.fa'
export const PRIMER3_CUSTOM_MISHYB_PATH = '/user_libs/internal_mishyb.fa'

/** Primer3's "not set" value for SEQUENCE_FORCE_* and SEQUENCE_START_CODON_POSITION. */
const PRIMER3_UNSET_POSITION = -1000000
const LIBRARY_TAGS = new Set(['PRIMER_MISPRIMING_LIBRARY', 'PRIMER_INTERNAL_MISHYB_LIBRARY'])
const RESERVED_TAGS = new Set<string>(PRIMER3_RESERVED_TAGS)
const COORDINATE_FORMATS: Record<string, Primer3CoordinateFormat | undefined> = PRIMER3_COORDINATE_TAGS

type TemplateSelection = {
  start: number
  length: number
}

function mod(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor
}

function rotate(sequence: string, offset: number): string {
  return sequence.slice(offset) + sequence.slice(0, offset)
}

class CoordinateConverter {
  private readonly mapping: Primer3TemplateMapping
  private readonly issues: string[]

  constructor(mapping: Primer3TemplateMapping, issues: string[]) {
    this.mapping = mapping
    this.issues = issues
  }

  convert(tag: string, format: Primer3CoordinateFormat, value: string): string | undefined {
    const before = this.issues.length
    let converted: string | undefined
    switch (format) {
      case 'position':
        converted = this.position(tag, value.trim(), true)
        break
      case 'positionList':
        converted = value.trim().split(/\s+/).map((token) => this.position(tag, token, false)).join(' ')
        break
      case 'interval':
        converted = this.interval(tag, value)
        break
      case 'intervalList':
        converted = this.intervalList(tag, value)
        break
      case 'okRegionList':
        converted = this.okRegionList(tag, value)
        break
    }
    return this.issues.length === before ? converted : undefined
  }

  private templateRangeLabel(): string {
    const { offset, templateLength, recordLength, topology } = this.mapping
    const first = offset + 1
    const last = topology === 'circular' ? mod(offset + templateLength - 1, recordLength) + 1 : offset + templateLength
    return `${first}–${last}`
  }

  private parseInteger(tag: string, token: string): number | undefined {
    if (!/^-?\d+$/.test(token)) {
      this.issues.push(`${tag}: "${token}" is not a whole number`)
      return undefined
    }
    return Number(token)
  }

  /** 1-based record position -> 0-based template position. */
  private toTemplate(tag: string, recordPosition: number): number | undefined {
    const { offset, templateLength, recordLength, topology } = this.mapping
    if (recordPosition < 1 || recordPosition > recordLength) {
      this.issues.push(`${tag}: position ${recordPosition} is outside the sequence (1–${recordLength})`)
      return undefined
    }
    const templatePosition = topology === 'circular' ? mod(recordPosition - 1 - offset, recordLength) : recordPosition - 1 - offset
    if (templatePosition < 0 || templatePosition >= templateLength) {
      this.issues.push(`${tag}: position ${recordPosition} is outside the Primer3 template (${this.templateRangeLabel()})`)
      return undefined
    }
    return templatePosition
  }

  private position(tag: string, token: string, allowUnset: boolean): string | undefined {
    const value = this.parseInteger(tag, token)
    if (value === undefined) return undefined
    if (allowUnset && value === PRIMER3_UNSET_POSITION) return String(value)
    const templatePosition = this.toTemplate(tag, value)
    return templatePosition === undefined ? undefined : String(templatePosition)
  }

  private span(tag: string, start: number, length: number): string | undefined {
    if (length < 0) {
      this.issues.push(`${tag}: length ${length} must not be negative`)
      return undefined
    }
    const templateStart = this.toTemplate(tag, start)
    if (templateStart === undefined) return undefined
    if (templateStart + length > this.mapping.templateLength) {
      this.issues.push(`${tag}: ${start},${length} extends past the end of the Primer3 template (${this.templateRangeLabel()})`)
      return undefined
    }
    return `${templateStart},${length}`
  }

  private interval(tag: string, value: string): string | undefined {
    const match = /^\s*(-?\d+)\s*,\s*(-?\d+)\s*$/.exec(value)
    if (!match) {
      this.issues.push(`${tag}: expected "start,length" but got "${value}"`)
      return undefined
    }
    return this.span(tag, Number(match[1]), Number(match[2]))
  }

  private intervalList(tag: string, value: string): string | undefined {
    const intervals: string[] = []
    const pattern = /\s*(-?\d+)\s*,\s*(-?\d+)\s*/y
    let index = 0
    const text = value.trim()
    while (index < text.length) {
      pattern.lastIndex = index
      const match = pattern.exec(text)
      if (!match) {
        this.issues.push(`${tag}: expected "start,length start,length …" but got "${value}"`)
        return undefined
      }
      const converted = this.span(tag, Number(match[1]), Number(match[2]))
      if (converted !== undefined) intervals.push(converted)
      index = pattern.lastIndex
    }
    return intervals.join(' ')
  }

  private okRegionList(tag: string, value: string): string | undefined {
    const regions: string[] = []
    for (const item of value.split(';').map((part) => part.trim()).filter(Boolean)) {
      const fields = item.split(',').map((field) => field.trim())
      if (fields.length !== 4 || fields.some((field) => field !== '' && !/^-?\d+$/.test(field))) {
        this.issues.push(`${tag}: expected "leftStart,leftLength,rightStart,rightLength" but got "${item}"`)
        continue
      }
      regions.push([this.okRegionHalf(tag, fields[0], fields[1]), this.okRegionHalf(tag, fields[2], fields[3])].join(','))
    }
    return regions.join(';')
  }

  private okRegionHalf(tag: string, start: string, length: string): string {
    const unset = (field: string) => field === '' || field === '-1'
    if (unset(start)) return `${start},${length}`
    if (unset(length)) return `${this.toTemplate(tag, Number(start)) ?? ''},${length}`
    return this.span(tag, Number(start), Number(length)) ?? ','
  }
}

function cleanSequence(sequence: string, keepCase: boolean): string {
  const stripped = sequence.replace(/[\s\d]/g, '')
  return keepCase ? stripped : stripped.toUpperCase()
}

function selectionLength(request: Primer3Request, recordLength: number, issues: string[]): number | undefined {
  const { selection, topology } = request.context
  const { start, end } = selection
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < 0 || start > recordLength || end > recordLength) {
    issues.push(`The selection ${start}–${end} is outside the sequence (0–${recordLength})`)
    return undefined
  }
  if (end < start && topology !== 'circular') {
    issues.push('A selection can only wrap the origin on circular sequences')
    return undefined
  }
  const length = end >= start ? end - start : end + recordLength - start
  if (length === 0) {
    issues.push('Select a region of the sequence first')
    return undefined
  }
  return length
}

function buildTemplate(
  request: Primer3Request,
  sequence: string,
  length: number,
): { template: string; offset: number; selection: TemplateSelection } {
  const { mode, topology, selection } = request.context
  const recordLength = sequence.length
  if (mode === 'template') {
    const template = topology === 'circular' ? rotate(sequence, selection.start % recordLength).slice(0, length) : sequence.slice(selection.start, selection.end)
    return { template, offset: selection.start % recordLength, selection: { start: 0, length } }
  }
  if (topology !== 'circular') {
    return { template: sequence, offset: 0, selection: { start: selection.start, length } }
  }
  const offset = mod(selection.start + Math.floor(length / 2) - Math.floor(recordLength / 2), recordLength)
  return {
    template: rotate(sequence, offset),
    offset,
    selection: { start: mod(selection.start - offset, recordLength), length },
  }
}

function convertQuality(value: string, mapping: Primer3TemplateMapping, issues: string[]): string | undefined {
  const scores = value.trim().split(/\s+/)
  if (scores.length !== mapping.recordLength) {
    issues.push(`SEQUENCE_QUALITY: expected ${mapping.recordLength} scores (one per base) but got ${scores.length}`)
    return undefined
  }
  const rotated = [...scores.slice(mapping.offset), ...scores.slice(0, mapping.offset)]
  return rotated.slice(0, mapping.templateLength).join(' ')
}

function libraryPath(
  source: Primer3LibrarySource | undefined,
  customPath: string,
  files: Record<string, string>,
  issues: string[],
): string | undefined {
  if (!source || source.kind === 'none') return undefined
  if (source.kind === 'builtin') return PRIMER3_BUILTIN_HUMREP_PATH
  const fasta = source.fasta.replace(/\r\n?/g, '\n')
  if (!fasta.trim()) {
    issues.push(`The library "${source.name}" is empty`)
    return undefined
  }
  files[customPath] = fasta.endsWith('\n') ? fasta : `${fasta}\n`
  return customPath
}

export function buildPrimer3Input(request: Primer3Request): BuiltPrimer3Input {
  const issues: string[] = []
  const requested = { ...request.settings, ...request.sequenceTags }
  const sequence = cleanSequence(request.context.sequence, requested.PRIMER_LOWERCASE_MASKING?.trim() === '1')
  if (!sequence) throw new Primer3InputError(['The sequence is empty'])
  const invalidCharacters = [...new Set(sequence.replace(/[A-Za-z]/g, ''))]
  if (invalidCharacters.length) {
    issues.push(`The sequence contains characters Primer3 cannot read: ${invalidCharacters.join(' ')}`)
  }

  const length = selectionLength(request, sequence.length, issues)
  if (length === undefined) throw new Primer3InputError(issues)
  const { template, offset, selection } = buildTemplate(request, sequence, length)
  const mapping: Primer3TemplateMapping = {
    topology: request.context.topology,
    recordLength: sequence.length,
    templateLength: template.length,
    offset,
  }
  const converter = new CoordinateConverter(mapping, issues)
  const selectionInterval = `${selection.start},${selection.length}`
  const mode = request.context.mode

  const tags: Record<string, string> = {
    SEQUENCE_ID: request.context.name?.replace(/[\r\n]+/g, ' ').trim() || 'vibegene',
    SEQUENCE_TEMPLATE: template,
  }
  for (const [tag, rawValue] of Object.entries(requested)) {
    if (RESERVED_TAGS.has(tag) || LIBRARY_TAGS.has(tag)) continue
    const value = rawValue ?? ''
    if (value.trim() === '') continue
    if (!/^[A-Za-z0-9_]+$/.test(tag)) {
      issues.push(`"${tag}" is not a valid Primer3 tag name`)
      continue
    }
    if (/[\r\n]/.test(value)) {
      issues.push(`${tag}: the value must be a single line`)
      continue
    }
    if (tag === 'SEQUENCE_INCLUDED_REGION' && mode === 'included') continue
    if (tag === 'SEQUENCE_QUALITY') {
      const quality = convertQuality(value, mapping, issues)
      if (quality !== undefined) tags[tag] = quality
      continue
    }
    const format = COORDINATE_FORMATS[tag]
    if (!format) {
      tags[tag] = value
      continue
    }
    const converted = converter.convert(tag, format, value)
    if (converted) tags[tag] = converted
  }
  if (mode === 'target') {
    tags.SEQUENCE_TARGET = tags.SEQUENCE_TARGET ? `${tags.SEQUENCE_TARGET} ${selectionInterval}` : selectionInterval
  } else if (mode === 'included') {
    tags.SEQUENCE_INCLUDED_REGION = selectionInterval
  }
  tags.PRIMER_FIRST_BASE_INDEX = '0'
  tags.PRIMER_EXPLAIN_FLAG = '1'

  const files: Record<string, string> = {}
  const misprimingPath = libraryPath(request.misprimingLibrary, PRIMER3_CUSTOM_MISPRIMING_PATH, files, issues)
  if (misprimingPath) tags.PRIMER_MISPRIMING_LIBRARY = misprimingPath
  const mishybPath = libraryPath(request.internalMishybLibrary, PRIMER3_CUSTOM_MISHYB_PATH, files, issues)
  if (mishybPath) tags.PRIMER_INTERNAL_MISHYB_LIBRARY = mishybPath

  if (issues.length) throw new Primer3InputError(issues)
  return { boulder: formatBoulderRecord(tags), files, tags, mapping }
}
