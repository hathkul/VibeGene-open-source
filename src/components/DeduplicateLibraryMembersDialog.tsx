import { useMemo, useState } from 'react'
import type { LibraryDuplicateSequenceGroup } from '../domain/libraryMemberDeduplicate'
import { ThemeButton, ThemeDialog, ThemeInput } from '../ui/ThemePrimitives'

export type DeduplicateLibraryMembersDraft = {
  keepMemberId: string
  memberIds: string[]
  suggestedName: string
  included: boolean
}

type DeduplicateLibraryMembersDialogProps = {
  groups: LibraryDuplicateSequenceGroup[]
  onCancel: () => void
  onConfirm: (groups: Array<{ keepMemberId: string; memberIds: string[]; suggestedName: string }>) => void
}

function draftsFromGroups(groups: LibraryDuplicateSequenceGroup[]): DeduplicateLibraryMembersDraft[] {
  return groups.map((group) => ({
    keepMemberId: group.keepMemberId,
    memberIds: group.memberIds,
    suggestedName: group.suggestedName,
    included: true,
  }))
}

export function DeduplicateLibraryMembersDialog({
  groups,
  onCancel,
  onConfirm,
}: DeduplicateLibraryMembersDialogProps) {
  const [drafts, setDrafts] = useState(() => draftsFromGroups(groups))

  const included = useMemo(() => drafts.filter((draft) => draft.included), [drafts])
  const removeCount = useMemo(
    () => included.reduce((sum, draft) => sum + Math.max(0, draft.memberIds.length - 1), 0),
    [included],
  )

  function setName(index: number, value: string) {
    setDrafts((current) => current.map((draft, draftIndex) => (
      draftIndex === index ? { ...draft, suggestedName: value } : draft
    )))
  }

  function setIncluded(index: number, value: boolean) {
    setDrafts((current) => current.map((draft, draftIndex) => (
      draftIndex === index ? { ...draft, included: value } : draft
    )))
  }

  return (
    <div className="translation-dialog-backdrop" role="presentation" onPointerDown={onCancel}>
      <ThemeDialog
        className="translation-dialog dedupe-library-members-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dedupe-library-members-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <h3 id="dedupe-library-members-title">Deduplicate members</h3>
        <p className="muted">
          Members with identical sequences are listed below. Each group will be replaced by one member
          using the suggested name.
        </p>

        <div className="dedupe-library-members-summary">
          {included.length
            ? `${included.length} group${included.length === 1 ? '' : 's'} · remove ${removeCount} duplicate${removeCount === 1 ? '' : 's'}`
            : 'No groups selected'}
        </div>

        <div className="dedupe-library-members-preview">
          <table>
            <thead>
              <tr>
                <th className="dedupe-library-members-include-col">Use</th>
                <th>Replacement name</th>
                <th>Members</th>
                <th>bp</th>
              </tr>
            </thead>
            <tbody>
              {drafts.map((draft, index) => {
                const source = groups[index]
                return (
                  <tr key={draft.keepMemberId + draft.memberIds.join(',')}>
                    <td className="dedupe-library-members-include-col">
                      <input
                        type="checkbox"
                        checked={draft.included}
                        aria-label={`Deduplicate group ${index + 1}`}
                        onChange={(event) => setIncluded(index, event.target.checked)}
                      />
                    </td>
                    <td>
                      <ThemeInput
                        type="text"
                        className="dedupe-library-members-name"
                        value={draft.suggestedName}
                        spellCheck={false}
                        disabled={!draft.included}
                        title={draft.suggestedName}
                        onChange={(event) => setName(index, event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') {
                            event.preventDefault()
                            onCancel()
                          }
                        }}
                      />
                    </td>
                    <td className="dedupe-library-members-list-col">
                      <ul className="dedupe-library-members-list">
                        {(source?.fileNames ?? []).map((fileName, nameIndex) => (
                          <li key={`${draft.memberIds[nameIndex] ?? nameIndex}-${fileName}`} title={fileName}>
                            {fileName}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td>{(source?.sequenceLength ?? 0).toLocaleString()}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="translation-actions">
          <ThemeButton type="button" onClick={onCancel}>
            Cancel
          </ThemeButton>
          <ThemeButton
            type="button"
            className="primary"
            selected
            disabled={included.length === 0 || included.some((draft) => !draft.suggestedName.trim())}
            onClick={() => {
              onConfirm(
                included.map((draft) => ({
                  keepMemberId: draft.keepMemberId,
                  memberIds: draft.memberIds,
                  suggestedName: draft.suggestedName.trim(),
                })),
              )
            }}
          >
            Deduplicate
          </ThemeButton>
        </div>
      </ThemeDialog>
    </div>
  )
}
