import type { SelectHTMLAttributes } from 'react'
import {
  constructSourceOptionValue,
  type ConstructSourceGroups,
  type ConstructSourceOption,
} from './useConstructSources'

function options(options: ConstructSourceOption[]) {
  return options.map((option) => (
    <option key={constructSourceOptionValue(option)} value={constructSourceOptionValue(option)}>
      {option.label}
    </option>
  ))
}

export function ConstructSourceOptions({ groups }: { groups: ConstructSourceGroups }) {
  return (
    <>
      {(groups.current.length > 0 || groups.open.length > 0) && (
        <optgroup label="Open constructs">
          {options(groups.current)}
          {options(groups.open)}
        </optgroup>
      )}
      {groups.recent.length > 0 && (
        <optgroup label="Recent constructs">{options(groups.recent)}</optgroup>
      )}
      {groups.drafts.length > 0 && <optgroup label="Drafts">{options(groups.drafts)}</optgroup>}
    </>
  )
}

type ConstructSourceSelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> & {
  groups: ConstructSourceGroups
  /** Reload open windows, recents, and drafts after the current selection interaction. */
  onOpen?: () => void | Promise<void>
  /** Empty option label; pass `false` to omit the placeholder row. */
  placeholder?: string | false
}

export function ConstructSourceSelect({
  groups,
  onOpen,
  placeholder = 'Choose construct…',
  onBlur,
  ...rest
}: ConstructSourceSelectProps) {
  return (
    <select
      {...rest}
      onBlur={(event) => {
        void onOpen?.()
        onBlur?.(event)
      }}
    >
      {placeholder !== false ? <option value="">{placeholder}</option> : null}
      <ConstructSourceOptions groups={groups} />
    </select>
  )
}
