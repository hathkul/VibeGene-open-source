import { useCallback, useEffect, useState } from 'react'
import { enzymePriorityOrderSaveStatus } from '../../application/enzymePreferences/enzymePriorityOrderPresentation'
import { pickRandomEnzymeName, planEnzymePreferencesApply } from '../../application/enzymePreferences/enzymePreferencesApplyPlan'
import type { EnzymePreferences } from '../../domain/enzymePreferences'
import type { EnzymeTabPositionMode } from '../sequence'

export type WorkspaceEnzymePreferencesControllerOptions = {
  enzymePreferences: EnzymePreferences
  setEnzymePreferences: (preferences: EnzymePreferences) => void
  setEnzymeTabPositionMode: (mode: EnzymeTabPositionMode) => void
  normalizeEnzymePreferences: (preferences: Partial<EnzymePreferences>) => EnzymePreferences
  saveEnzymePreferences: (preferences: EnzymePreferences) => void
  subscribeExternalSync: (apply: (preferences: EnzymePreferences) => void) => () => void
  enzymeNames: readonly string[]
  openEnzymeInfo: (name: string) => void
  setStatus: (message: string) => void
}

/** Owns enzyme preference persistence, cross-window sync, and random enzyme info routing. */
export function useWorkspaceEnzymePreferencesController(options: WorkspaceEnzymePreferencesControllerOptions) {
  const [enzymePrioritiesOpen, setEnzymePrioritiesOpen] = useState(false)

  const applyEnzymePreferences = useCallback((preferences: EnzymePreferences) => {
    const plan = planEnzymePreferencesApply(preferences)
    options.setEnzymePreferences(plan.preferences)
    options.setEnzymeTabPositionMode(plan.tabPositionMode)
  }, [options])

  const handleEnzymePreferencesChange = useCallback((preferences: EnzymePreferences) => {
    const normalized = options.normalizeEnzymePreferences(preferences)
    applyEnzymePreferences(normalized)
    options.saveEnzymePreferences(normalized)
  }, [applyEnzymePreferences, options])

  const { subscribeExternalSync } = options

  useEffect(() => {
    return subscribeExternalSync((preferences) => {
      applyEnzymePreferences(preferences)
    })
  }, [applyEnzymePreferences, subscribeExternalSync])

  const openRandomEnzymeInfo = useCallback(() => {
    const name = pickRandomEnzymeName(options.enzymeNames)
    if (name) options.openEnzymeInfo(name)
  }, [options])

  const saveEnzymePriorityOrder = useCallback((priorityOrder: string[]) => {
    handleEnzymePreferencesChange({ ...options.enzymePreferences, priorityOrder })
    setEnzymePrioritiesOpen(false)
    options.setStatus(enzymePriorityOrderSaveStatus(priorityOrder))
  }, [handleEnzymePreferencesChange, options])

  return {
    handleEnzymePreferencesChange,
    openRandomEnzymeInfo,
    enzymePrioritiesOpen,
    setEnzymePrioritiesOpen,
    saveEnzymePriorityOrder,
  }
}
