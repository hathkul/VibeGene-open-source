import { describe, expect, it } from 'vitest'
import { parseAbifChromatogram } from './abifReader'

type SyntheticTag = {
  name: string
  number: number
  type: 'char' | 'short'
  values: string | number[]
}

function elementSizeFor(type: SyntheticTag['type']) {
  return type === 'short' ? 2 : 1
}

function syntheticAbif(tags: SyntheticTag[]) {
  const directoryOffset = 128
  const dataOffset = 512
  const buffer = new ArrayBuffer(2048)
  const view = new DataView(buffer)
  view.setInt32(18, tags.length)
  view.setInt32(26, directoryOffset)
  let nextDataOffset = dataOffset

  tags.forEach((tag, index) => {
    const entry = directoryOffset + index * 28
    for (let character = 0; character < 4; character += 1) {
      view.setInt8(entry + character, tag.name.charCodeAt(character))
    }
    view.setInt32(entry + 4, tag.number)
    const count = tag.values.length
    const elementSize = elementSizeFor(tag.type)
    view.setUint16(entry + 10, elementSize)
    view.setUint32(entry + 12, count)
    view.setUint32(entry + 16, count * elementSize)
    if (count * elementSize <= 4) {
      for (let byte = 0; byte < count * elementSize; byte += 1) {
        const value = tag.type === 'char'
          ? (tag.values as string).charCodeAt(byte)
          : 0
        view.setUint8(entry + 20 + byte, value)
      }
      return
    }
    view.setInt32(entry + 20, nextDataOffset)
    if (tag.type === 'char') {
      for (let character = 0; character < count; character += 1) {
        view.setInt8(nextDataOffset + character, (tag.values as string).charCodeAt(character))
      }
    } else {
      for (let element = 0; element < count; element += 1) {
        view.setInt16(nextDataOffset + element * 2, (tag.values as number[])[element]!)
      }
    }
    nextDataOffset += count * elementSize
  })
  return buffer
}

function chromatogramFixture(overrides: Partial<Record<'PLOC' | 'RAW_PLOC' | 'PBAS' | 'FWO_', SyntheticTag>> = {}, rawTags: SyntheticTag[] = []) {
  const tags: SyntheticTag[] = [
    { name: 'DATA', number: 10, type: 'short', values: [11, 12, 13, 14] },
    { name: 'DATA', number: 11, type: 'short', values: [21, 22, 23, 24] },
    { name: 'DATA', number: 9, type: 'short', values: [31, 32, 33, 34] },
    { name: 'DATA', number: 12, type: 'short', values: [41, 42, 43, 44] },
    overrides.PLOC ?? { name: 'PLOC', number: 2, type: 'short', values: [0, 1, 2, 3] },
    overrides.PBAS ?? { name: 'PBAS', number: 2, type: 'char', values: 'ATGC\0' },
    ...rawTags,
  ]
  if (overrides.RAW_PLOC) tags.push(overrides.RAW_PLOC)
  if (overrides.FWO_) tags.push(overrides.FWO_)
  return syntheticAbif(tags)
}

describe('ABIF chromatogram parsing', () => {
  it('rejects a corrupt directory header without throwing or walking out of bounds', () => {
    const bytes = new ArrayBuffer(128)
    const view = new DataView(bytes)
    view.setInt32(18, 1)
    view.setInt32(26, -1)
    expect(parseAbifChromatogram(bytes)).toBeNull()

    view.setInt32(26, 120)
    view.setInt32(18, 1)
    expect(parseAbifChromatogram(bytes)).toBeNull()
  })

  it('decodes every PLOC and DATA short element using distinct element and byte counts', () => {
    const chromatogram = parseAbifChromatogram(chromatogramFixture())
    expect(chromatogram).toMatchObject({
      aTrace: [11, 12, 13, 14],
      tTrace: [21, 22, 23, 24],
      gTrace: [31, 32, 33, 34],
      cTrace: [41, 42, 43, 44],
      basePos: [0, 1, 2, 3],
      baseCalls: ['A', 'T', 'G', 'C'],
    })
  })

  it('uses the inline FWO_ payload to map DATA9–12 dynamically', () => {
    const chromatogram = parseAbifChromatogram(chromatogramFixture({
      FWO_: { name: 'FWO_', number: 1, type: 'char', values: 'ACGT' },
    }))
    expect(chromatogram).toMatchObject({
      aTrace: [31, 32, 33, 34],
      cTrace: [11, 12, 13, 14],
      gTrace: [21, 22, 23, 24],
      tTrace: [41, 42, 43, 44],
    })
  })

  it('maps signed raw DATA1–4 using FWO_ and retains raw PLOC.1 when valid', () => {
    const chromatogram = parseAbifChromatogram(chromatogramFixture({
      FWO_: { name: 'FWO_', number: 1, type: 'char', values: 'ACGT' },
      RAW_PLOC: { name: 'PLOC', number: 1, type: 'short', values: [0, 1, 2, 3] },
    }, [
      { name: 'DATA', number: 1, type: 'short', values: [-31, -1, 0, 3200] },
      { name: 'DATA', number: 2, type: 'short', values: [-2, 4, 9, 11] },
      { name: 'DATA', number: 3, type: 'short', values: [3, 6, 12, 18] },
      { name: 'DATA', number: 4, type: 'short', values: [5, 7, 13, 21] },
    ]))
    expect(chromatogram?.raw).toEqual({
      aTrace: [-31, -1, 0, 3200],
      cTrace: [-2, 4, 9, 11],
      gTrace: [3, 6, 12, 18],
      tTrace: [5, 7, 13, 21],
      basePos: [0, 1, 2, 3],
    })
    expect(chromatogram?.aTrace).toEqual([31, 32, 33, 34])
  })

  it('keeps processed chromatograms usable when raw DATA tags are missing or raw PLOC.1 is unusable', () => {
    const withoutRaw = parseAbifChromatogram(chromatogramFixture())
    expect(withoutRaw?.raw).toBeUndefined()

    const withoutCoordinates = parseAbifChromatogram(chromatogramFixture({
      RAW_PLOC: { name: 'PLOC', number: 1, type: 'short', values: [0, 1, 4, 5] },
    }, [
      { name: 'DATA', number: 1, type: 'short', values: [1, 2, 3, 4] },
      { name: 'DATA', number: 2, type: 'short', values: [5, 6, 7, 8] },
      { name: 'DATA', number: 3, type: 'short', values: [9, 10, 11, 12] },
      { name: 'DATA', number: 4, type: 'short', values: [13, 14, 15, 16] },
    ]))
    expect(withoutCoordinates?.raw).toMatchObject({
      aTrace: [5, 6, 7, 8],
      tTrace: [9, 10, 11, 12],
      gTrace: [1, 2, 3, 4],
      cTrace: [13, 14, 15, 16],
    })
    expect(withoutCoordinates?.raw?.basePos).toBeUndefined()
  })

  it('keeps the documented GATC fallback only when FWO_ is absent', () => {
    expect(parseAbifChromatogram(chromatogramFixture())?.aTrace).toEqual([11, 12, 13, 14])
    expect(parseAbifChromatogram(chromatogramFixture({
      FWO_: { name: 'FWO_', number: 1, type: 'char', values: 'AAAA' },
    }))).toBeNull()
  })

  it('accepts a trailing PBAS terminator while requiring PLOC for every called base', () => {
    expect(parseAbifChromatogram(chromatogramFixture())?.baseCalls).toEqual(['A', 'T', 'G', 'C'])
    expect(parseAbifChromatogram(chromatogramFixture({
      PLOC: { name: 'PLOC', number: 2, type: 'short', values: [0, 1, 2] },
    }))).toBeNull()
  })

  it('rejects unordered or out-of-channel-range call positions', () => {
    expect(parseAbifChromatogram(chromatogramFixture({
      PLOC: { name: 'PLOC', number: 2, type: 'short', values: [0, 2, 1, 3] },
    }))).toBeNull()
    expect(parseAbifChromatogram(chromatogramFixture({
      PLOC: { name: 'PLOC', number: 2, type: 'short', values: [0, 1, 2, 4] },
    }))).toBeNull()
  })
})
