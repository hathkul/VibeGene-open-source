import { useMemo, useState } from 'react'
import {
  parseLibraryNameConvention,
  proposeLibraryMemberCombineGroups,
  validateLibraryNameConvention,
  type ProposedLibraryCombineGroup,
} from '../domain/libraryMemberCombine'
import type { TraceFileRecord } from '../domain/traceTypes'
import { ThemeButton, ThemeDialog, ThemeInput } from '../ui/ThemePrimitives'

type CombineLibraryReadsDialogProps = {
  members: TraceFileRecord[]
  onCancel: () => void
  onCombine: (groups: ProposedLibraryCombineGroup[]) => void
}

const DEFAULT_PATTERNS = ['dir', 'rev']
const DEFAULT_CONVENTION = '<unique_name>_<tag>_<irrelevant>'

export function CombineLibraryReadsDialog({
  members,
  onCancel,
  onCombine,
}: CombineLibraryReadsDialogProps) {
  const [maxReads, setMaxReads] = useState(2)
  const [patterns, setPatterns] = useState<string[]>(() => DEFAULT_PATTERNS.slice())
  const [convention, setConvention] = useState(DEFAULT_CONVENTION)
  const [uniqueNameLength, setUniqueNameLength] = useState(0)

  const effectiveMax = Math.max(2, Math.min(8, Math.floor(maxReads) || 2))
  const effectiveUniqueLength = Math.max(0, Math.min(64, Math.floor(uniqueNameLength) || 0))
  const visiblePatterns = useMemo(() => {
    const next = patterns.slice(0, effectiveMax)
    while (next.length < effectiveMax) next.push('')
    return next
  }, [effectiveMax, patterns])

  const conventionError = useMemo(
    () => validateLibraryNameConvention(parseLibraryNameConvention(convention)),
    [convention],
  )

  const groups = useMemo(() => {
    if (conventionError) return []
    return proposeLibraryMemberCombineGroups(members, {
      maxReads: effectiveMax,
      patterns: visiblePatterns,
      convention,
      uniqueNameLength: effectiveUniqueLength,
    })
  }, [convention, conventionError, effectiveMax, effectiveUniqueLength, members, visiblePatterns])

  function setPatternAt(index: number, value: string) {
    setPatterns((current) => {
      const next = current.slice()
      while (next.length <= index) next.push('')
      next[index] = value
      return next
    })
  }

  function handleMaxReadsChange(value: string) {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) {
      setMaxReads(2)
      return
    }
    setMaxReads(Math.max(2, Math.min(8, Math.floor(parsed))))
  }

  function handleUniqueLengthChange(value: string) {
    if (value.trim() === '') {
      setUniqueNameLength(0)
      return
    }
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) {
      setUniqueNameLength(0)
      return
    }
    setUniqueNameLength(Math.max(0, Math.min(64, Math.floor(parsed))))
  }

  function insertToken(token: '<unique_name>' | '<tag>' | '<irrelevant>') {
    setConvention((current) => `${current}${token}`)
  }

  return (
    <div className="translation-dialog-backdrop" role="presentation" onPointerDown={onCancel}>
      <ThemeDialog
        className="translation-dialog combine-library-reads-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="combine-library-reads-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <h3 id="combine-library-reads-title">Combine multiple reads</h3>
        <p className="muted">
          Describe how file names are built with <code>&lt;unique_name&gt;</code>, <code>&lt;tag&gt;</code>, and
          optional <code>&lt;irrelevant&gt;</code> parts, then set the tag text for each read.
        </p>

        <div className="combine-library-reads-form">
          <label className="combine-library-reads-max">
            Max reads per member
            <ThemeInput
              type="number"
              min={2}
              max={8}
              value={effectiveMax}
              onChange={(event) => handleMaxReadsChange(event.target.value)}
            />
          </label>

          <label className="combine-library-reads-convention">
            Name convention
            <ThemeInput
              type="text"
              value={convention}
              spellCheck={false}
              placeholder={DEFAULT_CONVENTION}
              onChange={(event) => setConvention(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  onCancel()
                }
              }}
            />
          </label>
          <div className="combine-library-reads-token-row" role="group" aria-label="Insert convention tokens">
            <ThemeButton type="button" className="alignment-list-action" onClick={() => insertToken('<unique_name>')}>
              unique_name
            </ThemeButton>
            <ThemeButton type="button" className="alignment-list-action" onClick={() => insertToken('<tag>')}>
              tag
            </ThemeButton>
            <ThemeButton type="button" className="alignment-list-action" onClick={() => insertToken('<irrelevant>')}>
              irrelevant
            </ThemeButton>
          </div>

          <label className="combine-library-reads-max">
            Unique name length
            <ThemeInput
              type="number"
              min={0}
              max={64}
              value={effectiveUniqueLength || ''}
              placeholder="any"
              title="Exact character length of <unique_name>. Leave empty for flexible length."
              onChange={(event) => handleUniqueLengthChange(event.target.value)}
            />
            <span className="combine-library-reads-hint">empty = any</span>
          </label>

          <div className="combine-library-reads-patterns" role="group" aria-label="Read tags">
            {visiblePatterns.map((pattern, index) => (
              <label key={`read-pattern-${index}`}>
                {`Read ${index + 1} <tag>`}
                <ThemeInput
                  type="text"
                  value={pattern}
                  placeholder={index === 0 ? 'dir' : index === 1 ? 'rev' : `read${index + 1}`}
                  onChange={(event) => setPatternAt(index, event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      onCancel()
                    }
                  }}
                />
              </label>
            ))}
          </div>
        </div>

        <div className="combine-library-reads-summary">
          {conventionError
            ? conventionError
            : groups.length
              ? `${groups.length} group${groups.length === 1 ? '' : 's'} · ${groups.reduce((sum, group) => sum + group.memberIds.length, 0)} traces`
              : 'No matching groups yet — check convention, tags, and unique-name length'}
        </div>

        <div className="combine-library-reads-preview">
          {groups.length === 0 ? (
            <div className="combine-library-reads-empty">Nothing to combine with the current settings.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Reads</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <tr key={group.stemKey}>
                    <td title={group.suggestedName}>{group.suggestedName}</td>
                    <td title={group.fileNames.join(' · ')}>{group.fileNames.join(' · ')}</td>
                  </tr>
                ))}
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
            disabled={groups.length === 0}
            onClick={() => onCombine(groups)}
          >
            Combine
          </ThemeButton>
        </div>
      </ThemeDialog>
    </div>
  )
}
