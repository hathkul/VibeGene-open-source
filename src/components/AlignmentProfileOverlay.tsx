import { useEffect, useMemo, useState } from 'react'
import {
  alignmentProfileEnabled,
  alignmentProfileReport,
  getAlignmentProfileEntries,
  subscribeAlignmentProfile,
  type AlignmentProfileEntry,
} from '../domain/alignmentProfiler'

export function AlignmentProfileOverlay() {
  const enabled = useMemo(() => alignmentProfileEnabled(), [])
  const [entries, setEntries] = useState<AlignmentProfileEntry[]>([])

  useEffect(() => {
    if (!enabled) return
    return subscribeAlignmentProfile(() => {
      setEntries(getAlignmentProfileEntries())
    })
  }, [enabled])

  if (!enabled) return null

  const totalMs = entries.reduce((sum, entry) => sum + entry.ms, 0)
  const top = [...entries].toSorted((a, b) => b.ms - a.ms).slice(0, 8)

  return (
    <div className="alignment-profile-overlay" role="status" aria-live="polite">
      <div className="alignment-profile-overlay-header">
        <strong>Alignment profile</strong>
        <span>{totalMs.toFixed(0)} ms tracked</span>
        <button
          type="button"
          className="alignment-profile-overlay-copy"
          onClick={() => alignmentProfileReport('Alignment profile (manual)')}
        >
          Log
        </button>
      </div>
      {top.length === 0 ? (
        <div className="alignment-profile-overlay-empty">Enable alignments to collect timings.</div>
      ) : (
        <ol className="alignment-profile-overlay-list">
          {top.map((entry) => (
            <li key={entry.id}>
              <span className="alignment-profile-overlay-ms">{entry.ms.toFixed(1)} ms</span>
              <span className="alignment-profile-overlay-name">{entry.name}</span>
              {entry.detail ? <span className="alignment-profile-overlay-detail">{entry.detail}</span> : null}
            </li>
          ))}
        </ol>
      )}
      <div className="alignment-profile-overlay-hint">Add ?alignmentProfile=1 to the URL</div>
    </div>
  )
}
