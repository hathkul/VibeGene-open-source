import { describe, expect, it } from 'vitest'
import { defaultConstructProperties, normalizeProteinDocumentData, normalizeSequenceRecord } from '../src/domain/constructProperties'
import {
  capabilitiesForMolecule,
  formatSequenceLength,
  isWorkspaceTabAvailable,
} from '../src/domain/moleculeCapabilities'
import { exportProjectJson, parseProjectJson } from '../src/domain/parsers'
import { inferProteinSequence, parseFasta, parseSequenceFile } from '../src/domain/parsers'
import {
  aminoAcidInfo,
  calculateProteinProperties,
  findProteinMotifs,
  formatProteinMass,
  proteinDisplayNumberAt,
  proteinMolecularWeight,
  proteinMonoisotopicMass,
  proteinResiduesPerRow,
  proteinRulerMarks,
} from '../src/domain/protein'
import {
  sanitizeProtein,
  sanitizeRna,
  sanitizeSequenceForMolecule,
} from '../src/domain/sequence'
import type { ProteinBond, SequenceRecord } from '../src/domain/types'
import { normalizeProjectFileName } from '../src/storage/projects'
import { createSequenceRecordFromNewProteinFile } from '../src/domain/newProteinFile'
import { inferProjectFileFormat, SEQUENCE_OPEN_ACCEPT } from '../src/domain/fileFormats'
import {
  createProteinFeature,
  normalizeProteinFeatures,
  proteinFeatureFieldValues,
  proteinFeaturesOverlappingRange,
  serializeProteinFeatureFields,
} from '../src/domain/proteinFeatures'
import {
  assignProteinAnnotationLanes,
  assignProteinBondLanes,
  defaultProteinBondResidues,
  localProteinBondResidues,
  proteinBondDescription,
  proteinBondLabelCenterOffsets,
  proteinBondLaneMetrics,
  proteinMapBondLabelAttachX,
  proteinBondSegmentsForRow,
  proteinBondToCalloutSite,
} from '../src/domain/proteinBonds'

function proteinRecord(overrides: Partial<SequenceRecord> = {}): SequenceRecord {
  return {
    id: 'protein-1',
    name: 'Example protein',
    description: '',
    molecule: 'protein',
    topology: 'circular',
    sequence: 'mKWVtF* BZJUO-123',
    features: [],
    primers: [{ id: 'primer-1', name: 'DNA primer', sequence: 'ATGC', color: '#000000' }],
    traceFiles: [],
    operations: [],
    dnaEnds: {
      upstream: { modification: 'unmodified', stickiness: 0 },
      downstream: { modification: 'unmodified', stickiness: 0 },
    },
    protein: {
      numberingStart: -4,
      numberingRegions: [
        { id: 'region-b', sequenceStart: 4, sequenceEnd: 9, startAt: 20 },
        { id: 'region-a', sequenceStart: 0, sequenceEnd: 4, startAt: 5 },
      ],
      bonds: [
        {
          id: 'bond-1',
          name: 'Cystine',
          type: 'disulfide',
          endpoints: [{ residue: 1 }, { residue: 42, chainId: 'B' }],
        },
      ],
      userColors: {
        topStrand: [{ start: 1, end: 5, color: 'red' }],
        bottomStrand: [],
      },
      sourceDatabase: ' UniProt ',
      sourceAccession: ' P12345 ',
    },
    construct: defaultConstructProperties,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('molecule-aware sequence sanitization', () => {
  it('preserves protein residues, ambiguity symbols, case, and stop codons', () => {
    expect(sanitizeProtein('mKWVtF* BZJUO-123')).toBe('mKWVtF*BZJUO')
    expect(sanitizeSequenceForMolecule('AUG CUN', 'protein')).toBe('AUGCUN')
  })

  it('keeps RNA U but removes DNA T', () => {
    expect(sanitizeRna('augT ry')).toBe('augry')
  })
})

describe('protein record normalization', () => {
  it('forces a safe protein shape and preserves protein annotations', () => {
    const normalized = normalizeSequenceRecord(proteinRecord())
    expect(normalized.sequence).toBe('mKWVtF*BZJUO')
    expect(normalized.topology).toBe('linear')
    expect(normalized.primers).toEqual([])
    expect(normalized.dnaEnds).toBeUndefined()
    expect(normalized.traceFiles).toBeUndefined()
    expect(normalized.protein).toMatchObject({
      numberingStart: -4,
      sourceDatabase: 'UniProt',
      sourceAccession: 'P12345',
      numberingRegions: [
        { id: 'region-a', sequenceStart: 0, sequenceEnd: 4, startAt: 5 },
        { id: 'region-b', sequenceStart: 4, sequenceEnd: 9, startAt: 20 },
      ],
    })
    expect(normalized.protein?.bonds[0]?.endpoints).toEqual([
      { residue: 1 },
      { residue: 42, chainId: 'B' },
    ])
    expect(normalized.protein?.userColors?.topStrand).toEqual([
      { start: 1, end: 5, color: 'red' },
    ])
  })

  it('round-trips protein data through schema version 6 JSON', () => {
    const normalized = normalizeSequenceRecord(proteinRecord())
    const json = exportProjectJson(normalized)
    expect(JSON.parse(json).schemaVersion).toBe(6)
    expect(parseProjectJson(json).record).toEqual(normalized)
  })
})

describe('molecule capabilities', () => {
  it('gates DNA-only surfaces for protein documents', () => {
    const protein = capabilitiesForMolecule('protein')
    expect(protein.sequenceUnit).toBe('aa')
    expect(protein.restrictionEnzymes).toBe(false)
    expect(protein.primers).toBe(false)
    expect(protein.cloning).toBe(false)
    expect(protein.dnaEnds).toBe(false)
    expect(protein.features).toBe(true)
    expect(protein.map).toBe(true)
    expect(protein.defaultWorkspaceTab).toBe('Map')
    expect(protein.workspaceTabs).toEqual(['Map', 'Sequence', 'Properties', 'Features', 'History'])
    expect(isWorkspaceTabAvailable('Properties', 'protein')).toBe(true)
    expect(isWorkspaceTabAvailable('Properties', 'dna')).toBe(false)
    expect(isWorkspaceTabAvailable('Enzymes', 'protein')).toBe(false)
    expect(formatSequenceLength(1234, 'protein')).toBe(`${(1234).toLocaleString()} aa`)
  })

  it('uses .prot rather than .dna as the protein persistence fallback', () => {
    expect(normalizeProjectFileName(null, 'Example protein', 'protein')).toBe('Example protein.prot')
    expect(normalizeProjectFileName(null, 'Example construct', 'dna')).toBe('Example construct.dna')
  })
})

describe('phase 1 protein documents', () => {
  it('creates a normalized protein document with operation history', () => {
    const record = createSequenceRecordFromNewProteinFile({
      sequence: 'mkWV TF*',
      fileName: 'Albumin.faa',
    })
    expect(record).toMatchObject({
      name: 'Albumin',
      molecule: 'protein',
      topology: 'linear',
      sequence: 'MKWVTF*',
      protein: { numberingStart: 1, numberingRegions: [], bonds: [] },
    })
    expect(record.operations[0]?.type).toBe('newProteinFile')
  })

  it('recognizes protein FASTA from extensions, headers, and residue alphabet', () => {
    expect(inferProteinSequence('ACGT', 'short.faa')).toBe(true)
    expect(inferProteinSequence('ACGT', 'short.fasta', 'short molecule=protein')).toBe(true)
    expect(inferProteinSequence('MKWVTFISLL', 'short.fasta')).toBe(true)
    expect(inferProteinSequence('ACGTRYSWKMBDHVN', 'ambiguous-dna.fasta')).toBe(false)
    expect(parseFasta('>albumin\nMKWVTFISLL', 'albumin.faa').molecule).toBe('protein')
    expect(parseSequenceFile('MKWVTFISLL', 'albumin.pep').molecule).toBe('protein')
    expect(inferProjectFileFormat('albumin.prot')).toBe('snapgene-protein')
    expect(SEQUENCE_OPEN_ACCEPT).toContain('.faa')
    expect(SEQUENCE_OPEN_ACCEPT).toContain('.prot')
  })

  it('supports residue lookup, numbering regions, search, and mass calculation', () => {
    expect(aminoAcidInfo('w')).toMatchObject({ threeLetter: 'Trp', name: 'Tryptophan', className: 'nonpolar' })
    expect(proteinDisplayNumberAt(6, {
      numberingStart: 1,
      numberingRegions: [{ id: 'mature', sequenceStart: 5, sequenceEnd: 10, startAt: 1 }],
      bonds: [],
    })).toBe(2)
    expect(findProteinMotifs('MKWVTFMKWV', 'mkw')).toEqual([0, 6])
    expect(proteinMolecularWeight('AC')).toBeCloseTo(192.23288, 4)
    expect(formatProteinMass('AC')).toBe('192.2 Da')
    expect(formatProteinMass('AX')).toBe('Unknown')
  })

  it('keeps residue cells fixed-width while adapting row length to the pane', () => {
    expect(proteinResiduesPerRow(480, 14)).toBe(19)
    expect(proteinResiduesPerRow(960, 14)).toBe(44)
    expect(proteinResiduesPerRow(120, 14)).toBe(10)
  })

  it('builds protein ruler ticks from display numbering', () => {
    const marks = proteinRulerMarks(0, 12, { numberingStart: 1, numberingRegions: [], bonds: [] })
    expect(marks).toHaveLength(12)
    expect(marks.filter((mark) => mark.major).map((mark) => mark.number)).toEqual([5, 10])
    expect(marks.find((mark) => mark.number === 5)?.offset).toBe(4)
  })

  it('restarts residue numbering from a protein feature property across its segments', () => {
    const numberedFeature = {
      ...createProteinFeature('mature-chain', 5, 8, 'chain'),
      proteinNumberingStart: 101,
      locations: [
        { start: 5, end: 8, strand: 'forward' as const },
        { start: 12, end: 15, strand: 'forward' as const },
      ],
    }
    const data = { numberingStart: 1, numberingRegions: [], bonds: [] }
    expect(proteinDisplayNumberAt(5, data, [numberedFeature])).toBe(101)
    expect(proteinDisplayNumberAt(7, data, [numberedFeature])).toBe(103)
    expect(proteinDisplayNumberAt(12, data, [numberedFeature])).toBe(104)
    expect(proteinDisplayNumberAt(10, data, [numberedFeature])).toBe(11)
  })

  it('calculates protein masses, optical properties, pI, charge, and composition', () => {
    const properties = calculateProteinProperties('WYCC', {
      ph: 7,
      knownDisulfideCysteines: 2,
    })
    expect(properties.length).toBe(4)
    expect(properties.averageMass).toBeCloseTo(573.68208, 5)
    expect(properties.monoisotopicMass).toBeCloseTo(573.17158, 5)
    expect(proteinMonoisotopicMass('WYCC')).toBeCloseTo(573.17158, 5)
    expect(properties.extinctionCoefficientReduced).toBe(6990)
    expect(properties.extinctionCoefficient).toBe(7115)
    expect(properties.extinctionCoefficientOxidized).toBe(7115)
    expect(properties.absorbance).toBeCloseTo(7115 / 573.68208, 6)
    expect(properties.isoelectricPoint).toBeGreaterThan(4)
    expect(properties.isoelectricPoint).toBeLessThan(7)
    expect(properties.charge).toBeLessThan(0)
    expect(properties.composition.find((entry) => entry.code === 'C')).toMatchObject({
      count: 2,
      percent: 50,
    })
  })
})

describe('stage 2 protein features', () => {
  it('round-trips protein feature fields and preserves legacy plain notes', () => {
    expect(proteinFeatureFieldValues('legacy annotation')).toEqual({ note: 'legacy annotation' })
    const serialized = serializeProteinFeatureFields({ region_name: 'Catalytic core', note: 'Curated' })
    expect(proteinFeatureFieldValues(serialized)).toEqual({ region_name: 'Catalytic core', note: 'Curated' })
  })

  it('creates and normalizes residue annotations without DNA-only metadata', () => {
    const feature = {
      ...createProteinFeature('feature-1', 2, 12, 'domain'),
      translateInSequenceView: true,
      translation: {
        geneticCode: 'standard',
        firstCodonAsMet: true,
        readingFrame: 1 as const,
        consecutiveNumbering: true,
        segmentNumbering: [],
      },
      cleavageArrows: [4],
      locations: [{ start: -2, end: 99, strand: 'reverse' as const }],
    }
    expect(normalizeProteinFeatures([feature], 20)).toEqual([{
      ...feature,
      locations: [{ start: 0, end: 20, strand: 'forward' }],
      translateInSequenceView: undefined,
      translation: undefined,
      cleavageArrows: undefined,
      mapTrack: undefined,
    }])
  })

  it('finds visible protein annotations that overlap a residue row', () => {
    const domain = createProteinFeature('domain', 5, 15, 'domain')
    const hidden = { ...createProteinFeature('hidden', 5, 15, 'motif'), visible: false }
    const distant = createProteinFeature('distant', 30, 40, 'region')
    expect(proteinFeaturesOverlappingRange([domain, hidden, distant], 10, 20).map((feature) => feature.id)).toEqual(['domain'])
  })
})

describe('stage 3 protein numbering and bonds', () => {
  it('uses the first and last selected residues for a new bond', () => {
    expect(defaultProteinBondResidues(100, { start: 20, end: 41 })).toEqual([20, 40])
    expect(defaultProteinBondResidues(100, null)).toEqual([0, 1])
  })

  it('keeps non-overlapping numbering regions after rejecting an overlapping region', () => {
    const data = normalizeProteinDocumentData({
      numberingStart: -2,
      numberingRegions: [
        { id: 'first', sequenceStart: 0, sequenceEnd: 10, startAt: 1 },
        { id: 'overlap', sequenceStart: 2, sequenceEnd: 4, startAt: 20 },
        { id: 'second', sequenceStart: 10, sequenceEnd: 15, startAt: 100 },
      ],
      bonds: [],
    }, 20)
    expect(data.numberingRegions.map((region) => region.id)).toEqual(['first', 'second'])
    expect(proteinDisplayNumberAt(12, data)).toBe(102)
  })

  it('preserves comparative sources and disabled frameshift choices', () => {
    const data = normalizeProteinDocumentData({
      numberingStart: 1,
      numberingRegions: [],
      bonds: [],
      comparisonSources: [{
        id: 'translated-read',
        name: 'Translated read',
        kind: 'dna',
        sequence: 'ATGGCTGATGAA',
        enabled: true,
        disabledFrameShiftKeys: ['forward:6-10:+1', 'forward:10-11:-2'],
      }],
    }, 20)
    expect(data.comparisonSources).toEqual([expect.objectContaining({
      id: 'translated-read',
      sequence: 'ATGGCTGATGAA',
      disabledFrameShiftKeys: ['forward:6-10:+1', 'forward:10-11:-2'],
    })])
  })

  it('clamps and merges persistent protein comparison variability regions', () => {
    const data = normalizeProteinDocumentData({
      numberingStart: 1,
      numberingRegions: [],
      bonds: [],
      comparisonVariableRegions: [
        { id: 'cdr-2', start: 10, end: 18 },
        { id: 'cdr-1', start: -4, end: 5 },
        { id: 'overlap', start: 4, end: 11 },
        { id: 'outside', start: 30, end: 40 },
      ],
    }, 20)
    expect(data.comparisonVariableRegions).toEqual([
      { id: 'cdr-1', start: 0, end: 18 },
    ])
  })

  it('normalizes feature-like bond display properties', () => {
    const data = normalizeProteinDocumentData({
      numberingStart: 1,
      numberingRegions: [],
      bonds: [{
        id: 'styled',
        name: 'Catalytic bridge',
        type: 'cross-link',
        endpoints: [{ residue: 2 }, { residue: 9 }],
        color: '#123456',
        strokeWidth: 3,
        visible: false,
        showLabel: false,
        showTypeLabel: true,
      }],
    }, 20)
    expect(data.bonds[0]).toMatchObject({
      color: '#123456',
      strokeWidth: 3,
      visible: false,
      showLabel: false,
      showTypeLabel: true,
    })
    expect(normalizeProteinDocumentData({
      numberingStart: 1,
      numberingRegions: [],
      bonds: [{
        id: 'plain',
        name: 'Cystine',
        type: 'disulfide',
        endpoints: [{ residue: 0 }, { residue: 1 }],
      }],
    }, 20).bonds[0]?.strokeWidth).toBe(1.5)
    expect(normalizeProteinDocumentData({
      numberingStart: 1,
      numberingRegions: [],
      bonds: [{
        id: 'thick',
        name: 'Bridge',
        type: 'other',
        endpoints: [{ residue: 0 }, { residue: 1 }],
        strokeWidth: 99,
      }],
    }, 20).bonds[0]?.strokeWidth).toBe(8)
  })

  it('lays out local and external-chain bonds on sequence rows', () => {
    const local: ProteinBond = {
      id: 'local',
      name: 'Cystine',
      type: 'disulfide' as const,
      endpoints: [{ residue: 2 }, { residue: 12 }],
    }
    const external: ProteinBond = {
      id: 'external',
      name: 'Linked chain',
      type: 'cross-link' as const,
      endpoints: [{ residue: 5 }, { residue: 42, chainId: 'B' }],
    }
    expect(localProteinBondResidues(local)).toEqual([2, 12])
    expect(proteinBondSegmentsForRow([local, external], 0, 10)).toMatchObject([
      { bond: { id: 'local' }, start: 2, end: 10, localEndpointCount: 2, continuesBefore: false, continuesAfter: true },
      { bond: { id: 'external' }, start: 5, end: 6, localEndpointCount: 1, continuesBefore: false, continuesAfter: true },
    ])
    expect(proteinBondSegmentsForRow([local], 10, 20)[0]).toMatchObject({
      start: 10,
      end: 13,
      continuesBefore: true,
      continuesAfter: false,
    })
    expect(proteinBondDescription(external)).toBe('Cross-link · 6 ↔ B:43')
  })

  it('orders row bond segments by position rather than creation order', () => {
    const right: ProteinBond = {
      id: 'created-first',
      name: 'Right bond',
      type: 'other',
      endpoints: [{ residue: 20 }, { residue: 25 }],
    }
    const left: ProteinBond = {
      id: 'created-later',
      name: 'Left bond',
      type: 'other',
      endpoints: [{ residue: 2 }, { residue: 7 }],
    }
    expect(proteinBondSegmentsForRow([right, left], 0, 30).map((segment) => segment.bond.id))
      .toEqual(['created-later', 'created-first'])
  })

  it('packs overlapping bond segments into separate lanes', () => {
    const outer: ProteinBond = {
      id: 'outer',
      name: 'Outer',
      type: 'disulfide',
      endpoints: [{ residue: 1 }, { residue: 10 }],
    }
    const inner: ProteinBond = {
      id: 'inner',
      name: 'Inner',
      type: 'disulfide',
      endpoints: [{ residue: 3 }, { residue: 7 }],
    }
    const side: ProteinBond = {
      id: 'side',
      name: 'Side',
      type: 'disulfide',
      endpoints: [{ residue: 12 }, { residue: 15 }],
    }
    const lanes = assignProteinBondLanes(proteinBondSegmentsForRow([outer, inner, side], 0, 20))
    expect(lanes.map((segment) => [segment.bond.id, segment.lane])).toEqual([
      ['outer', 0],
      ['inner', 1],
      ['side', 0],
    ])
  })

  it('places a bond in the first lane free across its span, not below every feature in the row', () => {
    const packed = assignProteinAnnotationLanes([
      { id: 'wide-feature', kind: 'feature', start: 0, end: 8 },
      { id: 'middle-feature', kind: 'feature', start: 4, end: 12 },
      { id: 'far-feature', kind: 'feature', start: 20, end: 30 },
      { id: 'bond', kind: 'bond', start: 13, end: 19 },
    ])
    expect(packed.map(({ id, lane }) => [id, lane])).toEqual([
      ['wide-feature', 0],
      ['middle-feature', 1],
      ['far-feature', 0],
      ['bond', 0],
    ])
  })

  it('packs bond lanes with equal bar-to-name and name-to-next-bar gaps', () => {
    const metrics = proteinBondLaneMetrics(3, 8)
    expect(metrics.gapPx).toBe(3)
    expect(metrics.laneHeightPx).toBe(metrics.gapPx + metrics.labelHeightPx + metrics.gapPx)
    expect(metrics.labelTopPx).toBe(metrics.gapPx)
    // Legacy full-lane heights must not inflate spacing.
    expect(proteinBondLaneMetrics(28, 8).gapPx).toBe(3)
    expect(proteinBondLaneMetrics(28, 8).laneHeightPx).toBeGreaterThan(metrics.labelHeightPx)
  })

  it('enforces a minimum horizontal gap between map bond leaders and labels', () => {
    expect(proteinMapBondLabelAttachX(100, 100, 'right')).toBe(106)
    expect(proteinMapBondLabelAttachX(100, 100, 'left')).toBe(94)
    expect(proteinMapBondLabelAttachX(100, 120, 'right')).toBe(120)
    expect(proteinMapBondLabelAttachX(100, 70, 'left')).toBe(70)
  })

  it('shifts bond labels sideways to clear foreign vertical risers', () => {
    const outer: ProteinBond = {
      id: 'outer',
      name: 'OuterBondLabel',
      type: 'disulfide',
      endpoints: [{ residue: 0 }, { residue: 19 }],
    }
    const inner: ProteinBond = {
      id: 'inner',
      name: 'Inner',
      type: 'disulfide',
      endpoints: [{ residue: 9 }, { residue: 11 }],
    }
    const lanes = assignProteinBondLanes(proteinBondSegmentsForRow([outer, inner], 0, 20))
    const offsets = proteinBondLabelCenterOffsets(lanes, 0, 20, {
      fontSizePx: 8,
      cellWidthPx: 12,
      clearancePx: 4,
    })
    expect(Math.abs(offsets.get('outer') ?? 0)).toBeGreaterThan(0.1)
  })

  it('builds map callout sites from bond midpoints with full display labels', () => {
    const bond: ProteinBond = {
      id: 'bridge',
      name: 'Disulfide bond',
      type: 'disulfide',
      showTypeLabel: true,
      endpoints: [{ residue: 2 }, { residue: 11 }],
    }
    const site = proteinBondToCalloutSite(bond, 0)
    expect(site).toMatchObject({
      cutTop: 6,
      cutBottom: 6,
      match: '__bond_callout__bridge:0',
      enzyme: { name: 'Disulfide bond (Disulfide)' },
    })
    expect(proteinBondToCalloutSite({
      ...bond,
      endpoints: [{ residue: 4, chainId: 'A' }, { residue: 9, chainId: 'B' }],
    }, 1)).toBeNull()
  })
})
