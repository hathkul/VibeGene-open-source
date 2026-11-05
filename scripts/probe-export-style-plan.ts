import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { planInboundCleanupRemovals, planInboundConstructSync } from '../src/storage/databaseSync'
import { SEQUENCE_OPEN_EXTENSIONS } from '../src/domain/fileFormats'

const ROOT = '/path/to/your/sequence-files'
const SEQUENCE_EXTS = new Set(SEQUENCE_OPEN_EXTENSIONS.map((e) => e.toLowerCase()))

async function walk(absDir: string, relativeDir: string) {
  const out: Array<{ relativePath: string; mtimeMs: number; contentHash: string }> = []
  for (const entry of await readdir(absDir, { withFileTypes: true })) {
    const name = entry.name
    if (!name || name.startsWith('.')) continue
    const abs = path.join(absDir, name)
    const rel = relativeDir ? `${relativeDir}/${name}` : name
    if (entry.isDirectory()) {
      out.push(...(await walk(abs, rel.replace(/\\/g, '/'))))
      continue
    }
    const lower = name.toLowerCase()
    if (lower === 'vibegene-database.json' || lower.endsWith('.txt') || lower.endsWith('.json')) continue
    const dot = lower.lastIndexOf('.')
    if (dot < 0 || !SEQUENCE_EXTS.has(lower.slice(dot))) continue
    const buf = await readFile(abs)
    const info = await stat(abs)
    out.push({
      relativePath: rel.replace(/\\/g, '/'),
      mtimeMs: info.mtimeMs,
      contentHash: createHash('sha256').update(buf).digest('hex'),
    })
  }
  return out
}

async function main() {
  const diskFiles = await walk(ROOT, '')
  for (const file of ['/tmp/vg-export-style-library.json', '/tmp/vg-export-only-library.json', '/tmp/vg-scoped-library.json']) {
    const library = JSON.parse(readFileSync(file, 'utf8')) as Array<{
      projectId: string
      relativePath: string
      syncRelativePath?: string | null
      syncSourceHash?: string | null
    }>
    const libFiles = library.map((p) => ({
      projectId: p.projectId,
      relativePath: p.relativePath,
      syncRelativePath: p.syncRelativePath ?? null,
      syncSourceHash: p.syncSourceHash ?? null,
    }))
    const plan = planInboundConstructSync(diskFiles, libFiles, '2026-08-13T15:33:22.236Z')
    const adds = plan.actions.filter((a) => a.kind === 'add')
    const updates = plan.actions.filter((a) => a.kind === 'update')
    const removals = planInboundCleanupRemovals(diskFiles, libFiles, plan.matchedProjectIds)
    console.log(file, {
      lib: library.length,
      add: adds.length,
      update: updates.length,
      skip: plan.skippedUnchanged,
      dup: plan.skippedDuplicates,
      remove: removals.length,
      work: adds.length + updates.length + removals.length + 363,
    })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
