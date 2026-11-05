import { useEffect } from 'react'

export type ProjectRefreshLifecyclePorts = {
  refreshProjects: () => void | Promise<void>
  subscribeLibraryChanged: (listener: () => void) => () => void
  scheduleDatabaseBackgroundSync: () => void
}

/** Initial project list refresh and library-change background sync subscription. */
export function useProjectRefreshLifecycle(ports: ProjectRefreshLifecyclePorts) {
  const { refreshProjects, subscribeLibraryChanged, scheduleDatabaseBackgroundSync } = ports

  useEffect(() => {
    void refreshProjects()
  }, [refreshProjects])

  useEffect(() => {
    return subscribeLibraryChanged(() => {
      void refreshProjects()
      scheduleDatabaseBackgroundSync()
    })
  }, [refreshProjects, scheduleDatabaseBackgroundSync, subscribeLibraryChanged])
}
