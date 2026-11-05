/**
 * Offline probe: plan inbound Sync against the real VectorNTI folder + export manifest.
 * Usage: npx tsx scripts/probe-inbound-sync-plan.ts [folder]
 */
import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import {
  constructSyncKey,
  planInboundCleanupRemovals,
  planInboundConstructSync,
  sequenceFileStem,
} from '../src/storage/databaseSync'
import { SEQUENCE_OPEN_EXTENSIONS } from '../src/domain/fileFormats'

const ROOT =
  process.argv[2] ||
  '/path/to/your/sequence-files'

const SEQUENCE_EXTS = new Set(SEQUENCE_OPEN_EXTENSIONS.map((e) => e.toLowerCase()))

function isSequence(name: string) {
  const lower = name.toLowerCase()
  if (lower === 'vibegene-database.json') return false
  if (lower.endsWith('.txt') || lower.endsWith('.json')) return false
  const dot = lower.lastIndexOf('.')
  if (dot < 0) return false
  return SEQUENCE_EXTS.has(lower.slice(dot))
}

async function walk(absDir: string, relativeDir: string): Promise<
  Array<{ relativePath: string; mtimeMs: number; contentHash: string; bytes: number }>
> {
  const out: Array<{ relativePath: string; mtimeMs: number; contentHash: string; bytes: number }> = []
  const entries = await readdir(absDir, { withFileTypes: true })
  for (const entry of entries) {
    const name = entry.name
    if (!name || name === '.' || name === '..') continue
    const abs = path.join(absDir, name)
    const rel = relativeDir ? `${relativeDir}/${name}` : name
    if (entry.isDirectory()) {
      out.push(...(await walk(abs, rel.replace(/\\/g, '/'))))
      continue
    }
    if (!isSequence(name)) continue
    const buf = await readFile(abs)
    const info = await stat(abs)
    out.push({
      relativePath: rel.replace(/\\/g, '/'),
      mtimeMs: info.mtimeMs,
      contentHash: createHash('sha256').update(buf).digest('hex'),
      bytes: buf.byteLength,
    })
  }
  return out
}

async function main() {
  console.log('Scanning', ROOT)
  const diskFiles = await walk(ROOT, '')
  console.log('Disk sequence files:', diskFiles.length)

  const manifestRaw = await readFile(path.join(ROOT, 'vibegene-database.json'), 'utf8')
  const manifest = JSON.parse(manifestRaw) as {
    projects: Array<{ id: string; relativePath: string; name: string; constructName?: string }>
  }
  console.log('Manifest projects:', manifest.projects.length)

  // Simulate library as export paths only (no syncRelativePath / syncSourceHash),
  // which is the worst case after name≠filename imports.
  const libraryNoMeta = manifest.projects.map((project) => ({
    projectId: project.id,
    relativePath: project.relativePath,
  }))

  const planNoMeta = planInboundConstructSync(diskFiles, libraryNoMeta, new Date().toISOString())
  const addsNoMeta = planNoMeta.actions.filter((a) => a.kind === 'add')
  const updatesNoMeta = planNoMeta.actions.filter((a) => a.kind === 'update')
  const removalsNoMeta = planInboundCleanupRemovals(diskFiles, libraryNoMeta, planNoMeta.matchedProjectIds)

  console.log('\n=== Library = manifest paths only (no hash / syncRelativePath) ===')
  console.log({
    add: addsNoMeta.length,
    update: updatesNoMeta.length,
    skip: planNoMeta.skippedUnchanged,
    dup: planNoMeta.skippedDuplicates,
    remove: removalsNoMeta.length,
    matched: planNoMeta.matchedProjectIds.length,
  })

  // Simulate after hashes were learned from preferred disk file per matched key.
  // For each path-matched pair, attach disk hash; for unmatched, leave empty.
  const libraryByKey = new Map<string, (typeof libraryNoMeta)[0]>()
  for (const row of libraryNoMeta) {
    const key = constructSyncKey(row.relativePath)
    if (!libraryByKey.has(key)) libraryByKey.set(key, row)
  }
  const diskByKey = new Map<string, (typeof diskFiles)[0]>()
  for (const file of diskFiles) {
    const key = constructSyncKey(file.relativePath)
    // prefer first; real code prefers .dna — approximate by keeping .dna if seen
    const existing = diskByKey.get(key)
    if (!existing) diskByKey.set(key, file)
    else if (file.relativePath.toLowerCase().endsWith('.dna')) diskByKey.set(key, file)
  }

  const libraryWithHash = libraryNoMeta.map((row) => {
    const key = constructSyncKey(row.relativePath)
    const disk = diskByKey.get(key)
    return {
      ...row,
      syncSourceHash: disk?.contentHash ?? null,
      syncRelativePath: disk?.relativePath ?? null,
    }
  })

  const planHashed = planInboundConstructSync(diskFiles, libraryWithHash, new Date().toISOString())
  const addsHashed = planHashed.actions.filter((a) => a.kind === 'add')
  const updatesHashed = planHashed.actions.filter((a) => a.kind === 'update')
  const removalsHashed = planInboundCleanupRemovals(diskFiles, libraryWithHash, planHashed.matchedProjectIds)

  console.log('\n=== Library = path-matched hashes/paths filled where keys align ===')
  console.log({
    add: addsHashed.length,
    update: updatesHashed.length,
    skip: planHashed.skippedUnchanged,
    remove: removalsHashed.length,
    matched: planHashed.matchedProjectIds.length,
  })

  // Sample mismatches: disk keys not in library export keys
  const libKeys = new Set(libraryNoMeta.map((p) => constructSyncKey(p.relativePath)))
  const unmatchedDisk = addsNoMeta.slice(0, 15).map((a) => {
    const disk = diskFiles.find((d) => constructSyncKey(d.relativePath) === a.key)
    return {
      disk: disk?.relativePath,
      key: a.key,
      nearbyLib: [...libKeys].filter((k) => k.split('/').pop() === a.key.split('/').pop()).slice(0, 3),
    }
  })
  console.log('\nSample unmatched disk (no-meta plan adds):')
  console.log(JSON.stringify(unmatchedDisk, null, 2))

  // How often export basename ≠ any disk basename in same folder
  let nameMismatch = 0
  let pathMatch = 0
  for (const project of manifest.projects) {
    const key = constructSyncKey(project.relativePath)
    if (diskByKey.has(key)) pathMatch += 1
    else nameMismatch += 1
  }
  console.log('\nManifest path key vs disk:', { pathMatch, nameMismatch })

  // Stem-only collisions across folders
  const stemCount = new Map<string, number>()
  for (const file of diskFiles) {
    const stem = sequenceFileStem(file.relativePath.split('/').pop() || '').toLowerCase()
    stemCount.set(stem, (stemCount.get(stem) || 0) + 1)
  }
  const multiStem = [...stemCount.values()].filter((n) => n > 1).length
  console.log('Disk basename stems appearing more than once (any folder):', multiStem)

  // Why lib-only don't match: compare folder contents
  const libOnly = manifest.projects
    .map((project) => ({
      relativePath: project.relativePath,
      name: project.constructName || project.name,
      key: constructSyncKey(project.relativePath),
    }))
    .filter((row) => !diskByKey.has(row.key))

  console.log('\nSample lib-only vs disk files in same folder:')
  for (const row of libOnly.slice(0, 12)) {
    const dir = row.relativePath.includes('/')
      ? row.relativePath.slice(0, row.relativePath.lastIndexOf('/'))
      : ''
    const diskInDir = diskFiles
      .filter((d) => {
        const ddir = d.relativePath.includes('/')
          ? d.relativePath.slice(0, d.relativePath.lastIndexOf('/'))
          : ''
        return ddir.toLowerCase() === dir.toLowerCase()
      })
      .map((d) => d.relativePath.split('/').pop())
      .slice(0, 10)
    const libStem = sequenceFileStem(row.relativePath.split('/').pop() || '')
    const nameStem = sequenceFileStem(row.name)
    console.log(
      JSON.stringify({
        libPath: row.relativePath,
        libName: row.name,
        libStem,
        nameStem,
        diskFilesInFolder: diskInDir,
      }),
    )
  }

  // Can we rematch lib-only to disk-only by same folder + fuzzy name?
  const diskOnly = addsNoMeta.map((a) => {
    const disk = diskFiles.find((d) => constructSyncKey(d.relativePath) === a.key)!
    return disk
  })
  let rematchByFolderStem = 0
  const usedDisk = new Set<string>()
  for (const lib of libOnly) {
    const dir = lib.relativePath.includes('/')
      ? lib.relativePath.slice(0, lib.relativePath.lastIndexOf('/')).toLowerCase()
      : ''
    const candidates = diskOnly.filter((d) => {
      if (usedDisk.has(d.relativePath)) return false
      const ddir = d.relativePath.includes('/')
        ? d.relativePath.slice(0, d.relativePath.lastIndexOf('/')).toLowerCase()
        : ''
      return ddir === dir
    })
    const libStem = sequenceFileStem(lib.name).toLowerCase()
    const hit = candidates.find((d) => {
      const stem = sequenceFileStem(d.relativePath.split('/').pop() || '').toLowerCase()
      return stem === libStem || stem.includes(libStem) || libStem.includes(stem)
    })
    if (hit) {
      rematchByFolderStem += 1
      usedDisk.add(hit.relativePath)
    }
  }
  console.log('\nFuzzy rematch lib-name stem ↔ disk stem in same folder:', rematchByFolderStem, '/', libOnly.length)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
