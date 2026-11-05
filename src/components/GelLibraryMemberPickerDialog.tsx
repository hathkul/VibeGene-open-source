import { useMemo, useState } from 'react'
import type { AgaroseGelDnaSource } from '../domain/agaroseGelLibrary'
import { ThemeButton, ThemeDialog } from '../ui/ThemePrimitives'

type GelLibraryMemberPickerDialogProps = {
  libraryName: string
  members: AgaroseGelDnaSource[]
  mode: 'single' | 'multiple'
  title?: string
  confirmLabel?: string
  onCancel: () => void
  onConfirm: (selected: AgaroseGelDnaSource[]) => void
}

export function GelLibraryMemberPickerDialog({
  libraryName,
  members,
  mode,
  title,
  confirmLabel,
  onCancel,
  onConfirm,
}: GelLibraryMemberPickerDialogProps) {
  const [selectedLabels, setSelectedLabels] = useState<string[]>(() =>
    mode === 'multiple' ? members.map((member) => member.label) : [],
  )

  const selected = useMemo(
    () => members.filter((member) => selectedLabels.includes(member.label)),
    [members, selectedLabels],
  )

  function toggle(label: string) {
    if (mode === 'single') {
      setSelectedLabels([label])
      return
    }
    setSelectedLabels((current) =>
      current.includes(label) ? current.filter((entry) => entry !== label) : [...current, label],
    )
  }

  return (
    <div className="translation-dialog-backdrop" role="presentation" onPointerDown={onCancel}>
      <ThemeDialog
        className="translation-dialog gel-library-member-picker-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gel-library-member-picker-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <h3 id="gel-library-member-picker-title">
          {title ?? (mode === 'single' ? 'Choose library member' : 'Choose library members')}
        </h3>
        <p className="muted">
          {mode === 'single'
            ? `“${libraryName}” is a DNA library. Pick one member for this lane.`
            : `Pick members from “${libraryName}” to place on successive gel lanes.`}
        </p>

        <div className="gel-library-member-picker-toolbar">
          {mode === 'multiple' ? (
            <>
              <ThemeButton type="button" onClick={() => setSelectedLabels(members.map((member) => member.label))}>
                Select all
              </ThemeButton>
              <ThemeButton type="button" onClick={() => setSelectedLabels([])}>
                Clear
              </ThemeButton>
            </>
          ) : null}
          <span className="gel-library-member-picker-summary">
            {selected.length.toLocaleString()} of {members.length.toLocaleString()}
          </span>
        </div>

        <div className="gel-library-member-picker-list">
          {members.length === 0 ? (
            <div className="muted">This library has no sequence members.</div>
          ) : (
            <table className="gel-library-member-picker-table">
              <thead>
                <tr>
                  <th aria-label="Select" />
                  <th>Member</th>
                  <th>Length</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => {
                  const checked = selectedLabels.includes(member.label)
                  const name = member.record.name || member.label
                  return (
                    <tr key={member.label} className={checked ? 'is-selected' : undefined}>
                      <td>
                        <input
                          type={mode === 'single' ? 'radio' : 'checkbox'}
                          name="gel-library-member"
                          checked={checked}
                          onChange={() => toggle(member.label)}
                          aria-label={name}
                        />
                      </td>
                      <td className="gel-library-member-picker-name" title={name}>
                        {name}
                      </td>
                      <td className="gel-library-member-picker-length">
                        {member.record.sequence.length.toLocaleString()} bp
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="translation-actions">
          <ThemeButton type="button" onClick={onCancel}>
            Cancel
          </ThemeButton>
          <ThemeButton
            type="button"
            className="primary"
            selected
            disabled={selected.length === 0}
            onClick={() => onConfirm(mode === 'single' ? selected.slice(0, 1) : selected)}
          >
            {confirmLabel ?? (mode === 'single' ? 'Use member' : 'Add to gel')}
          </ThemeButton>
        </div>
      </ThemeDialog>
    </div>
  )
}
