import type { ComponentProps } from 'react'
import { BugReportDialog } from '../../BugReportDialog'

export type BugReportDialogsHostProps = {
  bugReportOpen: boolean
  props: Omit<ComponentProps<typeof BugReportDialog>, 'onClose'>
  onClose: () => void
}

/** Hosts the optional diagnostics submission dialog. */
export function BugReportDialogsHost({ bugReportOpen, props, onClose }: BugReportDialogsHostProps) {
  return bugReportOpen ? <BugReportDialog {...props} onClose={onClose} /> : null
}
