import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, ExternalLink, FolderOpen, Search, X } from 'lucide-react'
import {
  searchDnaDatabaseAnnotations,
  type DnaAnnotationDatabase,
  type DnaAnnotationPlan,
} from './domain/dnaDatabaseAnnotation'
import { databaseImportError } from './domain/externalSequences/http'
import type { SequenceFeature } from './domain/types'

type Props = {
  recordName: string
  sequence: string
  queryRange: { start: number; end: number }
  onCancel: () => void
  onApply: (features: SequenceFeature[], plans: DnaAnnotationPlan[]) => void
  onOpenExternal: (url: string) => void
}

function percent(value: number) {
  return `${Math.round(value * 10) / 10}%`
}

function eValue(value: number) {
  if (value === 0) return '0'
  return value < 0.001 ? value.toExponential(1) : value.toPrecision(2)
}

function annotationKey(accession: string, id: string) {
  return `${accession}\u0000${id}`
}

export function DnaDatabaseAnnotationDialog({ recordName, sequence, queryRange, onCancel, onApply, onOpenExternal }: Props) {
  const [database, setDatabase] = useState<DnaAnnotationDatabase>('ena_synthetic')
  const [maxHits, setMaxHits] = useState(10)
  const [plans, setPlans] = useState<DnaAnnotationPlan[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const querySequence = sequence.slice(queryRange.start, queryRange.end)
  const wholeSequence = queryRange.start === 0 && queryRange.end === sequence.length

  useEffect(() => () => abortRef.current?.abort(), [])

  const selectedAnnotations = useMemo(() => plans.flatMap((plan) => plan.annotations
    .filter((annotation) => annotation.transferable && selected.has(annotationKey(plan.hit.accession, annotation.id)))
    .map((annotation) => ({ annotation, plan }))), [plans, selected])

  async function runSearch() {
    if (busy) return
    const controller = new AbortController()
    abortRef.current?.abort()
    abortRef.current = controller
    setBusy(true)
    setPlans([])
    setSelected(new Set())
    setExpanded(new Set())
    setError('')
    try {
      const nextPlans = await searchDnaDatabaseAnnotations(querySequence, {
        database,
        maxHits,
        queryOffset: queryRange.start,
        signal: controller.signal,
        onStatus: setStatus,
      })
      setPlans(nextPlans)
      setExpanded(new Set(nextPlans.map((plan) => plan.hit.accession)))
      setSelected(new Set(nextPlans.flatMap((plan) => plan.annotations
        .filter((annotation) => annotation.selectedByDefault)
        .map((annotation) => annotationKey(plan.hit.accession, annotation.id)))))
      if (!nextPlans.length) setError('No annotated nucleotide matches were found.')
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === 'AbortError')) setError(databaseImportError(caught))
    } finally {
      if (abortRef.current === controller) setBusy(false)
    }
  }

  function cancelSearch() {
    abortRef.current?.abort()
    abortRef.current = null
    setBusy(false)
    setStatus('')
    setError('Search cancelled. Adjust the settings and search again when ready.')
  }

  function reset() {
    setPlans([])
    setSelected(new Set())
    setExpanded(new Set())
    setError('')
  }

  return (
    <div className="translation-dialog-backdrop" role="presentation" onPointerDown={() => !busy && onCancel()}>
      <div className="translation-dialog protein-uniprot-annotation-dialog" role="dialog" aria-modal="true" aria-labelledby="dna-database-annotation-title" onPointerDown={(event) => event.stopPropagation()}>
        <div className="sequence-database-import-heading">
          <div>
            <h3 id="dna-database-annotation-title">Annotate DNA from Databases</h3>
            <p>{recordName} · {wholeSequence ? 'Whole sequence' : `Selected bases ${queryRange.start + 1}–${queryRange.end}`} · {querySequence.length.toLocaleString()} bp</p>
          </div>
          <button type="button" className="sequence-database-import-close" aria-label="Close" disabled={busy} onClick={onCancel}>×</button>
        </div>

        {!plans.length && <div className="protein-uniprot-search-settings dna-database-annotation-settings">
          <div className="protein-uniprot-privacy-note">
            {database === 'ena' || database === 'ena_synthetic'
              ? `The submitted DNA sequence is sent to EMBL-EBI Job Dispatcher and matched against ${database === 'ena_synthetic' ? 'ENA synthetic constructs' : 'the full ENA library'}. The synthetic division is recommended for engineered plasmids and fusion constructs.`
              : 'The submitted DNA sequence is sent to NCBI BLAST. Deep NCBI searches can remain queued for hours and are intended as a fallback when ENA finds no useful match.'}
          </div>
          <label className="protein-annotation-source-field">
            <span>Search database</span>
            <select value={database} disabled={busy} onChange={(event) => setDatabase(event.target.value as DnaAnnotationDatabase)}>
              <option value="ena_synthetic">ENA synthetic constructs — recommended, fastest</option>
              <option value="ena">ENA all nucleotide sequences — broader, potentially slower</option>
              <option value="refseq_genomic">Deep NCBI RefSeq genomic — potentially hours</option>
              <option value="core_nt">Deep NCBI core nucleotide/GenBank — potentially hours</option>
            </select>
          </label>
          <label className="protein-annotation-max-hits-field">
            <span>Maximum matches</span>
            <select value={maxHits} disabled={busy} onChange={(event) => setMaxHits(Number(event.target.value))}>
              <option value={5}>5</option><option value={10}>10</option><option value={20}>20</option>
            </select>
          </label>
          <div className="protein-uniprot-search-action">
            <span aria-hidden="true">Action</span>
            <button type="button" className={`primary protein-uniprot-search-button${busy ? ' is-cancel' : ''}`} disabled={!busy && querySequence.length < 30} onClick={() => busy ? cancelSearch() : void runSearch()}>
              {busy ? <X size={15} /> : <Search size={15} />} {busy ? 'Cancel search' : 'Search annotated DNA'}
            </button>
          </div>
        </div>}

        <div className="protein-uniprot-results" aria-busy={busy}>
          {busy ? <div className="sequence-database-empty">{status === 'RETRIEVING' ? 'Retrieving source annotations…' : status === 'SUBMITTING' ? `Submitting DNA to ${database === 'ena' || database === 'ena_synthetic' ? 'EMBL-EBI' : 'NCBI'}…` : status.startsWith('WAITING:') ? `Waiting in the NCBI queue… initial estimate ${Math.max(1, Math.ceil(Number(status.split(':')[1]) / 60))} min. You can cancel and continue working.` : database === 'ena' || database === 'ena_synthetic' ? 'Searching ENA nucleotide sequences through EMBL-EBI…' : 'Searching NCBI nucleotide databases…'}</div>
            : plans.length ? <>
              <div className="sequence-database-results-summary">{plans.length} annotated match{plans.length === 1 ? '' : 'es'} · {selectedAnnotations.length} feature{selectedAnnotations.length === 1 ? '' : 's'} selected</div>
              <div className="protein-uniprot-hit-list" aria-label="DNA database matches">
                {plans.map((plan) => {
                  const isExpanded = expanded.has(plan.hit.accession)
                  const selectedCount = plan.annotations.filter((annotation) => selected.has(annotationKey(plan.hit.accession, annotation.id))).length
                  return <section key={plan.hit.accession} className={`protein-uniprot-hit-container${isExpanded ? ' is-expanded' : ''}`}>
                    <div className="protein-uniprot-hit-heading">
                      <button type="button" className="protein-uniprot-hit-toggle" aria-expanded={isExpanded} onClick={() => setExpanded((current) => {
                        const next = new Set(current); if (next.has(plan.hit.accession)) next.delete(plan.hit.accession); else next.add(plan.hit.accession); return next
                      })}>
                        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}<FolderOpen size={17} />
                        <span>
                          <span className="sequence-database-result-title"><strong>{plan.sourceRecord.name || plan.hit.title}</strong><code>{plan.hit.accession}</code>{selectedCount > 0 && <b>{selectedCount} selected</b>}</span>
                          <span className="sequence-database-result-description">{plan.hit.title}</span>
                          <span className="sequence-database-result-organism">Organism: {plan.organism || 'not reported by source'}</span>
                          <span className="sequence-database-result-meta">{percent(plan.hit.identityPercent)} identity · {percent(plan.hit.queryCoveragePercent)} query coverage · E {eValue(plan.hit.eValue)} · {plan.annotations.length} mapped features</span>
                        </span>
                      </button>
                      <button type="button" className="sequence-database-source-link" onClick={() => onOpenExternal(plan.hit.provider === 'ena' ? `https://www.ebi.ac.uk/ena/browser/view/${encodeURIComponent(plan.hit.accession)}` : `https://www.ncbi.nlm.nih.gov/nuccore/${encodeURIComponent(plan.hit.accession)}`)}>View source <ExternalLink size={12} /></button>
                    </div>
                    {isExpanded && <div className="protein-uniprot-hit-contents">
                      <div className="protein-uniprot-selection-tools"><span>{selectedCount} of {plan.annotations.filter((annotation) => annotation.transferable).length} transferable selected</span>
                        <button type="button" onClick={() => setSelected((current) => new Set([...current, ...plan.annotations.filter((annotation) => annotation.selectedByDefault).map((annotation) => annotationKey(plan.hit.accession, annotation.id))]))}>Recommended</button>
                        <button type="button" onClick={() => setSelected((current) => new Set([...current, ...plan.annotations.filter((annotation) => annotation.transferable).map((annotation) => annotationKey(plan.hit.accession, annotation.id))]))}>All transferable</button>
                        <button type="button" onClick={() => setSelected((current) => { const next = new Set(current); plan.annotations.forEach((annotation) => next.delete(annotationKey(plan.hit.accession, annotation.id))); return next })}>None</button>
                      </div>
                      <div className="protein-uniprot-annotation-list">{plan.annotations.map((annotation) => {
                        const key = annotationKey(plan.hit.accession, annotation.id)
                        return <label key={key} className={!annotation.transferable ? 'is-disabled' : undefined}>
                          <input type="checkbox" disabled={!annotation.transferable} checked={selected.has(key)} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(key); else next.delete(key); return next })} />
                          <span><span className="protein-uniprot-annotation-title"><strong>{annotation.name}</strong><em>{annotation.type}</em></span><small>{annotation.sourceRange} → {annotation.targetRange ?? 'not mapped'} · {percent(annotation.identityPercent)} identity · {percent(annotation.coveragePercent)} mapped</small>{annotation.warning && <small className="is-warning">{annotation.warning}</small>}</span>
                        </label>
                      })}</div>
                    </div>}
                  </section>
                })}
              </div>
            </> : <div className="sequence-database-empty">Configure and start a DNA database search.</div>}
        </div>
        {error && <div className="sequence-database-error" role="alert">{error}</div>}
        <div className="translation-dialog-footer sequence-database-footer"><button type="button" disabled={busy} onClick={onCancel}>Cancel</button><div>
          {plans.length > 0 && <button type="button" onClick={reset}>New search</button>}
          {plans.length > 0 && <button type="button" className="primary" disabled={!selectedAnnotations.length} onClick={() => onApply(selectedAnnotations.flatMap(({ annotation }) => annotation.feature ? [annotation.feature] : []), [...new Map(selectedAnnotations.map(({ plan }) => [plan.hit.accession, plan])).values()])}>Add {selectedAnnotations.length || ''} selected feature{selectedAnnotations.length === 1 ? '' : 's'}</button>}
        </div></div>
      </div>
    </div>
  )
}
