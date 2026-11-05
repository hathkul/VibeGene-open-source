export type FlexibleColumnLayout<T extends string> = {
  flexColumnId: T
  flexColumnMinWidth: number
  selectionColumnWidth: number
  minWidths?: Partial<Record<T, number>>
}

export function fixedColumnsSum<T extends string>(
  widths: Record<T, number>,
  flexColumnId: T,
): number {
  return (Object.keys(widths) as T[])
    .filter((id) => id !== flexColumnId)
    .reduce((sum, id) => sum + widths[id], 0)
}

export function effectiveFlexibleColumnWidths<T extends string>(
  widths: Record<T, number>,
  viewportWidth: number,
  flexColumnId: NoInfer<T>,
  options: Pick<FlexibleColumnLayout<T>, 'flexColumnMinWidth' | 'selectionColumnWidth' | 'minWidths'>,
): Record<T, number> {
  const { flexColumnMinWidth, selectionColumnWidth } = options
  const fixedIds = (Object.keys(widths) as T[]).filter((id) => id !== flexColumnId)
  const nextFixed = { ...widths }
  if (viewportWidth > 0) {
    const availableFixed = Math.max(0, viewportWidth - selectionColumnWidth - flexColumnMinWidth)
    const fixedSum = fixedIds.reduce((sum, id) => sum + widths[id], 0)
    let deficit = Math.max(0, fixedSum - availableFixed)
    const shrinkable = fixedIds.map((id) => ({ id, amount: Math.max(0, widths[id] - (options.minWidths?.[id] ?? 0)) }))
    while (deficit > 0 && shrinkable.some((entry) => entry.amount > 0)) {
      const active = shrinkable.filter((entry) => entry.amount > 0)
      const share = Math.max(1, Math.ceil(deficit / active.length))
      for (const entry of active) {
        const reduction = Math.min(entry.amount, share, deficit)
        nextFixed[entry.id] -= reduction
        entry.amount -= reduction
        deficit -= reduction
        if (deficit === 0) break
      }
    }
  }
  const leftover = Math.max(
    flexColumnMinWidth,
    viewportWidth > 0
      ? Math.floor(viewportWidth - selectionColumnWidth - fixedIds.reduce((sum, id) => sum + nextFixed[id], 0))
      : widths[flexColumnId],
  )
  return {
    ...nextFixed,
    [flexColumnId]: viewportWidth > 0 ? leftover : Math.max(widths[flexColumnId], leftover),
  }
}
