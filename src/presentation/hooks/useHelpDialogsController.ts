import { useCallback, useState } from 'react'
import { shouldShowWhatsNew } from '../../domain/whatsNew'

export type HelpDialogsHybridPort = {
  tryOpenHybridWindow: (kind: 'genetic-code-tables') => Promise<boolean>
}

export type HelpDialogsOpenSnapshot = {
  aboutOpen: boolean
  telegramGroupOpen: boolean
  whatsNewOpen: boolean
  geneticCodeTablesOpen: boolean
  dnaLibraryHelpOpen: boolean
  historyDerivedWorkflowsHelpOpen: boolean
  databaseHelpOpen: boolean
  crisprWorkflowHelpOpen: boolean
  alignmentsHelpOpen: boolean
  keyboardShortcutsOpen: boolean
}

/** Owns help, about, release-note, and feature-help dialog open state. */
export function useHelpDialogsController() {
  const [whatsNewOpen, setWhatsNewOpen] = useState(() => shouldShowWhatsNew())
  const [aboutOpen, setAboutOpen] = useState(false)
  const [telegramGroupOpen, setTelegramGroupOpen] = useState(false)
  const [dnaLibraryHelpOpen, setDnaLibraryHelpOpen] = useState(false)
  const [historyDerivedWorkflowsHelpOpen, setHistoryDerivedWorkflowsHelpOpen] = useState(false)
  const [databaseHelpOpen, setDatabaseHelpOpen] = useState(false)
  const [crisprWorkflowHelpOpen, setCrisprWorkflowHelpOpen] = useState(false)
  const [alignmentsHelpOpen, setAlignmentsHelpOpen] = useState(false)
  const [keyboardShortcutsOpen, setKeyboardShortcutsOpen] = useState(false)
  const [geneticCodeTablesOpen, setGeneticCodeTablesOpen] = useState(false)

  const openGeneticCodeTablesWindow = useCallback((ports: HelpDialogsHybridPort) => {
    void ports.tryOpenHybridWindow('genetic-code-tables').then((opened) => {
      if (!opened) setGeneticCodeTablesOpen(true)
    })
  }, [])

  const openSnapshot: HelpDialogsOpenSnapshot = {
    aboutOpen,
    telegramGroupOpen,
    whatsNewOpen,
    geneticCodeTablesOpen,
    dnaLibraryHelpOpen,
    historyDerivedWorkflowsHelpOpen,
    databaseHelpOpen,
    crisprWorkflowHelpOpen,
    alignmentsHelpOpen,
    keyboardShortcutsOpen,
  }

  return {
    openSnapshot,
    setWhatsNewOpen,
    setAboutOpen,
    setTelegramGroupOpen,
    setDnaLibraryHelpOpen,
    setHistoryDerivedWorkflowsHelpOpen,
    setDatabaseHelpOpen,
    setCrisprWorkflowHelpOpen,
    setAlignmentsHelpOpen,
    setKeyboardShortcutsOpen,
    geneticCodeTablesOpen,
    setGeneticCodeTablesOpen,
    whatsNewOpen,
    aboutOpen,
    telegramGroupOpen,
    dnaLibraryHelpOpen,
    historyDerivedWorkflowsHelpOpen,
    databaseHelpOpen,
    crisprWorkflowHelpOpen,
    alignmentsHelpOpen,
    keyboardShortcutsOpen,
    openGeneticCodeTablesWindow,
  }
}
