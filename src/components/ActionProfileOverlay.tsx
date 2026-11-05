import { useEffect, useMemo, useState } from 'react'
import {
  ACTION_PROFILE_SLOW_MS,
  actionProfileEnabled,
  actionProfileReport,
  clearActionProfile,
  getActionProfileAggregates,
  getActionProfileEntries,
  subscribeActionProfile,
  type ActionProfileAggregate,
} from '../domain/actionProfiler'

export function ActionProfileOverlay() {
  const enabled = useMemo(() => actionProfileEnabled(), [])
  const [aggregates, setAggregates] = useState<ActionProfileAggregate[]>([])
  const [sampleCount, setSampleCount] = useState(0)
  const [sortBy, setSortBy] = useState<'max' | 'total'>('max')

  useEffect(() => {
    if (!enabled) return
    const refresh = () => {
      setAggregates(getActionProfileAggregates())
      setSampleCount(getActionProfileEntries().length)
    }
    refresh()
    return subscribeActionProfile(refresh)
  }, [enabled])

  if (!enabled) return null

  const sorted = [...aggregates].toSorted((a, b) =>
    sortBy === 'max' ? b.maxMs - a.maxMs || b.totalMs - a.totalMs : b.totalMs - a.totalMs || b.maxMs - a.maxMs,
  )
  const top = sorted.slice(0, 12)
  const totalMs = aggregates.reduce((sum, row) => sum + row.totalMs, 0)
  const slowCount = aggregates.filter((row) => row.maxMs >= ACTION_PROFILE_SLOW_MS).length

  return (
    <div className="action-profile-overlay" role="status" aria-live="polite">
      <div className="action-profile-overlay-header">
        <strong>Action profile</strong>
        <span>
          {sampleCount} samples · {totalMs.toFixed(0)} ms
        </span>
      </div>
      <div className="action-profile-overlay-toolbar">
        <button
          type="button"
          className={sortBy === 'max' ? 'action-profile-overlay-chip is-active' : 'action-profile-overlay-chip'}
          onClick={() => setSortBy('max')}
        >
          Max
        </button>
        <button
          type="button"
          className={sortBy === 'total' ? 'action-profile-overlay-chip is-active' : 'action-profile-overlay-chip'}
          onClick={() => setSortBy('total')}
        >
          Total
        </button>
        <button type="button" className="action-profile-overlay-copy" onClick={() => actionProfileReport('Action profile (manual)')}>
          Log
        </button>
        <button type="button" className="action-profile-overlay-copy" onClick={() => clearActionProfile()}>
          Clear
        </button>
      </div>
      {top.length === 0 ? (
        <div className="action-profile-overlay-empty">
          Type or edit DNA in Sequence view — watch <code>sequenceEditToPaint</code> (key → paint).
        </div>
      ) : (
        <>
          <div className="action-profile-overlay-meta">
            {slowCount} / {aggregates.length} actions hit ≥ {ACTION_PROFILE_SLOW_MS} ms
          </div>
          <ol className="action-profile-overlay-list">
            {top.map((row) => (
              <li key={`${row.group}:${row.name}`} className={row.maxMs >= ACTION_PROFILE_SLOW_MS ? 'is-slow' : undefined}>
                <span className="action-profile-overlay-ms">{row.maxMs.toFixed(1)} ms</span>
                <span className="action-profile-overlay-name">{row.name}</span>
                <span className="action-profile-overlay-stats">
                  {row.group} · n={row.count} · avg {row.avgMs.toFixed(1)} · Σ {row.totalMs.toFixed(0)}
                </span>
                {row.lastDetail ? <span className="action-profile-overlay-detail">{row.lastDetail}</span> : null}
              </li>
            ))}
          </ol>
        </>
      )}
      <div className="action-profile-overlay-hint">Add ?perf=1 to the URL</div>
    </div>
  )
}
