import { describe, expect, it } from 'vitest'
import { createUpdaterConfig } from './create-updater-config.mjs'

describe('signed updater build configuration', () => {
  it('passes the complete public key to the bundler', () => {
    const key = 'test-public-key\nsecond-line'
    expect(createUpdaterConfig(key)).toEqual({
      bundle: { createUpdaterArtifacts: true },
      plugins: { updater: { pubkey: key } },
    })
  })

  it('rejects a missing or blank public key', () => {
    expect(() => createUpdaterConfig(undefined)).toThrow('Missing updater public key')
    expect(() => createUpdaterConfig('  ')).toThrow('Missing updater public key')
  })
})
