import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { chromium, type Browser, type Page } from '@playwright/test'

type LoadMeasurement = {
  kind: 'cold-ish' | 'cached-reload'
  navigation: {
    domContentLoadedMs: number | null
    loadMs: number | null
  }
  readiness: {
    workspaceMs: number | null
    mapMs: number | null
    sequenceMs: number | null
    sequenceStatus: 'ready' | 'timeout' | 'unavailable'
  }
  resources: {
    count: number
    transferredBytes: number
    encodedBodyBytes: number
    decodedBodyBytes: number
    zeroTransferEntries: number
    slowest: Array<{ name: string; durationMs: number; encodedBodyBytes: number }>
  }
  longTasks: {
    supported: boolean
    count: number
    totalMs: number
    maxMs: number
  }
  webVitals: {
    fcpMs: number | null
    lcpMs: number | null
    cls: number | null
    startupLongTaskBlockingMs: number
    layoutShifts: LayoutShiftSample[]
  }
  memory: {
    supported: boolean
    bytes: number | null
    source: 'measureUserAgentSpecificMemory' | null
  }
}

type LayoutShiftSource = {
  node: string
  previous: { x: number; y: number; width: number; height: number }
  current: { x: number; y: number; width: number; height: number }
}

type LayoutShiftSample = {
  value: number
  timeMs: number
  sources: LayoutShiftSource[]
}

type RunMeasurement = {
  run: number
  cold: LoadMeasurement
  cached: LoadMeasurement
}

type WindowWithStartupProbe = Window & {
  __vgLongTasks?: Array<{ duration: number }>
  __vgLargestContentfulPaint?: number
  __vgCumulativeLayoutShift?: number
  __vgLayoutShifts?: LayoutShiftSample[]
}

const DEFAULT_PORT = 5180
const DEFAULT_RUNS = 10
const READY_TIMEOUT_MS = 20_000

function readOption(name: string, fallback: string) {
  const prefix = `--${name}=`
  const value = process.argv.find((argument) => argument.startsWith(prefix))
  return value ? value.slice(prefix.length) : fallback
}

function numberOption(name: string, fallback: number) {
  const value = Number(readOption(name, String(fallback)))
  if (!Number.isFinite(value) || value < 1) throw new Error(`--${name} must be a positive number`)
  return Math.floor(value)
}

async function waitForPreview(url: string, child: ChildProcess) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`vite preview exited before becoming ready (code ${child.exitCode})`)
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // The preview server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Timed out waiting for vite preview at ${url}`)
}

function startPreview(port: number) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const child = spawn(npm, ['run', 'preview', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    stdio: 'ignore',
  })
  return child
}

async function installLongTaskProbe(page: Page) {
  await page.addInitScript(() => {
    const target = window as WindowWithStartupProbe
    target.__vgLongTasks = []
    target.__vgCumulativeLayoutShift = 0
    target.__vgLayoutShifts = []
    if (!('PerformanceObserver' in window)) return
    try {
      const observer = new PerformanceObserver((list) => {
        target.__vgLongTasks?.push(...list.getEntries().map((entry) => ({ duration: entry.duration })))
      })
      observer.observe({ entryTypes: ['longtask'] })
    } catch {
      // Long-task entries are optional; the report will say they are unsupported.
    }
    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries()
        const last = entries[entries.length - 1]
        if (last) target.__vgLargestContentfulPaint = last.startTime
      })
      observer.observe({ type: 'largest-contentful-paint', buffered: true })
    } catch {
      // LCP is optional in older browser engines.
    }
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as Array<PerformanceEntry & { value?: number; hadRecentInput?: boolean; sources?: Array<{ node?: Node; previousRect?: DOMRectReadOnly; currentRect?: DOMRectReadOnly }> }>) {
          if (entry.hadRecentInput) continue
          const sources: LayoutShiftSource[] = []
          for (const source of (entry.sources ?? []).slice(0, 4)) {
            const node = source.node
            const element = node instanceof Element ? node : null
            const nodeLabel = element
              ? `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${element.getAttribute('data-testid') ? `[data-testid="${element.getAttribute('data-testid')}"]` : ''}${element.getAttribute('class') ? `.${element.getAttribute('class')?.trim().split(/\s+/).slice(0, 2).join('.')}` : ''}`
              : 'unknown'
            const previous = source.previousRect ?? new DOMRectReadOnly()
            const current = source.currentRect ?? new DOMRectReadOnly()
            sources.push({
              node: nodeLabel,
              previous: { x: previous.x, y: previous.y, width: previous.width, height: previous.height },
              current: { x: current.x, y: current.y, width: current.width, height: current.height },
            })
          }
          target.__vgCumulativeLayoutShift = (target.__vgCumulativeLayoutShift ?? 0) + (entry.value ?? 0)
          if ((target.__vgLayoutShifts?.length ?? 0) < 24) {
            target.__vgLayoutShifts?.push({ value: entry.value ?? 0, timeMs: entry.startTime, sources })
          }
        }
      })
      observer.observe({ type: 'layout-shift', buffered: true })
    } catch {
      // CLS is optional in older browser engines.
    }
  })
}

async function browserNow(page: Page) {
  return page.evaluate(() => performance.now())
}

async function waitForVisible(page: Page, selector: string, timeout = READY_TIMEOUT_MS) {
  try {
    await page.locator(selector).first().waitFor({ state: 'visible', timeout })
    return await browserNow(page)
  } catch {
    return null
  }
}

async function measureLoad(page: Page, url: string, kind: LoadMeasurement['kind']): Promise<LoadMeasurement> {
  await page.goto(`${url}?bootSplash=0`, { waitUntil: 'commit', timeout: READY_TIMEOUT_MS })
  try {
    await page.waitForLoadState('load', { timeout: READY_TIMEOUT_MS })
  } catch {
    // Readiness measurements remain useful if a non-critical resource delays load.
  }

  const navigation = await page.evaluate(() => {
    const entry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    return {
      domContentLoadedMs: entry && entry.domContentLoadedEventEnd > 0 ? entry.domContentLoadedEventEnd : null,
      loadMs: entry && entry.loadEventEnd > 0 ? entry.loadEventEnd : null,
    }
  })

  const workspaceMs = await waitForVisible(page, '#main-workspace')
  const mapTab = page.locator('.tab-bar-tabs button').filter({ hasText: /^Map$/ }).first()
  if (await mapTab.count()) await mapTab.evaluate((element) => element.click())
  const mapMs = workspaceMs === null
    ? null
    : await waitForVisible(page, '.map-tab .map-backbone')
  const startupLongTasks = await page.evaluate(() => {
    const entries = (window as WindowWithStartupProbe).__vgLongTasks
    return {
      supported: Array.isArray(entries),
      count: entries?.length ?? 0,
      totalMs: entries?.reduce((sum, entry) => sum + entry.duration, 0) ?? 0,
      maxMs: entries?.reduce((max, entry) => Math.max(max, entry.duration), 0) ?? 0,
      blockingMs: entries?.reduce((sum, entry) => sum + Math.max(0, entry.duration - 50), 0) ?? 0,
    }
  })
  const startupVitals = await page.evaluate(() => {
    const probe = window as WindowWithStartupProbe
    const paintEntries = performance.getEntriesByType('paint')
    let fcpMs: number | null = null
    for (const entry of paintEntries) {
      if (entry.name === 'first-contentful-paint') fcpMs = entry.startTime
    }
    return {
      fcpMs,
      lcpMs: probe.__vgLargestContentfulPaint ?? null,
      cls: probe.__vgCumulativeLayoutShift ?? null,
      layoutShifts: probe.__vgLayoutShifts ?? [],
    }
  })

  let sequenceMs: number | null = null
  let sequenceStatus: LoadMeasurement['readiness']['sequenceStatus'] = 'unavailable'
  const sequenceTab = page.locator('.tab-bar-tabs button').filter({ hasText: /^Sequence$/ }).first()
  if (await sequenceTab.count()) {
    try {
      await sequenceTab.evaluate((element) => element.click())
      sequenceMs = await waitForVisible(page, '.sequence-tab:not(.tab-panel-hidden) .sequence-row')
      sequenceStatus = sequenceMs === null ? 'timeout' : 'ready'
    } catch {
      sequenceStatus = 'timeout'
    }
  }

  const result = await page.evaluate(async ({ startupLongTasks, startupVitals }) => {
    const origin = location.origin
    const resources = performance
      .getEntriesByType('resource')
      .filter((entry): entry is PerformanceResourceTiming => entry instanceof PerformanceResourceTiming)
      .filter((entry) => new URL(entry.name).origin === origin)
    const slowest = resources
      .map((entry) => ({
        name: new URL(entry.name).pathname.split('/').pop() || entry.name,
        durationMs: Number.isFinite(entry.duration) ? entry.duration : 0,
        encodedBodyBytes: Number.isFinite(entry.encodedBodySize) ? entry.encodedBodySize : 0,
      }))
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, 5)
    let memory: LoadMeasurement['memory'] = {
      supported: false,
      bytes: null,
      source: null,
    }
    if (typeof performance.measureUserAgentSpecificMemory === 'function') {
      try {
        const sample = await Promise.race([
          performance.measureUserAgentSpecificMemory(),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 1_000)),
        ])
        if (sample) {
          memory = { supported: true, bytes: sample.bytes, source: 'measureUserAgentSpecificMemory' }
        }
      } catch {
        // The API can be present but unavailable in a non-isolated context.
      }
    }
    return {
      resources: {
        count: resources.length,
        transferredBytes: resources.reduce((sum, entry) => sum + (Number.isFinite(entry.transferSize) ? entry.transferSize : 0), 0),
        encodedBodyBytes: resources.reduce((sum, entry) => sum + (Number.isFinite(entry.encodedBodySize) ? entry.encodedBodySize : 0), 0),
        decodedBodyBytes: resources.reduce((sum, entry) => sum + (Number.isFinite(entry.decodedBodySize) ? entry.decodedBodySize : 0), 0),
        zeroTransferEntries: resources.filter((entry) => entry.transferSize === 0).length,
        slowest,
      },
      longTasks: {
        supported: startupLongTasks.supported,
        count: startupLongTasks.count,
        totalMs: startupLongTasks.totalMs,
        maxMs: startupLongTasks.maxMs,
      },
      webVitals: {
        fcpMs: startupVitals.fcpMs,
        lcpMs: startupVitals.lcpMs,
        cls: startupVitals.cls,
        startupLongTaskBlockingMs: startupLongTasks.blockingMs,
        layoutShifts: startupVitals.layoutShifts,
      },
      memory,
    }
  }, { startupLongTasks, startupVitals })

  return {
    kind,
    navigation,
    readiness: { workspaceMs, mapMs, sequenceMs, sequenceStatus },
    ...result,
  }
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? null
}

function percentile(values: number[], percentileValue: number) {
  const sorted = [...values].sort((a, b) => a - b)
  if (!sorted.length) return null
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * percentileValue) - 1)] ?? null
}

function summarize(measurements: LoadMeasurement[], key: keyof LoadMeasurement['readiness']) {
  const values = measurements
    .map((measurement) => measurement.readiness[key])
    .filter((value): value is number => typeof value === 'number')
  return { medianMs: median(values), p90Ms: percentile(values, 0.9), samples: values.length }
}

function summarizeResources(measurements: LoadMeasurement[]) {
  return {
    medianTransferredBytes: median(measurements.map((measurement) => measurement.resources.transferredBytes)),
    medianEncodedBodyBytes: median(measurements.map((measurement) => measurement.resources.encodedBodyBytes)),
    medianDecodedBodyBytes: median(measurements.map((measurement) => measurement.resources.decodedBodyBytes)),
    medianZeroTransferEntries: median(measurements.map((measurement) => measurement.resources.zeroTransferEntries)),
  }
}

function summarizeLayoutShifts(measurements: LoadMeasurement[]) {
  const shifts = measurements.flatMap((measurement) => measurement.webVitals.layoutShifts)
  const sourceTotals = new Map<string, number>()
  for (const shift of shifts) {
    for (const source of shift.sources) sourceTotals.set(source.node, (sourceTotals.get(source.node) ?? 0) + shift.value)
  }
  return {
    count: shifts.length,
    totalValue: shifts.reduce((sum, shift) => sum + shift.value, 0),
    largest: [...shifts].sort((a, b) => b.value - a.value).slice(0, 8),
    sourceEntryValueTotals: [...sourceTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([node, value]) => ({ node, value })),
  }
}

function printSummary(measurements: RunMeasurement[]) {
  for (const kind of ['cold-ish', 'cached-reload'] as const) {
    const samples = measurements.map((measurement) => measurement[kind === 'cold-ish' ? 'cold' : 'cached'])
    console.log(`\n${kind}`)
    console.log(JSON.stringify({
      navigation: {
        medianDomContentLoadedMs: median(samples.map((sample) => sample.navigation.domContentLoadedMs).filter((value): value is number => value !== null)),
        p90DomContentLoadedMs: percentile(samples.map((sample) => sample.navigation.domContentLoadedMs).filter((value): value is number => value !== null), 0.9),
        medianLoadMs: median(samples.map((sample) => sample.navigation.loadMs).filter((value): value is number => value !== null)),
        p90LoadMs: percentile(samples.map((sample) => sample.navigation.loadMs).filter((value): value is number => value !== null), 0.9),
      },
      readiness: {
        workspace: summarize(samples, 'workspaceMs'),
        map: summarize(samples, 'mapMs'),
        sequence: summarize(samples, 'sequenceMs'),
        sequenceStatuses: samples.map((sample) => sample.readiness.sequenceStatus),
      },
      resources: summarizeResources(samples),
      longTasks: {
        supported: samples.some((sample) => sample.longTasks.supported),
        medianCount: median(samples.map((sample) => sample.longTasks.count)),
        medianTotalMs: median(samples.map((sample) => sample.longTasks.totalMs)),
        medianMaxMs: median(samples.map((sample) => sample.longTasks.maxMs)),
        p90TotalMs: percentile(samples.map((sample) => sample.longTasks.totalMs), 0.9),
      },
      webVitals: {
        medianFcpMs: median(samples.map((sample) => sample.webVitals.fcpMs).filter((value): value is number => value !== null)),
        medianLcpMs: median(samples.map((sample) => sample.webVitals.lcpMs).filter((value): value is number => value !== null)),
        medianCls: median(samples.map((sample) => sample.webVitals.cls).filter((value): value is number => value !== null)),
        medianStartupLongTaskBlockingMs: median(samples.map((sample) => sample.webVitals.startupLongTaskBlockingMs)),
        layoutShifts: summarizeLayoutShifts(samples),
      },
      memory: samples.some((sample) => sample.memory.supported)
        ? { medianBytes: median(samples.map((sample) => sample.memory.bytes).filter((value): value is number => value !== null)) }
        : { supported: false },
    }, null, 2))
  }
}

async function main() {
  const port = numberOption('port', DEFAULT_PORT)
  const runs = numberOption('runs', DEFAULT_RUNS)
  const baseUrl = readOption('url', `http://127.0.0.1:${port}`)
  if (!existsSync('dist/index.html')) {
    throw new Error('dist/index.html is missing; run `npm run build:web` before measuring production startup')
  }

  const preview = startPreview(port)
  let browser: Browser | undefined
  try {
    await waitForPreview(baseUrl, preview)
    browser = await chromium.launch({ headless: true })
    const metadata = {
      gitSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      node: process.version,
      os: `${process.platform}/${process.arch}`,
      browser: browser.version(),
      viewport: { width: 1440, height: 900 },
      runs,
      baseUrl,
    }
    console.log('metadata')
    console.log(JSON.stringify(metadata, null, 2))
    const measurements: RunMeasurement[] = []
    for (let run = 1; run <= runs; run += 1) {
      const context = await browser.newContext({
        serviceWorkers: 'block',
        viewport: { width: 1440, height: 900 },
      })
      const page = await context.newPage()
      await installLongTaskProbe(page)
      const cdp = await context.newCDPSession(page)
      await cdp.send('Network.enable')
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
      const cold = await measureLoad(page, baseUrl, 'cold-ish')
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: false })
      const cached = await measureLoad(page, baseUrl, 'cached-reload')
      measurements.push({ run, cold, cached })
      await context.close()
      console.log(`completed run ${run}/${runs}`)
    }
    printSummary(measurements)
    console.log('\nraw')
    console.log(JSON.stringify(measurements, null, 2))
  } finally {
    await browser?.close()
    if (preview.exitCode === null) preview.kill('SIGTERM')
  }
}

await main()
