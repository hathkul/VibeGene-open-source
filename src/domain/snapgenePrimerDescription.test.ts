// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest'
import { cloneFixture } from './fixtures'
import { exportSnapGene, parseSnapGene } from './parsers'
import { initSnapGeneLzma } from './snapgeneLzma'
import { themeFixturePalette } from '../test-support/themeFixturePalette'

beforeAll(async () => { await initSnapGeneLzma() })

describe('SnapGene primer descriptions', () => {
  it.each([false, true])('round-trips whitespace and literal characters (native packet order: %s)', (native) => {
    const record = cloneFixture()
    const description = '  First  line\n\n\tSecond line\r\nText <not markup> &amp; "quotes"\n'
    record.primers = [{ id: 'primer-1', name: 'Primer', sequence: record.sequence.slice(0, 20), color: themeFixturePalette.purple, description }]
    const bytes = exportSnapGene(record, { snapGenePacketOrder: native })
    expect(parseSnapGene(bytes, 'description.dna').primers[0]?.description).toBe(description)
  })

  it('still round-trips an ordinary single-line description', () => {
    const record = cloneFixture()
    record.primers = [{ id: 'primer-1', name: 'Primer', sequence: record.sequence.slice(0, 20), color: themeFixturePalette.purple, description: 'Standard note & details' }]
    expect(parseSnapGene(exportSnapGene(record), 'description.dna').primers[0]?.description).toBe('Standard note & details')
  })
})
