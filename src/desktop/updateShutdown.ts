/** Operations needed to prepare an update without discarding unsaved work. */
export type UpdateShutdownPorts = {
  /** Resolve only after the editor is closed or the user cancels its prompt. */
  closeNextWorkspace: () => Promise<'closed' | 'cancelled' | 'none'>
  syncDatabase: () => Promise<boolean>
  hasOpenWorkspaces: () => Promise<boolean>
}

/**
 * Preparation only: does not install or restart. The caller must prevent new
 * windows opening between its final check and the install operation.
 */
export async function prepareShutdownForUpdate(ports: UpdateShutdownPorts): Promise<boolean> {
  for (;;) {
    const result = await ports.closeNextWorkspace()
    if (result === 'cancelled') return false
    if (result === 'none') break
  }
  if (await ports.hasOpenWorkspaces()) return false
  if (!await ports.syncDatabase()) return false
  return !await ports.hasOpenWorkspaces()
}
