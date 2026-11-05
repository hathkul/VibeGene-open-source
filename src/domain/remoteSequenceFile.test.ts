import { describe, expect, it } from 'vitest'
import { remoteSequenceFileName, remoteSequenceShareUrl, remoteSequenceUrlFromSearch } from './remoteSequenceFile'

describe('remote sequence launch URLs', () => {
  it('accepts encoded HTTP(S) URLs', () => {
    expect(remoteSequenceUrlFromSearch('?url=https%3A%2F%2Fexample.org%2Fmaps%2FpDemo.dna%3Fdownload%3D1'))
      .toBe('https://example.org/maps/pDemo.dna?download=1')
    expect(remoteSequenceUrlFromSearch('?url=http%3A%2F%2Flocalhost%3A8080%2Ftest.dna'))
      .toBe('http://localhost:8080/test.dna')
  })

  it('rejects non-network schemes and embedded credentials', () => {
    expect(() => remoteSequenceUrlFromSearch('?url=file%3A%2F%2F%2Ftmp%2Ftest.dna')).toThrow(/http/)
    expect(() => remoteSequenceUrlFromSearch('?url=https%3A%2F%2Fme%3Asecret%40example.org%2Ftest.dna')).toThrow(/credentials/)
  })

  it('creates a link on the current deployment with the source URL encoded as one parameter', () => {
    const shared = remoteSequenceShareUrl(
      'https://files.example.org/My Map.dna?download=1&token=a b',
      'https://custom.vibegene.example/tools/editor/?old=value#map',
    )
    const parsed = new URL(shared)
    expect(parsed.origin).toBe('https://custom.vibegene.example')
    expect(parsed.pathname).toBe('/tools/editor/')
    expect(parsed.searchParams.has('old')).toBe(false)
    expect(parsed.hash).toBe('')
    expect(parsed.searchParams.get('url')).toBe('https://files.example.org/My%20Map.dna?download=1&token=a%20b')
  })

  it('derives a safe file name from Content-Disposition or the URL path', () => {
    expect(remoteSequenceFileName('https://example.org/download', "attachment; filename*=UTF-8''My%20Map.dna"))
      .toBe('My Map.dna')
    expect(remoteSequenceFileName('https://example.org/maps/My%20Map.dna?raw=1')).toBe('My Map.dna')
    expect(remoteSequenceFileName('https://example.org/')).toBe('remote.dna')
    expect(remoteSequenceFileName('https://example.org/maps/test.dna', 'attachment; filename="../unsafe.dna"'))
      .toBe('..unsafe.dna')
  })
})
