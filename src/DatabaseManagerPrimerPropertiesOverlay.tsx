import { PrimerPropertiesDialog } from './PrimerPropertiesDialog'
import type { PrimerPropertiesPayload } from './application/ports/hybridWindows'
import { primerRowIsCommon, type DatabasePrimerRow } from './storage/databasePrimers'
import type { LibraryPrimer } from './domain/libraryPrimer'

export function DatabaseManagerPrimerPropertiesOverlay({
  editingPrimer,
  editingPrimerPayload,
  onClose,
  onCopyAsCommon,
  onSaveCommon,
}: {
  editingPrimer: DatabasePrimerRow
  editingPrimerPayload: PrimerPropertiesPayload
  onClose: () => void
  onCopyAsCommon: (next: LibraryPrimer) => void | Promise<void>
  onSaveCommon: (next: LibraryPrimer) => void | Promise<void>
}) {
  return (
    <PrimerPropertiesDialog
      key={`${editingPrimer.key}:${editingPrimerPayload.sequence}`}
      primer={{
        name: editingPrimerPayload.name,
        sequence: editingPrimerPayload.sequence,
        color: editingPrimerPayload.color,
        description: editingPrimerPayload.description,
        specificity: editingPrimerPayload.specificity,
      }}
      templateSequence={editingPrimerPayload.templateSequence}
      preferredStrand={editingPrimerPayload.preferredStrand}
      bindings={editingPrimerPayload.bindings}
      commonId={editingPrimerPayload.commonId}
      source={primerRowIsCommon(editingPrimer) ? 'common' : 'construct'}
      onClose={onClose}
      onCopyAsCommon={onCopyAsCommon}
      onSave={onSaveCommon}
    />
  )
}
