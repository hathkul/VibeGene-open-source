// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { defaultConstructProperties } from '../src/domain/constructProperties'
import {
  canWriteProjectFileFormat,
  inferProjectFileFormat,
  serializeProjectFile,
} from '../src/domain/fileFormats'
import { exportProjectJson, parseProjectJson, parseSnapGene } from '../src/domain/parsers'
import {
  chooseDatabaseCopyFileName,
  snapGeneExtensionForMolecule,
  snapGeneFormatForMolecule,
  workspaceSaveDisposition,
} from '../src/domain/projectSaveSemantics'
import {
  parseSnapGeneAttachments,
  VIBEGENE_ATTACHMENT_FILE_NAME,
} from '../src/domain/snapgeneAttachments'
import {
  exportSnapGeneProtein,
  hydrateSnapGeneProteinRecord,
  isSnapGeneBondFeature,
  parseVibegeneSnapgeneAttachmentPayload,
  proteinBondToSnapGeneFeature,
  VIBEGENE_SNAPGENE_ATTACHMENT_SCHEMA,
} from '../src/domain/snapgeneProtein'
import { defaultFeatureTranslationOptions } from '../src/domain/geneticCode'
import {
  applyHistoryRetention,
  buildProteinSourceHistoryRetentionPolicy,
} from '../src/domain/historyRetention'
import { proteinTranslationSourceFromRecord, translatedCdsDerivation } from '../src/domain/proteinTranslationProvenance'
import type { SequenceRecord } from '../src/domain/types'

function proteinRecord(overrides: Partial<SequenceRecord> = {}): SequenceRecord {
  const sequence = 'ACDEFGHIKLMNPQRSTVWYCCCCCCCC'
  return {
    id: 'protein-1',
    name: 'TestProtein',
    description: 'Round-trip probe',
    molecule: 'protein',
    topology: 'linear',
    sequence,
    features: [
      {
        id: 'f1',
        name: 'Domain',
        type: 'region',
        color: '#2563eb',
        locations: [{ start: 0, end: 10, strand: 'forward' }],
      },
    ],
    primers: [],
    operations: [],
    construct: defaultConstructProperties,
    protein: {
      numberingStart: 1,
      numberingRegions: [],
      bonds: [
        {
          id: 'bond-1',
          name: 'SS1',
          type: 'disulfide',
          endpoints: [{ residue: 20 }, { residue: 27 }],
          color: '#b45309',
          strokeWidth: 2,
          showLabel: true,
        },
      ],
      comparisonSources: [
        {
          id: 'cmp-1',
          name: 'Homolog',
          kind: 'protein',
          sequence: 'ACDEFGHIKLMNPQRSTVWYAAAAAAA',
          enabled: true,
          disabledFrameShiftKeys: [],
        },
      ],
      sourceDatabase: 'VibeGene',
      sourceAccession: 'TEST',
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function listBlocks(bytes: Uint8Array) {
  const blocks: Array<{ type: number; data: Uint8Array }> = []
  let offset = 0
  while (offset + 5 <= bytes.length) {
    const type = bytes[offset]!
    const length = new DataView(bytes.buffer, bytes.byteOffset + offset + 1, 4).getUint32(0, false)
    const start = offset + 5
    const end = start + length
    if (end > bytes.length) break
    blocks.push({ type, data: bytes.subarray(start, end) })
    offset = end
  }
  return blocks
}

describe('SnapGene .prot protein save', () => {
  it('registers snapgene-protein as writable and prefers .prot for proteins', () => {
    expect(canWriteProjectFileFormat('snapgene-protein')).toBe(true)
    expect(inferProjectFileFormat('albumin.prot')).toBe('snapgene-protein')
    expect(snapGeneFormatForMolecule('protein')).toBe('snapgene-protein')
    expect(snapGeneExtensionForMolecule('protein')).toBe('prot')
    expect(chooseDatabaseCopyFileName('folder/a.gp', ['a.prot'], 'prot')).toBe('a (2).prot')
    expect(
      workspaceSaveDisposition({
        id: '1',
        fileFormat: 'snapgene-protein',
        fileName: 'a.prot',
      }),
    ).toBe('save-snapgene')
  })

  it('writes protein block 0x15, Bond features, and vibegene attachment', () => {
    const record = proteinRecord()
    const bytes = exportSnapGeneProtein(record)
    const blocks = listBlocks(bytes)
    const types = blocks.map((block) => block.type)
    expect(types).toContain(0x09)
    expect(types).toContain(0x15)
    expect(types).toContain(0x0a)
    expect(types.filter((type) => type === 0x17)).toHaveLength(2)
    expect(types).not.toContain(0x00)

    const cookie = blocks.find((block) => block.type === 0x09)!.data
    expect(new DataView(cookie.buffer, cookie.byteOffset).getUint16(8, false)).toBe(2)

    const sequenceBlock = blocks.find((block) => block.type === 0x15)!.data
    expect(new TextDecoder().decode(sequenceBlock.subarray(1))).toBe(record.sequence)

    const featuresXml = new TextDecoder().decode(blocks.find((block) => block.type === 0x0a)!.data)
    expect(featuresXml).toContain('type="Bond"')
    expect(featuresXml).toContain('bond_type')
    expect(featuresXml).toContain('Domain')

    const attachments = parseSnapGeneAttachments(
      blocks.filter((block) => block.type === 0x17).map((block) => block.data),
    )
    expect(attachments).toHaveLength(1)
    expect(attachments[0]?.name).toBe(VIBEGENE_ATTACHMENT_FILE_NAME)
    const payload = JSON.parse(new TextDecoder().decode(attachments[0]!.data))
    expect(payload.schema).toBe(VIBEGENE_SNAPGENE_ATTACHMENT_SCHEMA)
    expect(payload.schemaVersion).toBe(3)
    expect(payload.protein.bonds).toHaveLength(1)
    expect(payload.protein.comparisonSources).toHaveLength(1)
  })

  it('round-trips through parseSnapGene without duplicating bonds as features', () => {
    const record = proteinRecord()
    const serialized = serializeProjectFile('snapgene-protein', record)
    expect(serialized.ok).toBe(true)
    if (!serialized.ok) return

    const parsed = parseSnapGene(serialized.bytes, 'TestProtein.prot')
    expect(parsed.molecule).toBe('protein')
    expect(parsed.sequence).toBe(record.sequence)
    expect(parsed.features.some(isSnapGeneBondFeature)).toBe(false)
    expect(parsed.features.some((feature) => feature.name === 'Domain')).toBe(true)
    expect(parsed.protein?.bonds).toHaveLength(1)
    expect(parsed.protein?.bonds[0]).toMatchObject({
      name: 'SS1',
      type: 'disulfide',
      endpoints: [{ residue: 20 }, { residue: 27 }],
      strokeWidth: 2,
    })
    // showLabel defaults to on; normalize only stores explicit false
    expect(parsed.protein?.bonds[0]?.showLabel).not.toBe(false)
    expect(parsed.protein?.comparisonSources).toHaveLength(1)
    expect(parsed.protein?.sourceAccession).toBe('TEST')
  })

  it('round-trips embedded source DNA and CDS translation provenance', () => {
    const feature = {
      id: 'source-cds',
      name: 'Source CDS',
      type: 'CDS',
      color: '#22c55e',
      translateInSequenceView: true,
      translation: defaultFeatureTranslationOptions(1),
      locations: [{ start: 0, end: 9, strand: 'forward' as const }],
    }
    const sourceRecord: SequenceRecord = {
      id: 'source-dna',
      name: 'source.dna',
      description: '',
      molecule: 'dna',
      topology: 'linear',
      sequence: 'ATGGTTTAA',
      features: [feature],
      primers: [],
      operations: [],
      history: {
        id: 'history-current',
        name: 'source.dna',
        seqLen: 9,
        circular: false,
        operation: 'insert',
        resurrectable: false,
        hideHistory: false,
        oligos: [],
        regeneratedSites: [],
        inputSummaries: [],
        features: [],
        children: [{
          id: 'history-parent',
          name: 'parent.dna',
          seqLen: 6,
          circular: false,
          operation: 'invalid',
          resurrectable: true,
          hideHistory: false,
          oligos: [],
          regeneratedSites: [],
          inputSummaries: [],
          features: [],
          sequence: 'ATGGTT',
          children: [],
        }],
      },
      snapGeneNativeHistory: {
        treePayload: new Uint8Array([0xfd, 0x37, 0x7a, 0x58]),
        treeFingerprint: 'fnv1a32:test:1',
        nodePackets: [{ nodeId: 'history-parent', payload: new Uint8Array([1, 2, 3, 4]) }],
      },
      snapGeneEnzymes: {
        documentUuid: 'source-document',
        enzymeSetName: 'unique-6-plus',
        cachedSequenceLength: 9,
        block2: new Uint8Array([2, 2, 2]),
        block3: new Uint8Array([3, 3, 3]),
        block13: new Uint8Array([13, 13]),
      },
      construct: defaultConstructProperties,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    }
    const record = proteinRecord({
      protein: {
        ...proteinRecord().protein!,
        translationDerivation: translatedCdsDerivation([
          proteinTranslationSourceFromRecord(sourceRecord, feature),
        ]),
      },
    })
    const serialized = serializeProjectFile('snapgene-protein', record)
    expect(serialized.ok).toBe(true)
    if (!serialized.ok) return
    const parsed = parseSnapGene(serialized.bytes, 'derived.prot')
    const source = parsed.protein?.translationDerivation?.sources[0]
    expect(source?.sourceRecord?.molecule).toBe('dna')
    expect(source?.sourceRecord?.sequence).toBe('ATGGTTTAA')
    expect(source?.sourceRecord?.history?.children[0]?.sequence).toBe('ATGGTT')
    expect(source?.sourceRecord?.snapGeneNativeHistory?.treePayload)
      .toEqual(new Uint8Array([0xfd, 0x37, 0x7a, 0x58]))
    expect(source?.sourceRecord?.snapGeneNativeHistory?.nodePackets[0]?.payload)
      .toEqual(new Uint8Array([1, 2, 3, 4]))
    expect(source?.sourceRecord?.snapGeneEnzymes?.block2).toEqual(new Uint8Array([2, 2, 2]))
    expect(source?.sourceRecord?.snapGeneEnzymes?.block3).toEqual(new Uint8Array([3, 3, 3]))
    expect(source?.sourceRecord?.snapGeneEnzymes?.block13).toEqual(new Uint8Array([13, 13]))
    expect(source?.cds?.featureId).toBe('source-cds')
    expect(source?.cds?.includedTerminalStop).toBe(true)

    const blocks = listBlocks(serialized.bytes)
    const attachments = parseSnapGeneAttachments(
      blocks.filter((block) => block.type === 0x17).map((block) => block.data),
    )
    const payload = JSON.parse(new TextDecoder().decode(attachments[0]!.data))
    expect(payload.derivation.sources[0].sourceRecord.sequence).toBe('ATGGTTTAA')
    expect(payload.derivation.sources[0].sourceRecord.snapGeneEnzymes.block3Base64).toBe('AwMD')
    expect(payload.derivation.sources[0].sourceRecord.snapGeneEnzymes.block3).toBeUndefined()
    expect(payload.protein.translationDerivation).toBeUndefined()

    const serializedAgain = serializeProjectFile('snapgene-protein', parsed)
    expect(serializedAgain.ok).toBe(true)
    if (!serializedAgain.ok) return
    const parsedAgain = parseSnapGene(serializedAgain.bytes, 'derived-again.prot')
    const sourceAgain = parsedAgain.protein?.translationDerivation?.sources[0]?.sourceRecord
    expect(sourceAgain?.snapGeneNativeHistory?.nodePackets[0]?.payload)
      .toEqual(new Uint8Array([1, 2, 3, 4]))
    expect(sourceAgain?.snapGeneEnzymes?.block3).toEqual(new Uint8Array([3, 3, 3]))

    const projectRoundTrip = parseProjectJson(exportProjectJson(record)).record
    const projectSource = projectRoundTrip.protein?.translationDerivation?.sources[0]?.sourceRecord
    expect(projectSource?.snapGeneNativeHistory?.treePayload)
      .toEqual(new Uint8Array([0xfd, 0x37, 0x7a, 0x58]))
    expect(projectSource?.snapGeneEnzymes?.block13).toEqual(new Uint8Array([13, 13]))

    const cdsOnly = applyHistoryRetention(
      record,
      buildProteinSourceHistoryRetentionPolicy('cds-only', 0),
    )
    const trimmedSerialized = serializeProjectFile('snapgene-protein', cdsOnly)
    expect(trimmedSerialized.ok).toBe(true)
    if (!trimmedSerialized.ok) return
    const trimmedParsed = parseSnapGene(trimmedSerialized.bytes, 'derived-cds-only.prot')
    const trimmedSource = trimmedParsed.protein?.translationDerivation?.sources[0]
    expect(trimmedSource?.sourceRecord).toBeUndefined()
    expect(trimmedSource?.retention).toBe('cds-only')
    expect(trimmedSource?.cds?.nucleotideSequence).toBe('ATGGTTTAA')
  })

  it('continues to read schema-v1 protein attachments', () => {
    const legacy = new TextEncoder().encode(JSON.stringify({
      schema: VIBEGENE_SNAPGENE_ATTACHMENT_SCHEMA,
      schemaVersion: 1,
      protein: { numberingStart: 7, numberingRegions: [], bonds: [] },
    }))
    expect(parseVibegeneSnapgeneAttachmentPayload(legacy, 20)?.protein.numberingStart).toBe(7)
  })

  it('repairs legacy numeric byte objects in nested source DNA', () => {
    const legacyPayload = {
      schema: VIBEGENE_SNAPGENE_ATTACHMENT_SCHEMA,
      schemaVersion: 2,
      protein: { numberingStart: 1, numberingRegions: [], bonds: [] },
      derivation: {
        kind: 'translated-cds',
        createdAt: '',
        sources: [{
          projectName: 'legacy.dna',
          sequenceDigest: 'fnv1a64:legacy',
          sourceRecord: {
            id: 'legacy-source',
            name: 'legacy.dna',
            description: '',
            molecule: 'dna',
            topology: 'linear',
            sequence: 'ATGC',
            features: [],
            primers: [],
            operations: [],
            snapGeneEnzymes: {
              cachedSequenceLength: 4,
              block3: { 0: 3, 1: 4, 2: 5 },
            },
            construct: defaultConstructProperties,
            createdAt: '',
            updatedAt: '',
          },
        }],
      },
    }
    const legacy = new TextEncoder().encode(JSON.stringify(legacyPayload))
    const source = parseVibegeneSnapgeneAttachmentPayload(legacy, 2)
      ?.protein.translationDerivation?.sources[0]?.sourceRecord
    expect(source?.snapGeneEnzymes?.block3).toEqual(new Uint8Array([3, 4, 5]))

    const legacyProject = parseProjectJson(JSON.stringify({
      schemaVersion: 5,
      record: proteinRecord({
        protein: {
          ...proteinRecord().protein!,
          translationDerivation: legacyPayload.derivation as unknown as
            NonNullable<SequenceRecord['protein']>['translationDerivation'],
        },
      }),
    })).record
    expect(legacyProject.protein?.translationDerivation?.sources[0]?.sourceRecord
      ?.snapGeneEnzymes?.block3).toEqual(new Uint8Array([3, 4, 5]))
  })

  it('keeps valid provenance when optional nested binary metadata is damaged', () => {
    const damaged = new TextEncoder().encode(JSON.stringify({
      schema: VIBEGENE_SNAPGENE_ATTACHMENT_SCHEMA,
      schemaVersion: 3,
      protein: { numberingStart: 1, numberingRegions: [], bonds: [] },
      derivation: {
        kind: 'translated-cds',
        createdAt: '',
        sources: [{
          projectName: 'recoverable.dna',
          sequenceDigest: 'fnv1a64:recoverable',
          sourceRecord: {
            id: 'recoverable-source',
            name: 'recoverable.dna',
            description: '',
            molecule: 'dna',
            topology: 'linear',
            sequence: 'ATGC',
            features: [],
            primers: [],
            operations: [],
            snapGeneNativeHistory: {
              treePayloadBase64: 'not valid base64 %%%',
              nodePackets: [],
            },
            snapGeneEnzymes: { block3Base64: 'also invalid %%%' },
            construct: defaultConstructProperties,
            createdAt: '',
            updatedAt: '',
          },
        }],
      },
    }))
    const source = parseVibegeneSnapgeneAttachmentPayload(damaged, 2)
      ?.protein.translationDerivation?.sources[0]?.sourceRecord
    expect(source?.sequence).toBe('ATGC')
    expect(source?.snapGeneNativeHistory).toBeUndefined()
    expect(source?.snapGeneEnzymes).toBeUndefined()
  })

  it('keeps protein metadata when optional v2 provenance is malformed', () => {
    const malformed = new TextEncoder().encode(JSON.stringify({
      schema: VIBEGENE_SNAPGENE_ATTACHMENT_SCHEMA,
      schemaVersion: 2,
      protein: { numberingStart: 9, numberingRegions: [], bonds: [] },
      derivation: { kind: 'translated-cds', createdAt: '', sources: [{ sourceRecord: { molecule: 'dna' } }] },
    }))
    const parsed = parseVibegeneSnapgeneAttachmentPayload(malformed, 20)
    expect(parsed?.protein.numberingStart).toBe(9)
    expect(parsed?.protein.translationDerivation).toBeUndefined()
  })

  it('falls back to SnapGene Bond features when attachment is absent', () => {
    const bondFeature = proteinBondToSnapGeneFeature(proteinRecord().protein!.bonds[0]!)!
    const hydrated = hydrateSnapGeneProteinRecord({
      ...proteinRecord({ protein: undefined }),
      features: [
        {
          id: 'region-1',
          name: 'Region',
          type: 'region',
          color: '#64748b',
          locations: [{ start: 0, end: 5, strand: 'forward' }],
        },
        bondFeature,
      ],
    })
    expect(hydrated.features.some(isSnapGeneBondFeature)).toBe(false)
    expect(hydrated.protein?.bonds).toHaveLength(1)
    expect(hydrated.protein?.bonds[0]?.type).toBe('disulfide')
  })
})
