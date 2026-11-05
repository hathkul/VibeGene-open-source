// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CloningSchemaPanel } from '../src/CloningSchemaPanel'
import { defaultDnaEnds } from '../src/domain/dnaEnds'
import type { ResolvedCloningPart } from '../src/domain/restrictionCloning'

function fragment(name: string, color: string): ResolvedCloningPart {
  return {
    role: 'insert',
    name,
    sequence: 'AAAA',
    length: 4,
    dnaEnds: defaultDnaEnds(),
    color,
    upstreamEnzyme: null,
    downstreamEnzyme: null,
    upstreamOverhang: { type: 'blunt', sequence: null, length: 0, enzymeName: 'end' },
    downstreamOverhang: { type: 'blunt', sequence: null, length: 0, enzymeName: 'end' },
    leftEnzyme: null,
    rightEnzyme: null,
    leftEnzymeLabel: null,
    rightEnzymeLabel: null,
    schemaLeftSide: 'upstream',
    features: [],
    primers: [],
    source: {} as ResolvedCloningPart['source'],
    fragment: {} as ResolvedCloningPart['fragment'],
    startSite: {} as ResolvedCloningPart['startSite'],
    endSite: {} as ResolvedCloningPart['endSite'],
    originOffsetInFragment: null,
  }
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('CloningSchemaPanel fragment reorder', () => {
  it('reorders fragments with pointer dragging in WebKit-compatible mode', () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    const onReorder = vi.fn()

    act(() => {
      root.render(
        <CloningSchemaPanel
          vector={null}
          inserts={[fragment('First', '#c00'), fragment('Second', '#00c')]}
          insertOrder={[0, 1]}
          validation={{ ready: true, closed: false, message: '', issues: [], productLength: 8 }}
          activePart="product"
          mode="linear-ligation"
          onSelectPart={() => undefined}
          onReorderInserts={onReorder}
        />,
      )
    })

    const cards = container.querySelectorAll<HTMLElement>('[data-cloning-order-index]')
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => cards[1]),
    })

    const down = new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 0, clientY: 0 })
    Object.defineProperty(down, 'isPrimary', { value: true })
    act(() => cards[0]!.dispatchEvent(down))
    act(() => window.dispatchEvent(new MouseEvent('pointermove', { clientX: 12, clientY: 0 })))
    act(() => window.dispatchEvent(new MouseEvent('pointerup', { clientX: 12, clientY: 0 })))

    expect(onReorder).toHaveBeenCalledWith([1, 0])
    act(() => root.unmount())
  })
})
