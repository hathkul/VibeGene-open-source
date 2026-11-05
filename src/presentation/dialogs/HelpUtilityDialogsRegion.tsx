import type { ComponentProps } from 'react'
import { dismissWhatsNew } from '../../domain/whatsNew'
import { BugReportDialog } from '../../BugReportDialog'
import { BugReportDialogsHost } from './BugReportDialogsHost'
import { HelpDialogsHost } from './HelpDialogsHost'
import { UtilityDialogsHost, type UtilityDialogsHostProps } from './UtilityDialogsHost'
import type { HelpDialogsOpenSnapshot } from '../hooks/useHelpDialogsController'
import type { MoleculeType, SequenceRecord } from '../../domain/types'
import type { ToolsMwSelection } from '../../ToolsDialogs'

export type UtilityBugReportDialogsRegionProps = {
  record: SequenceRecord
  toolsMwSelection: ToolsMwSelection | null
  utility: Omit<UtilityDialogsHostProps, 'record' | 'toolsMwSelection'>
  bugReport: {
    open: boolean
    onClose: () => void
    dialogProps: Omit<ComponentProps<typeof BugReportDialog>, 'onClose'>
  }
}

export type HelpDialogsRegionProps = {
  molecule: MoleculeType
  helpOpen: HelpDialogsOpenSnapshot & {
    setGeneticCodeTablesOpen: (open: boolean) => void
    setWhatsNewOpen: (open: boolean) => void
    setAboutOpen: (open: boolean) => void
    setTelegramGroupOpen: (open: boolean) => void
    setDnaLibraryHelpOpen: (open: boolean) => void
    setHistoryDerivedWorkflowsHelpOpen: (open: boolean) => void
    setDatabaseHelpOpen: (open: boolean) => void
    setCrisprWorkflowHelpOpen: (open: boolean) => void
    setAlignmentsHelpOpen: (open: boolean) => void
    setKeyboardShortcutsOpen: (open: boolean) => void
  }
}

/** Utility, link, preferences, and bug-report dialog hosts (render before document lifecycle). */
export function UtilityBugReportDialogsRegion(props: UtilityBugReportDialogsRegionProps) {
  return (
    <>
      <UtilityDialogsHost
        record={props.record}
        toolsMwSelection={props.toolsMwSelection}
        {...props.utility}
      />
      <BugReportDialogsHost
        bugReportOpen={props.bugReport.open}
        props={props.bugReport.dialogProps}
        onClose={props.bugReport.onClose}
      />
    </>
  )
}

/** Help/about/feature-help dialog host (render after document lifecycle). */
export function HelpDialogsRegion(props: HelpDialogsRegionProps) {
  const { helpOpen: help } = props
  return (
      <HelpDialogsHost
        geneticCodeTablesOpen={help.geneticCodeTablesOpen}
        setGeneticCodeTablesOpen={help.setGeneticCodeTablesOpen}
        whatsNewOpen={help.whatsNewOpen}
        dismissWhatsNew={dismissWhatsNew}
        setWhatsNewOpen={help.setWhatsNewOpen}
        aboutOpen={help.aboutOpen}
        setAboutOpen={help.setAboutOpen}
        telegramGroupOpen={help.telegramGroupOpen}
        setTelegramGroupOpen={help.setTelegramGroupOpen}
        dnaLibraryHelpOpen={help.dnaLibraryHelpOpen}
        setDnaLibraryHelpOpen={help.setDnaLibraryHelpOpen}
        historyDerivedWorkflowsHelpOpen={help.historyDerivedWorkflowsHelpOpen}
        setHistoryDerivedWorkflowsHelpOpen={help.setHistoryDerivedWorkflowsHelpOpen}
        databaseHelpOpen={help.databaseHelpOpen}
        setDatabaseHelpOpen={help.setDatabaseHelpOpen}
        crisprWorkflowHelpOpen={help.crisprWorkflowHelpOpen}
        setCrisprWorkflowHelpOpen={help.setCrisprWorkflowHelpOpen}
        alignmentsHelpOpen={help.alignmentsHelpOpen}
        setAlignmentsHelpOpen={help.setAlignmentsHelpOpen}
        keyboardShortcutsOpen={help.keyboardShortcutsOpen}
        setKeyboardShortcutsOpen={help.setKeyboardShortcutsOpen}
        molecule={props.molecule}
      />
  )
}
