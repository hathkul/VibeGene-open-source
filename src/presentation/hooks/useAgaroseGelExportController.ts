import {
  buildGelBandPrintHtml,
  buildGelFragmentListText,
  type GelLane,
} from '../../application/agaroseGel/agaroseGelLanePlanning'
import { formatGelMatrixLabel, formatGelPercent, type DnaGelMatrix } from '../../domain/agaroseGel'
import type { MwLadder } from '../../domain/mwLadders'

export type AgaroseGelClipboardPort = {
  write(items: ClipboardItem[]): Promise<void>
  writeText(text: string): Promise<void>
}

export type AgaroseGelExportBrowserPort = {
  document: Document
  alert(message: string): void
  createObjectURL(blob: Blob): string
  revokeObjectURL(url: string): void
  createBlob(parts: BlobPart[], options?: BlobPropertyBag): Blob
  createImage(): HTMLImageElement
  createClipboardItem(items: Record<string, Blob>): ClipboardItem
  clipboard: AgaroseGelClipboardPort
  serializeSvg(svg: SVGSVGElement): string
  setTimeout(callback: () => void, delay: number): number
}

export type AgaroseGelExportControllerOptions = {
  getSourceSvg: () => SVGSVGElement | null
  currentRecordName: string
  lanes: GelLane[]
  gelPercent: number
  gelMatrix: DnaGelMatrix
  resolveLadder: (ladderId: string) => MwLadder
  setExpandedLanes: (expanded: Record<number, boolean>) => void
  browser: AgaroseGelExportBrowserPort
}

export type AgaroseGelExportController = {
  copyGelImage(inverted: boolean): Promise<void>
  exportGelImage(inverted: boolean, format: 'png' | 'svg'): Promise<void>
  copyFragmentList(): void
  exportFragmentList(): void
  printGelImage(inverted: boolean): void
  printBandData(): void
}

function gelSafeFileStem(name: string): string {
  return name.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'agarose-gel'
}

function downloadGelBlob(
  fileName: string,
  blob: Blob,
  browser: AgaroseGelExportBrowserPort,
): void {
  const url = browser.createObjectURL(blob)
  const link = browser.document.createElement('a')
  link.href = url
  link.download = fileName
  browser.document.body.appendChild(link)
  link.click()
  link.remove()
  browser.revokeObjectURL(url)
}

function loadImageFromUrl(
  url: string,
  browser: AgaroseGelExportBrowserPort,
): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = browser.createImage()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not render gel image.'))
    image.src = url
  })
}

export function cloneAgaroseGelSvgForExport(
  source: SVGSVGElement,
  inverted: boolean,
  browser: AgaroseGelExportBrowserPort,
): SVGSVGElement {
  const clone = source.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.querySelectorAll('[style]').forEach((node) => {
    const element = node as SVGElement
    element.style.cursor = ''
    element.style.userSelect = ''
  })
  clone.querySelectorAll('.agarose-gel-lane-hit').forEach((node) => {
    node.setAttribute('fill', 'transparent')
  })

  const viewBox = clone.viewBox?.baseVal
  const pageBg = browser.document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  pageBg.setAttribute('x', String(viewBox?.x || 0))
  pageBg.setAttribute('y', String(viewBox?.y || 0))
  pageBg.setAttribute('width', String(viewBox?.width || Number(clone.getAttribute('width') || 0)))
  pageBg.setAttribute('height', String(viewBox?.height || Number(clone.getAttribute('height') || 0)))
  pageBg.setAttribute('fill', '#ffffff')
  clone.insertBefore(pageBg, clone.firstChild)

  clone.querySelectorAll('rect').forEach((rect) => {
    const fill = rect.getAttribute('fill') ?? ''
    if (fill.startsWith('rgba(28, 112, 206')) {
      rect.setAttribute('fill', 'transparent')
      return
    }
    if (inverted) {
      if (fill === '#2a2a2a') rect.setAttribute('fill', '#ececec')
      else if (fill === '#f2f2f2' || fill === '#4a9eff') rect.setAttribute('fill', '#1f1f1f')
    } else if (fill === '#4a9eff') {
      rect.setAttribute('fill', '#f2f2f2')
    }
  })

  clone.querySelectorAll('text').forEach((text) => {
    if (text.getAttribute('fill') === '#1c70ce') {
      text.setAttribute('fill', '#333')
      if (text.getAttribute('font-weight') === '700') text.setAttribute('font-weight', '500')
    }
  })

  if (inverted) {
    clone.querySelectorAll('path').forEach((path) => {
      if ((path.getAttribute('stroke') ?? '') === '#9a9a9a') path.setAttribute('stroke', '#777777')
    })
  }
  return clone
}

async function agaroseGelSvgToPngBlob(
  svg: SVGSVGElement,
  browser: AgaroseGelExportBrowserPort,
): Promise<Blob> {
  const payload = `<?xml version="1.0" encoding="UTF-8"?>\n${browser.serializeSvg(svg)}`
  const blob = browser.createBlob([payload], { type: 'image/svg+xml;charset=utf-8' })
  const url = browser.createObjectURL(blob)
  try {
    const image = await loadImageFromUrl(url, browser)
    const width = Math.max(1, svg.width?.baseVal?.value || svg.viewBox?.baseVal?.width || image.naturalWidth)
    const height = Math.max(1, svg.height?.baseVal?.value || svg.viewBox?.baseVal?.height || image.naturalHeight)
    const scale = 2
    const canvas = browser.document.createElement('canvas')
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Could not create image canvas.')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!png) throw new Error('Could not encode PNG.')
    return png
  } finally {
    browser.revokeObjectURL(url)
  }
}

function printAgaroseGelHtmlDocument(
  title: string,
  bodyHtml: string,
  browser: AgaroseGelExportBrowserPort,
): void {
  const existing = browser.document.getElementById('agarose-gel-print-frame')
  if (existing) existing.remove()
  const frame = browser.document.createElement('iframe')
  frame.id = 'agarose-gel-print-frame'
  frame.setAttribute('aria-hidden', 'true')
  frame.title = title
  frame.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;'
  browser.document.body.appendChild(frame)

  const frameWindow = frame.contentWindow
  const frameDocument = frame.contentDocument ?? frameWindow?.document
  if (!frameWindow || !frameDocument) {
    frame.remove()
    browser.alert('Could not prepare the print view.')
    return
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${title.replace(/</g, '&lt;')}</title>
  <style>
    @page { margin: 12mm; }
    body { margin: 0; font: 12px/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: var(--vg-diagram-ink); } /* theme-color-allow: isolated print-document color */
    .gel-print-svg { display: flex; justify-content: center; padding: 8px; }
    .gel-print-svg svg { max-width: 100%; height: auto; }
    h1 { font-size: 16px; margin: 0 0 12px; }
    .lane-block { margin: 0 0 14px; page-break-inside: avoid; }
    .lane-title { font-weight: 700; margin-bottom: 2px; }
    .lane-meta { color: var(--vg-diagram-ink); margin-bottom: 4px; }
    ol { margin: 4px 0 0; padding-left: 1.4em; }
    li { margin: 1px 0; }
    .empty { color: var(--vg-diagram-ink); font-style: italic; } /* theme-color-allow: isolated print-document color */
  </style>
</head>
<body>${bodyHtml}</body>
</html>`
  const cleanup = () => {
    browser.setTimeout(() => frame.remove(), 1000)
  }
  const triggerPrint = () => {
    try {
      frameWindow.focus()
      frameWindow.print()
    } finally {
      cleanup()
    }
  }
  frameDocument.open()
  frameDocument.write(html)
  frameDocument.close()
  browser.setTimeout(triggerPrint, 50)
}

function createAgaroseGelExportController(
  options: AgaroseGelExportControllerOptions,
): AgaroseGelExportController {
  const getExportGelSvg = (inverted: boolean): SVGSVGElement | null => {
    const source = options.getSourceSvg()
    if (!source) {
      options.browser.alert('Gel image is not ready yet.')
      return null
    }
    return cloneAgaroseGelSvgForExport(source, inverted, options.browser)
  }
  const buildFragmentListText = () => buildGelFragmentListText(
    options.lanes,
    options.gelPercent,
    options.gelMatrix,
    options.resolveLadder,
  )

  return {
    async copyGelImage(inverted) {
      const svg = getExportGelSvg(inverted)
      if (!svg) return
      try {
        const png = await agaroseGelSvgToPngBlob(svg, options.browser)
        await options.browser.clipboard.write([
          options.browser.createClipboardItem({ 'image/png': png }),
        ])
      } catch (error) {
        options.browser.alert(`Could not copy gel image: ${error instanceof Error ? error.message : String(error)}`)
      }
    },
    async exportGelImage(inverted, format) {
      const svg = getExportGelSvg(inverted)
      if (!svg) return
      const stem = gelSafeFileStem(`${options.currentRecordName}-gel${inverted ? '-inverted' : ''}`)
      try {
        if (format === 'svg') {
          downloadGelBlob(
            `${stem}.svg`,
            options.browser.createBlob([`<?xml version="1.0" encoding="UTF-8"?>\n${options.browser.serializeSvg(svg)}`], {
              type: 'image/svg+xml;charset=utf-8',
            }),
            options.browser,
          )
          return
        }
        downloadGelBlob(`${stem}.png`, await agaroseGelSvgToPngBlob(svg, options.browser), options.browser)
      } catch (error) {
        options.browser.alert(`Could not export gel image: ${error instanceof Error ? error.message : String(error)}`)
      }
    },
    copyFragmentList() {
      void options.browser.clipboard.writeText(buildFragmentListText()).catch(() => {
        options.browser.alert('Could not copy fragment list.')
      })
    },
    exportFragmentList() {
      const stem = gelSafeFileStem(`${options.currentRecordName}-gel-bands`)
      downloadGelBlob(
        `${stem}.txt`,
        options.browser.createBlob([buildFragmentListText()], { type: 'text/plain;charset=utf-8' }),
        options.browser,
      )
    },
    printGelImage(inverted) {
      const svg = getExportGelSvg(inverted)
      if (!svg) return
      printAgaroseGelHtmlDocument(
        inverted ? 'Inverted DNA gel' : 'DNA gel',
        `<div class="gel-print-svg">${svg.outerHTML}</div>`,
        options.browser,
      )
    },
    printBandData() {
      options.setExpandedLanes(
        Object.fromEntries(
          options.lanes.map((lane, index) => [index, lane.kind === 'sample' && Boolean(lane.record)]),
        ),
      )
      printAgaroseGelHtmlDocument(
        'DNA gel band data',
        `<h1>Band data · ${formatGelPercent(options.gelPercent, options.gelMatrix)}% ${formatGelMatrixLabel(options.gelMatrix)}</h1>${buildGelBandPrintHtml(options.lanes, options.resolveLadder)}`,
        options.browser,
      )
    },
  }
}

export function createDefaultAgaroseGelExportBrowserPort(): AgaroseGelExportBrowserPort {
  return {
    document,
    alert: (message) => window.alert(message),
    createObjectURL: (blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
    createBlob: (parts, options) => new Blob(parts, options),
    createImage: () => new Image(),
    createClipboardItem: (items) => new ClipboardItem(items),
    clipboard: navigator.clipboard,
    serializeSvg: (svg) => new XMLSerializer().serializeToString(svg),
    setTimeout: (callback, delay) => window.setTimeout(callback, delay),
  }
}

export function createUnavailableAgaroseGelExportController(): AgaroseGelExportController {
  return {
    copyGelImage: async () => undefined,
    exportGelImage: async () => undefined,
    copyFragmentList: () => undefined,
    exportFragmentList: () => undefined,
    printGelImage: () => undefined,
    printBandData: () => undefined,
  }
}

export { createAgaroseGelExportController }
