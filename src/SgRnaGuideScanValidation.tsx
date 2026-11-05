import { useEffect, useMemo, useRef, useState } from 'react'
import { GUIDESCAN_ORGANISMS, guidescanOrganismMeta } from './domain/guidescan/organisms'
import {
  evidenceFromValidationError,
  evidenceFromValidationResult,
  formatGuideScanEvidenceLocation,
  formatGuideScanEvidenceNotes,
  formatGuideScanEvidenceOffTargets,
  formatGuideScanEvidenceSourceLabel,
  formatGuideScanEvidenceStatus,
  guideScanEvidenceMatchesContext,
  type GuideScanEvidence,
} from './domain/guidescan/evidence'
import { formatGuideScanOffTargetSummary, GUIDESCAN_METRIC_HELP } from './domain/guidescan/mapping'
import { guideScanDesignEligibilityForRecord } from './domain/guidescan/eligibility'
import { mapSgRnaPresetToGuideScanEnzyme } from './domain/guidescan/sgrnaValidationMapping'
import { normalizeGuideScanGuideQuery } from './domain/guidescan/guideQuery'
import { pickGuideScanCatalogDefaults } from './domain/guidescan/catalog'
import { guidescanErrorMessage } from './domain/guidescan/types'
import type { GuideScanGuideValidationResult, GuideScanSupportedInfo } from './domain/guidescan/types'
import type { SequenceRecord } from './domain/types'
import { GuideScanMetricHelp } from './GuideScanMetricHelp'

function guideSequencePrecheck(spacer: string): string | null {
  const normalized = normalizeGuideScanGuideQuery(spacer)
  if (!normalized) return 'Enter a guide DNA sequence to validate.'
  if (!/^[ACGTN]+$/.test(normalized)) return 'Guide sequences must contain only A, C, G, T, or N.'
  if (normalized.length < 20 || normalized.length > 23) return 'GuideScan2 validates guides that are 20–23 nt.'
  return null
}

function formatLocationFromValidation(result: GuideScanGuideValidationResult) {
  const guide = result.guide
  if (!guide) return '—'
  return `${guide.chromosome}:${guide.start}-${guide.end} · ${guide.strand === 'forward' ? '+' : '−'}`
}

function organismLabel(organism: string): string {
  return guidescanOrganismMeta(organism)?.label ?? organism
}

export function GuideScanEvidenceResultTable({
  evidence,
}: {
  evidence: GuideScanEvidence
}) {
  return (
    <table className="guidescan-results-table guidescan-validate-results">
      <caption className="sr-only">GuideScan2 evidence</caption>
      <tbody>
        <tr>
          <th scope="row">Source</th>
          <td>{formatGuideScanEvidenceSourceLabel(evidence)} · {organismLabel(evidence.organism)}</td>
        </tr>
        <tr>
          <th scope="row">Status</th>
          <td>{formatGuideScanEvidenceStatus(evidence)}</td>
        </tr>
        {evidence.rank != null && evidence.rank > 0 ? (
          <tr>
            <th scope="row">Rank</th>
            <td>{evidence.rank}</td>
          </tr>
        ) : null}
        <tr>
          <th scope="row">
            <span className="guidescan-col-heading">
              Specificity
              <GuideScanMetricHelp label="About specificity">{GUIDESCAN_METRIC_HELP.specificity}</GuideScanMetricHelp>
            </span>
          </th>
          <td>{evidence.specificity != null ? evidence.specificity.toFixed(2) : '—'}</td>
        </tr>
        <tr>
          <th scope="row">
            <span className="guidescan-col-heading">
              Cutting efficiency
              <GuideScanMetricHelp label="About cutting efficiency">{GUIDESCAN_METRIC_HELP.cuttingEfficiency}</GuideScanMetricHelp>
            </span>
          </th>
          <td>{evidence.cuttingEfficiency != null ? evidence.cuttingEfficiency.toFixed(2) : '—'}</td>
        </tr>
        <tr>
          <th scope="row">Locus / strand</th>
          <td className="guidescan-locus">{formatGuideScanEvidenceLocation(evidence)}</td>
        </tr>
        <tr>
          <th scope="row">
            <span className="guidescan-col-heading">
              Off-targets
              <GuideScanMetricHelp label="About off-target counts">{GUIDESCAN_METRIC_HELP.offTargets}</GuideScanMetricHelp>
            </span>
          </th>
          <td>{formatGuideScanEvidenceOffTargets(evidence)}</td>
        </tr>
        <tr>
          <th scope="row">Notes</th>
          <td>{formatGuideScanEvidenceNotes(evidence)}</td>
        </tr>
      </tbody>
    </table>
  )
}

function GuideScanValidationResultTable({
  result,
  organism,
}: {
  result: GuideScanGuideValidationResult
  organism: string
}) {
  return (
    <table className="guidescan-results-table guidescan-validate-results">
      <caption className="sr-only">GuideScan2 validation result</caption>
      <tbody>
        <tr>
          <th scope="row">Source</th>
          <td>Validated · {organismLabel(organism || result.organism)}</td>
        </tr>
        <tr>
          <th scope="row">Status</th>
          <td>{result.found ? 'Found' : 'Not found'}</td>
        </tr>
        <tr>
          <th scope="row">
            <span className="guidescan-col-heading">
              Specificity
              <GuideScanMetricHelp label="About specificity">{GUIDESCAN_METRIC_HELP.specificity}</GuideScanMetricHelp>
            </span>
          </th>
          <td>{result.guide?.specificity != null ? result.guide.specificity.toFixed(2) : '—'}</td>
        </tr>
        <tr>
          <th scope="row">
            <span className="guidescan-col-heading">
              Cutting efficiency
              <GuideScanMetricHelp label="About cutting efficiency">{GUIDESCAN_METRIC_HELP.cuttingEfficiency}</GuideScanMetricHelp>
            </span>
          </th>
          <td>{result.guide?.cuttingEfficiency != null ? result.guide.cuttingEfficiency.toFixed(2) : '—'}</td>
        </tr>
        <tr>
          <th scope="row">Locus / strand</th>
          <td className="guidescan-locus">{formatLocationFromValidation(result)}</td>
        </tr>
        <tr>
          <th scope="row">
            <span className="guidescan-col-heading">
              Off-targets
              <GuideScanMetricHelp label="About off-target counts">{GUIDESCAN_METRIC_HELP.offTargets}</GuideScanMetricHelp>
            </span>
          </th>
          <td>{result.guide ? formatGuideScanOffTargetSummary(result.guide.offTargetCounts) : '—'}</td>
        </tr>
        <tr>
          <th scope="row">Notes</th>
          <td>{result.found
            ? (result.guide?.annotations?.length ? `${result.guide.annotations.length} annotation(s)` : 'No extra annotations')
            : (result.errorMessage ?? 'Guide not found in GuideScan2 database.')}</td>
        </tr>
      </tbody>
    </table>
  )
}

type ValidationSnapshot = {
  contextKey: string
  phase: 'idle' | 'running' | 'done' | 'error'
  statusMessage: string
  result: GuideScanGuideValidationResult | null
}

const EMPTY_VALIDATION_SNAPSHOT: ValidationSnapshot = {
  contextKey: '',
  phase: 'idle',
  statusMessage: '',
  result: null,
}

export function SgRnaGuideScanValidation({
  record,
  presetId,
  spacer,
  persistedEvidence = null,
  onEvidenceChange,
}: {
  record: SequenceRecord
  presetId: string
  spacer: string
  /** Previously saved (or draft) evidence shown until a fresh validation replaces it. */
  persistedEvidence?: GuideScanEvidence | null
  /** Reports committed draft evidence: validation outcomes, or null when inputs invalidate it. */
  onEvidenceChange?: (evidence: GuideScanEvidence | null) => void
}) {
  const enzymeMapping = useMemo(() => mapSgRnaPresetToGuideScanEnzyme(presetId), [presetId])
  const normalizedSpacer = useMemo(() => normalizeGuideScanGuideQuery(spacer), [spacer])
  const sequenceIssue = useMemo(() => (normalizedSpacer ? guideSequencePrecheck(spacer) : 'Enter a guide DNA sequence to validate.'), [spacer, normalizedSpacer])

  const [catalog, setCatalog] = useState<GuideScanSupportedInfo | null>(null)
  const [organism, setOrganism] = useState(() => persistedEvidence?.organism ?? 'hg38')
  const [snapshot, setSnapshot] = useState<ValidationSnapshot>(EMPTY_VALIDATION_SNAPSHOT)
  const abortRef = useRef<AbortController | null>(null)
  const onEvidenceChangeRef = useRef(onEvidenceChange)
  const preferredOrganismRef = useRef(persistedEvidence?.organism ?? null)

  const enzymeId = enzymeMapping.ok ? enzymeMapping.enzyme : ''
  const validationContextKey = `${presetId}|${normalizedSpacer}|${organism}`
  const validationContextKeyRef = useRef(validationContextKey)
  const lastValidationContextKeyRef = useRef(validationContextKey)
  const matchesContext = snapshot.contextKey === validationContextKey
  const phase = matchesContext ? snapshot.phase : 'idle'
  const statusMessage = matchesContext ? snapshot.statusMessage : ''
  const displayResult = matchesContext ? snapshot.result : null

  useEffect(() => {
    onEvidenceChangeRef.current = onEvidenceChange
  }, [onEvidenceChange])

  useEffect(() => {
    validationContextKeyRef.current = validationContextKey
  }, [validationContextKey])

  const matchingPersisted = useMemo(() => {
    if (!persistedEvidence || !enzymeId) return null
    return guideScanEvidenceMatchesContext(persistedEvidence, {
      spacer: normalizedSpacer,
      enzyme: enzymeId,
      organism,
    }) ? persistedEvidence : null
  }, [persistedEvidence, normalizedSpacer, enzymeId, organism])

  const disabledReason = !enzymeMapping.ok
    ? enzymeMapping.reason
    : sequenceIssue
      ? sequenceIssue
      : !organism.trim()
        ? 'Choose a GuideScan reference genome.'
        : null

  const organismOptions = useMemo(() => {
    const ids = catalog?.organisms ?? GUIDESCAN_ORGANISMS.map((entry) => entry.id)
    return ids.map((id) => ({
      id,
      label: GUIDESCAN_ORGANISMS.find((entry) => entry.id === id)?.label ?? id,
    }))
  }, [catalog])

  useEffect(() => {
    let cancelled = false
    void import('./domain/guidescan/design')
      .then(({ loadGuideScanCatalog }) => loadGuideScanCatalog())
      .then((info) => {
        if (cancelled) return
        setCatalog(info)
        if (preferredOrganismRef.current) {
          setOrganism(preferredOrganismRef.current)
          return
        }
        const picked = pickGuideScanCatalogDefaults(info)
        const recordEligibility = guideScanDesignEligibilityForRecord(record)
        if (recordEligibility.eligible && recordEligibility.organism) {
          setOrganism(recordEligibility.organism)
        } else {
          setOrganism(picked.organism)
        }
      })
      .catch((error) => {
        console.error('Could not load the GuideScan catalog.', error)
        if (!cancelled) setCatalog(null)
      })
    return () => {
      cancelled = true
    }
  }, [record])

  useEffect(() => {
    if (lastValidationContextKeyRef.current === validationContextKey) return
    lastValidationContextKeyRef.current = validationContextKey
    abortRef.current?.abort()
    abortRef.current = null
    onEvidenceChangeRef.current?.(null)
  }, [validationContextKey])

  function cancelValidation() {
    abortRef.current?.abort()
    abortRef.current = null
    setSnapshot((current) => (
      current.contextKey === validationContextKey
        ? { ...current, phase: 'idle', statusMessage: 'GuideScan validation cancelled.' }
        : current
    ))
  }

  async function runValidation() {
    if (disabledReason || !enzymeMapping.ok) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const requestContextKey = validationContextKey
    setSnapshot({
      contextKey: requestContextKey,
      phase: 'running',
      statusMessage: 'Submitting GuideScan2 validation…',
      result: null,
    })

    try {
      const { validateGuideWithGuideScan } = await import('./domain/guidescan/validate')
      if (controller.signal.aborted) return
      const validation = await validateGuideWithGuideScan({
        organism,
        enzyme: enzymeMapping.enzyme,
        guideSequence: normalizedSpacer,
      }, { signal: controller.signal })
      setSnapshot((current) => {
        if (current.contextKey !== requestContextKey || validationContextKeyRef.current !== requestContextKey) {
          return current
        }
        return {
          contextKey: requestContextKey,
          phase: 'done',
          statusMessage: validation.found
            ? 'Guide found in GuideScan2.'
            : validation.errorMessage ?? 'Guide not found in GuideScan2 database.',
          result: validation,
        }
      })
      if (validationContextKeyRef.current === requestContextKey) {
        onEvidenceChangeRef.current?.(evidenceFromValidationResult(validation))
      }
    } catch (error) {
      if (controller.signal.aborted) return
      const message = guidescanErrorMessage(error)
      setSnapshot((current) => {
        if (current.contextKey !== requestContextKey || validationContextKeyRef.current !== requestContextKey) {
          return current
        }
        return {
          contextKey: requestContextKey,
          phase: 'error',
          statusMessage: message,
          result: null,
        }
      })
      if (validationContextKeyRef.current === requestContextKey) {
        onEvidenceChangeRef.current?.(evidenceFromValidationError({
          organism,
          enzyme: enzymeMapping.enzyme,
          querySequence: normalizedSpacer,
          message,
        }))
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null
    }
  }

  return (
    <div className="guidescan-validate-panel">
      <div className="guidescan-validate-controls">
        <label>
          <span>Reference genome</span>
          <select value={organism} onChange={(event) => setOrganism(event.target.value)}>
            {organismOptions.map((entry) => (
              <option key={entry.id} value={entry.id}>{entry.label}</option>
            ))}
          </select>
        </label>
        <div className="guidescan-validate-actions choices">
          {phase === 'running'
            ? <button type="button" onClick={cancelValidation}>Cancel</button>
            : <button
              type="button"
              disabled={Boolean(disabledReason)}
              title={disabledReason ?? undefined}
              aria-describedby={disabledReason ? 'guidescan-validate-disabled-reason' : undefined}
              onClick={() => void runValidation()}
            >
              Validate with GuideScan2
            </button>}
        </div>
      </div>
      {disabledReason && phase !== 'running' && (
        <p id="guidescan-validate-disabled-reason" className="guidescan-target-hint">{disabledReason}</p>
      )}
      {statusMessage && (
        <p className={phase === 'error' ? 'guidescan-design-error' : 'guidescan-design-status'} role={phase === 'error' ? 'alert' : 'status'}>
          {statusMessage}
        </p>
      )}
      {displayResult
        ? <GuideScanValidationResultTable result={displayResult} organism={organism} />
        : matchingPersisted
          ? <GuideScanEvidenceResultTable evidence={matchingPersisted} />
          : null}
    </div>
  )
}
