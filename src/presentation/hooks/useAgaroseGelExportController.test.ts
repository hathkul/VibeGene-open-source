import { themeFixturePalette } from '../../test-support/themeFixturePalette'
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import {
  cloneAgaroseGelSvgForExport,
  createAgaroseGelExportController,
  type AgaroseGelExportBrowserPort,
} from './useAgaroseGelExportController'
import { createEmptyGelSample, type GelLane } from '../../application/agaroseGel/agaroseGelLanePlanning'
import type { MwLadder } from '../../domain/mwLadders'

const ladder: MwLadder = {
  id: 'fixture-ladder',
  name: 'Fixture ladder',
  supplier: 'Fixture',
  preferredUnits: 'bp',
  concentration: null,
  url: null,
  isDefault: false,
  fragments: [{ lengthBp: 1000, mass: 1, format: 'bold' }],
}

function browserPort(): AgaroseGelExportBrowserPort {
  const ClipboardItemConstructor = class {
    readonly types: string[]
    readonly presentationStyle = 'inline' as const
    private readonly items: Record<string, Blob>
    constructor(items: Record<string, Blob>) {
      this.items = items
      this.types = Object.keys(items)
    }
    getType(type: string): Promise<Blob> {
      return Promise.resolve(this.items[type]!)
    }
  }
  Object.defineProperty(globalThis, 'ClipboardItem', { configurable: true, value: ClipboardItemConstructor })
  return {
    document,
    alert: vi.fn(),
    createObjectURL: vi.fn(() => 'blob:gel'),
    revokeObjectURL: vi.fn(),
    createBlob: (parts, options) => new Blob(parts, options),
    createImage: () => new Image(),
    createClipboardItem: (items) => new ClipboardItemConstructor(items),
    clipboard: {
      write: vi.fn(async () => undefined),
      writeText: vi.fn(async () => undefined),
    },
    serializeSvg: (svg) => new XMLSerializer().serializeToString(svg),
    setTimeout: (callback, delay) => window.setTimeout(callback, delay),
  }
}

function svgFixture(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 100 40')
  svg.setAttribute('width', '100')
  svg.setAttribute('height', '40')
  const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  background.setAttribute('fill', themeFixturePalette.darkGel)
  const selected = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  selected.setAttribute('class', 'agarose-gel-lane-hit')
  selected.setAttribute('fill', themeFixturePalette.blueBright)
  const label = document.createElementNS('http://www.w3.org/2000/svg', 'text')
  label.setAttribute('fill', themeFixturePalette.blueLabel)
  label.setAttribute('font-weight', '700')
  svg.append(background, selected, label)
  return svg
}

describe('agarose gel export controller', () => {
  function controllerFor(browser: AgaroseGelExportBrowserPort, lanes: GelLane[] = [createEmptyGelSample()]) {
    return createAgaroseGelExportController({
      getSourceSvg: svgFixture,
      currentRecordName: 'My construct / test',
      lanes,
      gelPercent: 1,
      gelMatrix: 'agarose',
      resolveLadder: () => ladder,
      setExpandedLanes: vi.fn(),
      browser,
    })
  }

  it('preserves export inversion transforms and inserts an opaque page background first', () => {
    const browser = browserPort()
    const clone = cloneAgaroseGelSvgForExport(svgFixture(), true, browser)
    expect(clone.firstElementChild?.getAttribute('fill')).toBe(themeFixturePalette.white)
    expect(clone.querySelectorAll('rect')[1]?.getAttribute('fill')).toBe(themeFixturePalette.grayPanel)
    expect(clone.querySelector('.agarose-gel-lane-hit')?.getAttribute('fill')).toBe('transparent')
    expect(clone.querySelector('text')?.getAttribute('fill')).toBe(themeFixturePalette.grayDark)
    expect(clone.querySelector('text')?.getAttribute('font-weight')).toBe('500')
  })

  it('alerts on a missing source SVG without touching browser export ports', async () => {
    const browser = browserPort()
    const controller = createAgaroseGelExportController({
      getSourceSvg: () => null,
      currentRecordName: 'construct',
      lanes: [createEmptyGelSample()],
      gelPercent: 1,
      gelMatrix: 'agarose',
      resolveLadder: () => ladder,
      setExpandedLanes: vi.fn(),
      browser,
    })
    await controller.exportGelImage(false, 'svg')
    expect(browser.alert).toHaveBeenCalledWith('Gel image is not ready yet.')
    expect(browser.createObjectURL).not.toHaveBeenCalled()
  })

  it('uses exact sanitized SVG filenames and balances object URLs', async () => {
    const browser = browserPort()
    const append = vi.spyOn(document.body, 'appendChild')
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const controller = createAgaroseGelExportController({
      getSourceSvg: svgFixture,
      currentRecordName: 'My construct / test',
      lanes: [createEmptyGelSample()],
      gelPercent: 1,
      gelMatrix: 'agarose',
      resolveLadder: () => ladder,
      setExpandedLanes: vi.fn(),
      browser,
    })
    await controller.exportGelImage(false, 'svg')
    const anchor = append.mock.calls
      .map(([node]) => node)
      .find((node): node is HTMLAnchorElement => node instanceof HTMLAnchorElement)
    expect(anchor?.download).toBe('My_construct_test-gel.svg')
    expect(browser.createObjectURL).toHaveBeenCalledTimes(1)
    expect(browser.revokeObjectURL).toHaveBeenCalledWith('blob:gel')
    click.mockRestore()
    append.mockRestore()
  })

  it('reports exact PNG conversion and clipboard failures while revoking the SVG URL', async () => {
    const browser = browserPort()
    browser.createImage = () => {
      const image = document.createElement('img')
      Object.defineProperty(image, 'src', {
        configurable: true,
        set: () => image.onload?.(new Event('load')),
      })
      return image
    }
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    await controllerFor(browser).exportGelImage(false, 'png')
    expect(browser.alert).toHaveBeenCalledWith('Could not export gel image: Could not create image canvas.')
    expect(browser.createObjectURL).toHaveBeenCalledTimes(1)
    expect(browser.revokeObjectURL).toHaveBeenCalledWith('blob:gel')

    const copyBrowser = browserPort()
    copyBrowser.createImage = browser.createImage
    await controllerFor(copyBrowser).copyGelImage(true)
    expect(copyBrowser.alert).toHaveBeenCalledWith('Could not copy gel image: Could not create image canvas.')
    expect(copyBrowser.revokeObjectURL).toHaveBeenCalledWith('blob:gel')
    getContext.mockRestore()
  })

  it('copies and exports fragment-list content with the exact bands filename', async () => {
    const browser = browserPort()
    const expected = '1.0% agarose\n\nMW\tFixture ladder\t1000\n1\t(empty)\t—'
    const controller = controllerFor(browser, [
      { kind: 'mw', ladderId: ladder.id },
      createEmptyGelSample(),
    ])
    controller.copyFragmentList()
    await Promise.resolve()
    expect(browser.clipboard.writeText).toHaveBeenCalledWith(expected)

    const append = vi.spyOn(document.body, 'appendChild')
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const createBlob = vi.spyOn(browser, 'createBlob')
    controller.exportFragmentList()
    const anchor = append.mock.calls
      .map(([node]) => node)
      .find((node): node is HTMLAnchorElement => node instanceof HTMLAnchorElement)
    expect(anchor?.download).toBe('My_construct_test-gel-bands.txt')
    expect(createBlob.mock.calls.at(-1)?.[0]?.[0]).toBe(expected)
    click.mockRestore()
    append.mockRestore()
  })

  it('replaces print iframes and preserves title, body order, and 50ms/1s sequencing', () => {
    const browser = browserPort()
    const timers: Array<{ callback: () => void; delay: number }> = []
    browser.setTimeout = (callback, delay) => {
      timers.push({ callback, delay })
      return timers.length
    }
    const controller = controllerFor(browser, [
      { kind: 'mw', ladderId: ladder.id },
      createEmptyGelSample(),
    ])
    controller.printBandData()
    const first = document.getElementById('agarose-gel-print-frame')
    expect(first).toBeInstanceOf(HTMLIFrameElement)
    if (!(first instanceof HTMLIFrameElement)) throw new Error('Expected print iframe')
    expect(first?.title).toBe('DNA gel band data')
    expect(first?.contentDocument?.title).toBe('DNA gel band data')
    const body = first?.contentDocument?.body.innerHTML ?? ''
    expect(body).toContain('MW · Fixture ladder')
    expect(body).toContain('Lane 1')
    expect(body.indexOf('MW · Fixture ladder')).toBeLessThan(body.indexOf('Lane 1'))
    expect(timers[0]?.delay).toBe(50)

    controller.printBandData()
    expect(document.querySelectorAll('#agarose-gel-print-frame')).toHaveLength(1)
    const printTimer = timers.at(-1)!
    expect(printTimer.delay).toBe(50)
    try {
      printTimer.callback()
    } catch {
      // jsdom has no real print implementation; the controller still schedules cleanup in finally.
    }
    const cleanupTimer = timers.at(-1)!
    expect(cleanupTimer.delay).toBe(1000)
    cleanupTimer.callback()
    expect(document.getElementById('agarose-gel-print-frame')).toBeNull()
  })
})
