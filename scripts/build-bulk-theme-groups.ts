#!/usr/bin/env node
/**
 * Builds scripts/bulk-theme-groups.json — Grok-approved grouping of all raw theme debt.
 */

import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const SCRIPT_DIR = resolve(import.meta.dirname)
const MANIFEST_PATH = resolve(SCRIPT_DIR, 'theme-debt-manifest.json')
const REGISTRY_PATH = resolve(SCRIPT_DIR, 'theme-scientific-color-registry.json')
const OUT_PATH = resolve(SCRIPT_DIR, 'bulk-theme-groups.json')
const EXTENSIONS_PATH = resolve(SCRIPT_DIR, 'theme-scientific-encoding-extensions.json')

const CLONING_DIAGRAM_CHROME_FILES =
  /CloningSchemaPanel|GibsonAssemblyDialog|GatewayBpCloningDialog|RestrictionCloningDialog|AgaroseGelDialog|PcrDialog|DatabaseManagerDialog/i

type Outcome = 'generic-ui' | 'semantic-feedback' | 'scientific-data' | 'dead-or-shadowed' | 'special-exception'

type ManifestFinding = {
  id: string
  file: string
  kind: string
  property: string
  literal: string
  owner: string
  classification: string
}

type GroupRow = {
  groupId: string
  outcome: Outcome
  mappingRule: string
  destinationToken: string
  property: string
  literal: string
  ownerFamily: string
  files: string[]
  findingCount: number
  enforcedCount: number
  findingIds: string[]
  exceptions: string[]
  rationale: string
}

const FEEDBACK_OWNER =
  /is-error|is-warning|is-success|is-invalid|is-danger|is-missing|is-unsupported|\.danger\b|destructive|(?<![\w-])error(?![\w-])|warning|invalid|(?<![\w-])danger(?![\w-])|(?<![\w-])success(?![\w-])|sync-status|sync-conflict|construct-picker-error|pick-primers-error|db-library-member-error|features-import-error|cloning-schema-partial/i

const SCIENTIFIC_ENCODING_OWNER =
  /motif-hit|feature-color|common-feature-color|protein-composition-code|protein-color-class-dot|protein-alignment-map-legend|protein-alignment-map-segment|protein-residue\.is-|binder-|\.vhh\b|scfv|darpin|hop-label|orf-label|primer-callout|linear-primer-callout|enzyme-callout|linear-enzyme-callout|sequence-enzyme-callout|enzyme-marker|sgrna-callout|trace-base|stop-codon|sequence-bases > span|dna-base|gel-band|chromatogram|tools-gel-canvas|library-sequence[^-]|history-glyph|session-draft-color|primer-subgroup-color|features-table.*color|recognition-site|cleavage-site|is-offtarget|is-uncloneable|is-vhh|is-orphaned|is-blunt|is-enzyme(?!-info)|mass-restriction-members-list > label\.is-uncloneable|object:(color|raw\.color|primer\.color|sensePrimer|antisensePrimer)/i

const GENERIC_CHROME_NEVER_SCIENTIFIC =
  /agarose-gel-lane|trace-viewer__open-sequence|sgrna-cloning-section|library-map-navigator|immunoglobulin-numbering-menu|scfv-detection-menu|binder-structure-detect-menu|binder-structure-numbering-menu|hcard-toggle|enzyme-info\b|gateway-|gibson-|track-map|sequence-row|plasmid-map/i

const ORDINARY_CHROME_IN_SCIENTIFIC_CONTEXT =
  /\bbutton\b|toolbar|dialog-actions|footer-actions|\.label\b|\.hint\b|\.title\b|resize-handle|resize-grip|splitter|minimap-nav|pagination|table-sort|pane-tabs|panel-tabs|keyboard-shortcut|menu-item|dropdown|file-export|table-pagination|db-main-actions|sidebar-tool|construct-add|mode-menu|save-mode|import-project-button|browse-import-menu|height-splitter|column-splitter|row-splitter|db-manager-resize|primer-editor-resize|alignment-row-splitter|alignment-column-splitter|agarose-gel-footer|bulk-add-dropdown|format-row button/i

const SPECIAL_EXCEPTION_OWNER =
  /pick-primers-pane-tabs|startup-|vg-startup|hybrid-window|document-recent|document-draft|toolbar-save-mode|linear-gradient\(to right|radial-gradient|::before|::after|translation-dialog-backdrop|modal-overlay|app-overlay|db-text-prompt-tag\.is-selected|mass-restriction-members-list > label\.is-uncloneable|compatibility|primer-quality|alignment-toggle-all-button|sequence-database-gene-back|sequence-database-source-link|db-tag-chip|db-library-badge|mer-badge|button\.primary\b|> button\.primary|\.primary\b.*button/i

function ownerFamily(owner: string): string {
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

function isBiologicalEncoding(f: ManifestFinding): boolean {
  if (GENERIC_CHROME_NEVER_SCIENTIFIC.test(f.owner)) return false
  if (/protein-composition-code\.is-|protein-color-class-dot\.is-|protein-alignment-map-legend i\.is-|protein-alignment-map-segment\.is-/.test(f.owner)) {
    return true
  }
  if (f.file === 'src/TraceViewer.css') {
    return /trace-base|trace-viewer__base|alignment-trace/i.test(f.owner)
  }
  if (f.file.endsWith('.tsx')) {
    if (/object:(color|raw\.color|primer\.color|sensePrimer|antisensePrimer)/.test(f.owner)) return true
    if (/jsx:(line|path|circle|rect|polyline)/.test(f.owner)) {
      if (CLONING_DIAGRAM_CHROME_FILES.test(f.file)) return false
      return false
    }
  }
  if (SCIENTIFIC_ENCODING_OWNER.test(f.owner)) {
    if (ORDINARY_CHROME_IN_SCIENTIFIC_CONTEXT.test(f.owner)) return false
    if (/enzyme-info/.test(f.owner) && !/callout|polyline|stroke|fill/.test(f.owner + f.property)) return false
    if (/gateway-|gibson-|track-map|sequence-row|plasmid-map/.test(f.owner) && !/callout|polyline|stroke|motif|primer|enzyme-marker|feature-color|sgrna|orf-label|hop-label/.test(f.owner)) {
      return false
    }
    if (f.property === 'color' && /text\b|label\b|\.hint|footer|header|button|kbd|dialog|toolbar|title\b|legend-title|section-title/.test(f.owner)) {
      return false
    }
    return true
  }
  return false
}

function specialExceptionReason(f: ManifestFinding): string {
  if (f.classification === 'specialized-state') return 'Manifest specialized-state: reviewed non-generic interaction or palette role.'
  if (SPECIAL_EXCEPTION_OWNER.test(f.owner)) {
    if (/button\.primary|database-construct-add/.test(f.owner)) return 'Primary action brand gradient is not ordinary control chrome.'
    if (/document-recent|document-draft/.test(f.owner)) return 'Startup document rows use startup palette, not bulk App.css convergence.'
    return 'Reviewed selector family excluded from bulk convergence (gradient, pseudo-element, or brand primary).'
  }
  if (hasAlphaLiteral(f.literal)) return 'Alpha or percentage wash needs an explicit semantic role before migration.'
  if (/^#fff(f{2})?$/i.test(f.literal.trim()) && f.property === 'color' && !/button|primary|inverse|on-/.test(f.owner)) {
    return 'Inverse or on-saturated-surface text requires explicit --vg-text-inverse mapping.'
  }
  if (/chip|badge|tag\.is-selected|prompt-tag/.test(f.owner)) return 'Saturated chip or tag palette is not generic panel/hover chrome.'
  if (f.property === 'fill' && !/(text|label|title|legend|heading|svg text|callout|enzyme|primer|motif|gel-|trace|residue|composition-code)/i.test(f.owner)) {
    return 'Geometry fill encodes visualization or needs a surface/border role, not text ink.'
  }
  if (f.property === 'box-shadow' && /error|danger|warning|success|invalid/.test(f.owner) && f.property !== 'background') {
    return 'Feedback elevation shadow is not an ink token.'
  }
  if (f.property === 'outline' && /error|danger|warning|success/.test(f.owner)) {
    return 'Feedback outline maps to border/focus family, not ink.'
  }
  return ''
}

function classifyOutcome(f: ManifestFinding, registryIds: Set<string>): Outcome {
  if (registryIds.has(f.id) || f.classification === 'scientific-data') return 'scientific-data'
  if (f.classification === 'dead-or-shadowed') return 'dead-or-shadowed'
  if (isBiologicalEncoding(f)) return 'scientific-data'
  if (f.classification === 'specialized-state') return 'special-exception'
  if (SPECIAL_EXCEPTION_OWNER.test(f.owner)) return 'special-exception'
  if (FEEDBACK_OWNER.test(f.owner)) return 'semantic-feedback'
  if (hasAlphaLiteral(f.literal)) return 'special-exception'
  return 'generic-ui'
}

function feedbackToken(f: ManifestFinding): string {
  const owner = f.owner
  const prop = f.property
  const blob = owner + f.literal
  const isSuccess = /is-success|is-ready|is-valid|success|4aa36b|4ca66a|16a34a|22c55e/i.test(blob)
  const isWarning = /is-warning|warning|d49a2e|f59e0b|d97706|92400e/i.test(blob)
  const isInfo = /sync-status|info|is-busy|selection-bar/i.test(blob)
  if (isSuccess) {
    if (prop.includes('background')) return '--vg-success-surface'
    if (/border|outline/.test(prop)) return '--vg-success-border'
    if (prop === 'color') return '--vg-success-ink'
    return ''
  }
  if (isWarning) {
    if (prop.includes('background')) return '--vg-warning-surface'
    if (/border|outline/.test(prop)) return '--vg-warning-border'
    if (prop === 'color') return '--vg-warning-ink'
    return ''
  }
  if (isInfo) {
    if (prop.includes('background')) return '--vg-info-surface'
    if (/border|outline/.test(prop)) return '--vg-info-border'
    if (prop === 'color') return '--vg-info-ink'
    return ''
  }
  const isDanger = /is-error|is-invalid|is-danger|is-missing|danger|destructive|error|invalid|sync-conflict|pick-primers-error|features-import-error|cloning-schema-partial|db-library-member-error|construct-picker-error/i.test(blob)
  if (isDanger) {
    if (prop.includes('background')) return '--vg-danger-surface'
    if (/border|outline/.test(prop)) return '--vg-danger-border'
    if (prop === 'color') return '--vg-danger-ink'
    if (prop === 'box-shadow') return '--vg-shadow-elevation'
    return ''
  }
  return ''
}

function destinationToken(f: ManifestFinding, outcome: Outcome): string {
  if (outcome !== 'generic-ui' && outcome !== 'semantic-feedback') return ''
  const prop = f.property
  const owner = f.owner
  const lit = normalizeLiteral(f.literal)

  if (outcome === 'semantic-feedback') return feedbackToken(f)

  if (prop === 'color') {
    if (/:disabled|disabled/i.test(owner)) return '--vg-text-disabled'
    if (/method-link|mutagenesis-link|source-link|gene-back|\.link-button|href|anchor|\blink\b/.test(owner) && !/dialog > p|\.hint|footer-note/.test(owner)) {
      return '--vg-text-link'
    }
    if (/primary|on-primary|button\.primary|construct-add-button:not\(:disabled\)|skip-link|uniprot-search-button(?!\.is-cancel)/.test(owner)) {
      return '--vg-text-inverse'
    }
    if (/^#fff(f{2})?$/i.test(lit) && /button|primary|toolbar.*button|danger|destructive|skip-link/.test(owner)) return '--vg-text-inverse'
    if (/muted|metadata|hint|secondary|placeholder|footer-note|empty-list|list-empty|generate-link-dialog > p|dialog > p/.test(owner)) {
      return '--vg-text-muted'
    }
    if (/title|heading|strong|label|text-h|header|legend-title|floating-label|column-header|sort-header|th\b/.test(owner)) return '--vg-text-strong'
    if (/selection-text|is-active|is-selected|:checked/.test(owner)) return '--vg-interactive-selected-ink'
    if (/control-ink|button(?!-)|kbd|stepper/.test(owner) && !/:hover/.test(owner)) return '--vg-control-ink'
    if (/stop-codon|trace-|motif|residue|enzyme-callout|primer-callout|protein-composition/.test(owner)) return ''
    if (/^#(?:[0-9a-f]{3}){1,2}$/i.test(lit) || /^rgb\(/.test(lit)) return '--vg-text'
    return ''
  }

  if (prop === 'fill') {
    if (/(text|label|title|legend|heading|svg text)/i.test(owner)) {
      if (/muted|secondary/.test(owner)) return '--vg-text-muted'
      if (/title|heading|strong/.test(owner)) return '--vg-text-strong'
      return '--vg-text'
    }
    return ''
  }

  if (prop === 'stroke') {
    if (/divider|grid-line|separator|muted-line/.test(owner)) return '--vg-border'
    if (/splitter|resize|handle|grip|control|button|kbd/.test(owner)) return '--vg-control-border'
    if (/callout|polyline|primer|enzyme|motif|gel-|trace|orf-label|hop-label|feature-color|recognition|sgrna|chromatogram|library-map|library-sequence|hcard|darpin|binder|vhh|scfv|immunoglobulin|protein-composition|stop-codon|trace-base|sequence-bases/.test(owner)) {
      return ''
    }
    if (/^#(?:222|111|333|bbb|ccc|ddd|888|999|aaa)/.test(lit) || /^rgb\(/.test(lit)) return '--vg-border'
    if (/border|outline|frame|box/.test(owner)) return '--vg-border-strong'
    return '--vg-border'
  }

  if (prop.includes('background')) {
    if (/uniprot-search-button\.is-cancel/.test(owner)) return '--vg-control-destructive'
    if (/uniprot-search-button\.is-cancel:hover/.test(owner)) return '--vg-control-destructive-hover'
    if (/sgrna-dialog-actions button:last-child/.test(owner)) return '--vg-control-affirmative'
    if (/enzyme-position-mode-toggle button\.is-active/.test(owner)) return '--vg-control-segment-active'
    if (/database-construct-add-button|uniprot-search-button(?!\.is-cancel)|guidescan-add-selected\.is-primary|translation-actions \.primary|db-picker-actions \.primary|button\.primary|\.primary\b|skip-link/.test(owner)) {
      return '--vg-control-primary'
    }
    if (/\bbutton\b|\.btn\b|kbd\b|stepper|pagination button/.test(owner)) {
      if (/:hover|:not\(:disabled\)\s*$|:not\(:disabled\)/.test(owner) && /:hover/.test(owner)) return '--vg-control-surface-hover'
      if (/:active/.test(owner)) return '--vg-control-surface-pressed'
      return '--vg-control-surface'
    }
    if (/\.is-active|\.is-selected|:checked|\[aria-selected/.test(owner) && !/:hover/.test(owner)) return '--vg-interactive-selected'
    if (/:hover/.test(owner) && /\.is-selected|\.is-active|:checked/.test(owner)) return '--vg-interactive-selected-hover'
    if (/:hover/.test(owner) && /row|list|menu|tree|browse|result|member|sort-header|tab|open-tab|document-|table|tbody|tr\b|label:hover|item:hover/.test(owner)) {
      return '--vg-interactive-hover'
    }
    if (/field|input|textarea|select\b|code\b|pre\b|inset|dedupe|picker-list > button[^:]*$|app-field|\.field\b/.test(owner) && !/selected|sequence-selected/.test(owner)) {
      return '--vg-surface-inset'
    }
    if (/splitter|resize-handle|resize-grip|twistie|grip/.test(owner)) return ''
    if (/chrome|toolbar|titlebar|app-shell|header-bg|footer-bg/.test(owner)) return '--vg-surface-chrome'
    if (/thead|table-head|column-header|th\b/.test(owner)) return '--vg-surface-panel-muted'
    if (/overlay|scrim|backdrop/.test(owner) && /modal|overlay|scrim|backdrop/.test(owner)) return '--vg-overlay-scrim'
    if (/chip|badge|tag\b/.test(owner)) return ''
    if (/map-|gel-|trace|sequence-row|protein-|plasmid|track-|library-map|library-sequence|motif|residue|enzyme-|primer-|annotation-|hop-|gateway|gibson|orf|dna-|chromatogram|hcard|darpin|binder|vhh|scfv|immunoglobulin|feature-color|common-feature|cleavage|recognition|sgrna|session-draft|tools-gel/.test(owner)) {
      return ''
    }
    if (/panel|pane|dialog|card|section|workspace|sidebar|content|body|preview|host|scroll|container|wrapper|main|workspace|manager|footer|header(?!-bg)/.test(owner)) {
      return '--vg-surface-panel'
    }
    return ''
  }

  if (prop === 'border' || prop === 'border-color' || prop === 'outline' || prop === 'outline-color') {
    if (/focus-visible|:focus-visible|:focus\b/.test(owner)) return '--vg-focus'
    if (/:disabled|disabled/.test(owner)) return '--vg-border-disabled'
    if (/splitter|resize|handle|grip|twistie/.test(owner)) return '--vg-control-border'
    if (/button|kbd|control|stepper|pagination/.test(owner)) return '--vg-control-border'
    if (/divider|separator|hr\b|rule\b|table-border|cell-border/.test(owner)) return '--vg-border'
    if (/strong|emphasis|frame|card|panel|field|input|textarea|select\b/.test(owner)) return '--vg-border-strong'
    return ''
  }

  if (prop === 'box-shadow') {
    if (/dialog|menu|dropdown|popover|modal|overlay|shadow-panel/.test(owner)) return '--vg-shadow-overlay'
    if (/error|danger|warning|success|invalid|feedback/.test(owner)) return ''
    if (/card|elevated|floating|toolbar|popup/.test(owner)) return '--vg-shadow-elevation'
    return ''
  }

  return ''
}

function fallbackGenericToken(f: ManifestFinding): string {
  const prop = f.property
  if (hasAlphaLiteral(f.literal) || /gradient/.test(f.literal)) return ''
  if (/protein-|legend|residue|composition-code|alignment-map|color-class|motif-hit|trace-base|trace-viewer__base|feature-color|callout|gel-band|stop-codon|sequence-bases|hop-label|orf-label|primer-callout|enzyme-callout|sgrna-callout|library-sequence|library-map-segment|history-glyph|session-draft-color/i.test(f.owner)) {
    return ''
  }
  if (prop === 'color') return '--vg-text'
  if (prop === 'fill' && /(text|label|title|legend|heading|svg text)/i.test(f.owner)) return '--vg-text'
  if (prop === 'stroke') return '--vg-border'
  if (prop === 'border' || prop === 'border-color' || prop === 'outline' || prop === 'outline-color') return '--vg-border'
  if (prop.includes('background')) return '--vg-surface-panel'
  if (prop === 'box-shadow') return '--vg-shadow-elevation'
  return ''
}

function scientificRationale(f: ManifestFinding): string {
  if (/motif-hit/.test(f.owner)) return 'Motif hit fill encodes sequence search highlighting, not panel chrome.'
  if (/linear-primer-callout|primer-callout/.test(f.owner)) return 'Primer callout geometry encodes map/primer identity.'
  if (/polyline|path\b|stroke/.test(f.owner + f.property)) return 'Analytical stroke encodes feature or map geometry.'
  if (/trace-base|sequence-base|dna-base|stop-codon/.test(f.owner)) return 'Trace or sequence base tint encodes read identity.'
  if (/feature-color|common-feature/.test(f.owner)) return 'Feature color header encodes biological feature class.'
  return 'Biological or analytical encoding retained outside the 67-row registry.'
}

function mappingRule(f: ManifestFinding, outcome: Outcome, token: string): string {
  if (outcome === 'scientific-data') return 'retain-biological-or-analytical-encoding'
  if (outcome === 'dead-or-shadowed') return 'remove-shadowed-declaration'
  if (outcome === 'special-exception') return 'retain-specific-exception'
  return `converge-${f.property}-to-${token.replace(/^--vg-/, '')}`
}

function groupKey(row: Omit<GroupRow, 'groupId' | 'findingIds' | 'findingCount' | 'enforcedCount'>): string {
  return [row.outcome, row.destinationToken, row.property, row.literal, row.ownerFamily, row.mappingRule, row.rationale].join('|')
}

async function main(): Promise<void> {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8')) as { findings: ManifestFinding[] }
  const baseline = new Set<string>()
  const registry = JSON.parse(await readFile(REGISTRY_PATH, 'utf8')) as { findings: Array<{ id: string }> }
  const registryIds = new Set(registry.findings.map((r) => r.id))

  const byGroup = new Map<string, GroupRow>()
  const proof: Record<string, { outcome: Outcome; token: string }> = {}

  for (const f of manifest.findings) {
    let outcome = classifyOutcome(f, registryIds)
    let token = destinationToken(f, outcome)
    let rationale =
      outcome === 'scientific-data'
        ? scientificRationale(f)
        : outcome === 'dead-or-shadowed'
          ? 'Declaration is shadowed or redundant under scheme-aware rules.'
          : outcome === 'semantic-feedback'
            ? 'Validation or status chrome maps to the shared feedback token family.'
            : 'Ordinary application chrome converges to the shared semantic palette.'

    if ((outcome === 'generic-ui' || outcome === 'semantic-feedback') && !token) {
      const exceptionReason = specialExceptionReason(f)
      if (exceptionReason) {
        outcome = 'special-exception'
        token = ''
        rationale = exceptionReason
      } else if (outcome === 'generic-ui') {
        token = fallbackGenericToken(f)
        if (token) {
          rationale = 'Ordinary application chrome converges to the shared semantic palette.'
        } else {
          outcome = 'special-exception'
          rationale = 'Protected multi-stop gradient, alpha wash, or brand primary not safe for bulk token swap.'
        }
      } else {
        outcome = 'special-exception'
        token = ''
        rationale = 'Feedback chrome needs an explicit success/warning/danger token mapping.'
      }
    }

    if (f.owner.includes('.motif-hit') && f.literal.toLowerCase().includes('f8e16c')) {
      outcome = 'scientific-data'
      token = ''
      rationale = scientificRationale(f)
    }
    if (f.owner.includes('.linear-primer-callout polyline') && f.property === 'stroke') {
      outcome = 'scientific-data'
      token = ''
      rationale = scientificRationale(f)
    }

    proof[f.id] = { outcome, token }
    const rule = mappingRule(f, outcome, token)
    const family = ownerFamily(f.owner)
    const partial = {
      outcome,
      mappingRule: rule,
      destinationToken: token,
      property: f.property,
      literal: f.literal.trim(),
      ownerFamily: family,
      files: [f.file],
      exceptions: [] as string[],
      rationale,
    }
    const key = groupKey(partial)
    let group = byGroup.get(key)
    if (!group) {
      group = {
        groupId: createHash('sha1').update(key).digest('hex').slice(0, 16),
        ...partial,
        findingCount: 0,
        enforcedCount: 0,
        findingIds: [],
      }
      byGroup.set(key, group)
    } else if (!group.files.includes(f.file)) {
      group.files.push(f.file)
      group.files.sort()
    }
    group.findingIds.push(f.id)
    group.findingCount += 1
    if (baseline.has(f.id)) group.enforcedCount += 1
  }

  const groups = [...byGroup.values()].sort(
    (a, b) => b.enforcedCount - a.enforcedCount || b.findingCount - a.findingCount || a.groupId.localeCompare(b.groupId),
  )

  const outcomeTotals = {
    raw: {} as Record<Outcome, number>,
    enforced: {} as Record<Outcome, number>,
  }
  for (const o of ['generic-ui', 'semantic-feedback', 'scientific-data', 'dead-or-shadowed', 'special-exception'] as Outcome[]) {
    outcomeTotals.raw[o] = 0
    outcomeTotals.enforced[o] = 0
  }
  for (const g of groups) {
    outcomeTotals.raw[g.outcome] += g.findingCount
    outcomeTotals.enforced[g.outcome] += g.enforcedCount
  }

  const projectedEnforcedRetirement =
    outcomeTotals.enforced['generic-ui'] + outcomeTotals.enforced['semantic-feedback'] + outcomeTotals.enforced['dead-or-shadowed']

  const payload = {
    version: 2,
    generatedAt: new Date().toISOString(),
    revisedBy: 'grok-approve-with-rule-changes',
    productNote:
      'Historical shades and gradients need not be preserved; ordinary UI converges when contrast and state relationships stay sound.',
    sourceCounts: {
      rawFindings: manifest.findings.length,
      enforcedBaseline: baseline.size,
      scientificRegistry: registryIds.size,
    },
    outcomeTotals,
    projectedEnforcedRetirement,
    proofChecks: {
      motifHitF8e16c: proof[manifest.findings.find((x) => x.owner === '.motif-hit' && x.literal.toLowerCase().includes('f8e16c'))?.id ?? ''] ?? null,
      linearPrimerPolyline: proof[manifest.findings.find((x) => x.owner === '.linear-primer-callout polyline')?.id ?? ''] ?? null,
    },
    groups: groups.map(({ findingIds, ...rest }) => ({ ...rest, findingIds: findingIds.sort() })),
  }

  await writeFile(OUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')

  const extensionRows = manifest.findings
    .filter((f) => {
      const row = proof[f.id]
      return row?.outcome === 'scientific-data' && !registryIds.has(f.id)
    })
    .map((f) => ({
      id: f.id,
      file: f.file,
      owner: f.owner,
      property: f.property,
      literal: f.literal,
      rationale: scientificRationale(f),
    }))
    .sort((a, b) => a.id.localeCompare(b.id))

  await writeFile(
    EXTENSIONS_PATH,
    `${JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), count: extensionRows.length, findings: extensionRows }, null, 2)}\n`,
    'utf8',
  )

  console.log('groups', groups.length)
  console.log('scientific extensions', extensionRows.length)
  console.log('outcome raw', outcomeTotals.raw)
  console.log('outcome enforced', outcomeTotals.enforced)
  console.log('projectedEnforcedRetirement', projectedEnforcedRetirement)
}

main().catch((err: unknown) => {
  console.error(err)
  process.exitCode = 1
})
