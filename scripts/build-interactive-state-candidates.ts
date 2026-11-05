#!/usr/bin/env node
/**
 * Builds scripts/interactive-state-candidates.json from needs-review manifest rows
 * that plausibly encode generic UI interaction states, reclassified against
 * scripts/interaction-state-matrix.json (Grok-approved roles).
 */

import { readFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const MANIFEST_PATH = resolve(import.meta.dirname, 'theme-debt-manifest.json')
const NEUTRAL_PATH = resolve(import.meta.dirname, 'neutral-text-chrome-candidates.json')
const MATRIX_PATH = resolve(import.meta.dirname, 'interaction-state-matrix.json')
const OUT_PATH = resolve(import.meta.dirname, 'interactive-state-candidates.json')

const INTERACTION_MIGRATE_TOKENS = new Set([
  '--vg-control-surface',
  '--vg-control-surface-hover',
  '--vg-control-border',
  '--vg-control-ink',
  '--vg-interactive-hover',
  '--vg-interactive-selected',
  '--vg-interactive-selected-hover',
  '--vg-interactive-selected-ink',
  '--vg-focus',
])

const DISALLOWED_MIGRATE_TOKENS = new Set([
  '--vg-disabled-ink',
  '--vg-disabled-surface',
  '--vg-disabled-border',
  '--vg-control-surface-pressed',
  '--vg-focus-ring',
])

type ManifestFinding = {
  id: string
  file: string
  owner: string
  property: string
  literal: string
  classification: string
}

type MatrixRole = {
  role: string
  token: string
  intendedOwners: Array<{ ledgerId: string; selector: string }>
}

type CandidateRow = {
  id: string
  file: string
  owner: string
  property: string
  literal: string
  proposedToken: string
  state: string
  baseSelector: string
  mechanism: string
  disposition: 'migrate' | 'reject'
  reason: string
  rationale: string
}

const stateModel = {
  focusRing: {
    token: '--vg-focus',
    note: 'Keyboard focus ring and outline-color on generic chrome controls.',
  },
  hoverSurface: {
    token: '--vg-interactive-hover',
    note: 'List/table row and panel hover fills matching app-table-hover.',
  },
  pressedSurface: {
    token: null as string | null,
    why: 'No dedicated --vg-* pressed surface; control gradient bottom may differ on :active.',
  },
  selectedSurface: {
    token: '--vg-interactive-selected',
    note: 'Selected list/menu/tag background matching app-selection.',
  },
  selectedForeground: {
    token: '--vg-interactive-selected-ink',
    note: 'Selected row/tag text matching app-selection-text.',
  },
  activeNavigation: {
    token: '--vg-interactive-selected',
    note: 'Active tab/menu item uses the same fill as selection unless proven otherwise.',
  },
  disabledForeground: {
    token: null as string | null,
    why: 'No --vg-disabled-ink; muted text token is not equivalent for all disabled controls.',
  },
  disabledSurface: {
    token: null as string | null,
    why: 'No --vg-disabled-surface token in index.css.',
  },
  disabledBorder: {
    token: null as string | null,
    why: 'No --vg-disabled-border; weakening --vg-border without computed-style proof is unsafe.',
  },
  controlHoverSurface: {
    token: '--vg-control-surface-hover',
    note: 'Button hover gradient stop on generic chrome buttons.',
  },
}

const ROLE_TO_STATE: Record<string, string> = {
  controlSurfaceNormal: 'controlSurfaceNormal',
  controlSurfaceHover: 'controlHoverSurface',
  controlBorder: 'controlBorder',
  controlInk: 'controlInk',
  interactiveHover: 'hoverSurface',
  interactiveSelected: 'selectedSurface',
  interactiveSelectedHover: 'selectedSurfaceHover',
  interactiveSelectedInk: 'selectedForeground',
  focusVisible: 'focusRing',
}

function normalizeLiteral(lit: string): string {
  return lit.replace(/\s+/g, ' ').trim().toLowerCase()
}

const HOVER_SURFACE_LITERALS = new Set(['#dcedff', '#e8f3ff', '#dceeff', '#efe8da', '#f5f5f5', '#f0f0f0', '#eef2ff', '#e8f2ff'])
const SELECTED_SURFACE_LITERALS = new Set(['#dbeafe', '#e8f3ff', '#dcedff', '#dceeff', '#e8dcc4'])
const CONTROL_HOVER_LITERALS = new Set(['#cfe4fb', '#dcecff', '#25445b'])
const SELECTED_INK_LITERALS = new Set(['#0f4f9c', '#1c70ce', '#2563eb', '#174f8f', '#124e86'])
const FOCUS_LITERALS = new Set(['#2f74b5', '#2563eb', '#1c70ce', '#1d75c7', '#69b8ff'])

function parseMechanism(owner: string): string {
  if (/:disabled\b/.test(owner)) return 'disabled'
  if (/:focus-visible\b/.test(owner)) return 'focus-visible'
  if (/:focus\b/.test(owner)) return 'focus'
  if (/:active\b/.test(owner)) return 'pressed'
  if (/\.is-selected\b|:checked\b|\[aria-selected/.test(owner)) return 'selected'
  if (/\.is-active\b|\.active\b/.test(owner)) return 'active'
  if (/:hover\b/.test(owner)) return 'hover'
  if (/\.is-open\b/.test(owner)) return 'active'
  return ''
}

function baseSelector(owner: string): string {
  return (
    owner
      .split(',')
      .map((part) =>
        part
          .trim()
          .replace(/:(hover|focus|focus-visible|active|disabled|checked)(.*)?$/, '')
          .replace(/\.is-(selected|active|open)\b.*$/, '')
          .trim(),
      )
      .filter(Boolean)[0] ?? ''
  )
}

function loadMatrixMigrateById(): Map<string, { token: string; state: string; rationale: string }> {
  const matrix = JSON.parse(readFileSync(MATRIX_PATH, 'utf8')) as { roles: MatrixRole[] }
  const map = new Map<string, { token: string; state: string; rationale: string }>()
  for (const role of matrix.roles) {
    const state = ROLE_TO_STATE[role.role] ?? role.role
    for (const owner of role.intendedOwners) {
      map.set(owner.ledgerId, {
        token: role.token,
        state,
        rationale: `Matrix owner ${owner.selector} maps to ${role.token} (${role.role}).`,
      })
    }
  }
  return map
}

function mixedInteractionReject(owner: string): string | null {
  if (/:focus-within\b/.test(owner)) return 'mixed-focus-within-not-splittable'
  if (/\.is-open\b/.test(owner) && /:hover|:active|\.is-active/.test(owner)) {
    return 'mixed-open-hover-or-active-not-splittable'
  }
  if (/is-submenu|is-drop-target/.test(owner)) return 'submenu-or-drop-target-state'
  if (/:hover[^,{]*(:active|\.is-active)|(:active|\.is-active)[^,{]*:hover/.test(owner)) {
    return 'mixed-hover-active-not-splittable'
  }
  if (/button\.guidescan-metric-help-trigger:hover, button\.guidescan-metric-help-trigger:focus-visible/.test(owner)) {
    return 'mixed-hover-focus-not-splittable'
  }
  return null
}

function scientificOrWorkflowReject(owner: string, file: string): string | null {
  if (file.endsWith('.tsx')) return 'protected-renderer-file'
  if (/agarose-gel-|gel-band|tools-gel-canvas/i.test(owner)) return 'scientific-gel-visualization'
  if (/\bhcard\b|map-title|\.map-/.test(owner)) return 'scientific-or-workflow-state'
  if (
    /protein-|plasmid|track-map|sequence-row|sequence-translation|sequence-feature|sequence-label|sequence-primer|sequence-database|dna-base|dna-ends|orf-|primer-map|primer-list|primer-callout|primer-color|primer-editor|primer-properties|annotation-|binder-|immunoglobulin|darpin|hop-|history-glyph|gateway-lr-|gateway-|gibson-|enzyme-|recognition|noncutters|methyl|library-map|library-sequence|gel-library|snapgene-shell|linear-alignment|linear-enzyme|linear-primer|map-alignment|sidebar-strand|sidebar-enzyme|sidebar-map-export|sgrna-|guidescan-|history-manager|filter-panel|primer-subgroup|features-table|common-feature-color|session-draft|trace-viewer|chromatogram|mass-restriction|mass-insert|restriction-cloning|ta-gc-|pcr-|pick-primers-|cloning-preview|alignment-|edit-map-label|action-profile-overlay|hcard-|map-zoom|map-feature|protein-map|protein-bond|protein-feature|protein-alignment|sequence-rows|cloning-schema|gibson-schema|alignment-file|pick-primers-error|is-offtarget|is-uncloneable|is-vhh|is-orphaned|is-cycle|is-flank|is-similar|is-skipped|is-preferred|is-reviewed|is-search-hit|is-blunt-green|is-enzyme|is-duplicate|is-merge|is-overlap|is-delete|is-undecoded|is-hovered|is-activatable|is-drop-target|compatibility|primer-quality/i.test(
      owner,
    )
  ) {
    return 'scientific-or-workflow-state'
  }
  if (
    /is-error|is-warning|is-success|is-invalid|is-ready|is-danger|is-missing|is-busy|is-unsupported|\.danger\b|destructive|error|warning|invalid|danger|success|sync-status|sync-conflict|construct-picker-error|database-construct-add-button|sgrna-dialog-actions button:last-child|sequence-database-gene-back|sequence-database-source-link|db-library-member-error|features-import-error|cloning-schema-partial|pick-primers-error|db-tag-chip|db-library-badge|mer-badge|restriction-cloning-dntp|selection-bar/i.test(
      owner,
    )
  ) {
    return 'semantic-status-or-validation'
  }
  if (/linear-gradient|radial-gradient|color-mix/i.test(owner)) return 'gradient-or-mix-owner'
  if (/box-shadow|text-shadow/i.test(owner) && !/outline/.test(owner)) return 'shadow-or-elevation'
  if (/dialog-resize|resize-grip|resize-handle|translation-dialog-backdrop|hybrid-window|modal-overlay|app-overlay|::before|::after/i.test(owner)) {
    return 'decorative-or-scrim'
  }
  if (/^:root\[data-color-scheme\]/.test(owner.trim())) return 'scheme-specific-override'
  if (/button\.primary\b|> button\.primary|\.primary\b.*button|footer-right > button\.primary/i.test(owner)) {
    return 'primary-action-brand'
  }
  if (/hop-label/i.test(owner)) return 'scientific-hop-label'
  if (/\.db-text-prompt-tag\.is-selected/.test(owner)) return 'chip-tag-selection-not-interactive-selected'
  return null
}

function rejectRow(
  rowBase: Omit<CandidateRow, 'proposedToken' | 'state' | 'disposition' | 'reason' | 'rationale'>,
  reason: string,
  state = '',
): CandidateRow {
  return {
    ...rowBase,
    proposedToken: '',
    state,
    disposition: 'reject',
    reason,
    rationale: '',
  }
}

function migrateRow(
  rowBase: Omit<CandidateRow, 'proposedToken' | 'state' | 'disposition' | 'reason' | 'rationale'>,
  proposedToken: string,
  state: string,
  rationale: string,
): CandidateRow {
  return {
    ...rowBase,
    proposedToken,
    state,
    disposition: 'migrate',
    reason: '',
    rationale,
  }
}

function classifyRow(f: ManifestFinding, matrixMigrateById: Map<string, { token: string; state: string; rationale: string }>): CandidateRow {
  const owner = f.owner
  const lit = f.literal.trim()
  const norm = normalizeLiteral(lit)
  const mechanism = parseMechanism(owner)
  const base = baseSelector(owner)
  const rowBase = {
    id: f.id,
    file: f.file,
    owner,
    property: f.property,
    literal: lit,
    baseSelector: base,
    mechanism,
  }

  const matrixHit = matrixMigrateById.get(f.id)
  if (matrixHit) {
    return migrateRow(rowBase, matrixHit.token, matrixHit.state, matrixHit.rationale)
  }

  const mixed = mixedInteractionReject(owner)
  if (mixed) {
    return rejectRow(rowBase, mixed)
  }

  const hard = scientificOrWorkflowReject(owner, f.file)
  if (hard) {
    return rejectRow(rowBase, hard)
  }

  if (/rgba?\(|\/\s*\d+%\)|rgb\([^)]+\/\s*\d/i.test(lit)) {
    return rejectRow(rowBase, 'alpha-without-safe-solid-token')
  }

  if (!mechanism) {
    if (/button\.primary|\.primary\b/.test(owner) && !/:hover|:active|:focus|:disabled|:focus-visible/.test(owner)) {
      return rejectRow(rowBase, 'resting-primary-not-interaction-state')
    }
    return rejectRow(rowBase, 'owner-lacks-recognizable-interaction-pseudo-or-state-class')
  }

  if (mechanism === 'disabled') {
    return rejectRow(rowBase, 'proposed-disabled-tokens-not-in-index-css', mechanism)
  }

  if (mechanism === 'pressed') {
    return rejectRow(rowBase, 'no-pressed-surface-token-in-index-css', 'pressedSurface')
  }

  if (mechanism === 'focus-visible' || mechanism === 'focus') {
    if (/outline|border-color|box-shadow/.test(f.property) || FOCUS_LITERALS.has(norm) || /^#2f74b5$/i.test(lit)) {
      return rejectRow(rowBase, 'matrix-has-no-generic-focus-ledger-owners', 'focusRing')
    }
    if (f.property === 'background' || f.property === 'background-color') {
      return rejectRow(rowBase, 'focus-background-not-focus-ring-token', 'hoverSurface')
    }
    return rejectRow(rowBase, 'focus-property-not-mapped-to-vg-focus', 'focusRing')
  }

  if (mechanism === 'selected' || (mechanism === 'active' && /\.is-selected\b/.test(owner))) {
    if (f.property === 'color' && SELECTED_INK_LITERALS.has(norm)) {
      return rejectRow(rowBase, 'matrix-has-no-generic-selected-ink-ledger-owners', 'selectedForeground')
    }
    if ((f.property === 'background' || f.property === 'background-color') && SELECTED_SURFACE_LITERALS.has(norm)) {
      return rejectRow(rowBase, 'selected-surface-literal-without-matrix-owner', 'selectedSurface')
    }
    if (f.property === 'border-color' && SELECTED_INK_LITERALS.has(norm)) {
      return rejectRow(rowBase, 'selected-border-accent-not-focus-or-selection-token', 'focusRing')
    }
    return rejectRow(rowBase, 'selected-state-without-matrix-owner', 'selectedSurface')
  }

  if (mechanism === 'active') {
    if (/\.sidebar-tool summary\.is-active|\.sidebar-tool-button\.is-active|\.db-main-actions button\.is-active/.test(owner)) {
      if (f.property === 'background' || f.property === 'background-color') {
        return migrateRow(
          rowBase,
          '--vg-interactive-selected',
          'activeNavigation',
          'Generic active navigation fill may use --vg-interactive-selected without legacy hex equality.',
        )
      }
      if (f.property === 'color') {
        return rejectRow(rowBase, 'matrix-has-no-generic-selected-ink-ledger-owners', 'activeNavigation')
      }
    }
    if ((f.property === 'background' || f.property === 'background-color') && (SELECTED_SURFACE_LITERALS.has(norm) || HOVER_SURFACE_LITERALS.has(norm))) {
      return rejectRow(rowBase, 'active-fill-without-approved-selector', 'activeNavigation')
    }
    if (f.property === 'color' && SELECTED_INK_LITERALS.has(norm)) {
      return rejectRow(rowBase, 'active-ink-without-matrix-owner', 'activeNavigation')
    }
    return rejectRow(rowBase, 'active-state-without-approved-mapping', 'activeNavigation')
  }

  if (mechanism === 'hover') {
    if (f.property === 'color') {
      if (/danger|destructive|remove|delete|error/i.test(owner)) {
        return rejectRow(rowBase, 'destructive-hover-ink')
      }
      return rejectRow(rowBase, 'hover-text-without-interactive-ink-token', 'hoverSurface')
    }
    if (f.property === 'background' || f.property === 'background-color') {
      if (/^#(?:b91c1c|dc2626|991b1b|e06a72)/i.test(lit)) {
        return rejectRow(rowBase, 'destructive-hover-surface')
      }
      if (/^#(?:fff|ffffff|fefefe)$/i.test(lit)) {
        return rejectRow(rowBase, 'white-hover-fill-is-control-surface-not-table-hover', 'hoverSurface')
      }
      const isDocumentOpenHover = /\.document-recent-open:hover|\.document-draft-open:hover/.test(owner)
      if (isDocumentOpenHover) {
        return migrateRow(
          rowBase,
          '--vg-interactive-hover',
          'hoverSurface',
          'File→Open list hovers may use --vg-interactive-hover per approved matrix.',
        )
      }
      const isGenericHoverLiteral =
        HOVER_SURFACE_LITERALS.has(norm) || norm === '#e8f2ff' || CONTROL_HOVER_LITERALS.has(norm)
      if (isGenericHoverLiteral) {
        const isButton =
          /\bbutton\b/.test(owner) &&
          !/tr:hover|tbody|data-table|list-row|menu-item|sidebar-menu li|file-row|browse-item|open-tab-row|result-list|members-list|db-text-prompt-tag|sort-header|pane-tabs|panel-tabs|tab-bar|document-recent|document-draft/.test(
            owner,
          )
        if (isButton || (/\bbutton\b/.test(owner) && CONTROL_HOVER_LITERALS.has(norm))) {
          return migrateRow(
            rowBase,
            '--vg-control-surface-hover',
            'controlHoverSurface',
            'Solid generic button hover may use --vg-control-surface-hover even when the token is a gradient.',
          )
        }
        if (/^button:hover\b|^button:hover:not\(:disabled\)/.test(owner.trim()) || owner.trim() === 'button:hover') {
          return migrateRow(
            rowBase,
            '--vg-control-surface-hover',
            'controlHoverSurface',
            'Shared button:hover gradient stop maps to --vg-control-surface-hover.',
          )
        }
        return migrateRow(
          rowBase,
          '--vg-interactive-hover',
          'hoverSurface',
          'Generic beige or table-hover wash may use --vg-interactive-hover without legacy hex equality.',
        )
      }
    }
    if (/^border/.test(f.property)) {
      return rejectRow(rowBase, 'hover-border-without-control-border-ledger-owner', 'hoverSurface')
    }
  }

  return rejectRow(rowBase, 'interaction-like-owner-without-approved-token-mapping')
}

const GROK_SINGLE_MIGRATE_ID = '8e57e9f2760e4833'

const DEAD_CASCADE_REJECT_IDS = new Set([
  'a013e7885111b605',
  '346337e85ec1262d',
  'ebc9e2df2cebe929',
  '5d23429f8f20f6a6',
  'a8ee5683b0f9a913',
])

const DEAD_CASCADE_REASON =
  'grok-lock: dead-cascade superseded by locked button:hover background migration 8e57e9f2760e4833'

function applyGrokSingleMigrateLock(rows: CandidateRow[]): void {
  for (const row of rows) {
    if (DEAD_CASCADE_REJECT_IDS.has(row.id)) {
      row.disposition = 'reject'
      row.proposedToken = ''
      row.state = ''
      row.rationale = ''
      row.reason = DEAD_CASCADE_REASON
      continue
    }
    if (row.id === GROK_SINGLE_MIGRATE_ID) {
      row.disposition = 'migrate'
      row.proposedToken = '--vg-control-surface-hover'
      row.state = 'controlHoverSurface'
      row.reason = ''
      row.rationale =
        'Replace the entire button:hover background with var(--vg-control-surface-hover); do not nest the token inside the legacy gradient.'
      continue
    }
    if (row.disposition === 'migrate') {
      row.disposition = 'reject'
      row.proposedToken = ''
      row.state = ''
      row.rationale = ''
      row.reason = 'grok-lock: not the single accepted interaction-state migration'
    }
  }
}

function isPlausiblyInteraction(f: ManifestFinding): boolean {
  const o = f.owner
  if (
    /:(hover|focus|focus-visible|active|disabled|checked)|:not\(:disabled\)|\.active\b|\.is-selected\b|\.is-active\b|\.is-open\b|is-submenu|is-changed|is-drop-target|button\.primary\b|\.danger\b|destructive/i.test(
      o,
    )
  ) {
    return true
  }
  return false
}

function summarizeMigrate(rows: CandidateRow[], key: 'state' | 'proposedToken' | 'property' | 'file'): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const row of rows.filter((r) => r.disposition === 'migrate')) {
    const value = row[key]
    counts[value] = (counts[value] ?? 0) + 1
  }
  return counts
}

async function main(): Promise<void> {
  const matrixMigrateById = loadMatrixMigrateById()
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8')) as { findings: ManifestFinding[] }
  const neutral = JSON.parse(await readFile(NEUTRAL_PATH, 'utf8')) as {
    rows: Array<{ id: string; reason: string; disposition: string }>
  }
  const priorInteractionIds = new Set(neutral.rows.filter((r) => r.reason === 'interaction-or-state').map((r) => r.id))

  const needsReview = manifest.findings.filter((f) => f.classification === 'needs-review')
  const byId = new Map<string, ManifestFinding>()
  for (const f of needsReview) {
    if (isPlausiblyInteraction(f) || priorInteractionIds.has(f.id)) {
      byId.set(f.id, f)
    }
  }

  const rows = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id)).map((f) => classifyRow(f, matrixMigrateById))

  applyGrokSingleMigrateLock(rows)

  for (const row of rows) {
    if (row.disposition === 'migrate') {
      if (!INTERACTION_MIGRATE_TOKENS.has(row.proposedToken)) {
        throw new Error(`migrate row ${row.id} uses disallowed token ${row.proposedToken}`)
      }
      if (DISALLOWED_MIGRATE_TOKENS.has(row.proposedToken)) {
        throw new Error(`migrate row ${row.id} uses forbidden token ${row.proposedToken}`)
      }
      if (!row.mechanism || !row.state || !row.rationale) {
        throw new Error(`migrate row ${row.id} missing mechanism/state/rationale`)
      }
    }
    if (row.disposition === 'reject') {
      if (!row.reason) throw new Error(`row ${row.id} missing reason`)
    }
  }

  const migrateRows = rows.filter((r) => r.disposition === 'migrate')
  const rejectRows = rows.filter((r) => r.disposition === 'reject')

  const payload = {
    generatedAt: new Date().toISOString(),
    revisedBy: 'grok-single-migrate-button-hover-background',
    matrixVersion: 1,
    acceptedCount: migrateRows.length,
    stateModel,
    migrateCount: migrateRows.length,
    rejectedCount: rejectRows.length,
    needsManualReviewCount: 0,
    countsByDisposition: {
      migrate: migrateRows.length,
      reject: rejectRows.length,
      'needs-manual-review': 0,
    },
    migrateByState: summarizeMigrate(rows, 'state'),
    migrateByToken: summarizeMigrate(rows, 'proposedToken'),
    migrateByProperty: summarizeMigrate(rows, 'property'),
    migrateByFile: summarizeMigrate(rows, 'file'),
    rows,
  }

  await writeFile(OUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  console.log('Wrote', rows.length, 'rows to', OUT_PATH)
  console.log('migrate', migrateRows.length, 'reject', rejectRows.length)
  console.log('migrateByState', payload.migrateByState)
  console.log('migrateByToken', payload.migrateByToken)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
