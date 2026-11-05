import { writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function createUpdaterConfig(key) {
  if (!key || !key.trim()) throw new Error('Missing updater public key')
  return { bundle: { createUpdaterArtifacts: true }, plugins: { updater: { pubkey: key } } }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.env.RUNNER_TEMP) throw new Error('Missing RUNNER_TEMP')
  writeFileSync(join(process.env.RUNNER_TEMP, 'vibegene-updater.json'), JSON.stringify(createUpdaterConfig(process.env.VIBEGENE_UPDATER_PUBLIC_KEY)))
}
