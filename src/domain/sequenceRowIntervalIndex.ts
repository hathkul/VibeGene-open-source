export type SequenceRowInterval = { rowStart: number; rowLength: number }

/** Index intervals into only the sequence rows they overlap. Row order must be genomic. */
export function indexIntervalsBySequenceRow<T>(
  items: readonly T[],
  rows: readonly SequenceRowInterval[],
  intervalOf: (item: T) => { start: number; end: number },
): T[][] {
  const result = rows.map(() => [] as T[])
  for (const item of items) {
    const { start, end } = intervalOf(item)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue
    let low = 0
    let high = rows.length
    while (low < high) {
      const middle = (low + high) >>> 1
      const row = rows[middle]!
      if (row.rowStart + row.rowLength <= start) low = middle + 1
      else high = middle
    }
    for (let index = low; index < rows.length; index += 1) {
      const row = rows[index]!
      if (row.rowStart >= end) break
      if (row.rowStart + row.rowLength > start) result[index]!.push(item)
    }
  }
  return result
}
