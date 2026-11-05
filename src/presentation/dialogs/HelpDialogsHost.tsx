import type { MoleculeType } from '../../domain/types'
import { GeneticCodeTablesDialog } from '../../ToolsDialogs'
import { WhatsNewDialog } from '../../WhatsNewDialog'
import { AboutDialog } from '../../AboutDialog'
import { TelegramGroupDialog } from '../../TelegramGroupDialog'
import { DnaLibraryHelpDialog } from '../../DnaLibraryHelpDialog'
import { HistoryDerivedWorkflowsHelpDialog } from '../../HistoryDerivedWorkflowsHelpDialog'
import { DatabaseHelpDialog } from '../../DatabaseHelpDialog'
import { CrisprWorkflowHelpDialog } from '../../CrisprWorkflowHelpDialog'
import { AlignmentsHelpDialog } from '../../AlignmentsHelpDialog'
import { KeyboardShortcutsDialog } from '../../KeyboardShortcutsDialog'

export type HelpDialogsHostProps = {
  geneticCodeTablesOpen: boolean
  setGeneticCodeTablesOpen: (open: boolean) => void
  whatsNewOpen: boolean
  dismissWhatsNew: () => void
  setWhatsNewOpen: (open: boolean) => void
  aboutOpen: boolean
  setAboutOpen: (open: boolean) => void
  telegramGroupOpen: boolean
  setTelegramGroupOpen: (open: boolean) => void
  dnaLibraryHelpOpen: boolean
  setDnaLibraryHelpOpen: (open: boolean) => void
  historyDerivedWorkflowsHelpOpen: boolean
  setHistoryDerivedWorkflowsHelpOpen: (open: boolean) => void
  databaseHelpOpen: boolean
  setDatabaseHelpOpen: (open: boolean) => void
  crisprWorkflowHelpOpen: boolean
  setCrisprWorkflowHelpOpen: (open: boolean) => void
  alignmentsHelpOpen: boolean
  setAlignmentsHelpOpen: (open: boolean) => void
  keyboardShortcutsOpen: boolean
  setKeyboardShortcutsOpen: (open: boolean) => void
  molecule: MoleculeType
}

/** Hosts help, about, release-note, and shortcut dialogs as one cohesive utility group. */
export function HelpDialogsHost(props: HelpDialogsHostProps) {
  return (
    <>
      {props.geneticCodeTablesOpen && <GeneticCodeTablesDialog onClose={() => props.setGeneticCodeTablesOpen(false)} />}
      {props.whatsNewOpen && <WhatsNewDialog onDismiss={() => { props.dismissWhatsNew(); props.setWhatsNewOpen(false) }} />}
      {props.aboutOpen && <AboutDialog onDismiss={() => props.setAboutOpen(false)} />}
      {props.telegramGroupOpen && <TelegramGroupDialog onDismiss={() => props.setTelegramGroupOpen(false)} />}
      {props.dnaLibraryHelpOpen && <DnaLibraryHelpDialog onDismiss={() => props.setDnaLibraryHelpOpen(false)} />}
      {props.historyDerivedWorkflowsHelpOpen && <HistoryDerivedWorkflowsHelpDialog onDismiss={() => props.setHistoryDerivedWorkflowsHelpOpen(false)} />}
      {props.databaseHelpOpen && <DatabaseHelpDialog onDismiss={() => props.setDatabaseHelpOpen(false)} />}
      {props.crisprWorkflowHelpOpen && <CrisprWorkflowHelpDialog onDismiss={() => props.setCrisprWorkflowHelpOpen(false)} />}
      {props.alignmentsHelpOpen && <AlignmentsHelpDialog onDismiss={() => props.setAlignmentsHelpOpen(false)} />}
      {props.keyboardShortcutsOpen && <KeyboardShortcutsDialog onDismiss={() => props.setKeyboardShortcutsOpen(false)} molecule={props.molecule} />}
    </>
  )
}
