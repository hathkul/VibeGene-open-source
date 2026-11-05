import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { gcContent, normalizeDna, reverseComplement } from './domain/sequence'
import { calculateAnnealTemperature } from './domain/primerThermodynamics'
import { dnaOligoMassDa } from './domain/primerExport'
import { PrimerStructuresPanel } from './PrimerStructuresPanel'
import { PrimerBindingSpecificityCheck } from './PrimerBindingSpecificityCheck'
import { setCommonPrimerSpecificity } from './storage/commonPrimers'
import { MAX_PRIMER_LENGTH, primerLengthError } from './domain/primerLimits'
import type { LibraryPrimer, LibraryPrimerSource } from './domain/libraryPrimer'
import type { PrimerBindingLayout, Strand } from './domain/types'
import { displayAnnealMaskForOrientation } from './application/primerWorkflow/primerPropertiesPayload'
import { primerPropertiesAnnealPreview } from './domain/primerSequenceLayout'

export type { LibraryPrimer, LibraryPrimerSource } from './domain/libraryPrimer'

const CONSTRUCT_EDIT_CONFIRM =
  'Cannot edit a plasmid-annealed primer. Create a copy as a common primer?'

const EDGE_INSET = 8

function formatOligoTm(sequence: string): string {
  const thermo = calculateAnnealTemperature(sequence)
  if (thermo.tmC === null || !Number.isFinite(thermo.tmC)) return 'Tm unavailable'
  if (
    thermo.tmMinC !== null &&
    thermo.tmMaxC !== null &&
    Math.abs(thermo.tmMaxC - thermo.tmMinC) >= 0.05
  ) {
    return `${thermo.tmMinC.toFixed(1)}-${thermo.tmMaxC.toFixed(1)} C`
  }
  return `${thermo.tmC.toFixed(1)} C`
}

type DragSession = {
  pointerId: number
  startClientX: number
  startClientY: number
  originLeft: number
  originTop: number
  width: number
  height: number
  boundsWidth: number
  boundsHeight: number
}

/**
 * Local title-bar dragging. DialogDragManager skips hybrid root shells; Primer
 * Properties nests inside the Database hybrid window, so it owns drag via
 * absolute left/top relative to its backdrop (reliable in WKWebView).
 */
function usePrimerPropertiesDrag() {
  const dialogRef = useRef<HTMLElement | null>(null)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const sessionRef = useRef<DragSession | null>(null)

  useEffect(() => {
    if (!dragging) return

    const onMove = (event: PointerEvent) => {
      const session = sessionRef.current
      if (!session || event.pointerId !== session.pointerId) return
      const rawLeft = session.originLeft + (event.clientX - session.startClientX)
      const rawTop = session.originTop + (event.clientY - session.startClientY)
      const minLeft = EDGE_INSET
      const maxLeft = session.boundsWidth - EDGE_INSET - session.width
      const minTop = EDGE_INSET
      const maxTop = session.boundsHeight - EDGE_INSET - session.height
      setPosition({
        left: Math.min(Math.max(rawLeft, Math.min(minLeft, maxLeft)), Math.max(minLeft, maxLeft)),
        top: Math.min(Math.max(rawTop, Math.min(minTop, maxTop)), Math.max(minTop, maxTop)),
      })
      event.preventDefault()
    }

    const onUp = (event: PointerEvent) => {
      const session = sessionRef.current
      if (!session || event.pointerId !== session.pointerId) return
      sessionRef.current = null
      setDragging(false)
      try {
        dialogRef.current?.releasePointerCapture(session.pointerId)
      } catch {
        // ignore
      }
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [dragging])

  function onHandlePointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0) return
    const target = event.target instanceof Element ? event.target : null
    if (target?.closest('button, input, select, textarea, a')) return
    const dialog = dialogRef.current
    if (!dialog) return

    const backdrop = dialog.parentElement
    const bounds = backdrop?.getBoundingClientRect() ?? {
      left: 0,
      top: 0,
      width: window.innerWidth,
      height: window.innerHeight,
    }
    const rect = dialog.getBoundingClientRect()

    // Absolute left/top are relative to the positioned backdrop, not the viewport.
    const left = rect.left - bounds.left
    const top = rect.top - bounds.top
    setPosition({ left, top })
    sessionRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      originLeft: left,
      originTop: top,
      width: rect.width,
      height: rect.height,
      boundsWidth: bounds.width,
      boundsHeight: bounds.height,
    }
    setDragging(true)
    try {
      dialog.setPointerCapture(event.pointerId)
    } catch {
      // ignore
    }
    event.preventDefault()
    event.stopPropagation()
  }

  const dialogStyle =
    position == null
      ? undefined
      : ({
          position: 'absolute',
          left: position.left,
          top: position.top,
          margin: 0,
          transform: 'none',
          // Clear hybrid centering translate (-50%, -50%).
          translate: 'none',
        } satisfies CSSProperties)

  return { dialogRef, dialogStyle, dragging, onHandlePointerDown }
}

export function PrimerPropertiesDialog({
  primer,
  source = primer.commonId ? 'common' : 'construct',
  templateSequence,
  preferredStrand,
  bindings,
  commonId = primer.commonId,
  onClose,
  onSave,
  onCopyAsCommon,
}: {
  primer: LibraryPrimer
  source?: LibraryPrimerSource
  templateSequence?: string
  preferredStrand?: Strand
  bindings?: PrimerBindingLayout[]
  commonId?: string
  onClose: () => void
  onSave?: (next: LibraryPrimer) => void | Promise<void>
  onCopyAsCommon?: (next: LibraryPrimer) => void | Promise<void>
}) {
  const [draft, setDraft] = useState(primer)
  const [mode, setMode] = useState<LibraryPrimerSource>(source)
  const [showReverseComplement, setShowReverseComplement] = useState(false)
  const [busy, setBusy] = useState(false)
  const [specificitySaveError, setSpecificitySaveError] = useState('')
  const specificitySaveQueue = useRef<Promise<void>>(Promise.resolve())
  const [activeTab, setActiveTab] = useState<'description' | 'structures'>('description')
  const nameInputRef = useRef<HTMLInputElement | null>(null)
  const sequenceInputRef = useRef<HTMLInputElement | null>(null)
  const sequenceHighlightRef = useRef<HTMLDivElement | null>(null)
  const { dialogRef, dialogStyle, dragging, onHandlePointerDown } = usePrimerPropertiesDrag()

  useEffect(() => {
    const input = nameInputRef.current
    if (!input) return
    input.focus()
    if (!input.readOnly) input.select()
  }, [primer, source])

  const sequence = useMemo(() => normalizeDna(draft.sequence), [draft.sequence])
  const sequenceLengthError = primerLengthError(sequence.length)
  const displayed = showReverseComplement ? reverseComplement(sequence) : sequence
  const canHighlightSequence = Boolean(sequence) && sequenceLengthError === null
  const annealMask = useMemo(() => {
    if (!canHighlightSequence) return [] as boolean[]
    const template = templateSequence ? normalizeDna(templateSequence) : ''
    if (!template) return sequence.split('').map(() => false)
    const preview = primerPropertiesAnnealPreview(template, sequence, { preferredStrand, bindings })
    return displayAnnealMaskForOrientation(preview.mask, showReverseComplement)
  }, [bindings, canHighlightSequence, preferredStrand, sequence, showReverseComplement, templateSequence])
  const gc = sequence ? gcContent(sequence) : 0

  function syncSequenceHighlightScroll(input: HTMLInputElement) {
    if (!sequenceHighlightRef.current) return
    sequenceHighlightRef.current.style.transform = `translateX(${-input.scrollLeft}px)`
  }
  const tmLabel = useMemo(() => formatOligoTm(sequence), [sequence])
  const massDa = dnaOligoMassDa(sequence)
  const canSave = mode === 'common' && Boolean(onSave) && sequence && draft.name.trim() && !sequenceLengthError
  const fieldsReadOnly = mode === 'construct'
  const boundToConstructTemplate = Boolean(templateSequence && bindings?.length)
  const sequenceReadOnly = false

  async function copyText(label: string, text: string) {
    const value = text.trim()
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      // Fallback for restricted clipboard contexts.
      const probe = document.createElement('textarea')
      probe.value = value
      probe.setAttribute('readonly', '')
      probe.style.position = 'fixed'
      probe.style.opacity = '0'
      document.body.appendChild(probe)
      probe.select()
      document.execCommand('copy')
      document.body.removeChild(probe)
    }
    void label
  }

  async function promoteToCommon(next: LibraryPrimer) {
    if (!onCopyAsCommon) return
    setBusy(true)
    try {
      await onCopyAsCommon(next)
      setMode('common')
      setDraft(next)
    } finally {
      setBusy(false)
    }
  }

  function attemptEdit(patch: Partial<LibraryPrimer>) {
    if (mode === 'construct') {
      if (patch.sequence !== undefined && boundToConstructTemplate) {
        setDraft((current) => ({ ...current, sequence: patch.sequence! }))
        return
      }
      if (!onCopyAsCommon) return
      if (!window.confirm(CONSTRUCT_EDIT_CONFIRM)) return
      void promoteToCommon({ ...draft, ...patch })
      return
    }
    setDraft((current) => ({ ...current, ...patch }))
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className={`primer-editor-dialog primer-properties-dialog${dragging ? ' is-dialog-dragging' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="primer-properties-title"
        data-local-dialog-drag=""
        style={dialogStyle}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header
          className="primer-editor-titlebar"
          data-dialog-drag-handle
          onPointerDown={onHandlePointerDown}
        >
          <h2 id="primer-properties-title">Primer Properties</h2>
        </header>

        <div className="primer-editor-top">
          <label>
            Primer:
            <span className="primer-properties-field-row">
              <input
                ref={nameInputRef}
                value={draft.name}
                readOnly={fieldsReadOnly}
                autoFocus
                onChange={(event) => attemptEdit({ name: event.target.value })}
              />
              <button
                type="button"
                className="primer-properties-copy"
                title="Copy name"
                onClick={() => void copyText('name', draft.name)}
              >
                Copy
              </button>
            </span>
          </label>
          <span>
            {sequence.length}-mer / {gc.toFixed(0)}% GC / Tm {tmLabel}
          </span>
          <label>
            Color:
            <select
              value={draft.color || '#7c3aed'}
              disabled={fieldsReadOnly}
              onChange={(event) => attemptEdit({ color: event.target.value })}
            >
              <option value="#7c3aed">Purple</option>
              <option value="#000000">Black</option>
              <option value="#0ea5e9">Blue</option>
              <option value="#dc2626">Red</option>
              <option value="#16a34a">Green</option>
            </select>
          </label>
        </div>

        <div className="primer-editor-sequence-row">
          <span>5&apos;</span>
          <div className="primer-properties-sequence-field" data-readonly={fieldsReadOnly ? 'true' : undefined}>
            <div className="primer-editor-sequence-highlight" aria-hidden="true">
              <div ref={sequenceHighlightRef}>
                {canHighlightSequence &&
                  displayed.split('').map((base, index) => (
                    <span
                      key={`${index}-${base}`}
                      className={annealMask[index] ? 'is-annealed' : 'is-overhang'}
                    >
                      {base}
                    </span>
                  ))}
              </div>
            </div>
            <input
              ref={sequenceInputRef}
              className="primer-properties-sequence"
              value={displayed}
              readOnly={sequenceReadOnly}
              onChange={(event) => {
                const raw = event.currentTarget.value
                const nextSequence = showReverseComplement ? reverseComplement(normalizeDna(raw)) : normalizeDna(raw)
                attemptEdit({ sequence: nextSequence })
              }}
              onScroll={(event) => syncSequenceHighlightScroll(event.currentTarget)}
              spellCheck={false}
            />
          </div>
          <span>3&apos;</span>
          <button
            type="button"
            className="primer-properties-copy"
            title="Copy sequence"
            onClick={() => void copyText('sequence', displayed)}
          >
            Copy
          </button>
        </div>
        <p className="primer-properties-unannealed muted">
          {sequenceLengthError
            ? `${sequenceLengthError} Shorten it before saving or calculating structures.`
            : mode === 'common'
            ? boundToConstructTemplate
              ? 'Common copy — anneal preview still uses the construct template.'
              : 'Common primer — not bound to a construct.'
            : 'Annealed to a construct. Sequence edits preview against the stored template; save as common to persist changes.'}
        </p>

        <PrimerBindingSpecificityCheck
          sequence={sequence}
          templateSequence={templateSequence}
          preferredStrand={preferredStrand}
          bindings={bindings}
          savedResult={draft.specificity}
          storageNotice={!commonId ? 'Results in this view are temporary. Open the construct or save the primer to the common library to keep them.' : undefined}
          onResultChange={(specificity) => {
            setDraft((current) => ({ ...current, specificity }))
            if (mode === 'common' && commonId) {
              specificitySaveQueue.current = specificitySaveQueue.current.then(async () => {
                try {
                  await setCommonPrimerSpecificity(commonId, specificity)
                  setSpecificitySaveError('')
                } catch {
                  setSpecificitySaveError('Could not save the specificity result to the primer library.')
                }
              })
            }
          }}
          toolbarLeading={<span className="muted">{massDa.toFixed(0)} Da</span>}
          reverseComplementButton={<button type="button" onClick={() => setShowReverseComplement((current) => !current)}>
            {showReverseComplement ? 'Show original' : 'Reverse Complement'}
          </button>}
        />
        {specificitySaveError && <p role="alert">{specificitySaveError}</p>}

        <div className="primer-editor-tabs">
          <button
            type="button"
            className={activeTab === 'description' ? 'active' : ''}
            onClick={() => setActiveTab('description')}
          >
            Description
          </button>
          <button
            type="button"
            className={activeTab === 'structures' ? 'active' : ''}
            disabled={sequence.length > MAX_PRIMER_LENGTH}
            title={sequenceLengthError ?? undefined}
            onClick={() => setActiveTab('structures')}
          >
            Structures
          </button>
        </div>

        {activeTab === 'description' ? (
          <div className="primer-editor-description-panel">
            <textarea
              value={draft.description ?? ''}
              readOnly={fieldsReadOnly}
              onChange={(event) => attemptEdit({ description: event.target.value })}
              rows={8}
              placeholder="Primer description"
            />
          </div>
        ) : (
          <PrimerStructuresPanel sequence={sequence} />
        )}

        <footer className="primer-editor-footer">
          <span>
            {mode === 'common' ? 'Standalone primer — not bound to a construct.' : 'Plasmid-annealed primer.'}
          </span>
          <button type="button" onClick={onClose} disabled={busy}>
            {mode === 'common' ? 'Cancel' : 'Close'}
          </button>
          {mode === 'construct' && onCopyAsCommon && (
            <button
              type="button"
              disabled={busy || !sequence}
              onClick={() => {
                if (!window.confirm(CONSTRUCT_EDIT_CONFIRM)) return
                void promoteToCommon({
                  name: draft.name.trim() || 'Primer',
                  sequence,
                  color: draft.color,
                  description: draft.description,
                })
              }}
            >
              Copy as common
            </button>
          )}
          {mode === 'common' && onSave && (
            <button
              type="button"
              disabled={!canSave || busy}
              onClick={() => {
                void (async () => {
                  setBusy(true)
                  try {
                    await specificitySaveQueue.current
                    await onSave({
                      name: draft.name.trim() || 'Primer',
                      sequence,
                      color: draft.color,
                      description: draft.description,
                      specificity: draft.specificity,
                    })
                  } finally {
                    setBusy(false)
                  }
                })()
              }}
            >
              OK
            </button>
          )}
        </footer>
      </section>
    </div>
  )
}
