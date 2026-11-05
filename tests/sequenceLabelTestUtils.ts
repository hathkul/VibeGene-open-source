import { createCanvas, GlobalFonts } from '@napi-rs/canvas'
import { fileURLToPath } from 'node:url'
import type { RestrictionSite } from '../src/domain/types'
import type { SequenceLabelRouterInput } from '../src/domain/sequenceLabelRouter'

/** Deterministic, representative test font; production uses the host UI font stack. */
export const SEQUENCE_ENZYME_LABEL_FONT =
  '11px "VibeGene Test Sans"'

GlobalFonts.registerFromPath(
  fileURLToPath(new URL('../node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf', import.meta.url)),
  'VibeGene Test Sans',
)

const canvas = createCanvas(1, 1)
const context = canvas.getContext('2d')!
context.font = SEQUENCE_ENZYME_LABEL_FONT

const widthCache = new Map<string, number>()

export function measureSequenceEnzymeLabelWidthPx(label: string) {
  const cached = widthCache.get(label)
  if (cached != null) return cached
  const width = Math.max(1, context.measureText(label).width)
  widthCache.set(label, width)
  return width
}

export function sequenceLabelWidthForSite(_site: RestrictionSite, label: string) {
  return measureSequenceEnzymeLabelWidthPx(label)
}

export function sequenceRouterInputDefaults(
  overrides: Partial<SequenceLabelRouterInput> = {},
): Pick<
  SequenceLabelRouterInput,
  'textHeight' | 'labelPadding' | 'labelWidthForSite' | 'baseStepPx' | 'trackInsetPx' | 'collisionUnitPx'
> {
  return {
    baseStepPx: 10,
    trackInsetPx: 28,
    collisionUnitPx: 0,
    textHeight: 13,
    labelPadding: 6,
    labelWidthForSite: sequenceLabelWidthForSite,
    ...overrides,
  }
}
