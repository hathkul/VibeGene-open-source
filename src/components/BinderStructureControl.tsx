import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  applyBinderNumbering,
  BINDER_TYPE_OPTIONS,
  binderSchemeLabel,
  defaultNumberingSchemeId,
  detectBinderStructure,
  numberingSchemesForBinder,
  selectBinderStructure,
  type BinderNumbering,
  type BinderNumberingSchemeId,
  type BinderStructure,
  type BinderTypeOptionId,
  isBinderNumberingForSequence,
} from '../domain/binderStructure'

type BinderStructureControlProps = {
  sequence: string
  numbering: BinderNumbering | null
  structure?: BinderStructure | null
  onStructureChange?: (structure: BinderStructure | null) => void
  onNumberingChange: (numbering: BinderNumbering | null) => void
  onAnnotate?: (numbering: BinderNumbering) => void
  onStatus: (message: string) => void
  targetLabel?: string
}

export function BinderStructureControl(props: BinderStructureControlProps) {
  return <BinderStructureControlInstance key={props.sequence} {...props} />
}

function BinderStructureControlInstance({
  sequence,
  numbering,
  structure: controlledStructure,
  onStructureChange,
  onNumberingChange,
  onAnnotate,
  onStatus,
  targetLabel = 'protein sequence',
}: BinderStructureControlProps) {
  const [structure, setStructure] = useState<BinderStructure | null>(null)
  const [selectedTypeId, setSelectedTypeId] = useState<BinderTypeOptionId | 'auto' | null>(null)
  const [schemeId, setSchemeId] = useState<BinderNumberingSchemeId>('imgt')
  const [busy, setBusy] = useState<'detect' | 'number' | null>(null)
  const [detectMenuOpen, setDetectMenuOpen] = useState(false)
  const [numberingMenuOpen, setNumberingMenuOpen] = useState(false)
  const controlRef = useRef<HTMLDivElement | null>(null)
  const requestIdRef = useRef(0)
  const structureForSequence = controlledStructure !== undefined ? controlledStructure : structure
  const schemes = structureForSequence ? numberingSchemesForBinder(structureForSequence.kind) : []
  const numberingActive = Boolean(
    numbering
    && structureForSequence
    && numbering.kind === structureForSequence.kind
    && numbering.schemeId === schemeId,
  )

  function acceptStructure(
    detected: BinderStructure,
    typeId: BinderTypeOptionId | 'auto',
    statusPrefix: string,
  ) {
    setStructure(detected)
    onStructureChange?.(detected)
    setSelectedTypeId(typeId)
    const nextScheme = defaultNumberingSchemeId(detected.kind)
    setSchemeId(nextScheme)
    onStatus(
      `${statusPrefix} ${detected.label} on the ${targetLabel} `
      + `(${Math.round(detected.confidence * 100)}% confidence). `
      + 'Choose a numbering scheme and apply it.',
    )
  }

  async function detectStructure() {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    setDetectMenuOpen(false)
    setNumberingMenuOpen(false)
    setBusy('detect')
    onNumberingChange(null)
    try {
      const detected = await detectBinderStructure(sequence)
      if (requestId !== requestIdRef.current) return
      acceptStructure(detected, 'auto', 'Detected')
    } catch (error) {
      if (requestId !== requestIdRef.current) return
      setStructure(null)
      onStructureChange?.(null)
      setSelectedTypeId(null)
      onNumberingChange(null)
      onStatus(
        error instanceof Error ? error.message : 'No binder structure was detected.',
      )
    } finally {
      if (requestId === requestIdRef.current) setBusy(null)
    }
  }

  async function selectStructure(optionId: BinderTypeOptionId) {
    const option = BINDER_TYPE_OPTIONS.find((candidate) => candidate.id === optionId)
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    setDetectMenuOpen(false)
    setNumberingMenuOpen(false)
    setBusy('detect')
    onNumberingChange(null)
    try {
      const detected = await selectBinderStructure(sequence, optionId)
      if (requestId !== requestIdRef.current) return
      acceptStructure(detected, optionId, `Selected ${option?.label ?? optionId} as`)
    } catch (error) {
      if (requestId !== requestIdRef.current) return
      setStructure(null)
      onStructureChange?.(null)
      setSelectedTypeId(null)
      onNumberingChange(null)
      onStatus(
        `${option?.label ?? optionId} was not applied: `
        + (error instanceof Error ? error.message : 'binder structure was not found.'),
      )
    } finally {
      if (requestId === requestIdRef.current) setBusy(null)
    }
  }

  async function applyNumbering(selectedScheme: BinderNumberingSchemeId) {
    if (!structureForSequence) {
      onStatus('Detect the binder structure before applying numbering.')
      return
    }
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    setSchemeId(selectedScheme)
    setDetectMenuOpen(false)
    setNumberingMenuOpen(false)
    setBusy('number')
    try {
      const applied = await applyBinderNumbering(sequence, structureForSequence, selectedScheme)
      if (requestId !== requestIdRef.current) return
      if (!isBinderNumberingForSequence(applied, sequence)) {
        onNumberingChange(null)
        onStatus(`${binderSchemeLabel(selectedScheme)} numbering returned no complete mapping for this sequence.`)
        return
      }
      onNumberingChange(applied)
      onStatus(
        `Applied ${applied.schemeLabel} numbering to the ${targetLabel} `
        + `(${structureForSequence.label}).`,
      )
    } catch (error) {
      if (requestId !== requestIdRef.current) return
      onNumberingChange(null)
      onStructureChange?.(null)
      onStatus(
        `${binderSchemeLabel(selectedScheme)} numbering was not applied: `
        + (error instanceof Error ? error.message : 'numbering failed.'),
      )
    } finally {
      if (requestId === requestIdRef.current) setBusy(null)
    }
  }

  useEffect(() => {
    if (!detectMenuOpen && !numberingMenuOpen) return
    const dismissPointer = (event: PointerEvent) => {
      if (!controlRef.current?.contains(event.target as Node)) {
        setDetectMenuOpen(false)
        setNumberingMenuOpen(false)
      }
    }
    const dismissKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDetectMenuOpen(false)
        setNumberingMenuOpen(false)
      }
    }
    window.addEventListener('pointerdown', dismissPointer)
    window.addEventListener('keydown', dismissKey)
    return () => {
      window.removeEventListener('pointerdown', dismissPointer)
      window.removeEventListener('keydown', dismissKey)
    }
  }, [detectMenuOpen, numberingMenuOpen])

  useEffect(() => () => {
    requestIdRef.current += 1
  }, [])

  return (
    <div ref={controlRef} className="binder-structure-controls">
      <div className="binder-structure-detect-group">
        <button
          type="button"
          className={`binder-structure-detect${structureForSequence ? ' is-active' : ''}`}
          disabled={busy !== null}
          title="Auto-detect whether this protein is an immunoglobulin domain, scFv, TCR, VNAR, or DARPin"
          onClick={() => void detectStructure()}
        >
          {busy === 'detect' ? 'Detecting…' : 'Detect binder structure'}
        </button>
        <button
          type="button"
          className={`binder-structure-detect-chevron${detectMenuOpen ? ' is-open' : ''}`}
          aria-label="Choose binder type"
          aria-haspopup="menu"
          aria-expanded={detectMenuOpen}
          disabled={busy !== null}
          onClick={() => {
            setNumberingMenuOpen(false)
            setDetectMenuOpen((current) => !current)
          }}
        >
          <ChevronDown size={13} />
        </button>
        {detectMenuOpen ? (
          <div className="binder-structure-detect-menu" role="menu">
            {BINDER_TYPE_OPTIONS.map((option) => (
              <button
                type="button"
                role="menuitem"
                className={selectedTypeId === option.id ? 'is-active' : undefined}
                key={option.id}
                onClick={() => void selectStructure(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="binder-structure-numbering">
        <button
          type="button"
          className={`binder-structure-numbering-main${numberingActive ? ' is-active' : ''}`}
          aria-pressed={numberingActive}
          disabled={busy !== null || !structureForSequence}
          title={numberingActive
            ? `Clear ${binderSchemeLabel(schemeId)} numbering and use plain ${targetLabel} positions`
            : structureForSequence
              ? `Apply ${binderSchemeLabel(schemeId)} numbering for ${structureForSequence.label}`
              : 'Detect the binder structure before applying numbering'}
          onClick={() => {
            if (numberingActive) {
              requestIdRef.current += 1
              setBusy(null)
              onNumberingChange(null)
              onStatus(`Using plain ${targetLabel} positions.`)
              return
            }
            void applyNumbering(schemeId)
          }}
        >
          {busy === 'number' ? 'Numbering…' : 'Apply numbering'}
        </button>
        <button
          type="button"
          className={`binder-structure-numbering-chevron${numberingMenuOpen ? ' is-open' : ''}`}
          aria-label="Choose numbering scheme"
          aria-haspopup="menu"
          aria-expanded={numberingMenuOpen}
          disabled={busy !== null || !structureForSequence || schemes.length === 0}
          onClick={() => {
            setDetectMenuOpen(false)
            setNumberingMenuOpen((current) => !current)
          }}
        >
          <ChevronDown size={13} />
        </button>
        {numberingMenuOpen && structureForSequence ? (
          <div className="binder-structure-numbering-menu" role="menu">
            {schemes.map((scheme) => (
              <button
                type="button"
                role="menuitem"
                className={scheme.id === schemeId ? 'is-active' : undefined}
                key={scheme.id}
                onClick={() => void applyNumbering(scheme.id)}
              >
                {scheme.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {onAnnotate ? (
        <button
          type="button"
          className="binder-structure-annotate"
          disabled={busy !== null || !numberingActive || !numbering}
          title={numberingActive
            ? `Annotate ${structureForSequence?.label ?? 'binder'} features using ${binderSchemeLabel(schemeId)} numbering`
            : 'Apply numbering before annotating'}
          onClick={() => {
            if (numberingActive && numbering) onAnnotate(numbering)
          }}
        >
          Annotate
        </button>
      ) : null}

      {structureForSequence ? (
        <output
          className="binder-structure-result"
          title={structureForSequence.detail}
        >
          {structureForSequence.label}
          {structureForSequence.manual ? ' (manual)' : ''}
          {' · '}
          {Math.round(structureForSequence.confidence * 100)}%
          {numberingActive ? ` · ${binderSchemeLabel(schemeId)}` : ''}
        </output>
      ) : null}
    </div>
  )
}
