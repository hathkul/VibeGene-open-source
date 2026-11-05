import { describe, expect, it } from 'vitest'
import thalArgsInput from '../domain/primer3/__fixtures__/primer_thal_args_input.txt?raw'
import thalArgsOutput from '../domain/primer3/__fixtures__/primer_thal_args_output.txt?raw'
import { parseBoulderRecords } from '../domain/primer3/boulder'
import { runPrimer3 } from './client'
import { runPrimer3Engine } from '../wasm/primer3/engine'
import { parsePrimer3Output } from '../domain/primer3/parseResult'
import { buildPrimer3Input } from '../domain/primer3/request'
import {
  PRIMER3_BUILTIN_LIBRARY_HUMREP,
  Primer3InputError,
  type Primer3Oligo,
  type Primer3Request,
  type Primer3SequenceContext,
} from '../domain/primer3/types'

const TIMEOUT_MS = 60_000

function randomSequence(length: number, seed: number): string {
  let state = seed
  let sequence = ''
  for (let index = 0; index < length; index += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    sequence += 'ACGT'[state >>> 30]
  }
  return sequence
}

function reverseComplement(sequence: string): string {
  const complement: Record<string, string> = { A: 'T', C: 'G', G: 'C', T: 'A', N: 'N' }
  return [...sequence].reverse().map((base) => complement[base] ?? 'N').join('')
}

function recordSlice(record: string, oligo: Primer3Oligo): string {
  return oligo.recordEnd >= oligo.recordStart
    ? record.slice(oligo.recordStart, oligo.recordEnd)
    : record.slice(oligo.recordStart) + record.slice(0, oligo.recordEnd)
}

function pickRequest(context: Partial<Primer3SequenceContext>, overrides: Partial<Primer3Request> = {}): Primer3Request {
  return {
    context: {
      sequence: randomSequence(1000, 7),
      topology: 'linear',
      selection: { start: 400, end: 450 },
      mode: 'target',
      name: 'engine-test',
      ...context,
    },
    settings: { PRIMER_TASK: 'generic', PRIMER_PRODUCT_SIZE_RANGE: '100-300', PRIMER_NUM_RETURN: '5' },
    sequenceTags: {},
    ...overrides,
  }
}

describe('runPrimer3Engine (WASM)', () => {
  it('reproduces the native Primer3 2.6.1 regression output for primer_thal_args', async () => {
    const output = await runPrimer3Engine({ boulder: thalArgsInput, files: {} })
    const actual = parseBoulderRecords(output)
    const expected = parseBoulderRecords(thalArgsOutput)
    expect(actual).toHaveLength(expected.length)
    for (const [index, record] of expected.entries()) {
      for (let rank = 0; rank < 5; rank += 1) {
        for (const kind of ['LEFT', 'RIGHT', 'INTERNAL']) {
          expect(actual[index][`PRIMER_${kind}_${rank}_SEQUENCE`]).toBe(record[`PRIMER_${kind}_${rank}_SEQUENCE`])
          expect(actual[index][`PRIMER_${kind}_${rank}`]).toBe(record[`PRIMER_${kind}_${rank}`])
        }
      }
    }
    expect(output).toBe(thalArgsOutput)
  }, TIMEOUT_MS)

  it('picks a sane primer pair on a 1 kb linear sequence', async () => {
    const request = pickRequest({})
    const result = await runPrimer3(request)
    expect(result.errors).toEqual([])
    expect(result.pairs.length).toBeGreaterThanOrEqual(1)
    for (const pair of result.pairs) {
      const { left, right } = pair
      if (!left || !right) throw new Error('pair without primers')
      expect(left.tm).toBeGreaterThan(50)
      expect(left.tm).toBeLessThan(70)
      expect(right.tm).toBeGreaterThan(50)
      expect(right.tm).toBeLessThan(70)
      expect(pair.productSize).toBeGreaterThanOrEqual(100)
      expect(pair.productSize).toBeLessThanOrEqual(300)
      expect(left.recordEnd).toBeLessThanOrEqual(400)
      expect(right.recordStart).toBeGreaterThanOrEqual(450)
      expect(recordSlice(request.context.sequence, left)).toBe(left.sequence)
      expect(reverseComplement(recordSlice(request.context.sequence, right))).toBe(right.sequence)
    }
  }, TIMEOUT_MS)

  it('amplifies a target that spans the origin of a circular record', async () => {
    const record = randomSequence(1500, 42)
    const request = pickRequest({ sequence: record, topology: 'circular', selection: { start: 1460, end: 40 } })
    const built = buildPrimer3Input(request)
    const result = parsePrimer3Output(await runPrimer3Engine(built), built.boulder, built.mapping)
    expect(result.errors).toEqual([])
    expect(result.pairs.length).toBeGreaterThanOrEqual(1)
    const [targetStart, targetLength] = built.tags.SEQUENCE_TARGET.split(',').map(Number)
    for (const pair of result.pairs) {
      const { left, right } = pair
      if (!left || !right) throw new Error('pair without primers')
      expect(recordSlice(record, left)).toBe(left.sequence)
      expect(reverseComplement(recordSlice(record, right))).toBe(right.sequence)
      expect(left.templateEnd).toBeLessThanOrEqual(targetStart)
      expect(right.templateStart).toBeGreaterThanOrEqual(targetStart + targetLength)
      expect(left.recordStart).toBeGreaterThan(1000)
      expect(right.recordEnd).toBeLessThan(500)
    }
  }, TIMEOUT_MS)

  it('screens primers against the built-in humrep mispriming library', async () => {
    const result = await runPrimer3(pickRequest({}, { misprimingLibrary: { kind: 'builtin', id: PRIMER3_BUILTIN_LIBRARY_HUMREP } }))
    expect(result.errors).toEqual([])
    expect(result.raw.PRIMER_MISPRIMING_LIBRARY).toBe('/primer3_libs/humrep_and_simple.txt')
    expect(result.raw.PRIMER_LEFT_0_LIBRARY_MISPRIMING).toBeDefined()
    expect(result.lefts[0].libraryMispriming).toMatch(/^\d+\.\d+, /)
  }, TIMEOUT_MS)

  it('uses a custom mispriming library written to the virtual file system', async () => {
    const result = await runPrimer3(
      pickRequest({}, { misprimingLibrary: { kind: 'custom', name: 'mine', fasta: `>my_repeat\n${randomSequence(200, 99)}\n` } }),
    )
    expect(result.errors).toEqual([])
    expect(result.lefts[0].libraryMispriming).toMatch(/my_repeat/)
  }, TIMEOUT_MS)

  it('picks an internal hybridization probe', async () => {
    const request = pickRequest({}, {
      settings: { PRIMER_TASK: 'generic', PRIMER_PICK_INTERNAL_OLIGO: '1', PRIMER_PRODUCT_SIZE_RANGE: '100-300' },
    })
    const result = await runPrimer3(request)
    expect(result.errors).toEqual([])
    const [pair] = result.pairs
    const { left, right, internal } = pair
    if (!left || !right || !internal) throw new Error('pair without probe')
    expect(internal.kind).toBe('internal')
    expect(recordSlice(request.context.sequence, internal)).toBe(internal.sequence)
    expect(internal.recordStart).toBeGreaterThanOrEqual(left.recordEnd)
    expect(internal.recordEnd).toBeLessThanOrEqual(right.recordStart)
  }, TIMEOUT_MS)

  it('returns Primer3 errors as output and leaves process.exitCode alone', async () => {
    const nodeProcess = (globalThis as { process?: { exitCode?: number | string | null } }).process
    const before = nodeProcess?.exitCode
    const result = await runPrimer3(pickRequest({}, { settings: { PRIMER_NOT_A_TAG: '1' } }))
    expect(nodeProcess?.exitCode).toBe(before)
    expect(result.errors.join(' ')).toMatch(/Unrecognized tag: PRIMER_NOT_A_TAG=1/)
    expect(result.pairs).toEqual([])
  }, TIMEOUT_MS)

  it('rejects invalid requests and aborted runs before starting Primer3', async () => {
    await expect(runPrimer3(pickRequest({ selection: { start: 5, end: 5 } }))).rejects.toBeInstanceOf(Primer3InputError)
    const controller = new AbortController()
    controller.abort()
    await expect(runPrimer3(pickRequest({}), { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
  })
})
