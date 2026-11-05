import { describe, expect, it } from 'vitest'
import { createUpdateManifest } from './update-manifest'

describe('update release manifest', () => {
  const signature = Buffer.from('untrusted comment: signature\nx\ntrusted comment: timestamp:1\tfile:app\tversion:1.2.3\nx\n').toString('base64')
  const release = { version: '1.2.3', platform: 'darwin-aarch64', url: 'https://example.com/app.tar.gz', signature }

  it('contains only the platform whose artifact was published', () => {
    expect(createUpdateManifest(release)).toEqual({
      version: '1.2.3',
      platforms: { 'darwin-aarch64': { url: release.url, signature } },
    })
  })

  it('rejects insecure URLs, unsupported targets and mismatched signed versions', () => {
    expect(() => createUpdateManifest({ ...release, url: 'http://example.com/app' })).toThrow()
    expect(() => createUpdateManifest({ ...release, platform: 'windows-portable' })).toThrow()
    expect(() => createUpdateManifest({ ...release, version: '1.2.4' })).toThrow()
    expect(() => createUpdateManifest({ ...release, signature: 'invalid' })).toThrow()
  })
})
