/**
 * Plan inbound sync using live IndexedDB library dump + real VectorNTI folder.
 * Usage: npx tsx scripts/probe-live-idb-plan.ts
 */
import { createHash } from 'node:crypto'
import { readFile, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { planInboundCleanupRemovals, planInboundConstructSync } from '../src/storage/databaseSync'
import { SEQUENCE_OPEN_EXTENSIONS } from '../src/domain/fileFormats'

const ROOT = '/path/to/your/sequence-files'
const LIBRARY_JSON = '/tmp/vg-live-library.json'
const SEQUENCE_EXTS = new Set(SEQUENCE_OPEN_EXTENSIONS.map((e) => e.toLowerCase()))

async function walk(absDir: string, relativeDir: string) {
  const out: Array<{ relativePath: string; mtimeMs: number; contentHash: string }> = []
  const entries = await readdir(absDir, { withFileTypes: true })
  for (const entry of entries) {
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

async function countTxt(absDir: string): Promise<number> {
  let n = 0
  const entries = await readdir(absDir, { withFileTypes: true })
  for (const entry of entries) {
    const abs = path.join(absDir, entry.name)
    if (entry.isDirectory()) n += await countTxt(abs)
    else if (entry.name.toLowerCase().endsWith('.txt')) n += 1
  }
  return n
}

async function main() {
  const library = JSON.parse(await readFile(LIBRARY_JSON, 'utf8')) as Array<{
    projectId: string
    relativePath: string
    syncRelativePath: string | null
    syncSourceHash: string | null
  }>
  console.log('Scanning disk…')
  const diskFiles = await walk(ROOT, '')
  const txts = await countTxt(ROOT)
  console.log('disk', diskFiles.length, 'library', library.length, 'txt', txts)

  const libFiles = library.map((p) => ({
    projectId: p.projectId,
    relativePath: p.relativePath,
    syncRelativePath: p.syncRelativePath,
    syncSourceHash: p.syncSourceHash,
  }))

  const plan = planInboundConstructSync(diskFiles, libFiles, new Date().toISOString())
  const adds = plan.actions.filter((a) => a.kind === 'add')
  const updates = plan.actions.filter((a) => a.kind === 'update')
  const removals = planInboundCleanupRemovals(diskFiles, libFiles, plan.matchedProjectIds)

  const summary = {
    add: adds.length,
    update: updates.length,
    skipUnchanged: plan.skippedUnchanged,
    skipDup: plan.skippedDuplicates,
    remove: removals.length,
    matched: plan.matchedProjectIds.length,
    workTotal: adds.length + updates.length + removals.length + txts,
    sampleAdds: adds.slice(0, 30).map((a) => a.relativePath),
  }
  console.log(summary)
  await writeFile('/tmp/vg-live-plan.json', JSON.stringify(summary, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
