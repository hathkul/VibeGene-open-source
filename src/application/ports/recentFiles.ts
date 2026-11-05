export type RecentFileEntry =
  | {
      kind: 'local'
      name: string
      path: string
      openedAt: string
    }
  | {
      kind: 'database'
      name: string
      projectId: string
      openedAt: string
    }

export const RECENT_FILES_CHANGED_EVENT = 'vg-recent-files-changed'
