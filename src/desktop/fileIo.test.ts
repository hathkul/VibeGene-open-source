import { describe, expect, it } from 'vitest'
import { bytesToFile, coerceBytes } from './fileIo'

describe('desktop file bytes', () => {
  it('coerces ArrayBuffer without emptying (Uint8Array.from trap)', () => {
    const source = new Uint8Array([9, 0, 0, 0, 14, 1, 2, 3, 4, 5])
    const viaBuffer = coerceBytes(source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength))
    expect(viaBuffer.length).toBe(source.length)
    expect([...viaBuffer]).toEqual([...source])
  })

  it('builds a File that preserves SnapGene-sized payloads', async () => {
    const source = new Uint8Array(64)
    source[0] = 0x09
    const file = bytesToFile('demo.dna', source)
    const roundTrip = new Uint8Array(await file.arrayBuffer())
    expect(roundTrip.length).toBe(64)
    expect(roundTrip[0]).toBe(0x09)
  })
})
