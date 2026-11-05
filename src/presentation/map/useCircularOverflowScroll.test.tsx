// @vitest-environment jsdom
import { act, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { useCircularOverflowScroll } from './useCircularOverflowScroll'

function Example({ identity, enabled, layout = 0 }: { identity: string; enabled: boolean; layout?: number }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  useCircularOverflowScroll(svgRef, { enabled, documentIdentity: identity, geometryDependencies: [layout] })
  return <div ref={hostRef} data-host><svg ref={svgRef} data-svg /></div>
}

describe('useCircularOverflowScroll', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })

  it('starts a new overflow document at top and centers only a wider SVG', () => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root.render(<Example identity="a" enabled />))
    const scrollHost = host.querySelector('[data-host]') as HTMLDivElement
    const svg = host.querySelector('[data-svg]') as SVGSVGElement
    Object.defineProperty(scrollHost, 'clientWidth', { configurable: true, value: 300 })
    scrollHost.scrollTop = 75
    scrollHost.scrollLeft = 80
    svg.getBoundingClientRect = () => ({ width: 500 } as DOMRect)

    act(() => root.render(<Example identity="b" enabled />))
    expect(scrollHost.scrollTop).toBe(0)
    expect(scrollHost.scrollLeft).toBe(100)
  })

  it('preserves user scroll on geometry updates and only resets when overflow begins', () => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root.render(<Example identity="a" enabled={false} />))
    const scrollHost = host.querySelector('[data-host]') as HTMLDivElement
    const svg = host.querySelector('[data-svg]') as SVGSVGElement
    Object.defineProperty(scrollHost, 'clientWidth', { configurable: true, value: 400 })
    svg.getBoundingClientRect = () => ({ width: 350 } as DOMRect)

    act(() => root.render(<Example identity="a" enabled />))
    expect(scrollHost.scrollTop).toBe(0)
    expect(scrollHost.scrollLeft).toBe(0)
    scrollHost.scrollTop = 64
    scrollHost.scrollLeft = 23

    act(() => root.render(<Example identity="a" enabled layout={1} />))
    expect(scrollHost.scrollTop).toBe(64)
    expect(scrollHost.scrollLeft).toBe(23)
  })
})
