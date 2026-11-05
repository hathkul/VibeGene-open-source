/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest'
import { desktopDropHitsElement } from '../src/desktop/desktopDropTarget'

describe('desktopDropHitsElement', () => {
  it('accepts drops without a position when a target exists', () => {
    const element = document.createElement('div')
    expect(desktopDropHitsElement(element)).toBe(true)
    expect(desktopDropHitsElement(null)).toBe(false)
  })

  it('maps Tauri physical coordinates into the element bounds', () => {
    const element = document.createElement('div')
    document.body.appendChild(element)
    element.getBoundingClientRect = () =>
      ({
        left: 10,
        top: 20,
        right: 110,
        bottom: 120,
        width: 100,
        height: 100,
        x: 10,
        y: 20,
        toJSON() {
          return {}
        },
      }) as DOMRect
    const originalDpr = window.devicePixelRatio
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 })
    expect(desktopDropHitsElement(element, { x: 40, y: 80 })).toBe(true)
    expect(desktopDropHitsElement(element, { x: 4, y: 80 })).toBe(false)
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: originalDpr })
    element.remove()
  })
})
