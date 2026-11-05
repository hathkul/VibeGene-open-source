/** Native / browser menu action id for the standalone GuideScan2 design dialog. */
export const GUIDESCAN_DESIGN_MENU_ACTION = 'crispr.design-sgrna' as const

export type GuideScanDesignMenuAction = typeof GUIDESCAN_DESIGN_MENU_ACTION

export function isGuideScanDesignMenuAction(action: string): action is GuideScanDesignMenuAction {
  return action === GUIDESCAN_DESIGN_MENU_ACTION
}

export function tryOpenGuideScanDesignFromMenuAction(action: string, open: () => void): boolean {
  if (!isGuideScanDesignMenuAction(action)) return false
  open()
  return true
}
