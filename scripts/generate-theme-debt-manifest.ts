#!/usr/bin/env node

/** Produce a review candidate without rewriting authoritative ownership files. */

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { scanProject, type ThemeFinding } from './check-theme-colors.ts'

type Classification = 'ui-debt' | 'scientific-data' | 'test-fixture' | 'dead-or-shadowed' | 'specialized-state' | 'needs-review'

export type ThemeDebtEntry = {
  id: string
  file: string
  kind: ThemeFinding['kind']
  property: string
  literal: string
  locator: ThemeFinding['locator']
  owner: string
  classification: Classification
  rationale: string
  reviewStatus: 'reviewed' | 'needs-review'
}

type Candidate = {
  version: 1
  generatedBy: string
  authoritativeManifest: string
  findings: ThemeDebtEntry[]
  staleReviewedRows: ThemeDebtEntry[]
}

const SCRIPT_DIR = new URL('.', import.meta.url).pathname
const ROOT_DIR = resolve(SCRIPT_DIR, '..')
const MANIFEST_PATH = resolve(SCRIPT_DIR, 'theme-debt-manifest.json')
const CANDIDATE_PATH = resolve(SCRIPT_DIR, 'theme-debt-manifest.candidate.json')

export type ThemeDebtCandidateOptions = {
  rootDir?: string
  manifestPath?: string
  candidatePath?: string
}

function identity(finding: Pick<ThemeFinding, 'id' | 'file' | 'kind' | 'property' | 'literal' | 'locator'>): string {
  return JSON.stringify([finding.id, finding.file, finding.kind, finding.property, finding.literal, finding.locator.owner, finding.locator.anchor])
}

function needsReview(finding: ThemeFinding, reason: string): ThemeDebtEntry {
  return {
    id: finding.id,
    file: finding.file,
    kind: finding.kind,
    property: finding.property,
    literal: finding.literal,
    locator: finding.locator,
    owner: finding.locator.owner,
    classification: 'needs-review',
    rationale: reason,
    reviewStatus: 'needs-review',
  }
}

export async function generateCandidate(options: ThemeDebtCandidateOptions = {}): Promise<Candidate> {
  const raw = await scanProject({ rootDir: options.rootDir ?? ROOT_DIR, mode: 'raw' })
  const manifestPath = options.manifestPath ?? MANIFEST_PATH
  const candidatePath = options.candidatePath ?? CANDIDATE_PATH
  const existing = JSON.parse(await readFile(manifestPath, 'utf8')) as { findings: ThemeDebtEntry[] }
  const existingById = new Map(existing.findings.map((entry) => [entry.id, entry]))
  const candidateFindings = raw.map((finding) => {
    const prior = existingById.get(finding.id)
    if (prior && identity(prior) === identity(finding)) return prior
    return needsReview(finding, prior
      ? 'Structural locator drifted; re-review the ownership before updating the authoritative row.'
      : 'New raw finding has no exact reviewed owner; classify it before granting an exemption or migration.')
  })
  const rawIds = new Set(raw.map((finding) => finding.id))
  const staleReviewedRows = existing.findings.filter((entry) => !rawIds.has(entry.id))
  const candidate: Candidate = {
    version: 1,
    generatedBy: 'tsx scripts/generate-theme-debt-manifest.ts --candidate',
    authoritativeManifest: 'scripts/theme-debt-manifest.json',
    findings: candidateFindings,
    staleReviewedRows,
  }
  await writeFile(candidatePath, `${JSON.stringify(candidate, null, 2)}\n`, 'utf8')
  return candidate
}

async function main(argv = process.argv.slice(2)): Promise<void> {
  if (!argv.includes('--candidate')) throw new Error('Refusing to rewrite authoritative theme debt. Use --candidate to write scripts/theme-debt-manifest.candidate.json.')
  const candidate = await generateCandidate()
  console.log(`Wrote review candidate with ${candidate.findings.length} findings and ${candidate.staleReviewedRows.length} stale reviewed rows; authoritative files were not changed.`)
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  main().catch((error: unknown) => { console.error(error); process.exitCode = 1 })
}
