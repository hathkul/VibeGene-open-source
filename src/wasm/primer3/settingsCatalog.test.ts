import { describe, expect, it } from 'vitest'
import { runPrimer3Engine } from './engine'
import { parsePrimer3Output } from '../../domain/primer3/parseResult'
import { buildPrimer3Input } from '../../domain/primer3/request'
import { PRIMER3_COORDINATE_TAGS, PRIMER3_RESERVED_TAGS } from '../../domain/primer3/types'
import {
  PRIMER3_SETTINGS,
  primer3DefaultSettings,
  type Primer3SettingDef,
  type Primer3SettingGroup,
  type Primer3SettingKind,
} from '../../domain/primer3/settingsCatalog'

/** Tags accepted by primer3_core 2.6.1 read_boulder.c (extracted from source). */
const ACCEPTED_BOULDER_TAGS = [
  'P3_COMMENT',
  'P3_FILE_FLAG',
  'P3_FILE_ID',
  'PRIMER_ANNEALING_TEMP',
  'PRIMER_DMSO_CONC',
  'PRIMER_DMSO_FACTOR',
  'PRIMER_DNA_CONC',
  'PRIMER_DNTP_CONC',
  'PRIMER_EXPLAIN_FLAG',
  'PRIMER_FIRST_BASE_INDEX',
  'PRIMER_FORMAMIDE_CONC',
  'PRIMER_GC_CLAMP',
  'PRIMER_INSIDE_PENALTY',
  'PRIMER_INTERNAL_DMSO_CONC',
  'PRIMER_INTERNAL_DMSO_FACTOR',
  'PRIMER_INTERNAL_DNA_CONC',
  'PRIMER_INTERNAL_DNTP_CONC',
  'PRIMER_INTERNAL_FORMAMIDE_CONC',
  'PRIMER_INTERNAL_MAX_BOUND',
  'PRIMER_INTERNAL_MAX_GC',
  'PRIMER_INTERNAL_MAX_HAIRPIN_TH',
  'PRIMER_INTERNAL_MAX_LIBRARY_MISHYB',
  'PRIMER_INTERNAL_MAX_NS_ACCEPTED',
  'PRIMER_INTERNAL_MAX_POLY_X',
  'PRIMER_INTERNAL_MAX_SELF_ANY',
  'PRIMER_INTERNAL_MAX_SELF_ANY_TH',
  'PRIMER_INTERNAL_MAX_SELF_END',
  'PRIMER_INTERNAL_MAX_SELF_END_TH',
  'PRIMER_INTERNAL_MAX_SIZE',
  'PRIMER_INTERNAL_MAX_TM',
  'PRIMER_INTERNAL_MIN_3_PRIME_OVERLAP_OF_JUNCTION',
  'PRIMER_INTERNAL_MIN_5_PRIME_OVERLAP_OF_JUNCTION',
  'PRIMER_INTERNAL_MIN_BOUND',
  'PRIMER_INTERNAL_MIN_GC',
  'PRIMER_INTERNAL_MIN_QUALITY',
  'PRIMER_INTERNAL_MIN_SIZE',
  'PRIMER_INTERNAL_MIN_THREE_PRIME_DISTANCE',
  'PRIMER_INTERNAL_MIN_TM',
  'PRIMER_INTERNAL_MISHYB_LIBRARY',
  'PRIMER_INTERNAL_MUST_MATCH_FIVE_PRIME',
  'PRIMER_INTERNAL_MUST_MATCH_THREE_PRIME',
  'PRIMER_INTERNAL_OPT_BOUND',
  'PRIMER_INTERNAL_OPT_GC_PERCENT',
  'PRIMER_INTERNAL_OPT_SIZE',
  'PRIMER_INTERNAL_OPT_TM',
  'PRIMER_INTERNAL_SALT_DIVALENT',
  'PRIMER_INTERNAL_SALT_MONOVALENT',
  'PRIMER_INTERNAL_WT_BOUND_GT',
  'PRIMER_INTERNAL_WT_BOUND_LT',
  'PRIMER_INTERNAL_WT_END_QUAL',
  'PRIMER_INTERNAL_WT_GC_PERCENT_GT',
  'PRIMER_INTERNAL_WT_GC_PERCENT_LT',
  'PRIMER_INTERNAL_WT_HAIRPIN_TH',
  'PRIMER_INTERNAL_WT_LIBRARY_MISHYB',
  'PRIMER_INTERNAL_WT_NUM_NS',
  'PRIMER_INTERNAL_WT_SELF_ANY',
  'PRIMER_INTERNAL_WT_SELF_ANY_TH',
  'PRIMER_INTERNAL_WT_SELF_END',
  'PRIMER_INTERNAL_WT_SELF_END_TH',
  'PRIMER_INTERNAL_WT_SEQ_QUAL',
  'PRIMER_INTERNAL_WT_SIZE_GT',
  'PRIMER_INTERNAL_WT_SIZE_LT',
  'PRIMER_INTERNAL_WT_TM_GT',
  'PRIMER_INTERNAL_WT_TM_LT',
  'PRIMER_LIBERAL_BASE',
  'PRIMER_LIB_AMBIGUITY_CODES_CONSENSUS',
  'PRIMER_LOWERCASE_MASKING',
  'PRIMER_MASK_3P_DIRECTION',
  'PRIMER_MASK_5P_DIRECTION',
  'PRIMER_MASK_FAILURE_RATE',
  'PRIMER_MASK_KMERLIST_PATH',
  'PRIMER_MASK_KMERLIST_PREFIX',
  'PRIMER_MASK_TEMPLATE',
  'PRIMER_MAX_BOUND',
  'PRIMER_MAX_END_GC',
  'PRIMER_MAX_END_STABILITY',
  'PRIMER_MAX_GC',
  'PRIMER_MAX_HAIRPIN_TH',
  'PRIMER_MAX_LIBRARY_MISPRIMING',
  'PRIMER_MAX_NS_ACCEPTED',
  'PRIMER_MAX_POLY_X',
  'PRIMER_MAX_SELF_ANY',
  'PRIMER_MAX_SELF_ANY_TH',
  'PRIMER_MAX_SELF_END',
  'PRIMER_MAX_SELF_END_TH',
  'PRIMER_MAX_SIZE',
  'PRIMER_MAX_TEMPLATE_MISPRIMING',
  'PRIMER_MAX_TEMPLATE_MISPRIMING_TH',
  'PRIMER_MAX_TM',
  'PRIMER_MIN_3_PRIME_OVERLAP_OF_JUNCTION',
  'PRIMER_MIN_5_PRIME_OVERLAP_OF_JUNCTION',
  'PRIMER_MIN_BOUND',
  'PRIMER_MIN_END_QUALITY',
  'PRIMER_MIN_GC',
  'PRIMER_MIN_LEFT_THREE_PRIME_DISTANCE',
  'PRIMER_MIN_QUALITY',
  'PRIMER_MIN_RIGHT_THREE_PRIME_DISTANCE',
  'PRIMER_MIN_SIZE',
  'PRIMER_MIN_THREE_PRIME_DISTANCE',
  'PRIMER_MIN_TM',
  'PRIMER_MISPRIMING_LIBRARY',
  'PRIMER_MUST_MATCH_FIVE_PRIME',
  'PRIMER_MUST_MATCH_THREE_PRIME',
  'PRIMER_NUM_RETURN',
  'PRIMER_OPT_BOUND',
  'PRIMER_OPT_GC_PERCENT',
  'PRIMER_OPT_SIZE',
  'PRIMER_OPT_TM',
  'PRIMER_OUTSIDE_PENALTY',
  'PRIMER_PAIR_MAX_COMPL_ANY',
  'PRIMER_PAIR_MAX_COMPL_ANY_TH',
  'PRIMER_PAIR_MAX_COMPL_END',
  'PRIMER_PAIR_MAX_COMPL_END_TH',
  'PRIMER_PAIR_MAX_DIFF_TM',
  'PRIMER_PAIR_MAX_LIBRARY_MISPRIMING',
  'PRIMER_PAIR_MAX_TEMPLATE_MISPRIMING',
  'PRIMER_PAIR_MAX_TEMPLATE_MISPRIMING_TH',
  'PRIMER_PAIR_WT_COMPL_ANY',
  'PRIMER_PAIR_WT_COMPL_ANY_TH',
  'PRIMER_PAIR_WT_COMPL_END',
  'PRIMER_PAIR_WT_COMPL_END_TH',
  'PRIMER_PAIR_WT_DIFF_TM',
  'PRIMER_PAIR_WT_IO_PENALTY',
  'PRIMER_PAIR_WT_LIBRARY_MISPRIMING',
  'PRIMER_PAIR_WT_PRODUCT_SIZE_GT',
  'PRIMER_PAIR_WT_PRODUCT_SIZE_LT',
  'PRIMER_PAIR_WT_PRODUCT_TM_GT',
  'PRIMER_PAIR_WT_PRODUCT_TM_LT',
  'PRIMER_PAIR_WT_PR_PENALTY',
  'PRIMER_PAIR_WT_TEMPLATE_MISPRIMING',
  'PRIMER_PAIR_WT_TEMPLATE_MISPRIMING_TH',
  'PRIMER_PICK_ANYWAY',
  'PRIMER_PICK_INTERNAL_OLIGO',
  'PRIMER_PICK_LEFT_PRIMER',
  'PRIMER_PICK_RIGHT_PRIMER',
  'PRIMER_PRODUCT_MAX_TM',
  'PRIMER_PRODUCT_MIN_TM',
  'PRIMER_PRODUCT_OPT_SIZE',
  'PRIMER_PRODUCT_OPT_TM',
  'PRIMER_PRODUCT_SIZE_RANGE',
  'PRIMER_QUALITY_RANGE_MAX',
  'PRIMER_QUALITY_RANGE_MIN',
  'PRIMER_SALT_CORRECTIONS',
  'PRIMER_SALT_DIVALENT',
  'PRIMER_SALT_MONOVALENT',
  'PRIMER_SECONDARY_STRUCTURE_ALIGNMENT',
  'PRIMER_SEQUENCING_ACCURACY',
  'PRIMER_SEQUENCING_INTERVAL',
  'PRIMER_SEQUENCING_LEAD',
  'PRIMER_SEQUENCING_SPACING',
  'PRIMER_TASK',
  'PRIMER_THERMODYNAMIC_OLIGO_ALIGNMENT',
  'PRIMER_THERMODYNAMIC_PARAMETERS_PATH',
  'PRIMER_THERMODYNAMIC_TEMPLATE_ALIGNMENT',
  'PRIMER_TM_FORMULA',
  'PRIMER_WT_BOUND_GT',
  'PRIMER_WT_BOUND_LT',
  'PRIMER_WT_END_QUAL',
  'PRIMER_WT_END_STABILITY',
  'PRIMER_WT_GC_PERCENT_GT',
  'PRIMER_WT_GC_PERCENT_LT',
  'PRIMER_WT_HAIRPIN_TH',
  'PRIMER_WT_LIBRARY_MISPRIMING',
  'PRIMER_WT_MASK_FAILURE_RATE',
  'PRIMER_WT_NUM_NS',
  'PRIMER_WT_POS_PENALTY',
  'PRIMER_WT_SELF_ANY',
  'PRIMER_WT_SELF_ANY_TH',
  'PRIMER_WT_SELF_END',
  'PRIMER_WT_SELF_END_TH',
  'PRIMER_WT_SEQ_QUAL',
  'PRIMER_WT_SIZE_GT',
  'PRIMER_WT_SIZE_LT',
  'PRIMER_WT_TEMPLATE_MISPRIMING',
  'PRIMER_WT_TEMPLATE_MISPRIMING_TH',
  'PRIMER_WT_TM_GT',
  'PRIMER_WT_TM_LT',
  'SEQUENCE_EXCLUDED_REGION',
  'SEQUENCE_FORCE_LEFT_END',
  'SEQUENCE_FORCE_LEFT_START',
  'SEQUENCE_FORCE_RIGHT_END',
  'SEQUENCE_FORCE_RIGHT_START',
  'SEQUENCE_ID',
  'SEQUENCE_INCLUDED_REGION',
  'SEQUENCE_INTERNAL_EXCLUDED_REGION',
  'SEQUENCE_INTERNAL_OLIGO',
  'SEQUENCE_INTERNAL_OVERLAP_JUNCTION_LIST',
  'SEQUENCE_OVERHANG_LEFT',
  'SEQUENCE_OVERHANG_RIGHT',
  'SEQUENCE_OVERLAP_JUNCTION_LIST',
  'SEQUENCE_PRIMER',
  'SEQUENCE_PRIMER_PAIR_OK_REGION_LIST',
  'SEQUENCE_PRIMER_REVCOMP',
  'SEQUENCE_QUALITY',
  'SEQUENCE_START_CODON_POSITION',
  'SEQUENCE_START_CODON_SEQUENCE',
  'SEQUENCE_TARGET',
  'SEQUENCE_TEMPLATE',
] as const

/** Accepted tags the catalog deliberately leaves out: reserved (set by the request builder) and library paths. */
const SKIPPED_TAGS = new Set<string>([
  ...PRIMER3_RESERVED_TAGS,
  'PRIMER_MISPRIMING_LIBRARY',
  'PRIMER_INTERNAL_MISHYB_LIBRARY',
])

const VALID_GROUPS = new Set<Primer3SettingGroup>(['sequence', 'general', 'advanced', 'internal', 'penalties', 'quality'])

const VALID_KINDS = new Set<Primer3SettingKind>([
  'int',
  'float',
  'bool',
  'choice',
  'text',
  'sequence',
  'sizeRangeList',
  'coordinates',
])

const PRIMER3_TASKS = [
  'generic',
  'pick_detection_primers',
  'check_primers',
  'pick_primer_list',
  'pick_sequencing_primers',
  'pick_cloning_primers',
  'pick_discriminative_primers',
  'pick_pcr_primers',
  'pick_pcr_primers_and_hyb_probe',
  'pick_left_only',
  'pick_right_only',
  'pick_hyb_probe_only',
]

const WASM_TIMEOUT_MS = 60_000

function randomSequence(length: number, seed: number): string {
  let state = seed
  let sequence = ''
  for (let index = 0; index < length; index += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    sequence += 'ACGT'[state >>> 30]
  }
  return sequence
}

function catalogDef(tag: string): Primer3SettingDef {
  const def = PRIMER3_SETTINGS.find((candidate) => candidate.tag === tag)
  if (!def) throw new Error(`${tag} is not in the catalog`)
  return def
}

/** Every supported tag at its default, skipping the later member of each conflict so Primer3 accepts the record. */
function explicitDefaults(): { settings: Record<string, string>; sequenceTags: Record<string, string>; skipped: string[] } {
  const settings: Record<string, string> = {}
  const sequenceTags: Record<string, string> = {}
  const skipped: string[] = []
  const blocked = new Set<string>()
  for (const def of PRIMER3_SETTINGS) {
    if (def.unsupported) continue
    if (blocked.has(def.tag)) {
      skipped.push(def.tag)
      continue
    }
    for (const other of def.conflictsWith ?? []) blocked.add(other)
    if (def.group === 'sequence') sequenceTags[def.tag] = def.defaultValue
    else settings[def.tag] = def.defaultValue
  }
  return { settings, sequenceTags, skipped }
}

async function pickPairs(settings: Record<string, string>, sequenceTags: Record<string, string> = {}) {
  const built = buildPrimer3Input({
    context: {
      sequence: randomSequence(1000, 11),
      topology: 'linear',
      selection: { start: 400, end: 450 },
      mode: 'target',
      name: 'catalog-test',
    },
    settings,
    sequenceTags,
  })
  const result = parsePrimer3Output(await runPrimer3Engine(built), built.boulder, built.mapping)
  return { built, result }
}

describe('PRIMER3_SETTINGS catalog', () => {
  it('uses unique tags with valid group/kind and no reserved tags', () => {
    const tags = PRIMER3_SETTINGS.map((def) => def.tag)
    expect(new Set(tags).size).toBe(tags.length)
    for (const def of PRIMER3_SETTINGS) {
      expect(VALID_GROUPS.has(def.group), def.tag).toBe(true)
      expect(VALID_KINDS.has(def.kind), def.tag).toBe(true)
      expect(SKIPPED_TAGS.has(def.tag), def.tag).toBe(false)
      expect(def.section.trim().length, def.tag).toBeGreaterThan(0)
    }
  })

  it('covers exactly the tags accepted by read_boulder.c, minus reserved and library tags', () => {
    const expected = ACCEPTED_BOULDER_TAGS.filter((tag) => !SKIPPED_TAGS.has(tag)).sort()
    expect(PRIMER3_SETTINGS.map((def) => def.tag).sort()).toEqual(expected)
  })

  it('has real help text for every setting', () => {
    for (const def of PRIMER3_SETTINGS) {
      expect(def.help.length, def.tag).toBeGreaterThan(20)
      expect(def.help.toLowerCase(), def.tag).not.toContain('see primer3 manual')
      expect(def.help, def.tag).not.toContain(def.tag)
    }
  })

  it('uses short human labels', () => {
    for (const def of PRIMER3_SETTINGS) {
      expect(def.label.length, def.tag).toBeLessThanOrEqual(24)
      expect(def.label, def.tag).not.toBe(def.label.toUpperCase())
    }
  })

  it('groups rows within one non-sequence section and labels min/opt/max rows', () => {
    const rows = new Map<string, Primer3SettingDef[]>()
    for (const def of PRIMER3_SETTINGS) {
      if (!def.row) continue
      expect(def.group, def.tag).not.toBe('sequence')
      rows.set(def.row, [...(rows.get(def.row) ?? []), def])
    }
    for (const [row, defs] of rows) {
      expect(defs.length, row).toBeGreaterThanOrEqual(2)
      expect(new Set(defs.map((def) => `${def.group}/${def.section}`)).size, row).toBe(1)
      for (const def of defs) {
        if (/_MIN_|_QUALITY_RANGE_MIN$/.test(def.tag)) expect(def.label, def.tag).toBe('Min')
        if (/_OPT_/.test(def.tag)) expect(def.label, def.tag).toBe('Opt')
        if (/_MAX_|_QUALITY_RANGE_MAX$/.test(def.tag)) expect(def.label, def.tag).toBe('Max')
      }
    }
    expect(catalogDef('PRIMER_OPT_SIZE')).toMatchObject({ section: 'Primer size', row: 'PRIMER_SIZE', label: 'Opt' })
  })

  it('marks every coordinate tag as 1-based record coordinates', () => {
    for (const tag of Object.keys(PRIMER3_COORDINATE_TAGS)) {
      const def = catalogDef(tag)
      expect(def.kind, tag).toBe('coordinates')
      expect(def.group, tag).toBe('sequence')
      expect(def.help, tag).toContain('1-based record position')
    }
    for (const def of PRIMER3_SETTINGS) {
      if (def.kind === 'coordinates') expect(Object.keys(PRIMER3_COORDINATE_TAGS), def.tag).toContain(def.tag)
    }
  })

  it('keeps defaults consistent with kind, choices and limits', () => {
    for (const def of PRIMER3_SETTINGS) {
      const value = def.defaultValue
      if (def.kind === 'bool') expect(['0', '1'], def.tag).toContain(value)
      if (def.kind === 'choice') {
        expect(def.choices?.length, def.tag).toBeGreaterThan(1)
        expect(def.choices?.map((choice) => choice.value), def.tag).toContain(value)
      }
      if ((def.kind === 'int' || def.kind === 'float') && value !== '') {
        const number = Number(value)
        expect(Number.isFinite(number), def.tag).toBe(true)
        if (def.kind === 'int') expect(Number.isInteger(number), def.tag).toBe(true)
        if (def.min !== undefined) expect(number, def.tag).toBeGreaterThanOrEqual(def.min)
        if (def.max !== undefined) expect(number, def.tag).toBeLessThanOrEqual(def.max)
      }
      if (def.group === 'sequence' && def.tag !== 'SEQUENCE_START_CODON_SEQUENCE') expect(value, def.tag).toBe('')
    }
  })

  it('offers every task and Tm model Primer3 2.6.1 accepts', () => {
    expect(catalogDef('PRIMER_TASK').choices?.map((choice) => choice.value).sort()).toEqual([...PRIMER3_TASKS].sort())
    expect(catalogDef('PRIMER_TM_FORMULA').choices).toEqual([
      { value: '0', label: 'Breslauer 1986' },
      { value: '1', label: 'SantaLucia 1998' },
    ])
    expect(catalogDef('PRIMER_SALT_CORRECTIONS').choices?.map((choice) => choice.value)).toEqual(['0', '1', '2'])
    expect(catalogDef('PRIMER_SALT_CORRECTIONS').choices?.map((choice) => choice.label)).toEqual([
      'Schildkraut & Lifson 1965',
      'SantaLucia 1998',
      'Owczarzy 2004/2008',
    ])
  })

  it('lists conflicts symmetrically between catalog tags', () => {
    for (const def of PRIMER3_SETTINGS) {
      for (const other of def.conflictsWith ?? []) {
        expect(catalogDef(other).conflictsWith, `${def.tag} -> ${other}`).toContain(def.tag)
      }
    }
    expect(catalogDef('PRIMER_MIN_THREE_PRIME_DISTANCE').conflictsWith?.sort()).toEqual([
      'PRIMER_INTERNAL_MIN_THREE_PRIME_DISTANCE',
      'PRIMER_MIN_LEFT_THREE_PRIME_DISTANCE',
      'PRIMER_MIN_RIGHT_THREE_PRIME_DISTANCE',
    ])
  })

  it('matches primer3_core 2.6.1 defaults (pr_set_default_global_args_2 / create_seq_arg)', () => {
    const defaults = primer3DefaultSettings()
    expect(defaults).toMatchObject({
      PRIMER_TASK: 'generic',
      PRIMER_PICK_LEFT_PRIMER: '1',
      PRIMER_PICK_INTERNAL_OLIGO: '0',
      PRIMER_PICK_RIGHT_PRIMER: '1',
      PRIMER_NUM_RETURN: '5',
      PRIMER_PRODUCT_SIZE_RANGE: '100-300',
      PRIMER_MIN_SIZE: '18',
      PRIMER_OPT_SIZE: '20',
      PRIMER_MAX_SIZE: '27',
      PRIMER_MIN_TM: '57',
      PRIMER_OPT_TM: '60',
      PRIMER_MAX_TM: '63',
      PRIMER_PAIR_MAX_DIFF_TM: '100',
      PRIMER_MIN_GC: '20',
      PRIMER_OPT_GC_PERCENT: '',
      PRIMER_MAX_GC: '80',
      PRIMER_MAX_POLY_X: '5',
      PRIMER_MAX_END_GC: '5',
      PRIMER_MAX_END_STABILITY: '100',
      PRIMER_MAX_SELF_ANY: '8',
      PRIMER_MAX_SELF_END: '3',
      PRIMER_MAX_SELF_ANY_TH: '47',
      PRIMER_INTERNAL_MAX_SELF_ANY: '12',
      PRIMER_INTERNAL_MAX_SELF_END: '12',
      PRIMER_MAX_LIBRARY_MISPRIMING: '12',
      PRIMER_PAIR_MAX_LIBRARY_MISPRIMING: '24',
      PRIMER_MAX_TEMPLATE_MISPRIMING: '',
      PRIMER_SALT_MONOVALENT: '50',
      PRIMER_SALT_DIVALENT: '1.5',
      PRIMER_DNTP_CONC: '0.6',
      PRIMER_INTERNAL_SALT_DIVALENT: '0',
      PRIMER_INTERNAL_DNTP_CONC: '0',
      PRIMER_DNA_CONC: '50',
      PRIMER_DMSO_FACTOR: '0.6',
      PRIMER_TM_FORMULA: '1',
      PRIMER_SALT_CORRECTIONS: '1',
      PRIMER_THERMODYNAMIC_OLIGO_ALIGNMENT: '1',
      PRIMER_THERMODYNAMIC_TEMPLATE_ALIGNMENT: '0',
      PRIMER_LIB_AMBIGUITY_CODES_CONSENSUS: '0',
      PRIMER_ANNEALING_TEMP: '-10',
      PRIMER_OPT_BOUND: '97',
      PRIMER_INSIDE_PENALTY: '-1',
      PRIMER_OUTSIDE_PENALTY: '0',
      PRIMER_MIN_THREE_PRIME_DISTANCE: '-1',
      PRIMER_MIN_5_PRIME_OVERLAP_OF_JUNCTION: '7',
      PRIMER_MIN_3_PRIME_OVERLAP_OF_JUNCTION: '4',
      PRIMER_INTERNAL_MIN_5_PRIME_OVERLAP_OF_JUNCTION: '3',
      PRIMER_INTERNAL_MIN_3_PRIME_OVERLAP_OF_JUNCTION: '3',
      PRIMER_SEQUENCING_LEAD: '50',
      PRIMER_SEQUENCING_SPACING: '500',
      PRIMER_SEQUENCING_INTERVAL: '250',
      PRIMER_SEQUENCING_ACCURACY: '20',
      PRIMER_MASK_FAILURE_RATE: '0.1',
      PRIMER_MASK_KMERLIST_PREFIX: 'homo_sapiens',
      PRIMER_WT_SIZE_LT: '1',
      PRIMER_WT_TM_GT: '1',
      PRIMER_WT_POS_PENALTY: '1',
      PRIMER_WT_GC_PERCENT_LT: '0',
      PRIMER_INTERNAL_WT_SIZE_GT: '1',
      PRIMER_PAIR_WT_PR_PENALTY: '1',
      PRIMER_PAIR_WT_IO_PENALTY: '0',
      PRIMER_QUALITY_RANGE_MIN: '0',
      PRIMER_QUALITY_RANGE_MAX: '100',
      SEQUENCE_START_CODON_SEQUENCE: 'ATG',
      SEQUENCE_TARGET: '',
    })
  })
})

describe('PRIMER3_SETTINGS against the Primer3 WASM engine', () => {
  it(
    'accepts every supported tag explicitly set to its default',
    async () => {
      const { settings, sequenceTags, skipped } = explicitDefaults()
      expect(skipped.sort()).toEqual([
        'PRIMER_INTERNAL_MIN_THREE_PRIME_DISTANCE',
        'PRIMER_MIN_LEFT_THREE_PRIME_DISTANCE',
        'PRIMER_MIN_RIGHT_THREE_PRIME_DISTANCE',
        'SEQUENCE_START_CODON_POSITION',
      ])
      const { built, result } = await pickPairs(settings, sequenceTags)
      for (const [tag, value] of Object.entries({ ...settings, ...sequenceTags })) {
        if (value !== '') expect(built.tags[tag], tag).toBe(value)
      }
      expect(result.raw.PRIMER_ERROR).toBeUndefined()
      expect(result.errors).toEqual([])
      expect(result.pairs.length).toBeGreaterThanOrEqual(1)
    },
    WASM_TIMEOUT_MS,
  )

  const boolTags = PRIMER3_SETTINGS.filter((def) => def.kind === 'bool' && !def.unsupported).map((def) => def.tag)

  it.each(boolTags)(
    'accepts %s=1',
    async (tag) => {
      const { result } = await pickPairs({ [tag]: '1' })
      expect(result.raw.PRIMER_ERROR).toBeUndefined()
      expect(result.errors).toEqual([])
      expect(result.pairs.length).toBeGreaterThanOrEqual(1)
    },
    WASM_TIMEOUT_MS,
  )
})
