import { describe, expect, it } from 'vitest'
import { parseBoulderRecord } from './boulder'
import { buildPrimer3Input, PRIMER3_BUILTIN_HUMREP_PATH, PRIMER3_CUSTOM_MISPRIMING_PATH } from './request'
import {
  PRIMER3_BUILTIN_LIBRARY_HUMREP,
  Primer3InputError,
  type Primer3Request,
  type Primer3SequenceContext,
} from './types'

const SEQUENCE = 'ACGTACGTAA' + 'CCCCCGGGGG' + 'TTTTTAAAAA' + 'GATCGATCGA' // 40 bp

function request(context: Partial<Primer3SequenceContext>, overrides: Partial<Primer3Request> = {}): Primer3Request {
  return {
    context: {
      sequence: SEQUENCE,
      topology: 'linear',
      selection: { start: 10, end: 20 },
      mode: 'target',
      ...context,
    },
    settings: {},
    sequenceTags: {},
    ...overrides,
  }
}

function issuesOf(action: () => unknown): string[] {
  try {
    action()
  } catch (error) {
    if (error instanceof Primer3InputError) return error.issues
    throw error
  }
  throw new Error('Expected Primer3InputError')
}

describe('buildPrimer3Input templates', () => {
  it('uses the whole linear record in target mode and appends the selection after user targets', () => {
    const built = buildPrimer3Input(request({ name: 'demo' }, { sequenceTags: { SEQUENCE_TARGET: '3,2 31,4' } }))
    expect(built.mapping).toEqual({ topology: 'linear', recordLength: 40, templateLength: 40, offset: 0 })
    expect(built.tags.SEQUENCE_TEMPLATE).toBe(SEQUENCE)
    expect(built.tags.SEQUENCE_TARGET).toBe('2,2 30,4 10,10')
    expect(built.tags.SEQUENCE_ID).toBe('demo')
    expect(built.tags.PRIMER_FIRST_BASE_INDEX).toBe('0')
    expect(built.tags.PRIMER_EXPLAIN_FLAG).toBe('1')
    expect(built.boulder.endsWith('\n=\n')).toBe(true)
    expect(parseBoulderRecord(built.boulder)).toEqual(built.tags)
  })

  it('slices the selection in template mode and converts coordinates relative to it', () => {
    const built = buildPrimer3Input(
      request(
        { mode: 'template', selection: { start: 10, end: 30 } },
        { sequenceTags: { SEQUENCE_EXCLUDED_REGION: '11,2', SEQUENCE_FORCE_LEFT_START: '15' } },
      ),
    )
    expect(built.tags.SEQUENCE_TEMPLATE).toBe(SEQUENCE.slice(10, 30))
    expect(built.mapping).toEqual({ topology: 'linear', recordLength: 40, templateLength: 20, offset: 10 })
    expect(built.tags.SEQUENCE_EXCLUDED_REGION).toBe('0,2')
    expect(built.tags.SEQUENCE_FORCE_LEFT_START).toBe('4')
    expect(built.tags.SEQUENCE_TARGET).toBeUndefined()
    expect(built.tags.SEQUENCE_ID).toBe('vibegene')
  })

  it('joins both ends of a circular selection that wraps the origin in template mode', () => {
    const built = buildPrimer3Input(request({ mode: 'template', topology: 'circular', selection: { start: 35, end: 5 } }))
    expect(built.tags.SEQUENCE_TEMPLATE).toBe(SEQUENCE.slice(35) + SEQUENCE.slice(0, 5))
    expect(built.mapping.offset).toBe(35)
    expect(built.mapping.templateLength).toBe(10)
  })

  it('rotates circular records so a selection across the origin sits in the middle of the template', () => {
    const built = buildPrimer3Input(request({ topology: 'circular', selection: { start: 36, end: 4 } }))
    const { offset, templateLength } = built.mapping
    expect(templateLength).toBe(40)
    expect(built.tags.SEQUENCE_TEMPLATE).toBe(SEQUENCE.slice(offset) + SEQUENCE.slice(0, offset))
    const [start, length] = built.tags.SEQUENCE_TARGET.split(',').map(Number)
    expect(length).toBe(8)
    expect(start).toBe(16)
    expect(built.tags.SEQUENCE_TEMPLATE.slice(start, start + length)).toBe(SEQUENCE.slice(36) + SEQUENCE.slice(0, 4))
  })

  it('converts user coordinates on rotated circular templates, including intervals across the origin', () => {
    const built = buildPrimer3Input(
      request(
        { topology: 'circular', selection: { start: 36, end: 4 } },
        { sequenceTags: { SEQUENCE_EXCLUDED_REGION: '39,4', SEQUENCE_OVERLAP_JUNCTION_LIST: '1 40' } },
      ),
    )
    const offset = built.mapping.offset
    expect(offset).toBe(20)
    expect(built.tags.SEQUENCE_EXCLUDED_REGION).toBe('18,4')
    expect(built.tags.SEQUENCE_OVERLAP_JUNCTION_LIST).toBe('20 19')
  })

  it('overrides SEQUENCE_INCLUDED_REGION with the selection in included mode', () => {
    const built = buildPrimer3Input(request({ mode: 'included', selection: { start: 5, end: 35 } }, { sequenceTags: { SEQUENCE_INCLUDED_REGION: '1,3' } }))
    expect(built.tags.SEQUENCE_INCLUDED_REGION).toBe('5,30')
    expect(built.tags.SEQUENCE_TARGET).toBeUndefined()
  })

  it('uppercases and strips whitespace and digits, but keeps case for lowercase masking', () => {
    const lower = request({ sequence: 'acgt acgt\n12aacc', selection: { start: 2, end: 6 } })
    expect(buildPrimer3Input(lower).tags.SEQUENCE_TEMPLATE).toBe('ACGTACGTAACC')
    const masked = buildPrimer3Input({ ...lower, settings: { PRIMER_LOWERCASE_MASKING: '1' } })
    expect(masked.tags.SEQUENCE_TEMPLATE).toBe('acgtacgtaacc')
  })
})

describe('buildPrimer3Input coordinate formats', () => {
  it('converts ok-region lists with empty and -1 fields', () => {
    const built = buildPrimer3Input(
      request({}, { sequenceTags: { SEQUENCE_PRIMER_PAIR_OK_REGION_LIST: '1,10,31,10 ; ,,21,5;3,4,-1,-1' } }),
    )
    expect(built.tags.SEQUENCE_PRIMER_PAIR_OK_REGION_LIST).toBe('0,10,30,10;,,20,5;2,4,-1,-1')
  })

  it('keeps the Primer3 unset sentinel for single positions', () => {
    const built = buildPrimer3Input(request({}, { sequenceTags: { SEQUENCE_FORCE_RIGHT_END: '-1000000', SEQUENCE_START_CODON_POSITION: '7' } }))
    expect(built.tags.SEQUENCE_FORCE_RIGHT_END).toBe('-1000000')
    expect(built.tags.SEQUENCE_START_CODON_POSITION).toBe('6')
  })

  it('collects every out-of-template or malformed coordinate as an issue', () => {
    const issues = issuesOf(() =>
      buildPrimer3Input(
        request(
          { mode: 'template', selection: { start: 10, end: 20 } },
          {
            sequenceTags: {
              SEQUENCE_TARGET: '5,2',
              SEQUENCE_EXCLUDED_REGION: '15,10',
              SEQUENCE_FORCE_LEFT_START: 'abc',
              SEQUENCE_INCLUDED_REGION: '12',
              SEQUENCE_OVERLAP_JUNCTION_LIST: '41',
            },
          },
        ),
      ),
    )
    expect(issues).toHaveLength(5)
    expect(issues[0]).toMatch(/SEQUENCE_TARGET: position 5 is outside the Primer3 template \(11–20\)/)
    expect(issues[1]).toMatch(/SEQUENCE_EXCLUDED_REGION: 15,10 extends past the end/)
    expect(issues[2]).toMatch(/SEQUENCE_FORCE_LEFT_START: "abc" is not a whole number/)
    expect(issues[3]).toMatch(/SEQUENCE_INCLUDED_REGION: expected "start,length"/)
    expect(issues[4]).toMatch(/SEQUENCE_OVERLAP_JUNCTION_LIST: position 41 is outside the sequence \(1–40\)/)
  })

  it('rejects empty sequences, empty selections and wrapping selections on linear records', () => {
    expect(issuesOf(() => buildPrimer3Input(request({ sequence: '  ' })))).toEqual(['The sequence is empty'])
    expect(issuesOf(() => buildPrimer3Input(request({ selection: { start: 5, end: 5 } })))[0]).toMatch(/Select a region/)
    expect(issuesOf(() => buildPrimer3Input(request({ selection: { start: 30, end: 5 } })))[0]).toMatch(/circular/)
    expect(issuesOf(() => buildPrimer3Input(request({ sequence: 'ACGT-ACGT', selection: { start: 1, end: 3 } })))[0]).toMatch(/cannot read: -/)
  })

  it('rotates SEQUENCE_QUALITY with the template', () => {
    const quality = Array.from({ length: 40 }, (_, index) => String(index)).join(' ')
    const built = buildPrimer3Input(request({ mode: 'template', selection: { start: 38, end: 40 } }, { sequenceTags: { SEQUENCE_QUALITY: quality } }))
    expect(built.tags.SEQUENCE_QUALITY).toBe('38 39')
  })
})

describe('buildPrimer3Input tags and libraries', () => {
  it('ignores reserved tags, library paths from settings and empty values', () => {
    const built = buildPrimer3Input(
      request(
        {},
        {
          settings: {
            PRIMER_FIRST_BASE_INDEX: '1',
            PRIMER_EXPLAIN_FLAG: '0',
            PRIMER_THERMODYNAMIC_PARAMETERS_PATH: '/x/',
            PRIMER_MISPRIMING_LIBRARY: '/home/me/lib.fa',
            P3_FILE_FLAG: '1',
            PRIMER_OPT_SIZE: '',
            PRIMER_MAX_SIZE: '25',
          },
          sequenceTags: { SEQUENCE_TEMPLATE: 'GGGG', SEQUENCE_ID: 'other' },
        },
      ),
    )
    expect(built.tags.PRIMER_FIRST_BASE_INDEX).toBe('0')
    expect(built.tags.PRIMER_EXPLAIN_FLAG).toBe('1')
    expect(built.tags.SEQUENCE_TEMPLATE).toBe(SEQUENCE)
    expect(built.tags.SEQUENCE_ID).toBe('vibegene')
    expect(built.tags.PRIMER_MAX_SIZE).toBe('25')
    for (const tag of ['PRIMER_THERMODYNAMIC_PARAMETERS_PATH', 'PRIMER_MISPRIMING_LIBRARY', 'P3_FILE_FLAG', 'PRIMER_OPT_SIZE']) {
      expect(built.tags).not.toHaveProperty(tag)
    }
  })

  it('maps built-in, custom and absent libraries', () => {
    const built = buildPrimer3Input(
      request(
        {},
        {
          misprimingLibrary: { kind: 'custom', name: 'my repeats', fasta: '>rep\r\nACGTACGT' },
          internalMishybLibrary: { kind: 'builtin', id: PRIMER3_BUILTIN_LIBRARY_HUMREP },
        },
      ),
    )
    expect(built.tags.PRIMER_MISPRIMING_LIBRARY).toBe(PRIMER3_CUSTOM_MISPRIMING_PATH)
    expect(built.files).toEqual({ [PRIMER3_CUSTOM_MISPRIMING_PATH]: '>rep\nACGTACGT\n' })
    expect(built.tags.PRIMER_INTERNAL_MISHYB_LIBRARY).toBe(PRIMER3_BUILTIN_HUMREP_PATH)

    const none = buildPrimer3Input(request({}, { misprimingLibrary: { kind: 'none' } }))
    expect(none.tags).not.toHaveProperty('PRIMER_MISPRIMING_LIBRARY')
    expect(none.tags).not.toHaveProperty('PRIMER_INTERNAL_MISHYB_LIBRARY')
    expect(none.files).toEqual({})
  })

  it('rejects multi-line values and invalid tag names', () => {
    const issues = issuesOf(() => buildPrimer3Input(request({}, { settings: { PRIMER_TASK: 'generic\nX=1', 'BAD TAG': '1' } })))
    expect(issues).toEqual(['PRIMER_TASK: the value must be a single line', '"BAD TAG" is not a valid Primer3 tag name'])
  })
})
