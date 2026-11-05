export type AppDatabaseManagerHistoryRecoveryToolbarInput = {
  fileView: boolean
  latestHistoryRecoveryProjectCount: number | null
  busy: boolean
}

export type AppDatabaseManagerHistoryRecoveryToolbarSlice = {
  visible: boolean
  projectCount: number
  busy: boolean
}

export function buildAppDatabaseManagerHistoryRecoveryToolbarSlice(
  input: AppDatabaseManagerHistoryRecoveryToolbarInput,
): AppDatabaseManagerHistoryRecoveryToolbarSlice {
  const projectCount = input.latestHistoryRecoveryProjectCount ?? 0
  return {
    visible: input.fileView && projectCount > 0,
    projectCount,
    busy: input.busy,
  }
}
