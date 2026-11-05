import { useMemo, useState } from 'react'
import { writeClipboardText } from './desktop/clipboard'
import { normalizeRemoteSequenceUrl, remoteSequenceShareUrl } from './domain/remoteSequenceFile'

export function OpenSequenceUrlDialog({
  onCancel,
  onOpen,
}: {
  onCancel: () => void
  onOpen: (url: string) => void
}) {
  const [sourceUrl, setSourceUrl] = useState('')
  const result = useMemo(() => {
    if (!sourceUrl.trim()) return { url: '', error: '' }
    try {
      return { url: normalizeRemoteSequenceUrl(sourceUrl), error: '' }
    } catch (error) {
      return { url: '', error: error instanceof Error ? error.message : String(error) }
    }
  }, [sourceUrl])

  return (
    <div className="translation-dialog-backdrop" role="presentation" onPointerDown={onCancel}>
      <form
        className="translation-dialog generate-link-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="open-sequence-url-title"
        onPointerDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault()
          if (result.url) onOpen(result.url)
        }}
      >
        <h3 id="open-sequence-url-title">Open sequence from URL</h3>
        <p>Enter a public link to a sequence file to open it in this window.</p>
        <label className="generate-link-field">
          <span>Sequence file URL</span>
          <input
            type="url"
            value={sourceUrl}
            autoFocus
            placeholder="https://example.org/plasmids/construct.dna"
            onChange={(event) => setSourceUrl(event.target.value)}
          />
        </label>
        {result.error && <p className="generate-link-error" role="alert">{result.error}</p>}
        <p className="generate-link-note">The file host must allow cross-origin downloads (CORS).</p>
        <div className="translation-dialog-footer generate-link-footer">
          <span />
          <div className="translation-actions">
            <button type="button" onClick={onCancel}>Cancel</button>
            <button type="submit" className="primary" disabled={!result.url}>Open</button>
          </div>
        </div>
      </form>
    </div>
  )
}

export function GenerateLinkDialog({ onClose }: { onClose: () => void }) {
  const [sourceUrl, setSourceUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const result = useMemo(() => {
    if (!sourceUrl.trim()) return { link: '', error: '' }
    try {
      return { link: remoteSequenceShareUrl(sourceUrl, window.location.href), error: '' }
    } catch (error) {
      return { link: '', error: error instanceof Error ? error.message : String(error) }
    }
  }, [sourceUrl])

  async function copyLink() {
    if (!result.link) return
    try {
      await writeClipboardText(result.link)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="translation-dialog-backdrop" role="presentation" onPointerDown={onClose}>
      <div
        className="translation-dialog generate-link-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="generate-link-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <h3 id="generate-link-title">Generate a VibeGene link</h3>
        <p>Paste a public link to a sequence file. Anyone opening the generated link can load that file in VibeGene.</p>
        <label className="generate-link-field">
          <span>Sequence file URL</span>
          <input
            type="url"
            value={sourceUrl}
            autoFocus
            placeholder="https://example.org/plasmids/pDemo.dna"
            onChange={(event) => {
              setSourceUrl(event.target.value)
              setCopied(false)
            }}
          />
        </label>
        {result.error && <p className="generate-link-error" role="alert">{result.error}</p>}
        <label className="generate-link-field">
          <span>Shareable VibeGene link</span>
          <textarea
            readOnly
            rows={3}
            value={result.link}
            placeholder="The generated link will appear here"
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
        <p className="generate-link-note">The sequence file must remain available at its original URL. Web hosts must allow cross-origin downloads (CORS).</p>
        <div className="translation-dialog-footer generate-link-footer">
          <span role="status">{copied ? 'Copied to clipboard.' : ''}</span>
          <div className="translation-actions">
            <button type="button" onClick={onClose}>Close</button>
            <button type="button" className="primary" disabled={!result.link} onClick={() => void copyLink()}>
              Copy link
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function RemoteSequenceOpenErrorDialog({
  message,
  detail = 'VibeGene loaded the pDemo example instead. Check that the source link is public, still available, and permits cross-origin downloads.',
  onClose,
}: {
  message: string
  detail?: string
  onClose: () => void
}) {
  return (
    <div className="translation-dialog-backdrop remote-sequence-error-backdrop" role="presentation" onPointerDown={onClose}>
      <div
        className="translation-dialog generate-link-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="remote-sequence-error-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <h3 id="remote-sequence-error-title">Could not open linked sequence</h3>
        <p className="generate-link-error">{message}</p>
        <p>{detail}</p>
        <div className="translation-dialog-footer">
          <span />
          <div className="translation-actions">
            <button type="button" className="primary" autoFocus onClick={onClose}>OK</button>
          </div>
        </div>
      </div>
    </div>
  )
}
