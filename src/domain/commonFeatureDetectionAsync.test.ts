import { themeFixturePalette } from '../test-support/themeFixturePalette'
import { describe, expect, it } from 'vitest'
import { detectCommonFeaturesAsync } from './commonFeatureDetectionAsync'
import type { CommonFeatureTemplate } from './commonFeatures'
import { cloneFixture } from './fixtures'

function template(sequence: string): CommonFeatureTemplate {
  return {
    id: 'feature-1',
    fileName: 'feature-1.fasta',
    name: 'Feature 1',
    type: 'misc_feature',
    color: themeFixturePalette.greenBright,
    sequence,
    qualifiers: [],
    locations: [{ start: 0, end: sequence.length, strand: 'forward' }],
  }
}

describe('detectCommonFeaturesAsync', () => {
  it('preserves detector results and reports progress without Worker support', async () => {
    const record = { ...cloneFixture(), topology: 'linear' as const, sequence: 'TTTACGTACGTAAA' }
    const progress: Array<[number, number]> = []
    const matches = await detectCommonFeaturesAsync(record, [template('ACGTACGT')], {
      onProgress: (completed, total) => progress.push([completed, total]),
    })

    expect(matches.map((match) => [match.start, match.end])).toEqual([[3, 11]])
    expect(progress).toEqual([[1, 1]])
  })

  it('rejects an operation that was cancelled before it starts', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(detectCommonFeaturesAsync(cloneFixture(), [], { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    })
  })
})
