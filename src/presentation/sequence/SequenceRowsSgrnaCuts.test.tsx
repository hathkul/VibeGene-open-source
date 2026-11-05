// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cloneFixture } from '../../domain/fixtures'
import { createSgRNAFeatures, findSgRNATargets, SGRNA_PRESETS } from '../../domain/sgrna'
import { reverseComplement } from '../../domain/sequence'
import { defaultEnzymePreferences } from '../../domain/enzymePreferences'
import { defaultDisplaySettings } from './sequenceShared'
import { SequenceRows } from './SequenceRows'

function recordFor(sequence: string, features: ReturnType<typeof createSgRNAFeatures>) {
  const fixture = cloneFixture()
  return { ...fixture, topology: 'linear' as const, sequence, features, primers: [] }
}

describe('SequenceRows sgRNA cuts', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
    vi.unstubAllGlobals()
  })

  function render(features: ReturnType<typeof createSgRNAFeatures>, sequence: string, selectedFeatureId: string | null) {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root.render(<SequenceRows
      record={recordFor(sequence, features)} motifHits={[]} restrictionSites={[]} primerFrameDisplays={[]}
      annotationFeatures={features} displaySettings={defaultDisplaySettings}
      enzymePreferences={defaultEnzymePreferences} hoveredRestrictionSiteKey={null} cutStrandSelection={null}
      selectedRange={null} selectedFeatureId={selectedFeatureId} selectedPrimerId={null} layoutActive
      onFeatureSelect={vi.fn()} onFeatureEdit={vi.fn()} onPrimerSelect={vi.fn()}
      onRestrictionSelect={vi.fn()} onRestrictionHover={vi.fn()} onRangeSelect={vi.fn()}
      onPrimerEdit={vi.fn()} onEnzymeInfo={vi.fn()}
    />))
  }

  it('shows the nominal cut and break details on hover and selection', () => {
    const spacer = 'ACGTACGTACGTACGTACGA'
    const sequence = `TTT${spacer}AGGTTT`
    const hit = findSgRNATargets(sequence, spacer, 'linear', SGRNA_PRESETS[0]!)[0]!
    const features = createSgRNAFeatures(hit, { name: 'Guide A', nuclease: 'SpCas9', pamMotif: 'NGG', pamSide: '3prime', spacer })
    render(features, sequence, null)
    expect(host.querySelector('.sequence-sgrna-cut')).toBeNull()
    const frame = host.querySelector('.sequence-sgrna-frame')!
    act(() => frame.dispatchEvent(new MouseEvent('pointerover', { bubbles: true })))
    expect(host.querySelector('.sequence-sgrna-cut')).not.toBeNull()
    expect(host.querySelector('.sequence-sgrna-cut-popover')?.textContent).toContain('blunt or staggered')
    expect(host.querySelector<HTMLElement>('.sequence-sgrna-cut-popover.is-forward')?.style.bottom).not.toBe('')
    act(() => frame.dispatchEvent(new MouseEvent('pointerout', { bubbles: true })))
    expect(host.querySelector('.sequence-sgrna-cut')).toBeNull()
    act(() => root.render(<SequenceRows
      record={recordFor(sequence, features)} motifHits={[]} restrictionSites={[]} primerFrameDisplays={[]}
      annotationFeatures={features} displaySettings={defaultDisplaySettings}
      enzymePreferences={defaultEnzymePreferences} hoveredRestrictionSiteKey={null} cutStrandSelection={null}
      selectedRange={null} selectedFeatureId={features[0].id} selectedPrimerId={null} layoutActive
      onFeatureSelect={vi.fn()} onFeatureEdit={vi.fn()} onPrimerSelect={vi.fn()}
      onRestrictionSelect={vi.fn()} onRestrictionHover={vi.fn()} onRangeSelect={vi.fn()}
      onPrimerEdit={vi.fn()} onEnzymeInfo={vi.fn()}
    />))
    expect(host.querySelector('.sequence-sgrna-cut')).not.toBeNull()
    expect(host.querySelector('.sequence-sgrna-cut-popover')?.textContent).toContain('probabilities are not calculated')
  })

  it('places the reverse-strand popover below its label', () => {
    const spacer = 'ACGTACGTACGTACGTACGA'
    const sequence = `TTTCCT${reverseComplement(spacer)}TTT`
    const hit = findSgRNATargets(sequence, spacer, 'linear', SGRNA_PRESETS[0]!)[0]!
    const features = createSgRNAFeatures(hit, { name: 'Reverse guide', nuclease: 'SpCas9', pamMotif: 'NGG', pamSide: '3prime', spacer })
    render(features, sequence, features[0].id)
    const popover = host.querySelector<HTMLElement>('.sequence-sgrna-cut-popover.is-reverse')
    expect(popover?.parentElement?.className).toBe('sequence-primer-lane')
    expect(Number.parseFloat(popover?.style.top ?? '')).toBeGreaterThan(0)
  })

  it.each(['forward', 'reverse'] as const)('shows illustrative Cas12a cuts on the %s-mapped strand', (strand) => {
    const spacer = 'ACGTACGTACGTACGTACGA'
    const sequence = strand === 'forward' ? `CCCTTTT${spacer}AAAAAA` : `${'C'.repeat(10)}${reverseComplement(spacer)}AAAACCCCC`
    const hit = findSgRNATargets(sequence, spacer, 'linear', { ...SGRNA_PRESETS[2]!, pamMotif: 'TTTN' }).find((candidate) => candidate.strand === strand)!
    const features = createSgRNAFeatures(hit, { name: 'Cas12a guide', nuclease: 'Cas12a', pamMotif: 'TTTN', pamSide: '5prime', spacer })
    render(features, sequence, features[0].id)
    const nonTarget = host.querySelector<HTMLElement>('[aria-label="Illustrative Cas12a non-target strand cut"]')!
    const target = host.querySelector<HTMLElement>('[aria-label="Illustrative Cas12a target strand cut"]')!
    expect(nonTarget.style.top).toBe(strand === 'forward' ? '0px' : '50%')
    expect(target.style.top).toBe(strand === 'reverse' ? '0px' : '50%')
    expect(host.querySelector('.sequence-sgrna-cut-popover')?.textContent).toContain('Positions vary')
    expect(host.querySelector('.sequence-sgrna-cut-popover')?.textContent).toContain('TTTT is a non-canonical PAM')
  })
})
