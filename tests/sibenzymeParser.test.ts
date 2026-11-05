import { describe, expect, it } from 'vitest'
import {
  parseSibProductBufferTable,
  sibNameToCatalog,
  sibProductSlug,
  sibProductUrl,
} from '../scripts/fetch-sibenzyme-buffer-chart'

describe('sibProductUrl', () => {
  it('builds product page URLs from SibEnzyme names', () => {
    expect(sibProductSlug('AspLE I')).toBe('asple-i')
    expect(sibProductUrl('AspLE I')).toBe('https://sibenzyme.com/en/product/asple-i/')
    expect(sibProductUrl('EcoRI')).toBe('https://sibenzyme.com/en/product/ecori/')
  })

  it('maps Sib names to catalog names', () => {
    expect(sibNameToCatalog('AspLE I')).toBe('AspLEI')
    expect(sibNameToCatalog('EcoRI')).toBe('EcoRI')
  })
})

describe('parseSibProductBufferTable', () => {
  it('parses concrete buffer activity from product pages', () => {
    const html = `
      <p><strong>Enzyme activity (%)</strong>:</p>
      <table>
        <tr><td>B</td><td>G</td><td>O</td><td>W</td><td>Y</td><td>ROSE</td></tr>
        <tr><td>10</td><td>75</td><td>100</td><td>50</td><td>25</td><td>100</td></tr>
      </table>
    `
    expect(parseSibProductBufferTable(html)).toEqual({
      b: '10',
      g: '75',
      o: '100',
      w: '50',
      y: '25',
      rose: '100',
    })
  })
})
