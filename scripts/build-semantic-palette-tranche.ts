#!/usr/bin/env node
/**
 * Grok-reduced allowlist classifier for semantic --vg-* palette convergence.
 * Read-only inventory helper; writes scripts/semantic-palette-tranche.json.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { scanProject } from './check-theme-colors.ts'
import { readThemeMigrationLedger } from './plan-theme-migration.ts'

const ROOT = resolve(import.meta.dirname, '..')
const OUT = resolve(import.meta.dirname, 'semantic-palette-tranche.json')

const SHADOW_RETIRE = new Set([
  '773c96486de1e3a9', 'df3345cc8afcc2ef', '22d9a0873a046a62', '9bac69a884b0e1c7', '67f78f3c33325925',
])

const CHROME_PREFIX = [
  '.db-', '.database-', '.preferences-', '.import-', '.export-', '.translation-', '.keyboard-shortcuts',
  '.cloning-', '.pcr-', '.agarose-gel-dialog', '.agarose-gel-layout', '.agarose-gel-main', '.agarose-gel-sidebar',
  '.agarose-gel-controls', '.agarose-gel-footer', '.agarose-gel-workspace', '.agarose-gel-mw-',
  '.agarose-gel-lane-list', '.agarose-gel-settings', '.agarose-gel-pcr', '.agarose-gel-multi', '.agarose-gel-move',
  '.restriction-cloning', '.gibson-assembly', '.gateway-cloning', '.ta-gc-cloning', '.mutagenesis-',
  '.mass-restriction', '.mass-insert', '.mass-cloning', '.pick-primers', '.primer-editor', '.primer-list',
  '.common-features', '.common-primers', '.feature-visibility', '.enzyme-preferences', '.enzyme-manage',
  '.enzyme-choose', '.enzyme-list', '.enzyme-info-find', '.enzyme-info-inferred', '.enzyme-info-buffer-table-wrap',
  '.tools-gel-dialog', '.tools-double-digest', '.tools-mw-', '.tools-letter', '.tools-genetic-table',
  '.new-dna-', '.unsaved-changes', '.whats-new', '.select-range', '.topology-choice', '.combine-library',
  '.dedupe-library', '.generate-link', '.blocked-batch', '.other-open-tab', '.mobile-cloning-pane',
  '.sidebar-menu', '.sidebar-feature', '.sidebar-dna', '.sidebar-orf', '.sidebar-primer', '.sidebar-map-export',
  '.hcard-', '.hop-detail', '.data-table', '.translation-dialog', '.translation-actions', '.compact-scientific-dialog',
  '.guidescan-design-dialog', '.sgrna-dialog', '.description-panel', '.sequence-database-import',
  '.sequence-database-ncbi-scope', '.sequence-database-result-list', '.sequence-database-gene',
  '.features-import', '.common-feature-preview', '.common-primers-detect', '.toolbar-edit-',
  '.combine-library-reads', '.dedupe-library-members', '.database-exit-sync', '.database-construct-picker',
  '.database-history', '.db-main-actions', '.db-table-pagination', '.db-file-list', '.db-drop-overlay',
  '.cloning-recipe', '.cloning-preview', '.pcr-recipe', '.pcr-primer-panel', '.pcr-design', '.pcr-recipe-dialog',
  '.history-management-toolbar', '.filter-panel',
]

const NEUTRAL_INK = /^#(?:222|222222|333|333333|444|444444|555|555555|666|666666|202020|1f2933|374151|4b5563|5b5346|2f2a23|8a8a8a)(?:\b|$)/i
const LINK_BLUE = /^#(?:1d4ed8|174f8f|2563eb|1c70ce|315f9c|0f766e|16803f|477f43|376f36)/i
const ERROR_RED = /^#(?:a02020|b91c1c|dc2626|e06a72|991b1b)/i
const SUCCESS_GREEN = /^#(?:16803f|477f43|376f36|4aa36b)/i

function wordBoundary(owner: string, word: string): boolean {
  return new RegExp(`\\b${word}\\b`).test(owner)
}

function hardReject(f: { owner: string; property: string; literal: string; file: string; excerpt?: string }): string | null {
  const o = f.owner
  const lit = f.literal.trim()
  if (f.file !== 'src/App.css' && f.file !== 'src/PickPrimersDialog.css') return 'file'
  if (o.startsWith('@media')) return 'media-query-owner'
  if (o === 'button') return 'global-button'
  if (o === '.tab-bar' || o.endsWith(' .tab-bar')) return 'tab-bar-chrome'
  if (/linear-gradient|radial-gradient|color-mix/i.test(lit)) return 'gradient-or-mix'
  if (/rgba?\(/i.test(lit)) return 'translucent'
  if (/box-shadow|text-shadow/i.test(f.property)) return 'shadow-property'
  if (/protein-|plasmid|track-map|sequence-row|sequence-translation|dna-base|orf-|primer-map|annotation-|binder-|immunoglobulin|darpin|hop-|is-aa-highlight|gateway-lr-|cloning-schema|gibson-schema|enzyme-info-buffer|recognition|noncutters|methyl|tools-gel-canvas|tools-genetic-arrow|snapgene-shell|linear-alignment|library-map|map-alignment|sidebar-strand|sidebar-enzyme|common-feature-color|session-draft|sgrna-strand|sgrna-hit|history-manager|filter-panel|primer-subgroup|primer-sgrna-row|features-table|enzyme-info-related/i.test(o)) return 'scientific-or-art'
  if (/::before|::after/.test(o)) return 'pseudo-art'
  if (!CHROME_PREFIX.some((prefix) => o.includes(prefix)) && !/-actions button|main-actions button|library-output-toggle|members-list|results-list|pane-tabs|panel-tabs|dialog-mode button/.test(o)) {
    return 'outside-chrome-allowlist'
  }
  if (/agarose-gel-lane|agarose-gel-canvas|agarose-gel-art|gel-band|ladder|well|fragment-item|lane-index|lane-name|lane-empty|lane-row|digest-warning|matrix-settings|is-drag-active/i.test(o)) return 'gel-art'
  if (/dialog-resize-grip|resize-handle|resize-grip|translation-dialog-backdrop|hybrid-window|:root\[data-color-scheme\]/i.test(o)) return 'decorative-or-scrim'
  if (/is-error|is-warning|is-success|is-invalid|is-ready|is-danger|is-reviewed|is-offtarget|is-similar|is-skipped|is-uncloneable|is-preferred|is-vhh|is-orphaned|is-cycle|is-flank|is-empty|is-active|is-selected|is-open|is-changed|is-submenu|\.active\b|:hover|:focus|:disabled|:checked|primary\b|\.danger\b|is-drop\b|destructive/i.test(o)) return 'interaction-or-state'
  if (/error|warn|warning|invalid|danger|success|status-line|pick-primers-error|features-import-error|db-library-member-error|cloning-schema-partial|database-construct-picker-error|database-construct-add-button|sgrna-dialog-actions button:last-child|sequence-database-gene-back|sequence-database-source-link|result-title span|db-tag-chip|db-library-badge|mer-badge|restriction-cloning-dntp|feature-section-row|selection-bar/i.test(o)) return 'state-link-or-chip'
  if (/sequence-database-result-title span/.test(o)) return 'badge-span'
  if (f.property === 'color' && (LINK_BLUE.test(lit) || ERROR_RED.test(lit) || SUCCESS_GREEN.test(lit))) return 'semantic-ink-literal'
  if (/^#c9c8ff$/i.test(lit)) return 'enzyme-purple'
  if (/^#eef5ff$/i.test(lit)) return 'tinted-control'
  if (SHADOW_RETIRE.has((f as { id?: string }).id ?? '')) return 'prior-shadow-retire'
  return null
}

function classify(f: { owner: string; property: string; literal: string; file: string; excerpt: string }): { role: string; token: string } | null {
  if (hardReject(f)) return null
  const o = f.owner
  const p = f.property
  const lit = f.literal.trim()

  if (/^border(-|$)/.test(p) || p === 'outline-color') {
    if (/input|checkbox|radio|select|textarea|toggle|kbd|menu|dialog\b|compact-field|description-panel-toggle|keyboard-shortcuts-list kbd/.test(o)) {
      return { role: 'control-outline', token: '--vg-control-border' }
    }
    if (/table|thead|tbody|tr\b|td\b|th\b|grid|table-wrap|preview th|preview td/.test(o) && wordBoundary(o, 'table')) {
      return { role: 'table-grid-border', token: '--vg-border' }
    }
    if (/table|thead|tbody|\bth\b|\btd\b|table-wrap|grid/.test(o)) {
      return { role: 'table-grid-border', token: '--vg-border' }
    }
    return { role: 'neutral-divider', token: '--vg-border' }
  }

  if (p === 'color') {
    if (/hint|empty|note|help|muted|caption|bullets|closing|multi-hint|pcr-hint|attb-hint|generate-link-note|reads-empty|reads-hint|whats-new|unsaved-changes-note|shortcut|submenu-arrow|meta\b/.test(o) && !/error|warn/.test(o)) {
      return { role: 'explanatory-muted-text', token: '--vg-text-muted' }
    }
    if (/\bstrong\b|\bth\b|heading|title|section-toggle|results-summary strong|name-table th|results-column h4|uniprot-plan-heading|annotation-title/.test(o)) {
      return { role: 'section-heading-text', token: '--vg-text-strong' }
    }
    if (wordBoundary(o, 'button') && o !== 'button' && !wordBoundary(o, 'table') && NEUTRAL_INK.test(lit)) {
      return { role: 'neutral-control-label', token: '--vg-control-ink' }
    }
    if (/summary|member-picker|library-reads|dedupe-library|combine-library|toolbar-edit-item|sidebar-menu|recipe-note|preferences-pcr-lead|preferences-option|import-options|detect-table|browse-item|construct-picker|result-list|history-batch|sync-dialog|primer-panel|gel-dialog|mass-restriction-name|mass-insert|cloning-recipe|gateway-cloning|gibson-assembly|restriction-cloning-(?!status|hint|treatment)/.test(o) && NEUTRAL_INK.test(lit)) {
      return { role: 'body-chrome-text', token: '--vg-text' }
    }
    return null
  }

  if (p === 'background' || p === 'background-color') {
    if (/thead|\bth\b|table-head|grid-head|corner/.test(o) && p === 'background-color' || (p === 'background' && /\bth\b|thead/.test(o))) {
      return null // reject table header fills
    }
    if (/input|select|textarea|compact-field|pick-primers-dialog input|pick-primers-dialog select|pick-primers-dialog textarea|sgrna-dialog.*input|list-box|file-list|editor-table-wrap|name-table-wrap|results-column(?! h)/.test(o) && !wordBoundary(o, 'button')) {
      if (/selection-bar/.test(o)) return null
      return { role: 'form-field-surface', token: '--vg-surface-inset' }
    }
    if (wordBoundary(o, 'button') && o !== 'button' && /^#(?:fff(?:fff)?|ffffff|f[0-9a-f]{5}|e[0-9a-f]{5}|d[0-9a-f]{5}|c[0-9a-f]{5})$/i.test(lit)) {
      if (/linear-gradient/i.test(f.excerpt)) return null
      return { role: 'feature-button-surface', token: '--vg-control-surface' }
    }
    if (/\.sequence-database-ncbi-scope\b/.test(o)) return { role: 'raised-list-surface', token: '--vg-surface-raised' }
    if (/result-list|file-row|startup-file|library-reads-preview|dedupe-library-members-preview|members-list(?! > label)|browse-list|supplier-list|construct-picker-list|open-tab-row|history-batch-records|enzyme-list-box|common-features-browse|db-file-list|table-wrap|list-scroll|list-card|pane-body|workspace|sidebar|dialog(?!-backdrop)|modal|main|layout|section|controls|picker|footer(?!-dropdown-divider)|header|chrome|recipe-dialog|primer-panel|gel-dialog|gel-layout|gel-main|gel-sidebar|gel-footer|gel-controls|gel-workspace|gel-mw-picker|gel-mw-editor|cloning-|restriction-|gateway-|gibson-|mass-restriction-|mass-insert-|pcr-|preferences-|import-|export-|translation-dialog(?!-backdrop)|keyboard-shortcuts|whats-new|unsaved-changes|topology-choice|tools-double-digest|tools-mw-|tools-letter|combine-library|dedupe-library|generate-link|blocked-batch|other-open-tab|mobile-cloning-pane|feature-visibility-menu|database-exit-sync|new-dna-dialog|compact-scientific-dialog/.test(o)) {
      if (/muted|alt|secondary|panel-muted|batch-records|pagination|members-list > label\.is-uncloneable/.test(o)) {
        return { role: 'nested-panel-surface', token: '--vg-surface-panel-muted' }
      }
      if (/dialog-resize|resize-grip|resize-handle/.test(o)) return null
      return { role: 'main-panel-surface', token: '--vg-surface-panel' }
    }
    if (/\.sequence-database-ncbi-scope\b|reads-preview|members-preview|ncbi-scope|result-list > button|open-tab-row|file-list|supplier-list|browse-list|construct-picker-list|members-list(?! > label)/.test(o)) {
      return { role: 'raised-list-surface', token: '--vg-surface-raised' }
    }
    return null
  }

  return null
}

async function main(): Promise<void> {
  const manifest = JSON.parse(await readFile(resolve(ROOT, 'scripts/theme-debt-manifest.json'), 'utf8')) as { findings: Array<{ id: string; classification: string; reviewStatus: string }> }
  const manifestIds = new Set(manifest.findings.filter((f) => f.classification === 'needs-review').map((f) => f.id))
  const ledger = await readThemeMigrationLedger(ROOT)
  const ledgerIds = new Set([
    ...ledger.app.entries.map((e) => e.id),
    ...ledger.app.removals.map((e) => e.id),
    ...ledger.app.anchorRows.map((e) => e.id),
    ...ledger.app.retainedRows.map((e) => e.id),
    ...ledger.pickPrimers.entries.map((e) => e.id),
  ])
  const raw = await scanProject({ rootDir: ROOT, mode: 'raw' })
  const rows: Array<{ id: string; file: string; owner: string; property: string; literal: string; line: number; role: string; token: string }> = []
  const rejectReasons: Record<string, number> = {}
  for (const f of raw) {
    if (!manifestIds.has(f.id) || ledgerIds.has(f.id)) continue
    const rej = hardReject({ ...f, owner: f.locator.owner })
    if (rej) {
      rejectReasons[rej] = (rejectReasons[rej] ?? 0) + 1
      continue
    }
    const mapped = classify({ owner: f.locator.owner, property: f.property, literal: f.literal, file: f.file, excerpt: f.excerpt })
    if (!mapped) {
      rejectReasons.unclassified = (rejectReasons.unclassified ?? 0) + 1
      continue
    }
    rows.push({
      id: f.id,
      file: f.file,
      owner: f.locator.owner,
      property: f.property,
      literal: f.literal,
      line: f.line,
      role: mapped.role,
      token: mapped.token,
    })
  }
  const byRole: Record<string, number> = {}
  const byToken: Record<string, number> = {}
  for (const r of rows) {
    byRole[r.role] = (byRole[r.role] ?? 0) + 1
    byToken[r.token] = (byToken[r.token] ?? 0) + 1
  }
  await writeFile(OUT, `${JSON.stringify({ generatedAt: new Date().toISOString(), total: rows.length, byRole, byToken, rejectReasons, rows }, null, 2)}\n`, 'utf8')
  console.log(`Wrote ${rows.length} semantic migrations to ${OUT}`)
  console.log('byRole', byRole)
  console.log('byToken', byToken)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
