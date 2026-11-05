import { describe, expect, it } from 'vitest'
import {
  finalizeVivantisProfile,
  isVivantisUbOnlySupply,
  normalizeVivantisSuppliedBuffer,
  preferredVivantisTableBuffer,
  reconcileVivantisPreferredBuffer,
  sanitizeVivantisHeatInactivation,
  vivantisBufferColumns,
  vivantisBufferColumnsFromActivity,
  vivantisEnzymeSpecificBufferLabel,
  vivantisEnzymeSpecificBufferName,
} from '../src/domain/vivantisBuffer'

describe('vivantisEnzymeSpecificBuffer', () => {
  it('detects enzyme-named supplied buffers', () => {
    expect(vivantisEnzymeSpecificBufferName('10X Buffer AccB1I, 10X Buffer UB and Viva Buffer A (Diluent)')).toBe(
      'AccB1I',
    )
    expect(vivantisEnzymeSpecificBufferLabel('10X Buffer EcoRI, 10X Buffer UB and Viva Buffer A. (Diluent)')).toBe(
      'Buffer EcoRI',
    )
  })

  it('ignores standard V, UB-only, and diluent-only supplied buffers', () => {
    expect(vivantisEnzymeSpecificBufferName('10X Buffer V3, 10X Buffer UB and Viva Buffer A. (Diluent)')).toBeNull()
    expect(vivantisEnzymeSpecificBufferName('10X Buffer UB and Viva Buffer A. (Diluent)')).toBeNull()
    expect(isVivantisUbOnlySupply('10X Buffer UB and Viva Buffer A. (Diluent)')).toBe(true)
  })
})

describe('normalizeVivantisSuppliedBuffer', () => {
  it('moves storage guidance into catalog notes', () => {
    const normalized = normalizeVivantisSuppliedBuffer(
      '10X Buffer V5, 10X Buffer UB and Viva Buffer A. (Diluent) Enzyme is stable for up to 6 months if properly stored. It is recommended that the enzyme is kept in small aliquots to avoid repeated freeze-thaw cycles',
    )
    expect(normalized.suppliedBuffer).toBe('10X Buffer V5, 10X Buffer UB and Viva Buffer A. (Diluent)')
    expect(normalized.catalogNotes[0]).toMatch(/stable for up to 6 months/i)
  })
})

describe('preferredVivantisTableBuffer', () => {
  it('prefers enzyme-specific buffer over table columns', () => {
    expect(
      preferredVivantisTableBuffer(
        'Reaction Conditions: Buffer V1 at 37°C',
        { v1: '75', v2: '75', v3: '50', v4: '50', ub: '75' },
        '10X Buffer AccB1I, 10X Buffer UB and Viva Buffer A (Diluent)',
      ),
    ).toBe('specific')
  })

  it('prefers UB for UB-only kits when activity is present', () => {
    expect(
      preferredVivantisTableBuffer(
        'Reaction Conditions: Buffer V4 at 37°C',
        { v1: '10', v2: '50', v3: '50', v4: '75', ub: '100' },
        '10X Buffer UB and Viva Buffer A. (Diluent)',
      ),
    ).toBe('ub')
  })

  it('prefers supplied V buffer when reaction buffer is below 100%', () => {
    expect(
      preferredVivantisTableBuffer(
        'Reaction Conditions: Buffer V1 at 37°C',
        { v1: '75', v2: '50', v3: '100', v4: '50', ub: '75' },
        '10X Buffer V3, 10X Buffer UB and Viva Buffer A. (Diluent)',
      ),
    ).toBe('v3')
  })
})

describe('reconcileVivantisPreferredBuffer', () => {
  it('keeps V5 when supplied with V5 and poster activity is present', () => {
    expect(
      reconcileVivantisPreferredBuffer({
        preferredBuffer: 'v5',
        suppliedBuffer: '10X Buffer V5, 10X Buffer UB and Viva Buffer A. (Diluent)',
        bufferActivity: { v1: '100', v2: '100', v3: '75', v4: '75', v5: '100', ub: '100' },
      }),
    ).toBe('v5')
  })
})

describe('sanitizeVivantisHeatInactivation', () => {
  it('rejects digestion example text', () => {
    expect(
      sanitizeVivantisHeatInactivation(
        'Quality Control Assays: Product Datasheet Example of Digestion Reaction Enzyme : 1 unit T7 DNA',
      ),
    ).toBeNull()
    expect(sanitizeVivantisHeatInactivation('65°C for 20 minutes')).toBe('65°C for 20 minutes')
    expect(sanitizeVivantisHeatInactivation('NO')).toBe('NO')
  })
})

describe('vivantisBufferColumnsFromActivity', () => {
  it('always includes V1–V5 and all UB concentrations', () => {
    expect(vivantisBufferColumnsFromActivity({ v1: '100', v2: '100', v3: '75', v4: '75', ub: '100' })).toEqual(
      vivantisBufferColumns,
    )
  })
})

describe('finalizeVivantisProfile', () => {
  it('cleans UB-only kits and prefers UB', () => {
    const finalized = finalizeVivantisProfile({
      suppliedBuffer: '10X Buffer UB and Viva Buffer A. (Diluent)',
      preferredBuffer: 'v4',
      bufferActivity: { v1: '10', v2: '50', v3: '50', v4: '75', ub: '100' },
      heatInactivation: '65°C for 20 minutes',
      enzymeSpecificBuffer: null,
      catalogNotes: [],
    })
    expect(finalized.enzymeSpecificBuffer).toBeNull()
    expect(finalized.preferredBuffer).toBe('ub')
  })
})
