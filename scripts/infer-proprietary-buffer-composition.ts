/**
 * Infer probable 1X compositions of unpublished proprietary restriction buffers
 * by inverting inferTargetActivity against native activity charts.
 *
 * Usage: npx tsx scripts/infer-proprietary-buffer-composition.ts
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { RestrictionEnzyme } from '../src/domain/types.ts'
import {
  compactFitOutput,
  fitProprietaryCatalog,
  formatGuess,
} from '../src/domain/proprietaryBufferComposition.ts'

const root = dirname(fileURLToPath(import.meta.url))
const catalogPath = join(root, '../src/data/enzymes.json')
const outPath = join(root, 'inferred-proprietary-buffer-composition.json')

const enzymes = JSON.parse(readFileSync(catalogPath, 'utf8')) as RestrictionEnzyme[]
const result = fitProprietaryCatalog(enzymes)
const compact = compactFitOutput(result)

writeFileSync(outPath, `${JSON.stringify(compact, null, 2)}\n`)

const summary = result.buffers.map((entry) => ({
  id: entry.id,
  nEnzymes: entry.nEnzymes,
  mae: entry.mae,
  holdoutMae: entry.holdoutMae,
  holdoutMethod: entry.holdoutMethod,
  confidence: entry.confidence,
  analogPublishedBuffer: entry.analogPublishedBuffer,
  best: entry.best ? formatGuess(entry.best) : null,
  tyingIonRecipes: entry.tyingIonRecipes,
  examples: entry.examples,
}))

console.log(JSON.stringify({ wrote: outPath, buffers: summary }, null, 2))
