type DnaLibraryToolbarProps = {
  consensusLength: number
  memberCount: number
  /** When set, shown instead of raw memberCount (e.g. aligned subset in alignment mode). */
  alignedMemberCount?: number
  pendingAlignCount?: number
  /** Selected member file name, or null when editing consensus. */
  selectedMemberName?: string | null
  /** Annotation reference label (consensus or member file name). */
  annotationReferenceName?: string | null
  onRebuildConsensus?: () => void
  onFlipLibrary?: () => void
  onOpenCombineLibraryReads?: () => void
  onCropLibrary?: () => void
  canCropLibrary?: boolean
  /** Alignment-mode-only grouping tip. */
  showGroupHint?: boolean
  status?: string | null
  busy?: boolean
}

/** Compact library control strip: stats | actions | status. */
export function DnaLibraryToolbar({
  consensusLength,
  memberCount,
  alignedMemberCount,
  pendingAlignCount = 0,
  selectedMemberName = null,
  annotationReferenceName = null,
  onRebuildConsensus,
  onFlipLibrary,
  onOpenCombineLibraryReads,
  onCropLibrary,
  canCropLibrary = false,
  showGroupHint = false,
  status = null,
  busy = false,
}: DnaLibraryToolbarProps) {
  const memberLabel = alignedMemberCount != null
    ? `${alignedMemberCount.toLocaleString()} aligned member${alignedMemberCount === 1 ? '' : 's'}`
    : `${memberCount.toLocaleString()} member${memberCount === 1 ? '' : 's'}`

  return (
    <div className="dna-library-toolbar" role="toolbar" aria-label="DNA library controls">
      <div className="dna-library-toolbar-group dna-library-toolbar-stats">
        <span className="dna-library-toolbar-stat">
          {`DNA library · ${consensusLength.toLocaleString()} bp consensus`}
        </span>
        <span className="dna-library-toolbar-stat">
          {memberLabel}
          {pendingAlignCount > 0 ? ` (${pendingAlignCount} aligning)` : ''}
        </span>
        <span className="dna-library-toolbar-stat">
          {selectedMemberName ? `Editing member: ${selectedMemberName}` : 'Editing consensus'}
        </span>
        <span className="dna-library-toolbar-stat" title="Features and primers spread from this reference">
          {`Ref: ${annotationReferenceName?.trim() || 'consensus'}`}
        </span>
      </div>

      <div className="dna-library-toolbar-group dna-library-toolbar-actions">
        {onRebuildConsensus ? (
          <button type="button" className="alignment-list-action" onClick={onRebuildConsensus}>
            Rebuild consensus
          </button>
        ) : null}
        {onFlipLibrary ? (
          <button
            type="button"
            className="alignment-list-action"
            onClick={onFlipLibrary}
            title="Reverse-complement consensus and all members, then realign"
          >
            Flip library
          </button>
        ) : null}
        {onOpenCombineLibraryReads ? (
          <button
            type="button"
            className="alignment-list-action"
            onClick={onOpenCombineLibraryReads}
            title="Batch-combine traces into multi-read members using a name convention"
          >
            Combine multiple reads
          </button>
        ) : null}
        {onCropLibrary ? (
          <button
            type="button"
            className="alignment-list-action"
            disabled={!canCropLibrary}
            onClick={onCropLibrary}
            title="Crop consensus and members to the selected consensus range"
          >
            Crop library
          </button>
        ) : null}
      </div>

      <div className="dna-library-toolbar-group dna-library-toolbar-status">
        {showGroupHint ? (
          <span className="alignment-mode-hint" title="Drag one library member onto another">
            Drag member onto member to group
          </span>
        ) : null}
        {status ? <span className="dna-library-toolbar-message" title={status}>{status}</span> : null}
        {busy ? <span className="dna-library-toolbar-busy">Working…</span> : null}
      </div>
    </div>
  )
}
