import { describe, expect, it } from 'vitest'
import {
  formatBoulderRecord,
  formatPrimer3SettingsFile,
  parseBoulderRecord,
  parseBoulderRecords,
  parsePrimer3SettingsFile,
} from './boulder'

describe('formatBoulderRecord', () => {
  it('writes TAG=value lines and a terminating = line, skipping empty values', () => {
    expect(formatBoulderRecord({ SEQUENCE_ID: 'x', PRIMER_OPT_SIZE: '', PRIMER_TASK: 'generic' })).toBe(
      'SEQUENCE_ID=x\nPRIMER_TASK=generic\n=\n',
    )
  })

  it('rejects tags or values containing line breaks', () => {
    expect(() => formatBoulderRecord({ SEQUENCE_ID: 'a\nb' })).toThrow(/line breaks/)
    expect(() => formatBoulderRecord({ 'BAD\nTAG': 'x' })).toThrow(/Invalid Boulder-IO tag/)
    expect(() => formatBoulderRecord({ 'A=B': 'x' })).toThrow(/Invalid Boulder-IO tag/)
  })
})

describe('parseBoulderRecords', () => {
  it('splits records on = lines, keeps = inside values and tolerates CRLF', () => {
    const records = parseBoulderRecords('A=1\r\nB=x=y\r\n=\r\nC=3\n=\nD=4\n')
    expect(records).toEqual([{ A: '1', B: 'x=y' }, { C: '3' }, { D: '4' }])
  })

  it('returns the first record or an empty object', () => {
    expect(parseBoulderRecord('A=1\n=\nB=2\n=\n')).toEqual({ A: '1' })
    expect(parseBoulderRecord('')).toEqual({})
  })

  it('round-trips formatBoulderRecord', () => {
    const tags = { SEQUENCE_ID: 'demo', SEQUENCE_TARGET: '10,20 40,5', PRIMER_PRODUCT_SIZE_RANGE: '100-300 300-600' }
    expect(parseBoulderRecord(formatBoulderRecord(tags))).toEqual(tags)
  })
})

describe('Primer3 settings files', () => {
  const settingsFile = [
    'Primer3 File - http://primer3.org',
    'P3_FILE_TYPE=settings',
    '',
    'P3_FILE_ID=Demo settings',
    '# comment line',
    'PRIMER_TASK=generic',
    'PRIMER_PRODUCT_SIZE_RANGE=150-250 100-300',
    'SEQUENCE_TARGET=10,20',
    '=',
    'PRIMER_OPT_SIZE=99',
    '',
  ].join('\n')

  it('parses PRIMER_* tags and drops P3_* tags, comments and anything after =', () => {
    expect(parsePrimer3SettingsFile(settingsFile)).toEqual({
      PRIMER_TASK: 'generic',
      PRIMER_PRODUCT_SIZE_RANGE: '150-250 100-300',
    })
  })

  it('accepts the legacy sourceforge header and CRLF line endings', () => {
    const legacy = 'Primer3 File - http://primer3.sourceforge.net\r\nP3_FILE_TYPE=settings\r\n\r\nPRIMER_OPT_SIZE=20\r\n=\r\n'
    expect(parsePrimer3SettingsFile(legacy)).toEqual({ PRIMER_OPT_SIZE: '20' })
  })

  it('rejects files without the Primer3 header or settings file type', () => {
    expect(() => parsePrimer3SettingsFile('PRIMER_OPT_SIZE=20\n=\n')).toThrow(/first line/)
    expect(() => parsePrimer3SettingsFile('Primer3 File - http://primer3.org\nP3_FILE_TYPE=sequence\n\n=\n')).toThrow(/line 2/)
  })

  it('writes a settings file Primer3 and the parser accept', () => {
    const text = formatPrimer3SettingsFile({ PRIMER_OPT_SIZE: '21', PRIMER_MIN_TM: '', P3_FILE_TYPE: 'settings' })
    expect(text).toBe('Primer3 File - http://primer3.org\nP3_FILE_TYPE=settings\n\nPRIMER_OPT_SIZE=21\n=\n')
    expect(parsePrimer3SettingsFile(text)).toEqual({ PRIMER_OPT_SIZE: '21' })
  })
})
