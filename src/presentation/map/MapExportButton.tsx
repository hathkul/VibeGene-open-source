import { useRef, useState } from 'react'
import { useCloseOnOutsidePointer } from '../hooks/useCloseOnOutsidePointer'

type MapImageFormat = 'png' | 'svg'

function cloneMapSvgForExport() {
  const svg =
    (document.querySelector('.protein-map-tab .protein-map-pane svg.protein-map-svg') as SVGSVGElement | null) ??
    (document.querySelector('.protein-map-pane svg.protein-map-svg') as SVGSVGElement | null) ??
    (document.querySelector('.map-tab .map-stage svg.plasmid-map') as SVGSVGElement | null) ??
    (document.querySelector('.map-tab .linear-map-stage svg.track-map') as SVGSVGElement | null) ??
    (document.querySelector('.linear-map-stage svg.track-map') as SVGSVGElement | null) ??
    (document.querySelector('.map-stage svg.plasmid-map') as SVGSVGElement | null)
  if (!svg) return null

  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')

  // Geometry in the app is mostly stroke-only via CSS (`fill: none`). Without that rule the
  // SVG default fill is black, which turns rings into disks and leaders into filled wedges.
  const styleProps = [
    'fill',
    'fill-opacity',
    'stroke',
    'stroke-width',
    'stroke-opacity',
    'stroke-linecap',
    'stroke-linejoin',
    'stroke-dasharray',
    'font-family',
    'font-size',
    'font-weight',
    'font-style',
    'letter-spacing',
    'opacity',
    'visibility',
    'display',
    'text-anchor',
    'dominant-baseline',
    'paint-order',
  ] as const

  const sourceNodes = Array.from(svg.querySelectorAll<SVGElement>('*'))
  const cloneNodes = Array.from(clone.querySelectorAll<SVGElement>('*'))
  for (let i = 0; i < sourceNodes.length; i += 1) {
    const source = sourceNodes[i]
    const target = cloneNodes[i]
    if (!source || !target) continue
    const computed = window.getComputedStyle(source)
    const parts: string[] = []
    for (const prop of styleProps) {
      const value = computed.getPropertyValue(prop).trim()
      if (!value || value === 'auto') continue
      // Keep fill/stroke `none` — skipping it is what caused solid-black shapes in exports.
      if (value === 'none' && prop !== 'fill' && prop !== 'stroke' && prop !== 'stroke-dasharray') continue
      if (value === 'normal' && (prop === 'font-style' || prop === 'letter-spacing' || prop === 'paint-order')) continue
      parts.push(`${prop}:${value}`)
    }
    const tag = target.tagName.toLowerCase()
    if (
      (tag === 'polyline' || tag === 'path' || tag === 'line' || tag === 'circle' || tag === 'ellipse') &&
      !parts.some((part) => part.startsWith('fill:'))
    ) {
      parts.push('fill:none')
    }
    if (parts.length) {
      const existing = target.getAttribute('style')
      target.setAttribute('style', existing ? `${existing};${parts.join(';')}` : parts.join(';'))
    }
  }

  // Drop invisible hit targets so they cannot paint in external viewers.
  clone.querySelectorAll('.enzyme-callout-label-hit rect').forEach((node) => node.remove())
  // Selection UI is interactive-only — omit it from the exported snapshot.
  clone
    .querySelectorAll(
      '.map-selection, .clock-selection-markers, .clock-hand, .selected-feature-halo, .linear-selection, .protein-map-selection',
    )
    .forEach((node) => node.remove())

  const viewBox = clone.viewBox.baseVal
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  bg.setAttribute('x', String(viewBox.x || 0))
  bg.setAttribute('y', String(viewBox.y || 0))
  bg.setAttribute('width', String(viewBox.width || Number(clone.getAttribute('width') || 0)))
  bg.setAttribute('height', String(viewBox.height || Number(clone.getAttribute('height') || 0)))
  bg.setAttribute('fill', '#ffffff')
  clone.insertBefore(bg, clone.firstChild)

  return clone
}

function serializeMapSvg(svg: SVGSVGElement) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(svg)}`
}

function downloadMapBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function loadMapExportImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not render the map image.'))
    image.src = url
  })
}

async function mapSvgToPngBlob(svg: SVGSVGElement) {
  const sourceBlob = new Blob([serializeMapSvg(svg)], { type: 'image/svg+xml;charset=utf-8' })
  const sourceUrl = URL.createObjectURL(sourceBlob)
  try {
    const image = await loadMapExportImage(sourceUrl)
    const viewBox = svg.viewBox.baseVal
    const width = Math.max(1, Number(svg.getAttribute('width')) || viewBox.width || image.naturalWidth)
    const height = Math.max(1, Number(svg.getAttribute('height')) || viewBox.height || image.naturalHeight)
    const scale = 2
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Could not create the map image canvas.')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!png) throw new Error('Could not encode the map as PNG.')
    return png
  } finally {
    URL.revokeObjectURL(sourceUrl)
  }
}

async function downloadMapImage(recordName: string, format: MapImageFormat) {
  const clone = cloneMapSvgForExport()
  if (!clone) throw new Error('No map is available to export.')
  const safeName = recordName.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'map'
  if (format === 'svg') {
    downloadMapBlob(
      `${safeName}.svg`,
      new Blob([serializeMapSvg(clone)], { type: 'image/svg+xml;charset=utf-8' }),
    )
    return
  }
  downloadMapBlob(`${safeName}.png`, await mapSvgToPngBlob(clone))
}

export function MapExportButton({ recordName, title }: { recordName: string; title: string }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  useCloseOnOutsidePointer(menuOpen, rootRef, setMenuOpen)

  function chooseFormat(format: MapImageFormat) {
    setMenuOpen(false)
    void downloadMapImage(recordName, format).catch((error) => {
      window.alert(`Could not export map: ${error instanceof Error ? error.message : String(error)}`)
    })
  }

  return (
    <div ref={rootRef} className={`sidebar-map-export-control${menuOpen ? ' menu-open' : ''}`}>
      <button
        type="button"
        className="sidebar-tool-button sidebar-snap-export-button"
        title={`${title}…`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <img src="/snap-export-icon.png" alt="" className="sidebar-tool-icon" width={22} height={22} />
      </button>
      {menuOpen ? (
        <div className="sidebar-menu sidebar-map-export-picker" role="menu" aria-label="Export image format">
          <strong>Export image as</strong>
          <button type="button" role="menuitem" onClick={() => chooseFormat('png')}>PNG</button>
          <button type="button" role="menuitem" onClick={() => chooseFormat('svg')}>SVG</button>
        </div>
      ) : null}
    </div>
  )
}
