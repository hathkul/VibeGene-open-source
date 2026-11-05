#!/usr/bin/env node

import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { computeThemeClosureAccounting } from './theme-closure-accounting.ts'

const OUT_PATH = resolve(import.meta.dirname, 'theme-closure-accounting.json')

async function main(): Promise<void> {
  const payload = await computeThemeClosureAccounting()
  await writeFile(OUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  console.log('enforced dispositions', payload.enforcedDispositionTotals)
  console.log('non-scientific raw outcomes', payload.nonScientificRawOutcomeTotals)
  console.log('baseline identity', payload.baselineIdentity)
  console.log('groups', payload.groups.length)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
