import { loadImage, createCanvas } from '@napi-rs/canvas'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyVivantisPosterCorrections } from './vivantis-poster-corrections.ts'
import { vivantisPosterSliceOrder } from './vivantis-poster-order.ts'

// Source poster slices are local inputs and are not distributed with the repository.
const sliceDir = join(dirname(fileURLToPath(import.meta.url)), 'vivantis-chart-slices')

export type VivantisPosterBufferActivity = {
  v1: string
  v2: string
  v3: string
  v4: string
  v5: string
  ub05: string
  ub: string
  ub15: string
  ub2: string
}

export type VivantisPosterRow = {
  posterName: string
  catalogName: string
  incubationC: number
  heatInactivation: string
  bufferActivity: VivantisPosterBufferActivity
}

export type VivantisActivityLevel = '100' | '75' | '50' | '25' | '10' | '0'

export type VivantisLegendEntry = {
  level: VivantisActivityLevel
  rgb: [number, number, number]
}

export type VivantisPosterLayout = {
  legend: VivantisLegendEntry[]
  fallbackColumnXs: number[]
  incubationX: number
  heatInactivationX: number
  dataStartY: number
}

const activityLevelOrder: VivantisActivityLevel[] = ['100', '75', '50', '25', '10', '0']

const defaultLegendSamples: Array<[number, number, number, number]> = [
  [75, 105, 86, 56],
  [105, 161, 126, 63],
  [135, 194, 167, 145],
  [165, 254, 237, 174],
  [195, 255, 253, 228],
  [225, 255, 255, 255],
]

function sampleRgb(
  data: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
  radius = 2,
): [number, number, number] {
  let r = 0
  let g = 0
  let b = 0
  let count = 0
  const px = Math.round(x)
  const py = Math.round(y)
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const index = ((py + dy) * width + (px + dx)) * 4
      r += data[index]!
      g += data[index + 1]!
      b += data[index + 2]!
      count += 1
    }
  }
  return [Math.round(r / count), Math.round(g / count), Math.round(b / count)]
}

function colorDistance(left: [number, number, number], right: [number, number, number]) {
  return (left[0] - right[0]) ** 2 + (left[1] - right[1]) ** 2 + (left[2] - right[2]) ** 2
}

function isBackground(rgb: [number, number, number]) {
  return rgb[0] > 246 && rgb[1] > 246 && rgb[2] > 243
}

export function calibrateLegendFromImage(
  data: Uint8ClampedArray,
  width: number,
  legendY = 44,
): VivantisLegendEntry[] {
  const entries: VivantisLegendEntry[] = []
  for (const [x, r, g, b] of defaultLegendSamples) {
    const sampled = sampleRgb(data, width, x, legendY, 3)
    const rgb: [number, number, number] =
      colorDistance(sampled, [r, g, b]) < colorDistance(sampled, [255, 255, 255]) ? [r, g, b] : sampled
    entries.push({ level: activityLevelOrder[entries.length]!, rgb })
  }
  return entries
}

export function matchActivityLevel(
  rgb: [number, number, number],
  legend: VivantisLegendEntry[],
): VivantisActivityLevel {
  let best: VivantisActivityLevel = '0'
  let bestDistance = Number.POSITIVE_INFINITY
  for (const entry of legend) {
    const distance = colorDistance(rgb, entry.rgb)
    if (distance < bestDistance) {
      bestDistance = distance
      best = entry.level
    }
  }
  return best
}

export function classifyVivantisActivity(rgb: [number, number, number]) {
  const legend = defaultLegendSamples.map(([, r, g, b], index) => ({
    level: activityLevelOrder[index]!,
    rgb: [r, g, b] as [number, number, number],
  }))
  return matchActivityLevel(rgb, legend)
}

function sampleCellRgb(
  data: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
  halfW = 5,
  halfH = 4,
) {
  let r = 0
  let g = 0
  let b = 0
  let count = 0
  for (let py = y - halfH; py <= y + halfH; py += 1) {
    for (let px = x - halfW; px <= x + halfW; px += 1) {
      const rgb = sampleRgb(data, width, px, py, 0)
      if (isBackground(rgb)) continue
      r += rgb[0]
      g += rgb[1]
      b += rgb[2]
      count += 1
    }
  }
  if (count === 0) return sampleRgb(data, width, x, y, 2)
  return [Math.round(r / count), Math.round(g / count), Math.round(b / count)] as [number, number, number]
}

export function detectColumnCentersForRow(
  data: Uint8ClampedArray,
  width: number,
  y: number,
  minCellWidth = 12,
) {
  const values: number[] = []
  for (let x = 285; x < 580; x += 1) {
    const rgb = sampleRgb(data, width, x, y, 0)
    values.push(isBackground(rgb) ? 0 : 1)
  }

  const centers: number[] = []
  let start = -1
  for (let index = 0; index < values.length; index += 1) {
    const x = 285 + index
    if (values[index] && start < 0) start = x
    if (!values[index] && start >= 0) {
      const end = x - 1
      if (end - start + 1 >= minCellWidth) {
        centers.push(Math.round((start + end) / 2))
      }
      start = -1
    }
  }

  return centers.slice(0, 9)
}

function activityZoneWhiteRatio(data: Uint8ClampedArray, width: number, y: number) {
  let white = 0
  let total = 0
  for (let x = 285; x < 600; x += 2) {
    total += 1
    if (isBackground(sampleRgb(data, width, x, y, 0))) white += 1
  }
  return white / total
}

export function fitRowCenters(detected: number[], expectedCount: number) {
  if (expectedCount <= 0) return []
  if (detected.length === expectedCount) return [...detected]
  if (detected.length === 0) {
    return Array.from({ length: expectedCount }, (_, index) => 130 + index * 17)
  }
  if (detected.length > expectedCount) {
    if (expectedCount === 1) return [detected[0]!]
    const step = (detected.length - 1) / (expectedCount - 1)
    return Array.from({ length: expectedCount }, (_, index) => detected[Math.round(index * step)]!)
  }

  const gaps = detected.slice(1).map((y, index) => y - detected[index]!)
  const step = gaps.length ? gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length : 17
  const centers = [...detected]
  while (centers.length < expectedCount) {
    centers.push(Math.round(centers[centers.length - 1]! + step))
  }
  return centers
}

export function detectPosterRowCenters(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  expectedCount: number,
  dataStartY = 110,
) {
  const activeYs: number[] = []
  for (let y = dataStartY; y < height - 20; y += 1) {
    if (activityZoneWhiteRatio(data, width, y) < 0.55) activeYs.push(y)
  }

  const centers: number[] = []
  let cluster: number[] = []
  for (const y of activeYs) {
    if (cluster.length === 0 || y - cluster[cluster.length - 1]! <= 2) {
      cluster.push(y)
      continue
    }
    centers.push(Math.round(cluster.reduce((sum, value) => sum + value, 0) / cluster.length))
    cluster = [y]
  }
  if (cluster.length > 0) {
    centers.push(Math.round(cluster.reduce((sum, value) => sum + value, 0) / cluster.length))
  }

  const merged: number[] = []
  for (const center of centers) {
    const previous = merged[merged.length - 1]
    if (previous !== undefined && center - previous < 10) {
      merged[merged.length - 1] = Math.round((previous + center) / 2)
      continue
    }
    merged.push(center)
  }

  if (merged.length >= expectedCount) {
    return merged.slice(0, expectedCount)
  }

  return fitRowCenters(merged, expectedCount)
}

function calibrateFallbackColumnCenters(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  rowCenters: number[],
) {
  const sums = Array<number>(9).fill(0)
  const counts = Array<number>(9).fill(0)

  for (const y of rowCenters.slice(0, Math.min(12, rowCenters.length))) {
    const centers = detectColumnCentersForRow(data, width, y)
    for (let index = 0; index < Math.min(9, centers.length); index += 1) {
      sums[index] += centers[index]!
      counts[index] += 1
    }
  }

  return sums.map((sum, index) => (counts[index] ? Math.round(sum / counts[index]!) : 300 + index * 31))
}

export function calibratePosterLayout(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  expectedRowCount: number,
): VivantisPosterLayout {
  const dataStartY = 110
  const rowCenters = detectPosterRowCenters(data, width, height, expectedRowCount, dataStartY)
  return {
    legend: calibrateLegendFromImage(data, width),
    fallbackColumnXs: calibrateFallbackColumnCenters(data, width, height, rowCenters),
    incubationX: 228,
    heatInactivationX: 276,
    dataStartY,
  }
}

function columnXsForRow(
  data: Uint8ClampedArray,
  width: number,
  y: number,
  layout: VivantisPosterLayout,
) {
  const detected = detectColumnCentersForRow(data, width, y)
  if (detected.length === 9) return detected
  return layout.fallbackColumnXs
}

function sampleHeatInactivation(
  data: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
) {
  const rgb = sampleRgb(data, width, x, y, 3)
  if (rgb[0] > 185 && rgb[1] < 95 && rgb[2] < 95) return 'NO'
  const left = sampleRgb(data, width, x - 8, y, 2)
  const right = sampleRgb(data, width, x + 8, y, 2)
  if (
    (left[0] > 185 && left[1] < 95 && left[2] < 95) ||
    (right[0] > 185 && right[1] < 95 && right[2] < 95)
  ) {
    return 'NO'
  }
  return null
}

function sampleIncubationC(data: Uint8ClampedArray, width: number, x: number, y: number) {
  const rgb = sampleRgb(data, width, x, y, 2)
  if (rgb[0] < 90 && rgb[1] < 90) return 65
  if (rgb[0] > 200 && rgb[1] < 130) return 50
  if (rgb[1] > 175 && rgb[0] < 130) return 55
  if (rgb[0] > 175 && rgb[1] > 145) return 60
  return 37
}

function parseRowAtY(
  data: Uint8ClampedArray,
  width: number,
  y: number,
  layout: VivantisPosterLayout,
): Omit<VivantisPosterRow, 'posterName' | 'catalogName'> {
  const columnXs = columnXsForRow(data, width, y, layout)
  const activities = columnXs.map((x) =>
    matchActivityLevel(sampleCellRgb(data, width, x, y, 5, 4), layout.legend),
  )

  return {
    incubationC: sampleIncubationC(data, width, layout.incubationX, y),
    heatInactivation: sampleHeatInactivation(data, width, layout.heatInactivationX, y) ?? '65°C',
    bufferActivity: {
      v1: activities[0]!,
      v2: activities[1]!,
      v3: activities[2]!,
      v4: activities[3]!,
      v5: activities[4]!,
      ub05: activities[5]!,
      ub: activities[6]!,
      ub15: activities[7]!,
      ub2: activities[8]!,
    },
  }
}

async function loadSlicePixels(path: string) {
  const image = await loadImage(path)
  const canvas = createCanvas(image.width, image.height)
  const context = canvas.getContext('2d')
  context.drawImage(image, 0, 0)
  const snapshot = context.getImageData(0, 0, image.width, image.height)
  return { width: image.width, height: image.height, data: snapshot.data }
}

export async function parseVivantisPosterSlices() {
  const rows: VivantisPosterRow[] = []

  for (const slice of vivantisPosterSliceOrder) {
    const path = join(sliceDir, slice.file)
    const { width, height, data } = await loadSlicePixels(path)
    const layout = calibratePosterLayout(data, width, height, slice.catalogNames.length)
    const rowCenters = detectPosterRowCenters(
      data,
      width,
      height,
      slice.catalogNames.length,
      layout.dataStartY,
    )

    if (rowCenters.length !== slice.catalogNames.length) {
      console.warn(
        `${slice.file}: aligned ${rowCenters.length} rows to ${slice.catalogNames.length} enzymes`,
      )
    }

    const count = Math.min(rowCenters.length, slice.catalogNames.length)
    for (let index = 0; index < count; index += 1) {
      const catalogName = slice.catalogNames[index]!
      rows.push({
        posterName: catalogName,
        catalogName,
        ...parseRowAtY(data, width, rowCenters[index]!, layout),
      })
    }
  }

  return rows
}

export function loadVivantisPosterChartFromFile() {
  const root = dirname(fileURLToPath(import.meta.url))
  const path = join(root, 'vivantis-poster-chart.json')
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, VivantisPosterRow>
}

async function main() {
  const rows = await parseVivantisPosterSlices()
  const chart = applyVivantisPosterCorrections(Object.fromEntries(rows.map((row) => [row.catalogName, row])))
  const outputPath = join(dirname(fileURLToPath(import.meta.url)), 'vivantis-poster-chart.json')
  writeFileSync(outputPath, `${JSON.stringify(chart, null, 2)}\n`)

  for (const key of ['AccBSI', 'BamHI', 'BglII', 'AspLEI', 'Acc16I', 'BstSNI', 'BseX3I', 'EcoRI']) {
    console.log(key, chart[key])
  }
  console.log(`Wrote ${Object.keys(chart).length} poster rows`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
