/** Visual-control panels for protein Sequence view and comparative alignment. */

import type {
  ProteinAlignmentVisualSettings,
  ProteinSequenceVisualSettings,
} from './proteinVisualSettings'

type RangePatch<T> = (value: number) => Partial<T>

function rangeControl<T extends object>(
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  ariaLabel: string,
  onChange: (patch: Partial<T>) => void,
  patch: RangePatch<T>,
  unit: 'px' | '' = 'px',
) {
  return (
    <label>
      <span className="elliptic-ring-gap-label">{label} {value}{unit}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={ariaLabel}
        onChange={(event) => onChange(patch(Number(event.target.value)))}
      />
    </label>
  )
}

function checkControl(
  label: string,
  checked: boolean,
  ariaLabel: string,
  onChange: (checked: boolean) => void,
) {
  return (
    <label className="elliptic-ring-gap-check">
      <input
        type="checkbox"
        checked={checked}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="elliptic-ring-gap-label">{label}</span>
    </label>
  )
}

function visualFooter(onSave?: () => void, onRevert?: () => void) {
  if (!onSave && !onRevert) return null
  return (
    <div className="visual-controls-footer">
      {onRevert ? <button type="button" className="visual-controls-revert" onClick={onRevert}>Revert to defaults</button> : null}
      {onSave ? <button type="button" className="visual-controls-save" onClick={onSave}>Save</button> : null}
    </div>
  )
}

export function ProteinSequenceVisualControlsPanel({
  settings,
  onChange,
  onSave,
  onRevert,
}: {
  settings: ProteinSequenceVisualSettings
  onChange: (patch: Partial<ProteinSequenceVisualSettings>) => void
  onSave?: () => void
  onRevert?: () => void
}) {
  return (
    <div className="elliptic-ring-gap-control protein-sequence-visual-controls" onPointerDown={(event) => event.stopPropagation()}>
      <strong className="protein-map-visual-controls-title">Protein sequence</strong>
      {rangeControl('Residue size', settings.residueFontSizePx, 8, 24, 1, 'Protein residue font size', onChange, (value) => ({ residueFontSizePx: value }))}
      {rangeControl('Residue weight', settings.residueFontWeight, 400, 800, 100, 'Protein residue font weight', onChange, (value) => ({ residueFontWeight: value }), '')}
      {rangeControl('Cell width', settings.residueCellWidthEm, 1, 2.2, 0.05, 'Protein residue cell width in em', onChange, (value) => ({ residueCellWidthEm: value }), '')}
      {rangeControl('Cell height', settings.residueCellHeightEm, 0.9, 2.4, 0.05, 'Protein residue cell height in em', onChange, (value) => ({ residueCellHeightEm: value }), '')}
      <div className="elliptic-ring-gap-divider" />
      {rangeControl('Number size', settings.numberingFontSizePx, 8, 18, 1, 'Protein row numbering font size', onChange, (value) => ({ numberingFontSizePx: value }))}
      {rangeControl('Number weight', settings.numberingFontWeight, 400, 800, 100, 'Protein row numbering font weight', onChange, (value) => ({ numberingFontWeight: value }), '')}
      {rangeControl('Number gutter', settings.numberingGutterPx, 36, 96, 2, 'Protein row numbering gutter width', onChange, (value) => ({ numberingGutterPx: value }))}
      {checkControl('Show numbering', settings.showNumbering, 'Show residue numbering beside sequence rows', (checked) => onChange({ showNumbering: checked }))}
      <div className="elliptic-ring-gap-divider" />
      {rangeControl('Ruler size', settings.rulerFontSizePx, 6, 14, 1, 'Protein sequence ruler font size', onChange, (value) => ({ rulerFontSizePx: value }))}
      {rangeControl('Ruler weight', settings.rulerFontWeight, 400, 800, 100, 'Protein sequence ruler font weight', onChange, (value) => ({ rulerFontWeight: value }), '')}
      <div className="protein-visual-orientation-row" role="group" aria-label="Ruler number orientation">
        <span className="elliptic-ring-gap-label">Ruler numbers</span>
        <div className="protein-visual-orientation-choices">
          {([
            ['horizontal', 'Horizontal'],
            ['angled', 'Angled'],
            ['vertical', 'Vertical'],
          ] as const).map(([value, label]) => (
            <label key={value}>
              <input
                type="radio"
                name="protein-ruler-orientation"
                checked={settings.rulerLabelOrientation === value}
                onChange={() => onChange({ rulerLabelOrientation: value })}
              />
              {label}
            </label>
          ))}
        </div>
      </div>
      {checkControl('Show ruler', settings.showRuler, 'Show residue ruler above sequence rows', (checked) => onChange({ showRuler: checked }))}
      <div className="elliptic-ring-gap-divider" />
      {rangeControl('Feature height', settings.featureTrackHeightPx, 10, 28, 1, 'Protein feature track height', onChange, (value) => ({ featureTrackHeightPx: value }))}
      {rangeControl('Feature label size', settings.featureLabelFontSizePx, 7, 16, 1, 'Protein feature label font size', onChange, (value) => ({ featureLabelFontSizePx: value }))}
      {rangeControl('Feature label weight', settings.featureLabelFontWeight, 400, 800, 100, 'Protein feature label font weight', onChange, (value) => ({ featureLabelFontWeight: value }), '')}
      {checkControl('Feature body frame', settings.featureBodyFrame, 'Draw thin black frames around feature bodies', (checked) => onChange({ featureBodyFrame: checked }))}
      <div className="elliptic-ring-gap-divider" />
      {rangeControl('Bond spacing', settings.bondTrackHeightPx, 2, 8, 1, 'Gap between bond bar and name, and between name and next bond', onChange, (value) => ({ bondTrackHeightPx: value }))}
      {rangeControl('Bond label size', settings.bondLabelFontSizePx, 7, 14, 1, 'Protein bond label font size', onChange, (value) => ({ bondLabelFontSizePx: value }))}
      {rangeControl('Bond label weight', settings.bondLabelFontWeight, 400, 800, 100, 'Protein bond label font weight', onChange, (value) => ({ bondLabelFontWeight: value }), '')}
      <div className="elliptic-ring-gap-divider" />
      {rangeControl('Legend size', settings.legendFontSizePx, 8, 16, 1, 'Protein color legend font size', onChange, (value) => ({ legendFontSizePx: value }))}
      {checkControl('Show color legend', settings.showLegend, 'Show amino acid color legend under sequence', (checked) => onChange({ showLegend: checked }))}
      {visualFooter(onSave, onRevert)}
    </div>
  )
}

export function ProteinAlignmentVisualControlsPanel({
  settings,
  onChange,
  onSave,
  onRevert,
}: {
  settings: ProteinAlignmentVisualSettings
  onChange: (patch: Partial<ProteinAlignmentVisualSettings>) => void
  onSave?: () => void
  onRevert?: () => void
}) {
  return (
    <div className="elliptic-ring-gap-control protein-alignment-visual-controls" onPointerDown={(event) => event.stopPropagation()}>
      <strong className="protein-map-visual-controls-title">Comparative alignment</strong>
      {rangeControl('Title size', settings.headerTitleFontSizePx, 10, 22, 1, 'Alignment header title font size', onChange, (value) => ({ headerTitleFontSizePx: value }))}
      {rangeControl('Title weight', settings.headerTitleFontWeight, 400, 800, 100, 'Alignment header title font weight', onChange, (value) => ({ headerTitleFontWeight: value }), '')}
      {rangeControl('Subtitle size', settings.headerSubtitleFontSizePx, 8, 16, 1, 'Alignment header subtitle font size', onChange, (value) => ({ headerSubtitleFontSizePx: value }))}
      {checkControl('Show header', settings.showHeader, 'Show comparative alignment header', (checked) => onChange({ showHeader: checked }))}
      <div className="elliptic-ring-gap-divider" />
      {rangeControl('Row name size', settings.rowNameFontSizePx, 8, 16, 1, 'Alignment row name font size', onChange, (value) => ({ rowNameFontSizePx: value }))}
      {rangeControl('Row name weight', settings.rowNameFontWeight, 400, 800, 100, 'Alignment row name font weight', onChange, (value) => ({ rowNameFontWeight: value }), '')}
      {rangeControl('Name column width', settings.stickyNameWidthPx, 160, 420, 10, 'Alignment sticky name column width', onChange, (value) => ({ stickyNameWidthPx: value }))}
      {rangeControl('Meta size', settings.metaFontSizePx, 6, 14, 1, 'Alignment meta column font size', onChange, (value) => ({ metaFontSizePx: value }))}
      {rangeControl('Meta weight', settings.metaFontWeight, 400, 800, 100, 'Alignment meta column font weight', onChange, (value) => ({ metaFontWeight: value }), '')}
      {checkControl('Show meta columns', settings.showMetaColumns, 'Show alignment identity and similarity meta columns', (checked) => onChange({ showMetaColumns: checked }))}
      <div className="elliptic-ring-gap-divider" />
      {rangeControl('Column header size', settings.columnHeaderFontSizePx, 6, 14, 1, 'Alignment column header font size', onChange, (value) => ({ columnHeaderFontSizePx: value }))}
      {rangeControl('Column header weight', settings.columnHeaderFontWeight, 400, 800, 100, 'Alignment column header font weight', onChange, (value) => ({ columnHeaderFontWeight: value }), '')}
      {rangeControl('Ruler size', settings.rulerFontSizePx, 5, 12, 1, 'Alignment ruler font size', onChange, (value) => ({ rulerFontSizePx: value }))}
      {rangeControl('Ruler weight', settings.rulerFontWeight, 400, 800, 100, 'Alignment ruler font weight', onChange, (value) => ({ rulerFontWeight: value }), '')}
      {checkControl('Show ruler', settings.showRuler, 'Show alignment position ruler', (checked) => onChange({ showRuler: checked }))}
      <div className="elliptic-ring-gap-divider" />
      {rangeControl('Residue size', settings.residueFontSizePx, 8, 20, 1, 'Alignment residue font size', onChange, (value) => ({ residueFontSizePx: value }))}
      {rangeControl('Residue weight', settings.residueFontWeight, 400, 800, 100, 'Alignment residue font weight', onChange, (value) => ({ residueFontWeight: value }), '')}
      {rangeControl('Codon size', settings.codonFontSizePx, 6, 14, 1, 'Alignment codon font size', onChange, (value) => ({ codonFontSizePx: value }))}
      {rangeControl('Codon weight', settings.codonFontWeight, 400, 800, 100, 'Alignment codon font weight', onChange, (value) => ({ codonFontWeight: value }), '')}
      {rangeControl('Frameshift badge size', settings.frameshiftBadgeFontSizePx, 5, 12, 1, 'Alignment frameshift badge font size', onChange, (value) => ({ frameshiftBadgeFontSizePx: value }))}
      <div className="elliptic-ring-gap-divider" />
      {rangeControl('Compact cell width', settings.cellWidthCompactPx, 12, 32, 1, 'Alignment cell width without codons', onChange, (value) => ({ cellWidthCompactPx: value }))}
      {rangeControl('Codon cell width', settings.cellWidthCodonPx, 18, 48, 1, 'Alignment cell width with codons', onChange, (value) => ({ cellWidthCodonPx: value }))}
      {rangeControl('Row height', settings.rowHeightPx, 16, 40, 1, 'Alignment comparison row height', onChange, (value) => ({ rowHeightPx: value }))}
      <div className="elliptic-ring-gap-divider" />
      {rangeControl('Legend size', settings.legendFontSizePx, 7, 14, 1, 'Alignment legend font size', onChange, (value) => ({ legendFontSizePx: value }))}
      {checkControl('Show legend', settings.showLegend, 'Show alignment similarity legend', (checked) => onChange({ showLegend: checked }))}
      {visualFooter(onSave, onRevert)}
    </div>
  )
}
