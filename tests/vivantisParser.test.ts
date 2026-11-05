import { describe, expect, it } from 'vitest'
import {
  migrateVivantisChart,
  parseBufferActivityFromManualText,
  parseBufferActivityFromPdfItems,
  preferredBufferFromManualText,
  vivantisAlsoKnownAs,
  vivantisTitleToCatalog,
} from '../scripts/fetch-vivantis-buffer-chart'
import { parseVivantisRecognition } from '../src/domain/enzymeParser'

describe('parseVivantisRecognition', () => {
  it('parses EcoRI', () => {
    const raw = `Concentration 20-100u/μl 5'…G↓AATTC…3' 3'…CTTAA↑G…5'`
    const parsed = parseVivantisRecognition(raw)
    expect(parsed).not.toBeNull()
    expect(parsed!.recognition).toBe('GAATTC')
    expect(parsed!.cutTop).toBe(1)
    expect(parsed!.cutBottom).toBe(5)
  })

  it('parses Bsp19I {NcoI} example', () => {
    const raw = `Concentration 10-30u/μl 5'…C↓CATGG…3' 3'…GGTAC↑C…5'`
    const parsed = parseVivantisRecognition(raw)
    expect(parsed).not.toBeNull()
    expect(parsed!.recognition).toBe('CCATGG')
    expect(parsed!.cutTop).toBe(1)
    expect(parsed!.cutBottom).toBe(5)
  })

  it('parses CciNI {NotI} example', () => {
    const raw = `Concentration 2-5u/μl 5'5'…GC↓GGCCGC…3' 3'…CGCCGG↑CG…5'`
    const parsed = parseVivantisRecognition(raw)
    expect(parsed).not.toBeNull()
    expect(parsed!.recognition).toBe('GCGGCCGC')
    expect(parsed!.cutTop).toBe(2)
    expect(parsed!.cutBottom).toBe(6)
  })
})

describe('vivantisTitleToCatalog', () => {
  it('uses Vivantis trade name instead of brace alias', () => {
    expect(vivantisTitleToCatalog('Ahl I {SpeI}')).toBe('AhlI')
    expect(vivantisAlsoKnownAs('Ahl I {SpeI}')).toBe('SpeI')
    expect(vivantisTitleToCatalog('Acc16I {MstI}')).toBe('Acc16I')
    expect(vivantisTitleToCatalog('EcoRI')).toBe('EcoRI')
  })

  it('normalizes OCR confusions of capital I vs lowercase L', () => {
    expect(vivantisTitleToCatalog('Bbv12l {HgiAI}')).toBe('Bbv12I')
    expect(vivantisTitleToCatalog('FbII {AccI}')).toBe('FblI')
  })

  it('migrates legacy chart keys from isoschizomer names to trade names', () => {
    const migrated = migrateVivantisChart({
      SpeI: {
        vivantisName: 'Ahl I {SpeI}',
        catalogName: 'SpeI',
        alias: 'SpeI',
        catalogNumber: null,
        recognitionRaw: "5'…G↓AATTC…3' 3'…CTTAA↑G…5'",
        preferredBuffer: 'v2',
        suppliedBuffer: null,
        bufferActivity: { v2: '100' },
        heatInactivation: null,
        incubationC: 37,
        productUrl: 'https://example.com',
        methylation: { dam: 'No Effect', dcm: 'No Effect', ecoKI: 'No Effect' },
      },
    })
    expect(migrated.AhlI?.catalogName).toBe('AhlI')
    expect(migrated.AhlI?.alsoKnownAs).toBe('SpeI')
    expect(migrated.SpeI).toBeUndefined()
  })
})

describe('parseBufferActivityFromManualText', () => {
  it('parses EcoRI manual activity table', () => {
    const text = `50% 50% 100% 50% 100% Activity in Reaction Buffer 0.5X 1.0X 1.5X 2.0X 50% 100% 100% 100% Buffer UB`
    const activity = parseBufferActivityFromManualText(text)
    expect(activity).toEqual({
      v1: '50',
      v2: '50',
      v3: '100',
      v4: '50',
      v5: '100',
      ub05: '50',
      ub: '100',
      ub15: '100',
      ub2: '100',
    })
    expect(preferredBufferFromManualText('Reaction Conditions: Buffer V3 at 37°C', activity)).toBe('v3')
  })

  it('parses BshV I manual activity table', () => {
    const text = `25% 50% 100% 100% 75% Activity in Reaction Buffer`
    const activity = parseBufferActivityFromManualText(text)
    expect(activity).toEqual({
      v1: '25',
      v2: '50',
      v3: '100',
      v4: '100',
      v5: '75',
    })
    expect(preferredBufferFromManualText(text, activity)).toBe('v3')
  })

  it('parses NaeI manual layout with values before Buffer UB', () => {
    const text = `100%   50%   10%   10% 10%  Buffer UB  0.5X 1.0X 1.5X 2.0X 75%   10%   10%   10%  Activity in Reaction Buffer`
    expect(parseBufferActivityFromManualText(text)).toEqual({
      v1: '100',
      v2: '50',
      v3: '10',
      v4: '10',
      v5: '10',
      ub05: '75',
      ub: '10',
      ub15: '10',
      ub2: '10',
    })
  })

  it('parses HhaI manual layout with four V-buffer values', () => {
    const text = `50%   25%   10% 100%  Activity in Reaction Buffer  10%  0.5X 1.0X 1.5X 2.0X 10%   100%   100% 100%  Buffer UB`
    expect(parseBufferActivityFromManualText(text)).toEqual({
      v1: '50',
      v2: '25',
      v3: '10',
      v4: '100',
      ub05: '10',
      ub: '100',
      ub15: '100',
      ub2: '100',
    })
  })

  it('parses AspLE I positional PDF activity row', () => {
    const items = [
      { str: '10%', x: 100, y: 279 },
      { str: '50%', x: 150, y: 279 },
      { str: '100%', x: 200, y: 279 },
      { str: '25%', x: 250, y: 279 },
      { str: 'Activity in Reaction Buffer', x: 50, y: 300 },
    ]
    expect(parseBufferActivityFromPdfItems(items)).toEqual({
      v1: '10',
      v2: '50',
      v3: '100',
      v4: '25',
    })
    expect(preferredBufferFromManualText('Reaction Conditions: Buffer V3 at 37°C', {
      v1: '10',
      v2: '50',
      v3: '100',
      v4: '25',
      ub: '100',
    })).toBe('v3')
  })

  it('parses Sse8387I scrambled manual layout', () => {
    const text = `Activity in Reaction Buffer  100% 75% 100%   100%   50%  2.0X 50%  0.5X 1.0X 1.5X 100%   100%   50%  Buffer UB`
    expect(parseBufferActivityFromManualText(text)).toEqual({
      v1: '100',
      v2: '75',
      v3: '100',
      v4: '100',
      v5: '50',
      ub05: '100',
      ub: '100',
      ub15: '50',
      ub2: '50',
    })
  })

  it('parses positioned PDF UB row with four concentrations', () => {
    const items = [
      { str: '50%', x: 100, y: 255 },
      { str: '100%', x: 150, y: 255 },
      { str: '100%', x: 200, y: 255 },
      { str: '100%', x: 250, y: 255 },
      { str: 'Buffer UB', x: 50, y: 270 },
      { str: 'Activity in Reaction Buffer', x: 50, y: 300 },
    ]
    expect(parseBufferActivityFromPdfItems(items)).toEqual({
      ub05: '50',
      ub: '100',
      ub15: '100',
      ub2: '100',
    })
  })

  it('parses combined percent tokens in one PDF text item', () => {
    const items = [
      { str: '100% 100%', x: 9, y: 230 },
      { str: '75%', x: 49, y: 230 },
      { str: '75%', x: 68, y: 230 },
      { str: '0.5X 1.0X 1.5X 2.0X', x: 9, y: 240 },
      { str: 'Buffer UB', x: 30, y: 253 },
      { str: 'Activity in Reaction Buffer', x: 8, y: 293 },
    ]
    expect(parseBufferActivityFromPdfItems(items)).toEqual({
      ub05: '100',
      ub: '100',
      ub15: '75',
      ub2: '75',
    })
  })
})
