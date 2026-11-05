import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { normalizeCssValue } from './plan-theme-migration.ts'

const ROOT = resolve(import.meta.dirname, '..')

export type ManifestRow = {
  id: string
  file: string
  kind: string
  property: string
  literal: string
  owner: string
  classification: string
  locator?: { owner: string; anchor: string }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function blockEnd(source: string, open: number): number {
  let depth = 0
  let quote: string | null = null
  for (let index = open; index < source.length; index += 1) {
    const character = source[index]
    if (quote) {
      if (character === quote && source[index - 1] !== '\\') quote = null
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      continue
    }
    if (character === '/' && source[index + 1] === '*') {
      const commentEnd = source.indexOf('*/', index + 2)
      if (commentEnd < 0) return -1
      index = commentEnd + 1
      continue
    }
    if (character === '{') depth += 1
    if (character === '}' && --depth === 0) return index
  }
  return -1
}

function ownerSelectorParts(owner: string): string[] {
  if (!owner.includes(',')) return [owner.trim()]
  return owner.split(',').map((part) => part.trim()).filter(Boolean)
}

export function resolveCssDeclarationValue(source: string, owner: string, property: string, literal: string): string | null {
  const normalizedLiteral = literal.trim().toLowerCase()
  for (const singleOwner of ownerSelectorParts(owner)) {
    const selector = new RegExp(`(?:^|\\n)[ \\t]*${escapeRegExp(singleOwner)}[ \\t]*\\{`, 'g')
    for (const match of source.matchAll(selector)) {
      const open = source.indexOf('{', match.index ?? 0)
      const close = blockEnd(source, open)
      if (open < 0 || close < 0) continue
      const body = source.slice(open + 1, close)
      const declarationPattern = new RegExp(`(?:^|;)\\s*${escapeRegExp(property)}\\s*:\\s*([^;{}]+)`, 'gm')
      for (const declaration of body.matchAll(declarationPattern)) {
        const value = normalizeCssValue(declaration[1]!)
        if (value.toLowerCase().includes(normalizedLiteral)) return value
      }
    }
  }
  return null
}

const sourceCache = new Map<string, string>()

export async function loadSource(file: string): Promise<string> {
  const cached = sourceCache.get(file)
  if (cached) return cached
  const text = await readFile(resolve(ROOT, file), 'utf8')
  sourceCache.set(file, text)
  return text
}

export async function resolveFullDeclarationValue(row: ManifestRow): Promise<{ value: string | null; deferReason?: string }> {
  if (row.file.endsWith('.css') || row.kind === 'css') {
    const source = await loadSource(row.file)
    const props =
      row.property === 'background-color'
        ? ['background-color', 'background']
        : row.property === 'background'
          ? ['background', 'background-color', 'background-image']
          : [row.property]
    for (const property of props) {
      const value = resolveCssDeclarationValue(source, row.owner, property, row.literal)
      if (value) return { value }
    }
    return { value: null, deferReason: `Could not reconstruct declaration for ${row.owner} ${row.property} containing ${row.literal}.` }
  }
  return { value: normalizeCssValue(row.literal) }
}

export function declarationContainsGradient(value: string): boolean {
  return /(?:linear|radial|conic)-gradient\s*\(/i.test(value)
}

export function declarationIsShadowProperty(property: string): boolean {
  return property === 'box-shadow' || property === 'text-shadow'
}

export function hasTranslucentCompound(value: string): boolean {
  return /rgba?\([^)]*\/\s*\d|rgb\([^)]+\/\s*\d|%|color-mix\([^)]*transparent/i.test(value)
}

export function isScientificEncodingRow(row: ManifestRow, registryIds: Set<string>): boolean {
  if (registryIds.has(row.id) || row.classification === 'scientific-data') return true
  const owner = row.owner
  if (/\.sequence-mutagenic-base|\.dna-end-p-badge|\.gateway-lr-ends-bases\.is-insert|\.sequence-primer-base|\.sequence-primer-frame|object:features\.color|object:oligoPrimers\.color|object:(color|raw\.color|primer\.color|sensePrimer|antisensePrimer)/i.test(owner)) {
    return true
  }
  if (/sgrna.*frame|guidescan.*frame|\.sequence-primer-frame|primer-frame/i.test(owner) && (row.property === 'stroke' || row.property === 'fill' || row.property.includes('background'))) {
    return true
  }
  if (/motif-hit|feature-color|common-feature-color|protein-composition|protein-residue|linear-primer-callout|primer-callout|enzyme-callout|sequence-enzyme-callout|sgrna-callout|orf-label|hop-label|trace-base|stop-codon|gel-band|recognition-site|cleavage-site|library-sequence|chromatogram/i.test(owner)) {
    if (/button|toolbar|dialog-actions|footer-actions|\.hint\b|\.title\b(?!-)|pagination|tabs\b/i.test(owner)) return false
    return true
  }
  if (row.file === 'src/TraceViewer.css' && /trace-base|trace-viewer__base/i.test(owner)) return true
  return false
}

export function isScientificShadowRetention(row: ManifestRow, fullValue: string): boolean {
  return /\.sequence-orf-residue\.is-stop\.selected/i.test(row.owner) && declarationIsShadowProperty(row.property) && /inset/i.test(fullValue)
}

export function isActionChromeNotDiagram(row: ManifestRow): boolean {
  return /\.agarose-gel-footer-right|cloning-schema-digest-choices|button\.primary|button\.is-drop|dialog-actions|footer-actions|\.primary\b/i.test(row.owner)
}

export function isDiagramChromeRow(row: ManifestRow): boolean {
  if (isActionChromeNotDiagram(row)) return false
  if (isScientificEncodingRow(row, new Set())) return false
  if (!/lane-label|gel-lane|axis|grid|frame|navigator|schema-panel|diagram|overview-svg|assembly-embed|tools-gel-canvas|cloning-schema|agarose-gel-lane-label/i.test(row.owner + row.file)) {
    return false
  }
  if (/callout|polyline|motif|residue|trace-|gel-band|feature-color|enzyme-marker|recognition|cleavage|library-sequence segment|chromatogram peak|primer-callout|enzyme-callout/i.test(row.owner)) {
    return false
  }
  return row.property === 'stroke' || row.property === 'fill' || /grid|axis|lane-label|frame|caption|label/i.test(row.owner)
}

export function isBlockingScrimRow(row: ManifestRow, fullValue: string): boolean {
  if (/chip|badge|tag\b|hint|minimap(?!-backdrop)|db-drop-overlay|feature-nocolor|prompt-tag|mer-badge|db-tag-chip/i.test(row.owner)) return false
  if (!/backdrop|scrim|modal-overlay|translation-dialog-backdrop|new-dna-dialog-backdrop|startup-modal-overlay/i.test(row.owner)) return false
  return hasTranslucentCompound(fullValue) || /transparent|rgba\([^)]*,\s*0/i.test(fullValue)
}

export function saturatedExplicitToken(row: ManifestRow, fullValue: string, bulkToken: string): string | null {
  if (bulkToken) return bulkToken
  const blob = `${row.owner}|${fullValue}|${row.literal}`.toLowerCase()
  if (/e06a72|b91c1c|dc2626|991b1b|7f1d1d|e03e3e|danger|destructive|remove-hover|is-error|is-invalid|is-danger|sync-conflict|pick-primers-error|construct-picker-error/i.test(blob)) {
    if (row.property.includes('background')) {
      if (/button|\.primary|destructive|remove-hover|cancel/i.test(row.owner)) return '--vg-control-destructive'
      return '--vg-danger-surface'
    }
    if (/border|outline/.test(row.property)) return '--vg-danger-border'
    if (row.property === 'color') {
      if (/button|\.primary|destructive|inverse|on-primary/i.test(row.owner)) return '--vg-text-inverse'
      return '--vg-danger-ink'
    }
  }
  if (/button\.primary|database-construct-add|uniprot-search-button(?!\.is-cancel)|translation-actions \.primary|\.primary:hover|guidescan-add-selected\.is-primary/i.test(row.owner)) {
    if (row.property.includes('background')) return /--vg-control-primary-hover/.test(row.owner) ? '--vg-control-primary-hover' : '--vg-control-primary'
    if (row.property === 'color') return '--vg-text-inverse'
    if (/border|outline/.test(row.property)) return '--vg-control-primary-border'
  }
  if (/warning|d49a2e|f59e0b|92400e/i.test(blob)) {
    if (row.property.includes('background')) return '--vg-warning-surface'
    if (/border|outline/.test(row.property)) return '--vg-warning-border'
    if (row.property === 'color') return '--vg-warning-ink'
  }
  if (/success|4aa36b|22c55e|ready|is-valid/i.test(blob)) {
    if (row.property.includes('background')) return '--vg-success-surface'
    if (/border|outline/.test(row.property)) return '--vg-success-border'
    if (row.property === 'color') return '--vg-success-ink'
  }
  if (/focus-visible|:focus-visible|:focus\b/.test(row.owner) && /outline/.test(row.property)) return '--vg-focus'
  if (/muted|hint|secondary|placeholder|footer-note|empty-list/i.test(row.owner) && row.property === 'color') return '--vg-text-muted'
  if (/title|heading|strong|text-h|legend-title|column-header|th\b/i.test(row.owner) && (row.property === 'color' || row.property === 'fill')) return '--vg-text-strong'
  if (/is-selected|is-active|:checked|selection-text/i.test(row.owner)) {
    if (row.property.includes('background')) return /--vg-interactive-selected-hover|:hover.*selected/i.test(row.owner) ? '--vg-interactive-selected-hover' : '--vg-interactive-selected'
    if (row.property === 'color') return '--vg-interactive-selected-ink'
  }
  if (/:hover/.test(row.owner) && /row|list|menu|table|browse|result|item|tab/i.test(row.owner) && row.property.includes('background')) {
    return '--vg-interactive-hover'
  }
  if (/field|input|textarea|select\b|inset|app-field/i.test(row.owner) && row.property.includes('background')) return '--vg-surface-inset'
  if (/panel|dialog|card|workspace|sidebar|scroll|container|wrapper|pane\b/i.test(row.owner) && row.property.includes('background')) return '--vg-surface-panel'
  if (/divider|separator|table-border/i.test(row.owner) && /border|outline/.test(row.property)) return '--vg-border'
  if (/button|kbd|stepper|control/i.test(row.owner) && /border|outline/.test(row.property)) return '--vg-control-border'
  return null
}

export function gradientDestinationToken(row: ManifestRow): string {
  if (/:active\b/.test(row.owner)) return '--vg-control-surface-pressed'
  if (/:hover/.test(row.owner)) return '--vg-control-surface-hover'
  if (/chrome|toolbar|titlebar|app-shell/i.test(row.owner)) return '--vg-surface-chrome'
  if (/button|kbd|stepper|pagination button|\.btn\b/i.test(row.owner)) return '--vg-control-surface'
  if (/panel|dialog|card|workspace|ambient|hero/i.test(row.owner)) return '--vg-surface-panel'
  return '--vg-control-surface'
}

export function shadowDestinationToken(row: ManifestRow, fullValue: string): string {
  if (/inset/i.test(fullValue)) return '--vg-shadow-inset-control'
  if (/dialog|menu|dropdown|popover|modal|overlay|popup|submenu|toolbar-edit-dropdown/i.test(row.owner)) return '--vg-shadow-overlay'
  return '--vg-shadow-elevation'
}

export function diagramDestinationToken(row: ManifestRow): string {
  if (row.property === 'stroke') {
    if (/grid|divider|separator|axis/i.test(row.owner)) return '--vg-diagram-grid-stroke'
    return '--vg-diagram-frame-stroke'
  }
  if (row.property === 'color' || row.property === 'fill') return '--vg-text-strong'
  if (row.property.includes('background')) return '--vg-surface-panel'
  return '--vg-border-strong'
}
