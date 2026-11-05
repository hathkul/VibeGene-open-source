import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { scanProject, scanSource } from './check-theme-colors.ts'
import { checkThemeDebt } from './check-theme-debt.ts'
import { generateCandidate, type ThemeDebtEntry } from './generate-theme-debt-manifest.ts'

const temporaryRoots: string[] = []

async function fixtureRoot(literal = '#111'): Promise<{ root: string; manifestPath: string; registryPath: string; candidatePath: string; finding: ThemeDebtEntry }> {
  const root = await mkdtemp(join(tmpdir(), 'vibegene-theme-debt-'))
  temporaryRoots.push(root)
  await (await import('node:fs/promises')).mkdir(join(root, 'src'))
  await writeFile(join(root, 'src', 'example.css'), `.button { color: ${literal}; }\n`)
  const [finding] = await scanProject({ rootDir: root, mode: 'raw' })
  const manifestPath = join(root, 'manifest.json')
  const registryPath = join(root, 'registry.json')
  const candidatePath = join(root, 'candidate.json')
  const entry: ThemeDebtEntry = {
    id: finding.id,
    file: finding.file,
    kind: finding.kind,
    property: finding.property,
    literal: finding.literal,
    locator: finding.locator,
    owner: finding.locator.owner,
    classification: 'needs-review',
    rationale: 'Reviewed unresolved theme debt in src/example.css owner .button; retain the literal until its UI/data ownership is migrated.',
    reviewStatus: 'reviewed',
  }
  await writeFile(manifestPath, JSON.stringify({ version: 1, findings: [entry] }))
  await writeFile(registryPath, JSON.stringify({ version: 1, findings: [] }))
  return { root, manifestPath, registryPath, candidatePath, finding: entry }
}

afterAll(async () => {
  const { rm } = await import('node:fs/promises')
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })))
})

describe('theme debt ownership manifest', () => {
  it('covers every raw finding with exact reviewed ownership', async () => {
    const result = await checkThemeDebt()
    expect(result.rawCount).toBe(278)
    expect(result.registryCount).toBe(278)
    expect(result.classificationCounts).toEqual({
      'scientific-data': 278,
    })
  }, 15_000)

  it('rejects a new literal until authoritative ownership is reviewed', async () => {
    const fixture = await fixtureRoot()
    await writeFile(join(fixture.root, 'src', 'example.css'), '.button { color: #222; }\n')
    await expect(checkThemeDebt({ rootDir: fixture.root, manifestPath: fixture.manifestPath, registryPath: fixture.registryPath })).rejects.toThrow(/stale manifest|missing manifest|locator or literal drift/)
  })

  it('candidate generation preserves authoritative files and marks new rows unreviewed', async () => {
    const fixture = await fixtureRoot()
    const before = await readFile(fixture.manifestPath, 'utf8')
    await writeFile(join(fixture.root, 'src', 'example.css'), '.button { color: #222; }\n')
    const candidate = await generateCandidate({ rootDir: fixture.root, manifestPath: fixture.manifestPath, candidatePath: fixture.candidatePath })
    expect(candidate.findings[0]?.reviewStatus).toBe('needs-review')
    expect(await readFile(fixture.manifestPath, 'utf8')).toBe(before)
    await expect(checkThemeDebt({ rootDir: fixture.root, manifestPath: fixture.manifestPath, registryPath: fixture.registryPath })).rejects.toThrow()
  })

  it('rejects stale and explicitly unreviewed rows', async () => {
    const fixture = await fixtureRoot()
    const manifest = JSON.parse(await readFile(fixture.manifestPath, 'utf8')) as { version: number; findings: ThemeDebtEntry[] }
    manifest.findings[0]!.reviewStatus = 'needs-review'
    await writeFile(fixture.manifestPath, JSON.stringify(manifest))
    await expect(checkThemeDebt({ rootDir: fixture.root, manifestPath: fixture.manifestPath, registryPath: fixture.registryPath })).rejects.toThrow(/unreviewed row/)
    manifest.findings[0]!.reviewStatus = 'reviewed'
    manifest.findings.push({ ...fixture.finding, id: 'stale-row' })
    await writeFile(fixture.manifestPath, JSON.stringify(manifest))
    await expect(checkThemeDebt({ rootDir: fixture.root, manifestPath: fixture.manifestPath, registryPath: fixture.registryPath })).rejects.toThrow(/stale manifest row/)
  })

  it('rejects boilerplate scientific rationale', async () => {
    const fixture = await fixtureRoot()
    const manifest = JSON.parse(await readFile(fixture.manifestPath, 'utf8')) as { version: number; findings: ThemeDebtEntry[] }
    manifest.findings[0]!.classification = 'scientific-data'
    await writeFile(fixture.manifestPath, JSON.stringify(manifest))
    await writeFile(fixture.registryPath, JSON.stringify({
      version: 1,
      findings: [{ ...fixture.finding, biologicalReason: `Reviewed ${fixture.finding.file} owner ${fixture.finding.owner}: this exact color literal is part of the biological record or workflow palette encoded by that declaration.` }],
    }))
    await expect(checkThemeDebt({ rootDir: fixture.root, manifestPath: fixture.manifestPath, registryPath: fixture.registryPath })).rejects.toThrow(/generic biological reason/)
  })

  it('keeps structural IDs stable across formatting and distinguishes ownership changes', () => {
    const oneLine = scanSource('src/example.css', '.button { color: #111; }', 'raw')[0]!
    const multiLine = scanSource('src/example.css', '.button {\n  color: #111;\n}', 'raw')[0]!
    const changedProperty = scanSource('src/example.css', '.button { background: #111; }', 'raw')[0]!
    expect(multiLine.id).toBe(oneLine.id)
    expect(changedProperty.id).not.toBe(oneLine.id)
    expect(multiLine.locator.owner).toBe('.button')
  })
})
