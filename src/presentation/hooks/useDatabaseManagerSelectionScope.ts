import { useCallback, useState, type SetStateAction } from 'react'

export function useDatabaseManagerSelectionScope(activeScope: string | null) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [selectionScopeKey, setSelectionScopeKey] = useState<string | null>(null)
  const setScopedSelectedIds = useCallback((next: SetStateAction<string[]>) => {
    setSelectionScopeKey(activeScope)
    setSelectedIds((current) => {
      const scopedCurrent = selectionScopeKey === activeScope ? current : []
      return typeof next === 'function' ? next(scopedCurrent) : next
    })
  }, [activeScope, selectionScopeKey])
  return { selectedIds, selectionScopeKey, setScopedSelectedIds }
}
