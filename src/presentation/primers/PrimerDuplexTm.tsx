import { useEffect, useId, useRef, useState } from 'react'
import type { PrimerDuplexTmResult } from '../../domain/primerDuplexThermodynamics'
import './PrimerDuplexTm.css'

export function PrimerDuplexTm({ result }: { result: PrimerDuplexTmResult | null }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const popupId = useId()

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !ref.current?.contains(event.target)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  if (result?.status === 'unsupported') {
    const coverage = result.variantCoverage
      ? `; evaluated ${result.variantCoverage.evaluatedVariantCount}/${result.variantCoverage.totalVariantCount}, ${result.variantCoverage.estimatedVariantCount} estimated, ${result.variantCoverage.unsupportedVariantCount ?? 'unknown'} unsupported, ${result.variantCoverage.unexaminedVariantCount} unexamined`
      : ''
    return <>Duplex Tm unavailable{`: ${result.reason}${coverage}`}</>
  }
  if (!result) {
    return <>Duplex Tm unavailable</>
  }

  const tailDetails = result.excludedFivePrimeBases
    ? result.modeledFivePrimeDanglingBases
      ? `5′ tail: ${result.modeledFivePrimeDanglingBases} adjacent dangling ${result.modeledFivePrimeDanglingBases === 1 ? 'base' : 'bases'} modeled${result.excludedFivePrimeBases > result.modeledFivePrimeDanglingBases ? `; ${result.excludedFivePrimeBases - result.modeledFivePrimeDanglingBases} remaining tail bases excluded` : ''}`
      : `5′ tail: ${result.excludedFivePrimeBases} unpaired bases excluded; dangling-end contribution not modeled`
    : ''

  const details = result.status === 'estimated-range'
    ? [
      `Range across ${result.estimatedVariantCount} estimated primer variants out of ${result.totalVariantCount}`,
      `Assumes equal abundance across IUPAC variants (${(result.oligoConcPerVariant * 1e9).toPrecision(3)} nM per variant); actual mixture proportions may differ`,
      result.unsupportedVariantCount ? `${result.unsupportedVariantCount} variants were unsupported and excluded from the range` : '',
      result.approximateTandemMismatchVariantCount ? `internal-loop approximation used for ${result.approximateTandemMismatchVariantCount} estimated variants` : '',
      tailDetails,
      result.assumedSubstitutions ? 'equal-length internal blocks treated as substitutions' : '',
    ].filter(Boolean).join('; ')
    : [
      `${result.mismatchCount} mismatch${result.mismatchCount === 1 ? '' : 'es'}${result.mismatchPositions.length ? ` at 5′ positions ${result.mismatchPositions.join(', ')}` : ''}`,
      tailDetails,
      result.assumedSubstitutions ? 'equal-length internal blocks treated as substitutions' : '',
      result.approximateTandemMismatch ? 'internal-loop model is unvalidated and salt correction approximate' : '',
    ].filter(Boolean).join('; ')

  return <>
    {result.status === 'estimated-range'
      ? `${result.unsupportedVariantCount ? 'Partial duplex Tm range' : 'Duplex Tm range'} ${result.tmCRange.min.toFixed(1)}–${result.tmCRange.max.toFixed(1)} °C`
      : `Estimated duplex Tm ${result.tmC.toFixed(1)} °C`}{' '}
    <span className="primer-duplex-info" ref={ref}>
      <button type="button" className="primer-duplex-info-button" aria-label="Duplex Tm details" aria-expanded={open} aria-controls={popupId} onClick={() => setOpen((value) => !value)}>i</button>
      {open && <span id={popupId} className="primer-duplex-info-popup" role="note">{details}</span>}
    </span>
  </>
}
