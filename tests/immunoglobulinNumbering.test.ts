import { describe, expect, it } from 'vitest'
import { detectImmunoglobulinNumbering } from '../src/domain/immunoglobulinNumbering'

const heavyChain = 'QVQLVQSGAEVKRPGSSVTVSCKASGGSFSTYALSWVRQAPGRGLEWMGGVIPLLTITNYAPRFQGRITITADRSTSTAYLELNSLRPEDTAVYYCAREGTTGKPIGAFAHWGQGTLVTVSS'
const kappaChain = 'DIQMTQSPSSLSASVGDRVTITCRASQDVNTAVAWYQQKPGKAPKLLIYSASFLYSGVPSRFSGSRSGTDFTLTISSLQPEDFATYYCQQHYTTPPTFGQGTKVEIK'

async function withKabatResidues(sequence: string, replacements: Record<string, string>) {
  const numbering = await detectImmunoglobulinNumbering(sequence, 'kabat', 'H')
  const residues = [...sequence]
  for (const [position, residue] of Object.entries(replacements)) {
    const index = numbering.positions.indexOf(position)
    if (index < 0) throw new Error(`Kabat position ${position} was not found in the test sequence.`)
    residues[index] = residue
  }
  return residues.join('')
}

describe('immunoglobulin numbering', () => {
  it('detects and maps IMGT positions onto an antibody reference', async () => {
    const result = await detectImmunoglobulinNumbering(heavyChain, 'imgt')
    expect(result.chain).toBe('H')
    expect(result.vhh?.subtype).toBe('VH')
    expect(result.confidence).toBeGreaterThan(0.5)
    expect(result.positions[0]).toBe('1')
    expect(heavyChain[result.positions.indexOf('23')]).toBe('C')
    expect(heavyChain[result.positions.indexOf('104')]).toBe('C')
    expect(heavyChain[result.positions.indexOf('118')]).toBe('W')
  })

  it('supports Kabat numbering and rejects unrelated proteins', async () => {
    const result = await detectImmunoglobulinNumbering(heavyChain, 'kabat', 'H')
    expect(result.scheme).toBe('kabat')
    expect(result.chain).toBe('H')
    await expect(detectImmunoglobulinNumbering(heavyChain, 'imgt', 'light')).rejects.toThrow()
    await expect(detectImmunoglobulinNumbering('MKTIIALSYIFCLVFADYKDDDDK', 'imgt')).rejects.toThrow()
  })

  it('can constrain detection to light or heavy chains', async () => {
    const result = await detectImmunoglobulinNumbering(kappaChain, 'imgt', 'light')
    expect(result.chain).toBe('K')
    await expect(detectImmunoglobulinNumbering(kappaChain, 'imgt', 'H')).rejects.toThrow()
  })

  it('distinguishes VHH-like heavy domains and supports manual VHH selection', async () => {
    const vhhLike = await withKabatResidues(heavyChain, {
      37: 'F',
      44: 'E',
      45: 'R',
      47: 'G',
    })
    const detected = await detectImmunoglobulinNumbering(vhhLike, 'imgt', 'auto')
    expect(detected.chain).toBe('H')
    expect(detected.vhh).toMatchObject({
      subtype: 'VHH',
      mode: 'detected',
      hallmarkMatches: 4,
    })
    expect(detected.vhh!.confidence).toBeGreaterThanOrEqual(0.9)

    const forced = await detectImmunoglobulinNumbering(heavyChain, 'kabat', 'VHH')
    expect(forced.vhh).toMatchObject({ subtype: 'VHH', mode: 'manual', hallmarkMatches: 0 })
  })

  it('ignores terminal stop markers from CDS translations', async () => {
    const withStop = `${heavyChain}*`
    const result = await detectImmunoglobulinNumbering(withStop, 'imgt', 'VHH')
    expect(result.chain).toBe('H')
    expect(result.positions).toHaveLength(withStop.length)
    expect(result.positions.at(-1)).toBeNull()
    expect(result.queryEnd).toBeLessThanOrEqual(heavyChain.length)
  })
})
