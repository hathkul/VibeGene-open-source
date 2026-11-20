import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ProteinTranslationSource, SequenceRecord } from '../../domain/types'
import { proteinTranslationOriginLabel, proteinTranslationOriginSources } from './proteinShared'

export function ProteinTranslationOrigin({ record, onOpenSource }: { record: SequenceRecord; onOpenSource?: (source: ProteinTranslationSource) => void }) {
  const [open, setOpen] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const sources = proteinTranslationOriginSources(record)
  const label = proteinTranslationOriginLabel(record)

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); triggerRef.current?.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  if (!label) return null
  const close = () => { setOpen(false); triggerRef.current?.focus() }
  return <>
    <button ref={triggerRef} type="button" className="protein-translation-origin" onClick={() => setOpen(true)} aria-haspopup="dialog">
      <span className="protein-translation-origin-first">Translated from {sources[0]?.projectName.trim()}</span>
      {sources.length > 1 && <>{' '}<span className="protein-translation-origin-more">and {sources.length - 1} more…</span></>}
    </button>
    {open && createPortal(
      <div className="modal-backdrop protein-origin-backdrop" onClick={(event) => { if (event.target === event.currentTarget) close() }}>
        <div className="protein-origin-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
          <h2 id={titleId}>Translated from</h2>
          <ul>{sources.map((source, index) => {
            const available = Boolean(onOpenSource && (source.sourceRecord || (source.projectId && source.sequenceDigest)))
            return <li key={`${source.projectId ?? source.projectName}-${index}`}>
              <button type="button" className="protein-origin-source" disabled={!available}
                title={available ? `Open ${source.projectName} in a new window` : 'Source construct is not available to open'}
                onClick={() => { close(); onOpenSource?.(source) }}>
                {source.projectName.trim()}
              </button>
              {!available && <small> (source unavailable)</small>}
            </li>
          })}</ul>
          <div className="protein-origin-actions"><button ref={closeRef} type="button" onClick={close}>Close</button></div>
        </div>
      </div>, document.body,
    )}
  </>
}
