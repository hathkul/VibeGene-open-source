import { useRef } from 'react'
import { GuideScanDesignPanel, type GuideScanAddPayload } from './GuideScanDesignPanel'
import type { GuideScanDesignCacheEntry, GuideScanDesignRegionSelection } from './domain/guidescan'
import type { SequenceRecord } from './domain/types'
import { DialogResizeGrip } from './ui/DialogResizeGrip'
import { useClampDialogToViewport } from './ui/useClampDialogToViewport'

export function GuideScanDesignDialog({
  record,
  designSelection,
  persistedCache,
  onPersistDesignCache,
  onCancel,
  onAddSelected,
}: {
  record: SequenceRecord
  designSelection?: GuideScanDesignRegionSelection | null
  persistedCache?: GuideScanDesignCacheEntry
  onPersistDesignCache?: (entry: GuideScanDesignCacheEntry) => void
  onCancel: () => void
  onAddSelected: (payload: GuideScanAddPayload) => void
}) {
  const dialogRef = useRef<HTMLElement | null>(null)
  useClampDialogToViewport(dialogRef, 16)

  return (
    <div className="translation-dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <section
        ref={dialogRef}
        className="translation-dialog sgrna-dialog guidescan-design-dialog compact-scientific-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guidescan-design-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <GuideScanDesignPanel
          record={record}
          designSelection={designSelection ?? null}
          persistedCache={persistedCache}
          onPersistDesignCache={onPersistDesignCache}
          onCancel={onCancel}
          onAddSelected={onAddSelected}
        />
        <DialogResizeGrip dialogRef={dialogRef} />
      </section>
    </div>
  )
}
