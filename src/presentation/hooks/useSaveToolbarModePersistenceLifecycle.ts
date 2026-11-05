import { useEffect, useLayoutEffect, useRef } from 'react'
import type { SaveToolbarMode } from '../../application/ports/saveToolbar'
import type { SaveToolbarModePersistenceAdapters } from '../../application/ports/lifecycle'

export type SaveToolbarModePersistenceLifecyclePorts = SaveToolbarModePersistenceAdapters & {
  saveToolbarMode: SaveToolbarMode
}

/** Persists the save-toolbar mode choice whenever it changes. */
export function useSaveToolbarModePersistenceLifecycle(ports: SaveToolbarModePersistenceLifecyclePorts) {
  const portsRef = useRef(ports)
  useLayoutEffect(() => {
    portsRef.current = ports
  }, [ports])

  const { saveToolbarMode } = ports

  useEffect(() => {
    portsRef.current.writeSaveToolbarMode(saveToolbarMode)
  }, [saveToolbarMode])
}
