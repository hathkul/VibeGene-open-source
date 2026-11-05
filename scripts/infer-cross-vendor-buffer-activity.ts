/**
 * Read src/data/enzymes.json and write inferred cross-vendor buffer activity.
 *
 * Model: scripts/crossVendorBufferActivity.ts (salt×pH×anion interpolation
 * from native empirical charts onto published 1X foreign compositions).
 *
 * Usage: npx tsx scripts/infer-cross-vendor-buffer-activity.ts
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { RestrictionEnzyme } from '../src/domain/types.ts'
import { compactCatalogOutput, inferCatalog } from './crossVendorBufferActivity.ts'

const root = dirname(fileURLToPath(import.meta.url))
const catalogPath = join(root, '../src/data/enzymes.json')
const matrixPath = join(root, 'inferred-cross-vendor-buffer-activity.json')
const summaryPath = join(root, 'inferred-cross-vendor-buffer-activity-summary.json')

const enzymes = JSON.parse(readFileSync(catalogPath, 'utf8')) as RestrictionEnzyme[]
const result = inferCatalog(enzymes)

writeFileSync(matrixPath, `${JSON.stringify(compactCatalogOutput(result))}\n`)
writeFileSync(summaryPath, `${JSON.stringify(result.summary, null, 2)}\n`)

const { summary } = result
console.log(
  JSON.stringify(
    {
      wrote: [matrixPath, summaryPath],
      catalogEnzymes: summary.catalogEnzymes,
      manufacturerProfiles: summary.manufacturerProfiles,
      profilesWithEnoughPoints: summary.profilesWithEnoughPoints,
      inferenceCount: summary.inferenceCount,
      proprietarySkipCount: summary.proprietarySkipCount,
      validation: summary.validation,
    },
    null,
    2,
  ),
)
