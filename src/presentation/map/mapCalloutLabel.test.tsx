import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { enzymeNameAtCharIndex, enzymeNamesFromLabel } from '../../domain/enzymeLabel'
import { MapCalloutLabelContent, SelectedMapCalloutLabel } from './mapComponents'
import { enzymeCalloutMatchesHover, mapCalloutLabelParts, mapCalloutLabelWidth, mapCalloutTextOriginX } from './mapCalloutLabel'

describe('map callout coordinates', () => {
  it('adds the label-to-leader gap outward on either side of a circular map', () => {
    expect(mapCalloutTextOriginX(100, 'start', 6)).toBe(106)
    expect(mapCalloutTextOriginX(100, 'end', 6)).toBe(94)
    expect(mapCalloutTextOriginX(100, 'start', -2)).toBe(100)
  })

  it.each([
    ['enzyme', 'EcoRI (123)', '(123)', 'EcoRI'],
    ['primer', '(1,234 .. 1,260) Primer+', '(1,234 .. 1,260)', 'Primer+'],
  ] as const)('places %s coordinates away from the leader with a wider gap', (kind, label, coordinate, name) => {
    const left = mapCalloutLabelParts(label, kind, 'end')
    const right = mapCalloutLabelParts(label, kind, 'start')
    expect(left.text).toBe(`${coordinate}\u00a0\u00a0\u00a0${name}`)
    expect(right.text).toBe(`${name}\u00a0\u00a0\u00a0${coordinate}`)
    const html = renderToStaticMarkup(<MapCalloutLabelContent label={label} kind={kind} anchor="end" />)
    expect(html).toContain(`<tspan font-weight="400">${coordinate}</tspan>`)
    expect(mapCalloutLabelWidth(label, kind, (text) => text.length)).toBe(left.text.length)
  })

  it('keeps selected coordinates normal weight and leaves labels without coordinates unchanged', () => {
    const html = renderToStaticMarkup(<SelectedMapCalloutLabel label="EcoRI (123)" mapCalloutKind="enzyme" x={0} y={0} textAnchor="start" fontSize={14} fontWeight={800} />)
    expect(html).toContain('<tspan font-weight="400">(123)</tspan>')
    expect(html).toContain('dominant-baseline="alphabetic"')
    expect(html).toContain('dy="0.35em"')
    expect(mapCalloutLabelParts('EcoRI', 'enzyme', 'end').text).toBe('EcoRI')
  })

  it('preserves merged-enzyme click targets when coordinates lead', () => {
    const label = mapCalloutLabelParts('EcoRI, BamHI (1234)', 'enzyme', 'end').text
    expect(label).toBe(`(${(1234).toLocaleString()})\u00a0\u00a0\u00a0EcoRI, BamHI`)
    expect(enzymeNamesFromLabel(label)).toEqual(['EcoRI', 'BamHI'])
    expect(enzymeNameAtCharIndex(label, label.indexOf('EcoRI'))).toBe('EcoRI')
    expect(enzymeNameAtCharIndex(label, label.indexOf('BamHI'))).toBe('BamHI')
  })

  it('matches complete enzyme names in merged callouts on either side of the map', () => {
    for (const anchor of ['start', 'end']) {
      const label = mapCalloutLabelParts('EagI-HF, NotI (1234)', 'enzyme', anchor).text
      expect(enzymeCalloutMatchesHover(label, 'EagI-HF')).toBe(true)
      expect(enzymeCalloutMatchesHover(label, 'NotI')).toBe(true)
      expect(enzymeCalloutMatchesHover(label, 'EagI')).toBe(false)
      expect(enzymeCalloutMatchesHover(label, null)).toBe(false)
    }
    expect(enzymeCalloutMatchesHover('BclI* (12)', 'BclI')).toBe(true)
  })

  it('resolves enzyme names when coordinates use space grouping', () => {
    const label = '(1\u00a0234)\u00a0\u00a0\u00a0EcoRI, BamHI'
    expect(enzymeNamesFromLabel(label)).toEqual(['EcoRI', 'BamHI'])
    expect(enzymeNameAtCharIndex(label, label.indexOf('EcoRI'))).toBe('EcoRI')
    expect(enzymeNameAtCharIndex(label, label.indexOf('BamHI'))).toBe('BamHI')
  })
})
