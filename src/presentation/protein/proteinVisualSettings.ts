export type ProteinSequenceRulerLabelOrientation = 'horizontal' | 'angled' | 'vertical'

export type ProteinSequenceVisualSettings = {
  panelOpen: boolean
  residueFontSizePx: number
  residueFontWeight: number
  residueCellWidthEm: number
  residueCellHeightEm: number
  numberingFontSizePx: number
  numberingFontWeight: number
  numberingGutterPx: number
  rulerFontSizePx: number
  rulerFontWeight: number
  rulerLabelOrientation: ProteinSequenceRulerLabelOrientation
  featureTrackHeightPx: number
  featureLabelFontSizePx: number
  featureLabelFontWeight: number
  featureBodyFrame: boolean
  bondTrackHeightPx: number
  bondLabelFontSizePx: number
  bondLabelFontWeight: number
  legendFontSizePx: number
  showNumbering: boolean
  showRuler: boolean
  showLegend: boolean
}

export type ProteinAlignmentVisualSettings = {
  panelOpen: boolean
  headerTitleFontSizePx: number
  headerTitleFontWeight: number
  headerSubtitleFontSizePx: number
  rowNameFontSizePx: number
  rowNameFontWeight: number
  metaFontSizePx: number
  metaFontWeight: number
  columnHeaderFontSizePx: number
  columnHeaderFontWeight: number
  rulerFontSizePx: number
  rulerFontWeight: number
  residueFontSizePx: number
  residueFontWeight: number
  codonFontSizePx: number
  codonFontWeight: number
  frameshiftBadgeFontSizePx: number
  legendFontSizePx: number
  cellWidthCompactPx: number
  cellWidthCodonPx: number
  rowHeightPx: number
  stickyNameWidthPx: number
  showHeader: boolean
  showRuler: boolean
  showLegend: boolean
  showMetaColumns: boolean
}

export const defaultProteinSequenceVisual: ProteinSequenceVisualSettings = {
  panelOpen: false,
  residueFontSizePx: 14,
  residueFontWeight: 500,
  residueCellWidthEm: 1.35,
  residueCellHeightEm: 1.65,
  numberingFontSizePx: 11,
  numberingFontWeight: 400,
  numberingGutterPx: 60,
  rulerFontSizePx: 8,
  rulerFontWeight: 600,
  rulerLabelOrientation: 'horizontal',
  featureTrackHeightPx: 16,
  featureLabelFontSizePx: 10,
  featureLabelFontWeight: 400,
  featureBodyFrame: true,
  bondTrackHeightPx: 3,
  bondLabelFontSizePx: 8,
  bondLabelFontWeight: 400,
  legendFontSizePx: 12,
  showNumbering: true,
  showRuler: true,
  showLegend: true,
}

export const defaultProteinAlignmentVisual: ProteinAlignmentVisualSettings = {
  panelOpen: false,
  headerTitleFontSizePx: 14,
  headerTitleFontWeight: 700,
  headerSubtitleFontSizePx: 10,
  rowNameFontSizePx: 11,
  rowNameFontWeight: 600,
  metaFontSizePx: 8,
  metaFontWeight: 600,
  columnHeaderFontSizePx: 8,
  columnHeaderFontWeight: 700,
  rulerFontSizePx: 7,
  rulerFontWeight: 600,
  residueFontSizePx: 12,
  residueFontWeight: 700,
  codonFontSizePx: 9,
  codonFontWeight: 600,
  frameshiftBadgeFontSizePx: 6,
  legendFontSizePx: 9,
  cellWidthCompactPx: 20,
  cellWidthCodonPx: 28,
  rowHeightPx: 22,
  stickyNameWidthPx: 280,
  showHeader: true,
  showRuler: true,
  showLegend: true,
  showMetaColumns: true,
}
