import { useCallback, useEffect, useState } from 'react'
import { applySavedAppPreferences, type ApplySavedAppPreferencesPorts } from '../../application/appPreferences/applySavedAppPreferences'
import type { AppPreferences } from '../../domain/appPreferences'
import { readAppPreferences } from '../../domain/appPreferences'
import { sendHeartbeat } from '../../domain/telemetry'
import type { RemoteSequenceOpenError } from '../dialogs/utilityDialogTypes'

export type UtilityDialogsHybridPort = {
  tryOpenHybridWindow: (kind: 'preferences' | 'genetic-code-tables') => Promise<boolean>
}

export type UtilityDialogsOpenSnapshot = {
  preferencesOpen: boolean
  generateLinkOpen: boolean
  openSequenceUrlOpen: boolean
  bugReportOpen: boolean
}

export type UtilityDialogsControllerOptions = {
  initialRemoteSequenceOpenError: RemoteSequenceOpenError | null
  whatsNewVersion: string
  subscribeAppPreferencesExternalSync: (apply: (preferences: AppPreferences) => void) => () => void
  preferenceSavePorts: Omit<ApplySavedAppPreferencesPorts, 'setAppPreferences'>
}

/** Owns preferences, link/URL, and bug-report dialog state. */
export function useUtilityDialogsController({
  initialRemoteSequenceOpenError,
  whatsNewVersion,
  subscribeAppPreferencesExternalSync,
  preferenceSavePorts,
}: UtilityDialogsControllerOptions) {
  const [generateLinkOpen, setGenerateLinkOpen] = useState(false)
  const [openSequenceUrlOpen, setOpenSequenceUrlOpen] = useState(false)
  const [remoteSequenceOpenError, setRemoteSequenceOpenError] = useState<RemoteSequenceOpenError | null>(
    () => initialRemoteSequenceOpenError,
  )
  const [preferencesOpen, setPreferencesOpen] = useState(false)
  const [bugReportOpen, setBugReportOpen] = useState(false)
  const [appPreferences, setAppPreferences] = useState<AppPreferences>(() => readAppPreferences())

  useEffect(() => {
    return subscribeAppPreferencesExternalSync(setAppPreferences)
  }, [subscribeAppPreferencesExternalSync])

  useEffect(() => {
    if (!appPreferences.shareAnonymousUsage) return
    void sendHeartbeat(whatsNewVersion)
  }, [appPreferences.shareAnonymousUsage, whatsNewVersion])

  const openPreferencesWindow = useCallback((ports: UtilityDialogsHybridPort) => {
    void ports.tryOpenHybridWindow('preferences').then((opened) => {
      if (!opened) setPreferencesOpen(true)
    })
  }, [])

  const saveAppPreferences = useCallback((preferences: AppPreferences) => {
    applySavedAppPreferences(preferences, {
      setAppPreferences,
      ...preferenceSavePorts,
    })
  }, [preferenceSavePorts])

  const openSnapshot: UtilityDialogsOpenSnapshot = {
    preferencesOpen,
    generateLinkOpen,
    openSequenceUrlOpen,
    bugReportOpen,
  }

  return {
    appPreferences,
    setAppPreferences,
    openSnapshot,
    generateLinkOpen,
    setGenerateLinkOpen,
    openSequenceUrlOpen,
    setOpenSequenceUrlOpen,
    remoteSequenceOpenError,
    setRemoteSequenceOpenError,
    preferencesOpen,
    setPreferencesOpen,
    bugReportOpen,
    setBugReportOpen,
    openPreferencesWindow,
    saveAppPreferences,
  }
}
