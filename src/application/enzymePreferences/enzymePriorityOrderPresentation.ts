export function enzymePriorityOrderSaveStatus(priorityOrder: readonly string[]): string {
  return priorityOrder.length
    ? `Saved custom enzyme priority order (${priorityOrder.length} enzymes).`
    : 'Restored default enzyme priority order.'
}
