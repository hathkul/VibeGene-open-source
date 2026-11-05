export type RouterClock = { now(): number }

export type RouterProfileEntry = { step: string; ms: number; details?: string }

export function routerPerformanceClock(): RouterClock {
  return { now: () => performance.now() }
}

export function elapsedMs(clock: RouterClock | null, started: number): number {
  return clock ? clock.now() - started : 0
}

/** Translate an absolute SVG arc path `M x y A r r 0 large sweep x2 y2` by (dx, dy). */
export function translateCircularArcPath(d: string, dx: number, dy: number) {
  const match = /^M ([-\d.]+) ([-\d.]+) A ([-\d.]+) ([-\d.]+) 0 (\d) (\d) ([-\d.]+) ([-\d.]+)$/.exec(d)
  if (!match) return d
  const x1 = Number(match[1]) + dx
  const y1 = Number(match[2]) + dy
  const x2 = Number(match[7]) + dx
  const y2 = Number(match[8]) + dy
  return `M ${x1} ${y1} A ${match[3]} ${match[4]} 0 ${match[5]} ${match[6]} ${x2} ${y2}`
}

export function logRouterProfile(label: string, entries: RouterProfileEntry[]) {
  if (!entries.length) return
  const total = entries.reduce((sum, entry) => sum + entry.ms, 0)
  const formatted = entries
    .filter((entry) => entry.ms >= 0)
    .map((entry) => ({
      step: entry.step,
      ms: Number(entry.ms.toFixed(2)),
      details: entry.details ?? '',
    }))
  console.groupCollapsed(`[router][profile] ${label} total=${total.toFixed(2)}ms`)
  console.table(formatted)
  console.groupEnd()
}
