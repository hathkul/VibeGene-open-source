// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest'
import { MOBILE_SHELL_MEDIA } from '../src/ui/mobileShellMedia'
import {
  MOBILE_PROTEIN_MAP_TOUCH_HINT,
  MOBILE_PROTEIN_MAP_ZOOMED_TOUCH_HINT,
  MOBILE_PROTEIN_SEQUENCE_TOUCH_HINT,
  MOBILE_SEQUENCE_TOUCH_HINT,
  mobileEnzymeCutAnchorStatus,
  mobilePrimerAnchorStatus,
  pointerModifierExtend,
  resolveMobileEnzymeCutPairExtend,
  resolveMobilePrimerPairExtend,
} from '../src/ui/mobilePairSelection'

function stubMobileShell(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query === MOBILE_SHELL_MEDIA ? matches : false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    })),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('mobilePairSelection', () => {
  it('uses modifier keys for extend on all viewports', () => {
    stubMobileShell(false)
    expect(pointerModifierExtend({ shiftKey: true, ctrlKey: false, metaKey: false })).toBe(true)
    expect(resolveMobileEnzymeCutPairExtend(false, {}, 'b', 'a')).toBe(false)
  })

  it('pairs enzyme cuts on mobile when a different site is tapped', () => {
    stubMobileShell(true)
    expect(resolveMobileEnzymeCutPairExtend(false, { enzyme: 'EcoRI' }, 'site-b', 'site-a')).toBe(true)
    expect(resolveMobileEnzymeCutPairExtend(false, { enzyme: 'EcoRI' }, 'site-a', 'site-a')).toBe(false)
    expect(resolveMobileEnzymeCutPairExtend(false, null, 'site-b', 'site-a')).toBe(false)
  })

  it('extends primer selection on mobile only from primer anchors', () => {
    stubMobileShell(true)
    expect(resolveMobilePrimerPairExtend(false, { kind: 'primer' }, 'primer')).toBe(true)
    expect(resolveMobilePrimerPairExtend(false, { kind: 'base' }, 'dna')).toBe(false)
    expect(resolveMobilePrimerPairExtend(false, { kind: 'primer' }, 'dna')).toBe(false)
  })

  it('documents mobile status copy and sequence hint', () => {
    expect(MOBILE_PROTEIN_MAP_TOUCH_HINT).toContain('backbone')
    expect(MOBILE_PROTEIN_MAP_TOUCH_HINT).toContain('Drag empty map to pan')
    expect(MOBILE_PROTEIN_MAP_ZOOMED_TOUCH_HINT).toContain('pan/move view')
    expect(MOBILE_PROTEIN_MAP_ZOOMED_TOUCH_HINT).not.toContain('minimap')
    expect(MOBILE_PROTEIN_SEQUENCE_TOUCH_HINT).toContain('residues')
    expect(MOBILE_SEQUENCE_TOUCH_HINT).toContain('Drag bases to select')
    expect(mobileEnzymeCutAnchorStatus('EcoRI', 100, 102)).toContain('Tap another cut site')
    expect(mobilePrimerAnchorStatus('fwd', '1..20')).toContain('Tap another primer')
  })
})
