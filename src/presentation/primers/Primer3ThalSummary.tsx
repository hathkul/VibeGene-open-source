import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PrimerDuplexTmResult } from '../../domain/primerDuplexThermodynamics'
import type { Primer3ThalState } from './usePrimer3Thal'
import { formatPrimer3ThalStructure } from './primer3ThalForBinding'
import './Primer3ThalSummary.css'

function fixedAlignmentText(result: PrimerDuplexTmResult | null): string {
  if (!result) return 'unavailable'
  if (result.status === 'unsupported') return `unavailable: ${result.reason}`
  if (result.status === 'estimated-range') {
    const label = result.unsupportedVariantCount ? 'Partial original alignment range' : 'Original alignment range'
    return `${label} ${result.tmCRange.min.toFixed(1)}–${result.tmCRange.max.toFixed(1)} °C (${result.estimatedVariantCount}/${result.totalVariantCount} variants estimated${result.unsupportedVariantCount ? `; ${result.unsupportedVariantCount} unsupported` : ''})`
  }
  return `${result.tmC.toFixed(1)} °C`
}

function fixedAlignmentLimitations(result: PrimerDuplexTmResult | null): string[] {
  if (!result) return ['No original alignment estimate is available.']
  if (result.status === 'unsupported') {
    const coverage = result.variantCoverage
      ? `Variant coverage: ${result.variantCoverage.estimatedVariantCount} estimated, ${result.variantCoverage.unsupportedVariantCount ?? 'unknown'} unsupported, ${result.variantCoverage.unexaminedVariantCount} unexamined of ${result.variantCoverage.totalVariantCount}.`
      : ''
    return [`Original alignment estimate unavailable: ${result.reason}`, coverage].filter(Boolean)
  }
  if (result.status === 'estimated-range') {
    return [
      `Range across ${result.estimatedVariantCount} estimated primer variants out of ${result.totalVariantCount}.`,
      `Assumes equal variant abundance (${(result.oligoConcPerVariant * 1e9).toPrecision(3)} nM per variant); actual mixture proportions may differ.`,
      result.unsupportedVariantCount ? `${result.unsupportedVariantCount} variants were unsupported and excluded from the range.` : '',
      result.approximateTandemMismatchVariantCount ? `Internal-loop model is unvalidated and salt correction approximate for ${result.approximateTandemMismatchVariantCount} estimated variants.` : '',
      result.excludedFivePrimeBases
        ? `5′ tail: ${result.modeledFivePrimeDanglingBases ?? 0} adjacent dangling bases modeled; ${Math.max(0, result.excludedFivePrimeBases - (result.modeledFivePrimeDanglingBases ?? 0))} remaining tail bases excluded.`
        : '',
      result.assumedSubstitutions ? 'Equal-length internal blocks were treated as substitutions.' : '',
    ].filter(Boolean)
  }
  return [
    `${result.mismatchCount} mismatch${result.mismatchCount === 1 ? '' : 'es'}${result.mismatchPositions.length ? ` at 5′ positions ${result.mismatchPositions.join(', ')}` : ''}.`,
    result.terminalMismatchPositions?.length ? `Terminal mismatch positions: ${result.terminalMismatchPositions.join(', ')}.` : '',
    result.excludedFivePrimeBases
      ? `5′ tail: ${result.modeledFivePrimeDanglingBases ?? 0} adjacent dangling bases modeled; ${Math.max(0, result.excludedFivePrimeBases - (result.modeledFivePrimeDanglingBases ?? 0))} remaining tail bases excluded.`
      : '',
    result.approximateTandemMismatch ? 'Internal-loop model is unvalidated and salt correction approximate.' : '',
    result.assumedSubstitutions ? 'Equal-length internal blocks were treated as substitutions.' : '',
  ].filter(Boolean)
}

export function Primer3ThalSummary({
  primer3,
  fixedAlignment,
  primer3MappedToPreview = false,
  approximation,
}: {
  primer3: Primer3ThalState
  fixedAlignment: PrimerDuplexTmResult | null
  primer3MappedToPreview?: boolean
  approximation?: {
    excludedPrimer5PrimeBases: string
    excludedPrimer5PrimeBaseCount: number
    retainedPrimer5PrimeBaseCount: number
    fullPrimerLength: number
    modeledPrimerLength: number
  }
}) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ left: number; top: number; width: number; maxHeight: number } | null>(null)
  const detailsId = useId()
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const popupRef = useRef<HTMLDivElement | null>(null)
  const available = primer3.status === 'estimated'
  const structureText = available ? primer3.result.structure : ''

  useLayoutEffect(() => {
    if (!open) return
    const updatePosition = () => {
      const anchor = buttonRef.current?.getBoundingClientRect()
      const popup = popupRef.current
      if (!anchor || !popup) return
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const paddingX = Math.min(12, Math.max(0, (viewportWidth - 1) / 2))
      const paddingY = Math.min(12, Math.max(0, (viewportHeight - 1) / 2))
      const width = Math.max(1, Math.min(640, viewportWidth - paddingX * 2))
      const viewportMaxHeight = Math.max(1, viewportHeight - paddingY * 2)

      // Measure after applying the intended width so wrapping reflects the actual popup.
      popup.style.width = `${width}px`
      popup.style.maxHeight = `${viewportMaxHeight}px`
      const naturalHeight = Math.max(popup.scrollHeight, popup.getBoundingClientRect().height, 1)
      const availableBelow = Math.max(0, viewportHeight - paddingY - anchor.bottom - 8)
      const availableAbove = Math.max(0, anchor.top - paddingY - 8)
      const placeBelow = naturalHeight <= availableBelow || availableBelow >= availableAbove
      const availableAtSide = placeBelow ? availableBelow : availableAbove
      const maxHeight = Math.max(1, Math.min(naturalHeight, availableAtSide || viewportMaxHeight))
      const anchorCenter = anchor.left + anchor.width / 2
      const left = Math.max(paddingX, Math.min(anchorCenter - width / 2, viewportWidth - width - paddingX))
      let top = placeBelow ? anchor.bottom + 8 : anchor.top - maxHeight - 8
      top = Math.max(paddingY, Math.min(top, viewportHeight - maxHeight - paddingY))
      setPosition((previous) => previous?.left === left && previous.top === top && previous.width === width && previous.maxHeight === maxHeight
        ? previous
        : { left, top, width, maxHeight })
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open, primer3.status, structureText, fixedAlignment])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Node && !buttonRef.current?.contains(target) && !popupRef.current?.contains(target)) {
        setOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])
  const primaryValue = available
    ? `${primer3.result.tmC.toFixed(1)} °C (Primer3${approximation ? '; approximate' : ''})`
    : primer3.status === 'loading'
      ? fixedAlignment
        ? `${fixedAlignmentText(fixedAlignment)} (original alignment; Primer3 calculating…)`
        : 'calculating with Primer3…'
      : fixedAlignment
        ? `${fixedAlignmentText(fixedAlignment)} (original alignment; Primer3 unavailable)`
        : `unavailable (${primer3.status === 'unavailable' ? primer3.reason : 'no thermodynamic estimate'})`

  return (
    <section className="primer-tm-summary" aria-label="Primer melting temperature estimates">
      <p className="primer-tm-summary__primary" aria-live="polite">
        <strong>Estimated duplex Tm: </strong>{primaryValue}{' '}
        <button
          ref={buttonRef}
          className="primer-tm-summary__info-button"
          type="button"
          aria-label="Duplex Tm details"
          aria-expanded={open}
          aria-controls={detailsId}
          onClick={() => {
            setPosition(null)
            setOpen((value) => !value)
          }}
        >i</button>
      </p>
      {open && createPortal(
        <div
          ref={popupRef}
          className="primer-tm-summary__details"
          id={detailsId}
          role="note"
          style={{
            position: 'fixed', left: position?.left ?? 12, top: position?.top ?? 12,
            width: position?.width ?? 640, maxWidth: 'calc(100vw - 24px)',
            maxHeight: position?.maxHeight ?? 'calc(100vh - 24px)', overflow: 'auto',
            visibility: position ? 'visible' : 'hidden',
          }}
        >
          {primer3.status === 'unavailable' && <p>Primer3 estimate unavailable: {primer3.reason}</p>}
          <p>
            Primer3 estimates Tm from its predicted structure at this binding site. The original alignment estimate uses the same reaction conditions but a different calculation method. The predicted structure can differ from the original alignment. Neither estimate guarantees PCR extension.
          </p>
          <p>Original alignment estimate: {fixedAlignmentText(fixedAlignment)}.</p>
          <p>
            Sequence highlights and the 3′ exact-match Tm above use the original alignment.{' '}
            {primer3MappedToPreview
              ? 'Preview shows the Primer3 structure.'
              : primer3.status === 'estimated'
                ? 'Preview shows the original alignment; the Primer3 structure is below.'
                : 'Preview shows the original alignment while Primer3 is unavailable or calculating.'}
          </p>
          {approximation ? (
            <p>
              {available ? 'Approximate Primer3 estimate' : 'Approximate Primer3 request'}: it models {approximation.modeledPrimerLength} of {approximation.fullPrimerLength} primer bases, retaining {approximation.retainedPrimer5PrimeBaseCount} leading 5′ overhang bases and omitting {approximation.excludedPrimer5PrimeBaseCount}. The preview keeps the full primer and draws omitted bases as an unmodeled overhang. The displayed Primer3 structure contains only the modeled sequence.
            </p>
          ) : null}
          <ul>
            {fixedAlignmentLimitations(fixedAlignment).map((limitation, index) => <li key={`${index}-${limitation}`}>{limitation}</li>)}
          </ul>
          {primer3.status === 'estimated' ? (
            <>
              <p>{approximation ? 'Primer3 predicted structure (modeled primer portion)' : 'Primer3 predicted structure'}</p>
              <pre aria-label="Primer3 predicted structure drawing" style={{ maxHeight: 220, overflow: 'auto', whiteSpace: 'pre' }}>
                {formatPrimer3ThalStructure(primer3.result.structure)}
              </pre>
            </>
          ) : primer3.status === 'loading' ? (
            <p role="status">Calculating Primer3 estimate…</p>
          ) : null}
        </div>,
        document.body,
      )}
    </section>
  )
}
