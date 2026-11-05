import { useEffect, useRef, useState } from 'react'
import { isTauriRuntime } from './desktop/tauriRuntime'
import { WHATS_NEW_VERSION } from './domain/whatsNew'
import { sendBugReport } from './domain/telemetry'
import { mountBugReportTurnstile } from './domain/turnstile'
import {
  formatBugReportDiagnostics,
  type BugReportAppSnapshot,
} from './domain/bugReportDiagnostics'

export function BugReportDialog({
  recentStatus,
  statusHistory,
  snapshot,
  currentSequence,
  loadOtherSequences,
  onClose,
  onSubmitted,
}: {
  recentStatus?: string
  statusHistory: string[]
  snapshot: BugReportAppSnapshot
  currentSequence: string
  loadOtherSequences?: () => Promise<Array<{ name: string; sequence: string }>>
  onClose: () => void
  onSubmitted?: (reportId: number) => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [email, setEmail] = useState('')
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true)
  const [includeSequences, setIncludeSequences] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [verificationError, setVerificationError] = useState<string | null>(null)
  const turnstileContainerRef = useRef<HTMLDivElement | null>(null)
  const turnstileControlRef = useRef<{ reset: () => void; dispose: () => void } | null>(null)
  const isDesktop = isTauriRuntime()

  useEffect(() => {
    if (isDesktop || !turnstileContainerRef.current) return
    let cancelled = false
    let mountedControl: { reset: () => void; dispose: () => void } | null = null
    void mountBugReportTurnstile(turnstileContainerRef.current, {
      verified: (token) => {
        if (cancelled) return
        setTurnstileToken(token)
        setVerificationError(null)
      },
      expired: () => {
        if (cancelled) return
        setTurnstileToken(null)
        setVerificationError('Verification expired. Please complete it again.')
      },
      failed: () => {
        if (cancelled) return
        setTurnstileToken(null)
        setVerificationError('Verification failed to load. Please retry.')
      },
    }).then((control) => {
      if (cancelled) {
        control.dispose()
        return
      }
      mountedControl = control
      turnstileControlRef.current = control
    }).catch((mountError: unknown) => {
      if (!cancelled) {
        setVerificationError(mountError instanceof Error ? mountError.message : 'Verification is unavailable.')
      }
    })
    return () => {
      cancelled = true
      mountedControl?.dispose()
      if (turnstileControlRef.current === mountedControl) turnstileControlRef.current = null
    }
  }, [isDesktop])

  async function submit() {
    const trimmedTitle = title.trim()
    const trimmedDescription = description.trim()
    if (trimmedTitle.length < 3 || trimmedDescription.length < 3) {
      setError('Please add a short title and description.')
      return
    }
    if (!isDesktop && !turnstileToken) {
      setError('Please complete the human verification first.')
      return
    }
    setBusy(true)
    setError(null)

    let otherSequences: Array<{ name: string; sequence: string }> = []
    if (includeSequences && loadOtherSequences) {
      try {
        otherSequences = await loadOtherSequences()
      } catch {
        otherSequences = []
      }
    }

    const diagnostics = formatBugReportDiagnostics({
      includeDiagnostics,
      includeSequences,
      statusHistory,
      recentStatus,
      snapshot,
      currentSequence: includeSequences ? currentSequence : undefined,
      otherSequences: includeSequences ? otherSequences : undefined,
    })

    const result = await sendBugReport({
      title: trimmedTitle,
      description: trimmedDescription,
      email: email.trim() || undefined,
      statusNote: includeDiagnostics ? recentStatus?.trim() : undefined,
      diagnostics: diagnostics || undefined,
      appVersion: WHATS_NEW_VERSION,
      turnstileToken: turnstileToken || undefined,
    })
    if (!isDesktop) {
      setTurnstileToken(null)
      turnstileControlRef.current?.reset()
    }
    setBusy(false)
    if (!result.ok) {
      setError(result.error || 'Could not send report.')
      return
    }
    onSubmitted?.(result.id)
    onClose()
  }

  return (
    <div className="translation-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="translation-dialog bug-report-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bug-report-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h3 id="bug-report-title">Report a bug</h3>
        <p className="muted bug-report-lead">
          Sends a report to the VibeGene maintainers. Choose below what diagnostic detail to include.
        </p>

        <label className="bug-report-field">
          <span>Title</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={200}
            placeholder="What went wrong?"
            autoFocus
          />
        </label>

        <label className="bug-report-field">
          <span>Description</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={8000}
            rows={6}
            placeholder="Steps to reproduce, what you expected, and what happened instead."
          />
        </label>

        <label className="bug-report-field">
          <span>
            Email <span className="muted">(optional, if you want a reply)</span>
          </span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            maxLength={200}
            placeholder="you@example.com"
          />
        </label>

        <div className="bug-report-opts">
          <label className="preferences-option">
            <input
              type="checkbox"
              checked={includeDiagnostics}
              onChange={(event) => setIncludeDiagnostics(event.target.checked)}
            />
            <span>
              Include app diagnostics
              <span className="muted preferences-option-note">
                {' '}
                — status history, open tabs (names/lengths), selection, view mode (no sequence bases)
              </span>
            </span>
          </label>

          <label className="preferences-option">
            <input
              type="checkbox"
              checked={includeSequences}
              onChange={(event) => setIncludeSequences(event.target.checked)}
            />
            <span>
              Include open sequence data
              <span className="muted preferences-option-note">
                {' '}
                — truncated DNA from this tab and other open tabs (only if you check this)
              </span>
            </span>
          </label>
        </div>

        {isDesktop ? (
          <p className="muted bug-report-verification-note">
            Standalone reports are protected by Cloudflare rate limits. No CAPTCHA is shown in the desktop app.
          </p>
        ) : (
          <div className="bug-report-verification">
            <div ref={turnstileContainerRef} />
            {verificationError ? <p className="bug-report-error">{verificationError}</p> : null}
          </div>
        )}

        {error ? <p className="bug-report-error">{error}</p> : null}

        <div className="translation-dialog-footer">
          <div className="translation-actions">
            <button type="button" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => void submit()}
              disabled={busy || (!isDesktop && !turnstileToken)}
            >
              {busy ? 'Sending…' : 'Send report'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
