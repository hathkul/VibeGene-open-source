import { defaultPrimerHybridizationParams } from './primerHybridization'
import type { PrimerBindingLayout, Strand } from './types'

export const PRIMER_DISPLAY_ROWS = 3
export const PRIMER_ROW_HALF_SHIFT = 0.5
/** One letter-height raised band for oversize inserts / portal hairpins. */
export const PRIMER_ROW_INSERT_SHIFT = 1
/** Horizontal inset/outset between a primer letter cell edge and a vertical frame border. */
export const PRIMER_FRAME_EDGE_PAD_RATIO = 0.25
/** @deprecated Prefer primerHybridization.minMeltingTemperature (default 40). */
export const MIN_PRIMER_DISPLAY_TM_C = defaultPrimerHybridizationParams.minMeltingTemperature
/** Internal scientific palette fallback for synthetic primer probes. */
export const PRIMER_FALLBACK_COLOR = '#7c3aed'

export type PrimerGlyphKind = 'annealed' | 'mismatch' | 'overhang' | 'template-gap'

export type PrimerGlyph = {
  char: string
  kind: PrimerGlyphKind
  /** Visual row (0 = duplex, 0.5 = half-lift overhang/mismatch, 1 = insert blob). */
  row: number
  templateIndex?: number
}

export type PrimerFrameDisplay = {
  primerId: string
  name: string
  color: string
  strand: Strand
  sequence: string
  glyphs: PrimerGlyph[]
  templateSpanStart: number
  templateSpanEnd: number
  selectRange: { start: number; end: number }
}

export type PrimerFrameMetrics = {
  rowHeight: number
  halfShift: number
  frameHeight: number
  labelGap: number
  /** Letter-row span inside the frame (1 for plain duplex; up to PRIMER_DISPLAY_ROWS for hairpins). */
  displayRows: number
}

export type PrimerClearanceSpan = {
  left: number
  right: number
}

export type PrimerFrameSegment = {
  kind: PrimerGlyphKind
  row: number
  left: number
  right: number
  top: number
  bottom: number
}

export type PrimerEditorAnnealPreview = {
  mask: boolean[]
  annealedCount: number
  terminalSequence: string
  bindings?: PrimerBindingLayout[]
  strand?: Strand
}
export type PrimerTrackLayout = {
  templateCenterX: (templateIndex: number) => number
  trackWidthPx: number
}
export type FrameBounds = {
  left: number
  right: number
  top: number
  bottom: number
  labelX: number
  labelY: number
}

export type PrimerLabelMetrics = {
  fontSizePx: number
  width: number
  height: number
  halfWidth: number
  halfHeight: number
}

export type PrimerFrameBoundsOptions = {
  layout?: PrimerTrackLayout
  /** When true, reserve space for the terminal arrow flap (forward flaps rise into the label band). */
  showArrow?: boolean
  labelFontSizePx?: number
}
export type PrimerFramePathLayers = {
  fills: string[]
  outlines: string[]
}
export type PrimerArrowFlapPoints = {
  p0x: number
  p0y: number
  p1x: number
  p1y: number
  p2x: number
  p2y: number
  p3x: number
  p3y: number
}
export type PrimerFramePathOptions = {
  strand: Strand
  integrateArrow: boolean
  integrateHairpin: boolean
  baseStepPx: number
  layout?: PrimerTrackLayout
}
