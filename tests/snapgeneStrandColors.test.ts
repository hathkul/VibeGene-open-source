import { describe, expect, it, beforeAll } from 'vitest'
import { exportSnapGene } from '../src/domain/parsers'
import { initSnapGeneLzma } from '../src/domain/snapgeneLzma'
import {
  clearStrandColorForSelection,
  exportSnapGeneStrandColorsXml,
  paintStrandColorForSelection,
  parseSnapGeneHistoryColorsElement,
  parseSnapGeneStrandColorsXml,
  positionInStrandColorRange,
  snapGeneColorToCss,
  strandColorAtPosition,
} from '../src/domain/snapgeneStrandColors'
import { sanitizeDna } from '../src/domain/sequence'
import { defaultConstructProperties } from '../src/domain/constructProperties'

function readSnapGenePacket(bytes: Uint8Array, targetType: number) {
  let offset = 0
  while (offset + 5 <= bytes.length) {
    const type = bytes[offset]!
    const length = new DataView(bytes.buffer, bytes.byteOffset + offset + 1, 4).getUint32(0, false)
    const start = offset + 5
    const end = start + length
    if (end > bytes.length) break
    if (type === targetType) return bytes.slice(start, end)
    offset = end
  }
  return null
}

beforeAll(async () => {
  await initSnapGeneLzma()
})

describe('sanitizeDna', () => {
  it('preserves mixed case while stripping invalid characters', () => {
    expect(sanitizeDna('aaaGGAG-atat')).toBe('aaaGGAGatat')
  })
})

describe('parseSnapGeneStrandColorsXml', () => {
  it('parses block 20 strand color ranges on both strands', () => {
    const xml = `<StrandColors>
      <TopStrand><ColorRange range="314..354" colors="magenta"/></TopStrand>
      <BottomStrand><ColorRange range="318..358" colors="red"/></BottomStrand>
    </StrandColors>`
    const parsed = parseSnapGeneStrandColorsXml(xml, 500)
    expect(parsed?.topStrand).toEqual([{ start: 313, end: 354, color: 'magenta' }])
    expect(parsed?.bottomStrand).toEqual([{ start: 317, end: 358, color: 'red' }])
    expect(snapGeneColorToCss('magenta')).toBe('#c026d3')
  })

  it('parses wrapped circular color ranges into two spans', () => {
    const xml = `<StrandColors type="Product">
      <TopStrand><ColorRange range="14..2" colors="black"/></TopStrand>
    </StrandColors>`
    const parsed = parseSnapGeneStrandColorsXml(xml, 20)
    expect(parsed?.type).toBe('Product')
    expect(parsed?.topStrand).toEqual([
      { start: 13, end: 20, color: 'black' },
      { start: 0, end: 2, color: 'black' },
    ])
    expect(positionInStrandColorRange(0, parsed!.topStrand[1]!, 20, 'circular')).toBe(true)
    expect(positionInStrandColorRange(19, parsed!.topStrand[0]!, 20, 'circular')).toBe(true)
  })
})

describe('parseSnapGeneHistoryColorsElement', () => {
  it('parses HistoryColors nested under a history node', () => {
    const parsed = parseSnapGeneHistoryColorsElement(
      {
        innerHTML: '<StrandColors type="Input"><TopStrand><ColorRange range="3..13" colors="red"/></TopStrand></StrandColors>',
        outerHTML:
          '<HistoryColors><StrandColors type="Input"><TopStrand><ColorRange range="3..13" colors="red"/></TopStrand></StrandColors></HistoryColors>',
      } as Element,
      20,
    )
    expect(parsed?.type).toBe('Input')
    expect(parsed?.topStrand).toEqual([{ start: 2, end: 13, color: 'red' }])
    expect(strandColorAtPosition(parsed, 5, 'forward', 20, 'circular')).toBe('#dc2626')
  })
})

describe('paintStrandColorForSelection', () => {
  it('paints a range on the forward strand and replaces overlapping colors', () => {
    const painted = paintStrandColorForSelection(
      {
        topStrand: [{ start: 4, end: 8, color: 'blue' }],
        bottomStrand: [],
      },
      'forward',
      { start: 6, end: 10 },
      'red',
      20,
    )
    expect(painted.topStrand).toEqual([
      { start: 4, end: 6, color: 'blue' },
      { start: 6, end: 10, color: 'red' },
    ])
    expect(strandColorAtPosition(painted, 7, 'forward', 20, 'linear')).toBe('#dc2626')
  })

  it('paints wrapped circular selections as two spans', () => {
    const painted = paintStrandColorForSelection(undefined, 'forward', { start: 18, end: 2 }, 'green', 20)
    expect(painted.topStrand).toEqual([
      { start: 18, end: 20, color: 'green' },
      { start: 0, end: 2, color: 'green' },
    ])
  })

  it('can paint both strands independently', () => {
    const top = paintStrandColorForSelection(undefined, 'forward', { start: 2, end: 5 }, 'red', 20)
    const both = paintStrandColorForSelection(top, 'reverse', { start: 2, end: 5 }, 'red', 20)
    expect(both.topStrand).toEqual([{ start: 2, end: 5, color: 'red' }])
    expect(both.bottomStrand).toEqual([{ start: 2, end: 5, color: 'red' }])
  })

  it('clears paint from a selection while preserving colors on both sides', () => {
    const cleared = clearStrandColorForSelection(
      {
        topStrand: [{ start: 2, end: 10, color: 'black' }],
        bottomStrand: [],
      },
      'forward',
      { start: 5, end: 8 },
      20,
    )
    expect(cleared.topStrand).toEqual([
      { start: 2, end: 5, color: 'black' },
      { start: 8, end: 10, color: 'black' },
    ])
    expect(strandColorAtPosition(cleared, 6, 'forward', 20, 'linear')).toBeUndefined()
  })
})

describe('SnapGene strand color round-trip', () => {
  it('exports block 20 and preserves sequence case on export', () => {
    const sequence = 'aaaGGAGATATGCGTACTtt'
    const bytes = exportSnapGene({
      id: 'seq-1',
      name: 'case-test',
      description: 'test',
      molecule: 'dna',
      topology: 'circular',
      sequence,
      features: [],
      primers: [],
      operations: [],
      construct: {
        ...defaultConstructProperties,
        syntheticDna: false,
        laboratoryHostOrganism: null,
        bacterialTransformationStrain: null,
        hostMethylation: { dam: false, dcm: false, ecoKI: false },
        sequenceAuthor: 'test',
        comments: '',
      },
      createdAt: '',
      updatedAt: '',
      strandColors: parseSnapGeneStrandColorsXml(
        `<StrandColors><TopStrand><ColorRange range="3..13" colors="red"/></TopStrand></StrandColors>`,
        sequence.length,
      ),
    })

    const dnaPacket = readSnapGenePacket(bytes, 0x00)
    expect(new TextDecoder('ascii').decode(dnaPacket!.slice(1))).toBe(sequence)

    const colorsPacket = readSnapGenePacket(bytes, 0x14)
    expect(colorsPacket).not.toBeNull()
    const xml = new TextDecoder().decode(colorsPacket!)
    expect(xml).toContain('<StrandColors>')
    expect(xml).toContain('colors="red"')
    expect(parseSnapGeneStrandColorsXml(xml, sequence.length)?.topStrand).toEqual([
      { start: 2, end: 13, color: 'red' },
    ])
  })

  it('round-trips exported strand colors XML', () => {
    const colors = {
      type: 'Product' as const,
      topStrand: [{ start: 2, end: 13, color: 'red' }],
      bottomStrand: [{ start: 4, end: 8, color: 'blue' }],
    }
    const xml = exportSnapGeneStrandColorsXml(colors)
    expect(parseSnapGeneStrandColorsXml(xml, 20)).toEqual(colors)
  })
})
