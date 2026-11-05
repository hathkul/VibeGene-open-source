import { parseBoulderRecord } from './boulder'
import type {
  Primer3Oligo,
  Primer3OligoKind,
  Primer3Pair,
  Primer3Result,
  Primer3TemplateMapping,
} from './types'

const OLIGO_TAG_PATTERN = /^PRIMER_(LEFT|RIGHT|INTERNAL)_(\d+)(?:_(.+))?$/
const PAIR_TAG_PATTERN = /^PRIMER_PAIR_(\d+)_(.+)$/

const EXPLAIN_TAGS: Record<string, Primer3OligoKind | 'pair'> = {
  PRIMER_LEFT_EXPLAIN: 'left',
  PRIMER_RIGHT_EXPLAIN: 'right',
  PRIMER_INTERNAL_EXPLAIN: 'internal',
  PRIMER_PAIR_EXPLAIN: 'pair',
}

type OptionalOligoNumber =
  | 'selfAny'
  | 'selfEnd'
  | 'selfAnyTh'
  | 'selfEndTh'
  | 'hairpinTh'
  | 'endStability'
  | 'templateMispriming'
  | 'templateMisprimingTh'

const OLIGO_NUMBER_SUFFIXES: Record<string, OptionalOligoNumber> = {
  SELF_ANY: 'selfAny',
  SELF_END: 'selfEnd',
  SELF_ANY_TH: 'selfAnyTh',
  SELF_END_TH: 'selfEndTh',
  HAIRPIN_TH: 'hairpinTh',
  END_STABILITY: 'endStability',
  TEMPLATE_MISPRIMING: 'templateMispriming',
  TEMPLATE_MISPRIMING_TH: 'templateMisprimingTh',
}

type OptionalPairNumber = 'productSize' | 'productTm' | 'complAny' | 'complEnd' | 'complAnyTh' | 'complEndTh'

const PAIR_NUMBER_SUFFIXES: Record<string, OptionalPairNumber> = {
  PRODUCT_SIZE: 'productSize',
  PRODUCT_TM: 'productTm',
  COMPL_ANY: 'complAny',
  COMPL_END: 'complEnd',
  COMPL_ANY_TH: 'complAnyTh',
  COMPL_END_TH: 'complEndTh',
}

const KIND_BY_NAME: Record<string, Primer3OligoKind> = {
  LEFT: 'left',
  RIGHT: 'right',
  INTERNAL: 'internal',
}

function toNumber(value: string | undefined): number {
  if (value === undefined || value.trim() === '') return Number.NaN
  return Number(value)
}

function splitMessages(value: string | undefined): string[] {
  if (!value) return []
  return value.split(';').map((message) => message.trim()).filter(Boolean)
}

function recordSpan(templateStart: number, length: number, mapping: Primer3TemplateMapping): { recordStart: number; recordEnd: number } {
  if (mapping.topology !== 'circular') {
    return { recordStart: mapping.offset + templateStart, recordEnd: mapping.offset + templateStart + length }
  }
  const recordStart = (mapping.offset + templateStart) % mapping.recordLength
  const end = recordStart + length
  return { recordStart, recordEnd: end > mapping.recordLength ? end - mapping.recordLength : end }
}

function buildOligo(
  kind: Primer3OligoKind,
  rank: number,
  fields: Map<string, string>,
  mapping: Primer3TemplateMapping,
): Primer3Oligo | undefined {
  const location = /^\s*(-?\d+)\s*,\s*(\d+)\s*$/.exec(fields.get('') ?? '')
  if (!location) return undefined
  const position = Number(location[1])
  const length = Number(location[2])
  const templateStart = kind === 'right' ? position - length + 1 : position
  const oligo: Primer3Oligo = {
    kind,
    rank,
    sequence: fields.get('SEQUENCE') ?? '',
    length,
    templateStart,
    templateEnd: templateStart + length,
    ...recordSpan(templateStart, length, mapping),
    tm: toNumber(fields.get('TM')),
    gcPercent: toNumber(fields.get('GC_PERCENT')),
    penalty: toNumber(fields.get('PENALTY')),
    extra: {},
  }
  for (const [suffix, value] of fields) {
    if (suffix === '' || suffix === 'SEQUENCE' || suffix === 'TM' || suffix === 'GC_PERCENT' || suffix === 'PENALTY') continue
    const numberKey = OLIGO_NUMBER_SUFFIXES[suffix]
    if (numberKey) oligo[numberKey] = toNumber(value)
    else if (suffix === 'LIBRARY_MISPRIMING') oligo.libraryMispriming = value
    else if (suffix === 'PROBLEMS') oligo.problems = value
    else oligo.extra[suffix] = value
  }
  return oligo
}

function buildPair(rank: number, fields: Map<string, string>): Primer3Pair {
  const pair: Primer3Pair = { rank, penalty: toNumber(fields.get('PENALTY')), extra: {} }
  for (const [suffix, value] of fields) {
    if (suffix === 'PENALTY') continue
    const numberKey = PAIR_NUMBER_SUFFIXES[suffix]
    if (numberKey) pair[numberKey] = toNumber(value)
    else pair.extra[suffix] = value
  }
  return pair
}

function groupFields(groups: Map<number, Map<string, string>>, rank: number, suffix: string, value: string) {
  let fields = groups.get(rank)
  if (!fields) {
    fields = new Map()
    groups.set(rank, fields)
  }
  fields.set(suffix, value)
}

export function parsePrimer3Output(output: string, input: string, mapping: Primer3TemplateMapping): Primer3Result {
  const raw = parseBoulderRecord(output)
  const oligoFields: Record<Primer3OligoKind, Map<number, Map<string, string>>> = {
    left: new Map(),
    right: new Map(),
    internal: new Map(),
  }
  const pairFields = new Map<number, Map<string, string>>()
  const explain: Primer3Result['explain'] = {}
  const errors: string[] = []
  const warnings: string[] = []

  for (const [tag, value] of Object.entries(raw)) {
    const explainKind = EXPLAIN_TAGS[tag]
    if (explainKind) {
      explain[explainKind] = value
      continue
    }
    if (tag === 'PRIMER_WARNING') {
      warnings.push(...splitMessages(value))
      continue
    }
    if (tag === 'PRIMER_ERROR' || tag.endsWith('_ERROR')) {
      errors.push(...splitMessages(value))
      continue
    }
    const oligoMatch = OLIGO_TAG_PATTERN.exec(tag)
    if (oligoMatch) {
      groupFields(oligoFields[KIND_BY_NAME[oligoMatch[1]]], Number(oligoMatch[2]), oligoMatch[3] ?? '', value)
      continue
    }
    const pairMatch = PAIR_TAG_PATTERN.exec(tag)
    if (pairMatch) groupFields(pairFields, Number(pairMatch[1]), pairMatch[2], value)
  }

  const collect = (kind: Primer3OligoKind) =>
    [...oligoFields[kind]]
      .sort(([a], [b]) => a - b)
      .map(([rank, fields]) => buildOligo(kind, rank, fields, mapping))
      .filter((oligo): oligo is Primer3Oligo => oligo !== undefined)
  const lefts = collect('left')
  const rights = collect('right')
  const internals = collect('internal')

  const pairCount = Number(raw.PRIMER_PAIR_NUM_RETURNED ?? 0)
  const pairs: Primer3Pair[] = []
  if (pairCount > 0) {
    for (let rank = 0; rank < pairCount; rank += 1) {
      const pair = buildPair(rank, pairFields.get(rank) ?? new Map())
      pair.left = lefts.find((oligo) => oligo.rank === rank)
      pair.right = rights.find((oligo) => oligo.rank === rank)
      pair.internal = internals.find((oligo) => oligo.rank === rank)
      pairs.push(pair)
    }
  }

  return { pairs, lefts, rights, internals, explain, warnings, errors, raw, input, output }
}
