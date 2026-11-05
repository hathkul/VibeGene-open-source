import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findThemeMigrationDeclarations } from './plan-theme-migration.ts'

const ROOT = resolve(import.meta.dirname, '..')
const CANDIDATES_PATH = resolve(import.meta.dirname, 'interactive-state-candidates.json')
const APP_CSS_PATH = resolve(ROOT, 'src/App.css')

const LOCKED_MIGRATE_ID = '8e57e9f2760e4833'
const LOCKED_OWNER = 'button:hover'
const LOCKED_PROPERTY = 'background'
const LOCKED_TOKEN = '--vg-control-surface-hover'

describe('interactive state applied migrations', () => {
  const candidates = JSON.parse(readFileSync(CANDIDATES_PATH, 'utf8')) as {
    rows: Array<{ id: string; disposition: string; proposedToken: string; owner: string; property: string }>
  }
  const migrateRows = candidates.rows.filter((row) => row.disposition === 'migrate')
  const css = readFileSync(APP_CSS_PATH, 'utf8')

  it('replaces the full button:hover background with the control hover token', () => {
    expect(migrateRows.map((row) => row.id)).toEqual([LOCKED_MIGRATE_ID])
    const row = migrateRows[0]!
    expect(row.proposedToken).toBe(LOCKED_TOKEN)
    expect(row.owner).toBe(LOCKED_OWNER)
    expect(row.property).toBe(LOCKED_PROPERTY)

    expect(css).not.toMatch(/button:hover\s*\{[^}]*linear-gradient\s*\(\s*#ffffff\s*,\s*#cfe4fb\s*\)/s)
    expect(css).not.toMatch(/linear-gradient\s*\([^)]*var\(\s*--vg-control-surface-hover\s*\)/i)

    const matches = findThemeMigrationDeclarations(css, LOCKED_OWNER, LOCKED_PROPERTY, 'src/App.css')
    expect(matches).toHaveLength(1)
    expect(matches[0]!.value).toBe(`var(${LOCKED_TOKEN})`)
  })
})
