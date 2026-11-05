import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const SUPPORTED_PLATFORMS = new Set([
  'darwin-aarch64', 'darwin-x86_64', 'windows-x86_64',
  'linux-x86_64', 'linux-aarch64',
])

/** Build one platform's manifest only after its signed release is available. */
export function createUpdateManifest(input: {
  version: string; platform: string; url: string; signature: string; notes?: string
}) {
  const version = input.version.replace(/^v/, '')
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error('Invalid release version')
  if (!SUPPORTED_PLATFORMS.has(input.platform)) throw new Error('Unsupported update platform')
  const url = new URL(input.url)
  if (url.protocol !== 'https:') throw new Error('Update packages must use HTTPS')
  const signature = input.signature.trim()
  const decoded = Buffer.from(signature, 'base64').toString('utf8')
  const comment = decoded.split('\n').find((line) => line.startsWith('trusted comment:'))
  if (!comment?.split('\t').includes(`version:${version}`)) {
    throw new Error('Updater signature does not contain the matching signed version')
  }
  return {
    version,
    ...(input.notes ? { notes: input.notes } : {}),
    platforms: { [input.platform]: { url: url.href, signature } },
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [version, platform, url, signaturePath, outputPath, notesPath] = process.argv.slice(2)
  if (!version || !platform || !url || !signaturePath || !outputPath) {
    throw new Error('Usage: tsx scripts/update-manifest.ts VERSION PLATFORM URL SIGNATURE_FILE OUTPUT_FILE [NOTES_FILE]')
  }
  const manifest = createUpdateManifest({
    version, platform, url,
    signature: readFileSync(signaturePath, 'utf8'),
    notes: notesPath ? readFileSync(notesPath, 'utf8').trim() : undefined,
  })
  writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' })
}
