/** Target interior size ticks on the linear map. */
export const LINEAR_RULER_TARGET_MARKS = 5
export const LINEAR_RULER_MIN_MARKS = 4
export const LINEAR_RULER_MAX_MARKS = 6

/** Target interior size ticks on the circular map (origin is a separate mark). */
export const CIRCULAR_RULER_TARGET_MARKS = 8
export const CIRCULAR_RULER_MIN_MARKS = 4
export const CIRCULAR_RULER_MAX_MARKS = 12

export function niceBpStep(raw: number): number {
  const value = Math.max(1, raw)
  const exp = Math.floor(Math.log10(value))
  let best = 10 ** Math.max(0, exp)
  let bestDiff = Infinity
  for (const e of [exp - 1, exp, exp + 1]) {
    if (e < 0) continue
    const base = 10 ** e
    for (const factor of [1, 2, 5]) {
      const step = factor * base
      const diff = Math.abs(step - value)
      if (diff < bestDiff) {
        best = step
        bestDiff = diff
      }
    }
  }
  return Math.max(1, best)
}

export function marksForBpStep(sequenceLength: number, step: number, limit = 24): number[] {
  if (sequenceLength <= 1 || step <= 0) return []
  const marks: number[] = []
  for (let position = step; position < sequenceLength; position += step) {
    marks.push(position)
    if (marks.length >= limit) break
  }
  return marks
}

function rulerMarkPositions(
  sequenceLength: number,
  targetMarks: number,
  minMarks: number,
  maxMarks: number,
): number[] {
  if (sequenceLength <= 1) return []
  let step = niceBpStep(sequenceLength / (targetMarks + 1))
  let marks = marksForBpStep(sequenceLength, step, maxMarks)
  while (marks.length > maxMarks) {
    const next = niceBpStep(step * 2)
    if (next <= step) break
    step = next
    marks = marksForBpStep(sequenceLength, step, maxMarks)
  }
  while (marks.length < minMarks) {
    const next = niceBpStep(step / 2)
    if (next >= step || next < 1) break
    const candidate = marksForBpStep(sequenceLength, next, maxMarks)
    if (candidate.length > maxMarks) break
    step = next
    marks = candidate
  }
  return marks
}

/** Place about 4–6 evenly spaced size notches (nice round bp steps). */
export function linearRulerMarkPositions(sequenceLength: number): number[] {
  return rulerMarkPositions(
    sequenceLength,
    LINEAR_RULER_TARGET_MARKS,
    LINEAR_RULER_MIN_MARKS,
    LINEAR_RULER_MAX_MARKS,
  )
}

/** Place about 4–12 evenly spaced size notches (nice round bp steps). Origin is separate. */
export function circularRulerMarkPositions(sequenceLength: number): number[] {
  return rulerMarkPositions(
    sequenceLength,
    CIRCULAR_RULER_TARGET_MARKS,
    CIRCULAR_RULER_MIN_MARKS,
    CIRCULAR_RULER_MAX_MARKS,
  )
}
