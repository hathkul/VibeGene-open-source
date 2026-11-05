/**
 * Theme closure classification (Grok APPROVE-WITH-RULE-CHANGES).
 * Every non-registry row resolves to a single existing --vg-* token or register-scientific.
 */

import { createHash } from 'node:crypto'

export type BulkOutcome = 'generic-ui' | 'semantic-feedback' | 'scientific-data' | 'dead-or-shadowed'

export type EnforcedDisposition =
  | 'migrate-existing-token'
  | 'register-scientific'
  | 'delete-dead'
  | 'correct-stale-accounting'

export type NonScientificRawOutcome =
  | 'ordinary-ui'
  | 'interaction-state'
  | 'feedback-state'
  | 'scientific-data'
  | 'dead-or-redundant'

export type ManifestFinding = {
  id: string
  file: string
  kind: string
  property: string
  literal: string
  owner: string
  classification: string
}

export type ResolvedClosure = {
  enforcedDisposition: EnforcedDisposition
  /** Single existing token when disposition is migrate-existing-token. */
  destinationToken: string
  nonScientificRawOutcome: NonScientificRawOutcome
  rationale: string
  mappingRule: string
  isScientificRaw: boolean
}

const CLONING_DIAGRAM_FILES =
  /CloningSchemaPanel|GibsonAssemblyDialog|GatewayBpCloningDialog|GatewayCloningDialog|GatewayLrEndsPanel|TaGcCloningDialog/i

const DIAGRAM_NEUTRAL_LITERAL =
  /^(#(?:222|111|333|bbb|ccc|999|888|ddd|171717)|gray|grey)$/i

const FEEDBACK_OWNER =
  /is-error|is-warning|is-success|is-invalid|is-danger|is-missing|is-unsupported|\.danger\b|destructive|(?<![\w-])error(?![\w-])|warning|invalid|(?<![\w-])danger(?![\w-])|(?<![\w-])success(?![\w-])|sync-status|sync-conflict|construct-picker-error|pick-primers-error|db-library-member-error|features-import-error|cloning-schema-partial/i

const SCIENTIFIC_ENCODING_OWNER =
  /motif-hit|feature-color|common-feature-color|protein-composition-code|protein-color-class-dot|protein-alignment-map-legend|protein-alignment-map-segment|protein-residue\.is-|binder-|\.vhh\b|scfv|darpin|hop-label|orf-label|primer-callout|linear-primer-callout|enzyme-callout|linear-enzyme-callout|sequence-enzyme-callout|enzyme-marker|sgrna-callout|trace-base|stop-codon|sequence-bases > span|dna-base|gel-band|chromatogram|library-sequence[^-]|history-glyph|session-draft-color|primer-subgroup-color|features-table.*color|recognition-site|cleavage-site|cleavage-arrow(?!-halo)|protein-map-hit|sequence-minimap-alignment-coverage|is-offtarget|is-uncloneable|is-vhh|is-orphaned|is-blunt|is-enzyme(?!-info)|mass-restriction-members-list > label\.is-uncloneable|object:(color|raw\.color|primer\.color|sensePrimer|antisensePrimer|fallbackPrimers\.color|deletedRegionHighlights\.color|primerCalloutBundle\.color)|sequence-sgrna|sequence-mutagenic-base|hop-primer|enzyme-arrow|sgrna-cloning-compatibility|sgrna-cloning-oligo|is-frameshift|is-variant-error|sequence-orf-residue\.is-stop|sequence-bases-trace-annotation/i

const ORDINARY_CHROME_IN_SCIENTIFIC_CONTEXT =
  /(?<!hop-label.*)\bbutton\b(?!.*hop-label)|toolbar|dialog-actions|footer-actions|(?<!mass-restriction-members-list > )\.label\b|\.hint\b|\.title\b|resize-handle|resize-grip|splitter|minimap-nav|pagination|table-sort|pane-tabs|panel-tabs|keyboard-shortcut|menu-item|dropdown|file-export|table-pagination|db-main-actions|sidebar-tool|construct-add|mode-menu|save-mode|import-project-button|browse-import-menu|height-splitter|column-splitter|row-splitter|db-manager-resize|primer-editor-resize|alignment-row-splitter|alignment-column-splitter|agarose-gel-footer|bulk-add-dropdown|format-row button/i

export const INTERACTION_STATE_OWNER =
  /:hover|:active|:focus-visible|:focus\b|\.is-selected|\.is-active|:checked|\[aria-selected|\.is-open|table-hover|segment-active|control-surface-hover|control-surface-pressed|interactive-selected|interactive-hover|interactive-selected-hover|control-primary-hover|app-table-hover|app-selection|picker-list > button:hover|open-tab|sort-header:hover|document-(draft|recent)-open:hover|tbody tr:hover|list-item:hover|menu.*:hover|dropdown > button\.is-open/i

export function ownerFamily(owner: string): string {
  const trimmed = owner.trim()
  if (trimmed.startsWith(':root[data-color-scheme')) return ':root[data-color-scheme] …'
  const first = trimmed.split(',')[0]?.trim() ?? trimmed
  return first
    .replace(/:(hover|focus|focus-visible|active|disabled|checked)(\([^)]*\))?/g, '')
    .replace(/\.is-[\w-]+/g, '.is-*')
    .slice(0, 120)
}

function normalizeLiteral(lit: string): string {
  return lit.replace(/\s+/g, ' ').trim().toLowerCase()
}

function hasAlphaLiteral(lit: string): boolean {
  return /rgba?\([^)]*\/\s*\d|rgb\([^)]+\/\s*\d|%/.test(lit)
}

function isCloningDiagramNeutral(f: ManifestFinding): boolean {
  if (!CLONING_DIAGRAM_FILES.test(f.file)) return false
  if (/jsx:(line|path|polyline|circle|rect)/.test(f.owner) || f.kind === 'tsx') {
    return DIAGRAM_NEUTRAL_LITERAL.test(f.literal.trim()) || /^#(?:[0-9a-f]{3}){1,2}$/i.test(f.literal.trim())
  }
  return false
}

function mustRegisterScientific(f: ManifestFinding): boolean {
  if (/sgrna-cloning-compatibility/.test(f.owner)) return true
  if (f.literal.trim() === '#2a2a2a' && /AgaroseGelDialog|tools-gel|gel/i.test(f.file + f.owner)) return true
  if (/object:fallbackPrimers\.color|object:deletedRegionHighlights\.color/.test(f.owner)) return true
  if (/sequence-primer-base/.test(f.owner)) return true
  if (/sequence-bases-trace-annotation.*is-variant-error|is-variant-error/.test(f.owner)) return true
  if (/protein-comparison-cell\.is-frameshift|is-frameshift/.test(f.owner) && !/gateway-lr-ends/.test(f.owner)) return true
  if (/sequence-orf-residue\.is-stop/.test(f.owner)) return true
  if (/mass-restriction-members-list > label\.is-uncloneable/.test(f.owner)) return true
  if (/hop-label/.test(f.owner) && !/hop-primer\.hop-sgrna-oligos/.test(f.owner)) return true
  if (/sequence-sgrna|sgrna-frame|sgrna-name|pam-arrow|sgrna-pam|crispr/i.test(f.owner)) return true
  if (/sequence-mutagenic-base/.test(f.owner)) return true
  if (/AgaroseGelDialog/.test(f.file) && /^#(?:f2f2f2|4a9eff)$/i.test(f.literal.trim())) return true
  if (/enzyme-arrow|arrowhead|enzyme-marker/i.test(f.owner)) return true
  if (/hop-primer\.hop-sgrna-oligos|hop-sgrna-oligos/.test(f.owner)) return true
  if (/object:primerCalloutBundle\.color/.test(f.owner)) return true
  if (/sgrna-cloning-oligo-sequence mark|sgrna-cloning-oligo-additions/.test(f.owner)) return true
  if (/\.cleavage-arrow(?!-halo)/.test(f.owner)) return true
  if (/protein-map-hit/.test(f.owner)) return true
  if (/sequence-minimap-alignment-coverage/.test(f.owner)) return true
  if (f.literal.trim().toLowerCase() === '#8b6914' && /sequence-minimap-alignment-coverage|alignment-coverage/.test(f.owner)) return true
  if (f.owner.includes('.motif-hit') && f.literal.toLowerCase().includes('f8e16c')) return true
  if (f.owner.includes('.linear-primer-callout polyline') && f.property === 'stroke') return true
  return false
}

export function isBiologicalEncoding(f: ManifestFinding): boolean {
  if (mustRegisterScientific(f)) return true
  if (/PlasmidMap\.tsx/.test(f.file) && /jsx:rect/.test(f.owner)) return false
  if (/agarose-gel-lane-label|trace-viewer__open-sequence/.test(f.owner)) return false
  if (/protein-composition-code\.is-|protein-color-class-dot\.is-|protein-alignment-map-legend i\.is-|protein-alignment-map-segment\.is-/.test(f.owner)) {
    return true
  }
  if (f.file === 'src/TraceViewer.css') {
    return /trace-base|trace-viewer__base|alignment-trace/i.test(f.owner)
  }
  if (f.file.endsWith('.tsx')) {
    if (/object:(color|raw\.color|primer\.color|sensePrimer|antisensePrimer|fallbackPrimers\.color|deletedRegionHighlights\.color|primerCalloutBundle\.color)/.test(f.owner)) {
      return true
    }
    if (/jsx:(line|path|circle|rect|polyline)/.test(f.owner)) {
      if (isCloningDiagramNeutral(f)) return false
      if (CLONING_DIAGRAM_FILES.test(f.file)) return false
      if (/PlasmidMap/.test(f.file)) return false
      if (/Hybridization/.test(f.file)) return false
      return false
    }
  }
  if (SCIENTIFIC_ENCODING_OWNER.test(f.owner)) {
    if (/mass-restriction-members-list > label\.is-uncloneable/.test(f.owner)) return true
    if (ORDINARY_CHROME_IN_SCIENTIFIC_CONTEXT.test(f.owner)) return false
    if (/enzyme-info/.test(f.owner) && !/callout|polyline|stroke|fill|arrow/.test(f.owner + f.property)) return false
    if (/gateway-lr-ends-bases\.is-/.test(f.owner)) return false
    if (/gateway-|gibson-|track-map|sequence-row/.test(f.owner) && !/callout|polyline|stroke|motif|primer|enzyme-marker|feature-color|sgrna|orf-label|hop-label|arrow/.test(f.owner)) {
      return false
    }
    if (f.property === 'color' && /text\b|label\b|\.hint|footer|header|button|kbd|dialog|toolbar|title\b|legend-title|section-title/.test(f.owner)) {
      if (/hop-label|is-uncloneable|mutagenic|sgrna|compatibility/.test(f.owner)) return true
      return false
    }
    return true
  }
  return false
}

export function isScientificRawFinding(f: ManifestFinding, registryIds: Set<string>): boolean {
  return registryIds.has(f.id) || f.classification === 'scientific-data' || isBiologicalEncoding(f)
}

function classifyBulkOutcome(f: ManifestFinding, registryIds: Set<string>): BulkOutcome {
  if (registryIds.has(f.id) || f.classification === 'scientific-data') return 'scientific-data'
  if (f.classification === 'dead-or-shadowed') return 'dead-or-shadowed'
  if (isBiologicalEncoding(f)) return 'scientific-data'
  if (FEEDBACK_OWNER.test(f.owner)) return 'semantic-feedback'
  return 'generic-ui'
}

function feedbackToken(f: ManifestFinding): string {
  const owner = f.owner
  const prop = f.property
  const blob = owner + f.literal
  const isSuccess = /is-success|is-ready|is-valid|success|4aa36b|4ca66a|16a34a|22c55e|0f766e/i.test(blob)
  const isWarning = /is-warning|warning|d49a2e|f59e0b|d97706|92400e/i.test(blob)
  const isInfo = /sync-status|info|is-busy|selection-bar/i.test(blob)
  if (isSuccess) {
    if (prop.includes('background')) return '--vg-success-surface'
    if (/border|outline/.test(prop)) return '--vg-success-border'
    if (prop === 'color' || prop === 'fill' || prop === 'stroke') return '--vg-success-border'
    return '--vg-success-ink'
  }
  if (isWarning) {
    if (prop.includes('background')) return '--vg-warning-surface'
    if (/border|outline/.test(prop)) return '--vg-warning-border'
    if (prop === 'color') return '--vg-warning-ink'
    return '--vg-warning-border'
  }
  if (isInfo) {
    if (prop.includes('background')) return '--vg-info-surface'
    if (/border|outline/.test(prop)) return '--vg-info-border'
    if (prop === 'color') return '--vg-info-ink'
    return '--vg-info-border'
  }
  const isDanger = /is-error|is-invalid|is-danger|is-missing|danger|destructive|error|invalid|sync-conflict|pick-primers-error|features-import-error|cloning-schema-partial|db-library-member-error|construct-picker-error|b91c1c/i.test(blob)
  if (isDanger) {
    if (prop.includes('background')) return '--vg-danger-surface'
    if (/border|outline/.test(prop)) return '--vg-danger-border'
    if (prop === 'color' || prop === 'fill' || prop === 'stroke') return '--vg-danger-border'
    if (prop === 'box-shadow') return '--vg-shadow-elevation'
    return '--vg-danger-ink'
  }
  return '--vg-danger-ink'
}

function ruleBasedToken(f: ManifestFinding): string {
  const prop = f.property
  const owner = f.owner
  const lit = normalizeLiteral(f.literal)

  if (/\.vg-gallery-scheme-dot|theme-gallery.*scheme-dot/.test(owner)) {
    if (prop.includes('background') || prop === 'fill') return '--vg-surface-panel'
  }

  if (/\.cleavage-arrow-halo/.test(owner)) {
    if (prop === 'fill' || prop.includes('background')) return '--vg-diagram-surface'
  }

  if (/\.tools-gel-canvas/.test(owner)) {
    if (prop.includes('background')) return '--vg-surface-panel'
    if (prop === 'border' || prop === 'border-color') return '--vg-border'
  }

  if (/PlasmidMap\.tsx/i.test(f.file)) {
    if (lit === '#b91c1c') return prop === 'fill' || prop === 'stroke' ? '--vg-danger-border' : '--vg-danger-border'
    if (lit === '#0f766e') return '--vg-success-border'
    if (lit === '#7c3aed') return '--vg-focus'
    if (/textPath|text-path/i.test(owner) && (lit === '#111' || lit === '#171717')) return '--vg-map-ink'
  }

  if (/Hybridization/i.test(f.file) && lit === '#7c3aed' && (prop === 'stroke' || prop === 'fill')) {
    return '--vg-data-mark'
  }
  if (/primerExport|snapGeneParser/.test(f.file) && lit === '#7c3aed' && prop === 'color') {
    return '--vg-data-mark'
  }
  if (/useAgaroseGelExportController/.test(f.file) && /^#(?:111|444|666)$/.test(lit) && prop === 'color') {
    return '--vg-diagram-ink'
  }
  if (/TrackMap\.tsx/.test(f.file) && lit === '#111' && prop === 'fill') {
    return '--vg-map-ink'
  }

  if (/document-(draft|recent)-open:hover/.test(owner)) {
    if (prop.includes('background')) return '--vg-startup-hover-surface'
  }

  if (/gateway-cloning-dialog .gateway-lr-ends-bases\.is-/.test(owner) || /gateway-lr-ends-bases\.is-/.test(owner)) {
    if (prop.includes('background') || prop === 'fill') return '--vg-data-mark-selected'
    if (prop === 'color') return '--vg-data-mark-selected'
  }

  if (/db-text-prompt-tag\.is-selected/.test(owner)) {
    if (prop.includes('background')) return '--vg-interactive-selected'
    if (/border/.test(prop)) return '--vg-interactive-selected'
  }

  if (/db-tag-chip|db-library-badge|mer-badge|db-text-prompt-tag(?!\.is-selected)/.test(owner)) {
    if (prop.includes('background')) return '--vg-chip-surface'
    if (/border/.test(prop)) return '--vg-chip-border'
    if (prop === 'color') return '--vg-chip-ink'
  }

  if (/\.linear-selection/.test(owner)) {
    if (prop.includes('background') || prop === 'fill') return '--vg-data-mark-selected'
  }

  if (/map-zoom-minimap-track|sequence-minimap-backdrop|sequence-minimap-track|protein-foundation-pane.*minimap/.test(owner)) {
    if (prop === 'fill' || prop.includes('background')) {
      if (/overflow|history-node|pending/.test(owner)) return '--vg-data-track'
      return '--vg-map-surface'
    }
  }
  if (/^#(?:d8d8d8|d0d0d0|f8fafc)$/.test(lit) && (prop === 'fill' || prop.includes('background'))) {
    return '--vg-data-track'
  }
  if (/^#(?:fffdf8|fbf7ed)$/.test(lit) && (prop === 'fill' || prop.includes('background')) && !/vg-gallery-scheme-dot/.test(owner)) {
    return '--vg-map-surface'
  }

  if (hasAlphaLiteral(f.literal)) {
    if (/overlay|scrim|backdrop|modal-backdrop/.test(owner)) return '--vg-overlay-scrim'
    if (/swatch|glint|table-wrap|::before|::after/.test(owner)) return '--vg-shadow-elevation'
    if (prop === 'box-shadow') return '--vg-shadow-overlay'
    return '--vg-shadow-elevation'
  }

  if (isCloningDiagramNeutral(f) || (CLONING_DIAGRAM_FILES.test(f.file) && /jsx:/.test(owner))) {
    if (prop === 'stroke') return '--vg-diagram-line'
    if (prop === 'color') return '--vg-diagram-ink'
    if (prop === 'fill') return '--vg-diagram-surface'
  }

  if (/mobile-drawer-backdrop|modal-backdrop|overlay-scrim/.test(owner) && hasAlphaLiteral(f.literal)) {
    if (prop.includes('background')) return '--vg-overlay-scrim'
  }

  if (/hybrid-window|@media \(hover: none\)/.test(owner)) {
    if (/backdrop|scrim/.test(owner) && prop.includes('background')) return '--vg-overlay-scrim'
    if (prop.includes('background')) return '--vg-surface-panel'
    if (prop === 'color') return '--vg-text'
    if (prop === 'box-shadow') return '--vg-shadow-elevation'
  }

  if (/sequence-database-gene-back|sequence-database-source-link|gene-back|source-link/.test(owner)) {
    return '--vg-text-link'
  }

  if (/alignment-toggle-all-button/.test(owner)) {
    if (prop.includes('background')) return '--vg-control-surface'
    if (prop === 'color') return '--vg-control-ink'
    if (/border/.test(prop)) return '--vg-control-border'
  }

  return ''
}

function destinationToken(f: ManifestFinding, outcome: BulkOutcome): string {
  const ruled = ruleBasedToken(f)
  if (ruled) return ruled

  if (outcome === 'scientific-data' || outcome === 'dead-or-shadowed') return ''

  const prop = f.property
  const owner = f.owner
  const lit = normalizeLiteral(f.literal)

  if (outcome === 'semantic-feedback') {
    const fb = feedbackToken(f)
    return fb || '--vg-danger-ink'
  }

  if (prop === 'color') {
    if (/:disabled|disabled/i.test(owner)) return '--vg-text-disabled'
    if (/method-link|mutagenesis-link|source-link|gene-back|\.link-button|href|anchor|\blink\b/.test(owner)) return '--vg-text-link'
    if (/primary|on-primary|button\.primary|construct-add-button|skip-link|uniprot-search-button(?!\.is-cancel)/.test(owner)) {
      return '--vg-text-inverse'
    }
    if (/^#fff(f{2})?$/i.test(lit) && /button|primary|toolbar.*button|danger|destructive|skip-link/.test(owner)) return '--vg-text-inverse'
    if (/muted|metadata|hint|secondary|placeholder|footer-note|empty-list|list-empty|dialog > p/.test(owner)) return '--vg-text-muted'
    if (/title|heading|strong|text-h|header|legend-title|column-header|sort-header|th\b/.test(owner)) return '--vg-text-strong'
    if (/selection-text|is-active|is-selected|:checked/.test(owner)) return '--vg-interactive-selected-ink'
    if (/control-ink|kbd|stepper/.test(owner)) return '--vg-control-ink'
    return '--vg-text'
  }

  if (prop === 'fill') {
    if (/textPath|text-path|svg text/i.test(owner)) return '--vg-map-ink'
    if (/(text|label|title|legend|heading)/i.test(owner)) return '--vg-text'
    if (/minimap|track|backdrop/.test(owner)) return '--vg-map-surface'
    return '--vg-diagram-surface'
  }

  if (prop === 'stroke') {
    if (/splitter|resize|handle|grip|control|button|kbd/.test(owner)) return '--vg-control-border'
    if (CLONING_DIAGRAM_FILES.test(f.file) && /jsx:/.test(owner)) return '--vg-diagram-line'
    return '--vg-diagram-line'
  }

  if (prop.includes('background')) {
    if (/uniprot-search-button\.is-cancel:hover/.test(owner)) return '--vg-control-destructive-hover'
    if (/uniprot-search-button\.is-cancel/.test(owner)) return '--vg-control-destructive'
    if (/sgrna-dialog-actions button:last-child/.test(owner)) return '--vg-control-affirmative'
    if (/enzyme-position-mode-toggle button\.is-active/.test(owner)) return '--vg-control-segment-active'
    if (/database-construct-add-button|button\.primary|\.primary\b|skip-link|guidescan-add-selected\.is-primary/.test(owner)) {
      return '--vg-control-primary'
    }
    if (/\bbutton\b|\.btn\b|kbd\b|stepper|pagination button/.test(owner)) {
      if (/:hover/.test(owner)) return '--vg-control-surface-hover'
      if (/:active/.test(owner)) return '--vg-control-surface-pressed'
      return '--vg-control-surface'
    }
    if (/\.is-active|\.is-selected|:checked/.test(owner) && !/:hover/.test(owner)) return '--vg-interactive-selected'
    if (/:hover/.test(owner) && /\.is-selected|\.is-active/.test(owner)) return '--vg-interactive-selected-hover'
    if (/:hover/.test(owner)) return '--vg-interactive-hover'
    if (/field|input|textarea|select\b|code\b|pre\b|app-field/.test(owner)) return '--vg-surface-inset'
    if (/thead|table-head|column-header|th\b/.test(owner)) return '--vg-surface-panel-muted'
    if (/overlay|scrim|backdrop/.test(owner)) return '--vg-overlay-scrim'
    if (/chrome|toolbar|titlebar|app-shell/.test(owner)) return '--vg-surface-chrome'
    return '--vg-surface-panel'
  }

  if (prop === 'border' || prop === 'border-color' || prop === 'outline' || prop === 'outline-color') {
    if (/focus-visible|:focus-visible|:focus\b/.test(owner)) return '--vg-focus'
    if (/:disabled|disabled/.test(owner)) return '--vg-border-disabled'
    if (/button|kbd|control|stepper|pagination|splitter|resize|handle/.test(owner)) return '--vg-control-border'
    if (/divider|separator|hr\b|table-border/.test(owner)) return '--vg-border'
    return '--vg-border-strong'
  }

  if (prop === 'box-shadow') {
    if (/dialog|menu|dropdown|popover|modal/.test(owner)) return '--vg-shadow-overlay'
    return '--vg-shadow-elevation'
  }

  if (/linear-gradient|radial-gradient/.test(f.literal)) {
    if (/primary|button\.primary|construct-add/.test(owner)) return '--vg-control-primary'
    return '--vg-control-surface'
  }

  return '--vg-surface-panel'
}

const GENERIC_BIOLOGICAL_REASON_SNIPPETS = [
  'Biological and analytical encoding belongs in the scientific registry.',
  'Biological or analytical encoding retained outside the 67-row registry.',
  'retain the literal until',
]

export const FALLBACK_BIOLOGICAL_REASON_PATTERN =
  /Scientific (?:color|fill|stroke|background) #[0-9a-f]{3,8} encodes analytical meaning for owner/i

export function isGenericBiologicalReason(reason: string): boolean {
  const trimmed = reason.trim()
  return (
    GENERIC_BIOLOGICAL_REASON_SNIPPETS.some((snippet) => trimmed.includes(snippet))
    || FALLBACK_BIOLOGICAL_REASON_PATTERN.test(trimmed)
  )
}

export function specificBiologicalReason(f: ManifestFinding): string {
  const owner = f.owner
  const ctx = `${owner} ${f.literal} ${f.file}`
  if (/sgrnaCloning|sgrna-cloning-oligo|guide\.guide/.test(ctx)) return 'sgRNA cloning insert colors distinguish guide RNA, scaffold RNA, and annealed oligo strands.'
  if (/primerExport|primersFromList|PrimerImport|object:probe\.color/.test(ctx)) return 'Imported primer list color defaults identify primer records in export and hybridization workflows.'
  if (/fixtures|primer_m13/.test(ctx)) return 'Sample M13 primer colors encode forward versus reverse primer identity in demo constructs.'
  if (/databaseProtein|protein\.color/.test(ctx) && /application\/databaseProtein/.test(f.file)) {
    return 'Default protein feature color when persisted rows omit an explicit feature palette.'
  }
  if (/protein-map-bond|protein-bond-track/.test(owner)) return 'Protein map bond stroke color encodes covalent linkage class (disulfide, thioether, thiolester, cross-link).'
  if (/dna-base-/.test(owner)) return 'DNA base letter ink encodes nucleotide identity in sequence rows.'
  if (/protein-composition-code/.test(owner)) return 'Protein composition code tint encodes amino-acid property class in composition readouts.'
  if (/protein-alignment-map-segment|protein-alignment-map-legend/.test(owner)) {
    return 'Protein alignment map fill encodes residue match, similarity, gap, or frameshift class.'
  }
  if (/protein-residue|protein-color-class-dot|sequence-orf-residue/.test(owner)) {
    return 'Residue or ORF tint encodes biochemical class or reading-frame identity.'
  }
  if (/alignment-trace-bases|trace-viewer__channel|sequence-bases-trace/.test(owner)) {
    return 'Trace channel stroke or fill encodes called base identity in chromatogram views.'
  }
  if (/sgrna-cloning-compatibility/.test(owner)) return 'CRISPR compatibility readout encodes assay compatibility, not chrome.'
  if (/motif-hit/.test(owner)) return 'Motif hit fill encodes sequence search highlighting, not panel chrome.'
  if (/linear-primer-callout|primer-callout|sequence-primer-callout/.test(owner)) return 'Primer callout geometry encodes map/primer identity.'
  if (/hop-label|hop-primer|enzyme-arrow|cleavage-arrow|protein-map-hit|sgrna-map|pam-arrow/.test(owner)) {
    return 'Map or CRISPR annotation geometry encodes biological identity.'
  }
  if (/sequence-sgrna-frame|sgrna-frame|sequence-sgrna-base|sequence-sgrna-/.test(owner)) {
    return 'sgRNA sequence highlight encodes guide RNA nucleotides or targeted frame on the map.'
  }
  if (/trace-base|sequence-base|stop-codon|mutagenic|frameshift|variant-error|primer-base|sequence-primer-base/.test(owner)) {
    return 'Sequence or trace tint encodes read, primer, or variant identity.'
  }
  if (/feature-color|common-feature-color-header/.test(owner)) return 'Feature color header encodes biological feature class.'
  if (/fallbackPrimers|deletedRegionHighlights|immunoglobulin|kabat|imgt|tcrAnnotations|vnarAnnotations/.test(ctx)) {
    return 'Domain annotation color encodes CDR, domain, or highlight class on imported records.'
  }
  if (/enzyme-callout|linear-enzyme-callout|sequence-enzyme-callout|is-blunt|is-sticky/.test(owner)) {
    return 'Restriction enzyme callout ink encodes cut site geometry or end compatibility.'
  }
  if (/history-glyph/.test(owner)) return 'History glyph tint encodes prior edit or feature class in the timeline minimap.'
  if (/gel|#2a2a2a|#f2f2f2|#4a9eff|agarose/.test(ctx)) return 'Gel band or slab fill encodes electrophoresis fragment identity.'
  if (/is-uncloneable|mass-restriction/.test(owner)) return 'Mass-restriction cloneability state encodes workflow validity.'
  if (/sequence-minimap-alignment-coverage|#8b6914/.test(ctx)) return 'Coverage tint encodes alignment depth, not panel chrome.'
  if (/featureQualifiers|variable:color/.test(ctx)) {
    return 'Default misc-feature color applied when GenBank-style qualifiers omit an explicit feature palette.'
  }
  if (/object:|variable:/.test(owner) && /domain\//.test(f.file)) {
    return 'Persisted record color field encodes primer, feature, or product identity in domain data.'
  }
  if (/jsx:(path|rect|circle|line|text)/.test(owner) && /(Dialog|Map|Panel|Gel)/.test(f.file)) {
    return 'Diagram stroke or fill encodes biological entity state in cloning or map views.'
  }
  if (/storage\//.test(f.file) && /color/.test(owner)) return 'Stored primer or feature default color encodes library identity when user color is absent.'
  if (/SequenceRows/.test(f.file) && /#2563eb|#dc2626/.test(f.literal)) {
    return 'History strand coloring distinguishes forward primer lanes from reverse primer lanes in sequence rows.'
  }
  if (/trace-viewer__base-glyph/.test(owner)) return 'Trace viewer base glyph ink encodes called nucleotide identity under chromatogram peaks.'
  if (/primerCalloutBundle/.test(owner)) return 'Track map primer callout bundle color encodes primer identity on the linear map.'
  if (/pick-primers-spec-toggle\.is-offtarget/.test(owner)) {
    return 'Off-target primer specificity toggle ink encodes mismatch warning, not neutral dialog chrome.'
  }
  if (/PickPrimersDialog/.test(f.file) && /is-similar|is-offtarget/.test(owner)) {
    return 'Primer specificity toggle color encodes alignment match class in pick-primers review.'
  }
  if (/App\.css/.test(f.file) && /::/.test(owner)) {
    return `Pseudo-element ${f.property} on ${owner} encodes sequence or map annotation ink.`
  }
  if (/\.css/.test(f.file)) {
    return `Stylesheet ${f.property} on ${owner} encodes analytical diagram or data identity (${f.literal}).`
  }
  return `Owner ${owner} uses ${f.property} ${f.literal} as scoped biological or analytical encoding in ${f.file}.`
}

export function scientificRationale(f: ManifestFinding): string {
  return specificBiologicalReason(f)
}

function rawOutcomeForFinding(
  f: ManifestFinding,
  registryIds: Set<string>,
  bulkOutcome: BulkOutcome,
): NonScientificRawOutcome {
  if (isScientificRawFinding(f, registryIds) || bulkOutcome === 'scientific-data') return 'scientific-data'
  if (bulkOutcome === 'dead-or-shadowed') return 'dead-or-redundant'
  if (bulkOutcome === 'semantic-feedback') return 'feedback-state'
  if (INTERACTION_STATE_OWNER.test(f.owner)) return 'interaction-state'
  return 'ordinary-ui'
}

function mappingRule(f: ManifestFinding, disposition: EnforcedDisposition, token: string): string {
  if (disposition === 'correct-stale-accounting' || disposition === 'register-scientific') {
    return 'retain-biological-or-analytical-encoding'
  }
  if (disposition === 'delete-dead') return 'remove-shadowed-declaration'
  return `converge-${f.property}-to-${token.replace(/^--vg-/, '')}`
}

export function resolveClosureRow(f: ManifestFinding, registryIds: Set<string>): ResolvedClosure {
  const isScientificRaw = isScientificRawFinding(f, registryIds)
  const bulkOutcome = classifyBulkOutcome(f, registryIds)

  if (registryIds.has(f.id)) {
    return {
      enforcedDisposition: 'correct-stale-accounting',
      destinationToken: '',
      nonScientificRawOutcome: 'scientific-data',
      rationale: 'Registered scientific paint; enforced scanner should exempt this row.',
      mappingRule: 'retain-biological-or-analytical-encoding',
      isScientificRaw: true,
    }
  }

  if (bulkOutcome === 'dead-or-shadowed') {
    return {
      enforcedDisposition: 'delete-dead',
      destinationToken: '',
      nonScientificRawOutcome: 'dead-or-redundant',
      rationale: 'Declaration is shadowed or redundant under scheme-aware rules.',
      mappingRule: 'remove-shadowed-declaration',
      isScientificRaw: false,
    }
  }

  if (isScientificRaw || bulkOutcome === 'scientific-data' || mustRegisterScientific(f)) {
    return {
      enforcedDisposition: 'register-scientific',
      destinationToken: '',
      nonScientificRawOutcome: 'scientific-data',
      rationale: scientificRationale(f),
      mappingRule: 'retain-biological-or-analytical-encoding',
      isScientificRaw: true,
    }
  }

  const token = destinationToken(f, bulkOutcome)
  if (!/^--vg-[a-z0-9-]+$/.test(token)) {
    throw new Error(`Unresolved token for ${f.id} ${f.file} ${f.owner}: "${token}"`)
  }

  const rawOutcome = rawOutcomeForFinding(f, registryIds, bulkOutcome)
  const rationale =
    bulkOutcome === 'semantic-feedback'
      ? 'Validation or status chrome maps to the shared feedback token family.'
      : rawOutcome === 'interaction-state'
        ? 'Interaction pseudo-class or selected state maps to existing interactive/control tokens.'
        : 'Ordinary application or diagram chrome converges to an existing semantic token.'

  return {
    enforcedDisposition: 'migrate-existing-token',
    destinationToken: token,
    nonScientificRawOutcome: rawOutcome,
    rationale,
    mappingRule: mappingRule(f, 'migrate-existing-token', token),
    isScientificRaw: false,
  }
}

/** @deprecated Use resolveClosureRow */
export type ResolvedMigration = {
  bulkOutcome: BulkOutcome
  destinationToken: string
  rationale: string
  mappingRule: string
}

export function resolveManifestFindingMigration(f: ManifestFinding, registryIds: Set<string>): ResolvedMigration {
  const row = resolveClosureRow(f, registryIds)
  let bulkOutcome: BulkOutcome = 'generic-ui'
  if (row.isScientificRaw) bulkOutcome = 'scientific-data'
  else if (row.nonScientificRawOutcome === 'feedback-state') bulkOutcome = 'semantic-feedback'
  else if (row.enforcedDisposition === 'delete-dead') bulkOutcome = 'dead-or-shadowed'
  return {
    bulkOutcome,
    destinationToken: row.destinationToken,
    rationale: row.rationale,
    mappingRule: row.mappingRule,
  }
}

export function closureGroupId(parts: string[]): string {
  return createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 16)
}
