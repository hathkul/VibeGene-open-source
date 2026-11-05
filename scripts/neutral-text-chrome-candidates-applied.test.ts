import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { scanProject } from './check-theme-colors.ts'
import { findThemeMigrationDeclarations, type ThemeMigrationLedger } from './plan-theme-migration.ts'

const ROOT = resolve(import.meta.dirname, '..')
const CANDIDATES_PATH = resolve(import.meta.dirname, 'neutral-text-chrome-candidates.json')
const LEDGER_PATH = resolve(import.meta.dirname, 'theme-migration-ledger.json')
const LOCKED_ACCEPTED_COUNT = 85

const PRODUCTION_STYLE_EXTENSIONS = new Set(['.css', '.scss', '.sass'])

type AcceptedRow = {
  id: string
  file: string
  owner: string
  property: string
  literal: string
  proposedToken: string
  disposition: string
}

function readLedger(): ThemeMigrationLedger {
  return JSON.parse(readFileSync(LEDGER_PATH, 'utf8')) as ThemeMigrationLedger
}

/** Unique production style paths for all accepted rows; fails closed on bad or missing paths. */
export function deriveAcceptedMigrationFiles(accepted: AcceptedRow[]): string[] {
  const byRow = new Set(accepted.map((row) => row.file))
  const files = [...byRow].sort()
  expect(files.length).toBeGreaterThan(0)
  for (const row of accepted) {
    expect(byRow.has(row.file), `accepted row ${row.id} file not in derived set`).toBe(true)
  }
  for (const file of files) {
    expect(file.startsWith('src/'), `${file} must live under src/`).toBe(true)
    expect(file.startsWith('scripts/') || file.startsWith('tests/') || file.startsWith('dist/'), `${file} must not be scripts/tests/dist`).toBe(false)
    expect(file.includes('/tests/') || file.includes('/test-support/'), `${file} must not be test output`).toBe(false)
    const extension = file.slice(file.lastIndexOf('.'))
    expect(PRODUCTION_STYLE_EXTENSIONS.has(extension), `${file} must be a production stylesheet`).toBe(true)
    expect(existsSync(resolve(ROOT, file)), `${file} must exist on disk`).toBe(true)
  }
  return files
}

describe('neutral text chrome applied migrations', () => {
  const candidates = JSON.parse(readFileSync(CANDIDATES_PATH, 'utf8')) as { acceptedCount: number; rows: AcceptedRow[] }
  const accepted = candidates.rows.filter((row) => row.disposition === 'migrate')
  const rejectedIds = new Set(candidates.rows.filter((row) => row.disposition === 'reject').map((row) => row.id))

  it('keeps the locked accepted count aligned with the candidate ledger', () => {
    expect(candidates.acceptedCount).toBe(LOCKED_ACCEPTED_COUNT)
    expect(accepted.length).toBe(LOCKED_ACCEPTED_COUNT)
  })

  it(
    'migrates every accepted row to its locked token without touching rejected candidate literals',
    async () => {
      const migrationFiles = deriveAcceptedMigrationFiles(accepted)
      expect(new Set(migrationFiles)).toEqual(new Set(accepted.map((row) => row.file)))

      const ledger = readLedger()
      const cssByFile = new Map<string, string>()
      for (const file of migrationFiles) {
        cssByFile.set(file, readFileSync(resolve(ROOT, file), 'utf8'))
      }
      expect([...cssByFile.keys()].sort()).toEqual(migrationFiles)

      const ledgerById = new Map([
        ...ledger.app.entries.map((entry) => [entry.id, entry] as const),
        ...ledger.pickPrimers.entries.map((entry) => [entry.id, entry] as const),
      ])
      const acceptedIds = new Set(accepted.map((row) => row.id))

      for (const row of accepted) {
        expect(migrationFiles, `scan list missing ${row.file}`).toContain(row.file)
        const ledgerEntry = ledgerById.get(row.id)
        expect(ledgerEntry, `missing ledger entry ${row.id}`).toBeDefined()
        expect(ledgerEntry!.token).toBe(row.proposedToken)

        const css = cssByFile.get(row.file)
        expect(css, `production CSS not loaded for ${row.file}`).toBeDefined()
        const appEntry = ledger.app.entries.find((entry) => entry.id === row.id)
        if (appEntry?.postMigration) {
          const contract = appEntry.postMigration
          const ownerParts = contract.currentOwner.includes(',')
            ? contract.currentOwner.split(',').map((part) => part.trim())
            : [contract.currentOwner]
          let matches = findThemeMigrationDeclarations(css!, contract.currentOwner, contract.currentProperty, row.file)
          if (matches.length === 0 && ownerParts.length > 1) {
            matches = ownerParts.flatMap((owner) => findThemeMigrationDeclarations(css!, owner, contract.currentProperty, row.file))
          }
          const current = matches.find((match) => match.anchor === contract.currentAnchor) ?? matches[contract.currentOccurrence]
          expect(current, `missing declaration ${row.id}`).toBeDefined()
          expect(current!.value.replace(/\s+/g, ' ').trim()).toBe(contract.currentValue.replace(/\s+/g, ' ').trim())
        } else {
          const pickEntry = ledger.pickPrimers.entries.find((entry) => entry.id === row.id)
          expect(pickEntry?.token).toBe(row.proposedToken)
          const ownerParts = row.owner.includes(',') ? row.owner.split(',').map((part) => part.trim()) : [row.owner]
          const matches = ownerParts.flatMap((owner) => findThemeMigrationDeclarations(css!, owner, row.property, row.file))
          const migrated = matches.find((match) => match.value.includes(`var(${row.proposedToken})`))
          expect(migrated, `missing PickPrimers declaration ${row.id}`).toBeDefined()
          expect(migrated!.value.includes(row.literal), `literal still present ${row.id}`).toBe(false)
        }
      }

      const raw = await scanProject({ rootDir: ROOT, mode: 'raw', files: migrationFiles })
      const scannedFiles = [...new Set(raw.map((finding) => finding.file))].sort()
      for (const file of migrationFiles) {
        expect(scannedFiles, `raw scan omitted ${file}`).toContain(file)
      }
      expect(scannedFiles.every((file) => migrationFiles.includes(file)), 'raw scan included unrelated files').toBe(true)

      for (const finding of raw) {
        if (acceptedIds.has(finding.id)) {
          expect.fail(`accepted id still raw ${finding.id}`)
        }
      }

      for (const row of accepted) {
        expect(rejectedIds.has(row.id)).toBe(false)
      }
    },
    20_000,
  )
})
