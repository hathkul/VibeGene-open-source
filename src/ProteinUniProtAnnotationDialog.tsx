import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, ExternalLink, FolderOpen, Search, X } from 'lucide-react'
import {
  buildUniProtAnnotationPlan,
  searchUniProtBySimilarity,
  type ProjectedUniProtAnnotation,
  type UniProtAnnotationPlan,
  type UniProtBlastDatabase,
  type UniProtSimilarityHit,
} from './domain/proteinUniProtAnnotation'
import {
  featureFromInterProMatch,
  searchInterProPfam,
  type InterProAnnotationGroup,
  type InterProScanMatch,
} from './domain/proteinInterProAnnotation'
import type { ProteinBond, SequenceFeature } from './domain/types'
import { commonOrganisms } from './domain/externalSequences/organisms'

type Props = {
  recordName: string
  sequence: string
  queryRange: { start: number; end: number }
  onCancel: () => void
  onApply: (features: SequenceFeature[], bonds: ProteinBond[], plans: UniProtAnnotationPlan[]) => void
  onApplyInterPro: (features: SequenceFeature[], matches: InterProScanMatch[]) => void
  onOpenExternal: (url: string) => void
}

type AnnotationSource = 'uniprot' | 'interpro'

function percent(value: number) {
  return `${Math.round(value * 10) / 10}%`
}

function eValue(value: number) {
  if (value === 0) return '0'
  return value < 0.001 ? value.toExponential(1) : value.toPrecision(2)
}

function searchStatusLabel(status: string) {
  if (status === 'SUBMITTING') return 'Submitting the sequence to EMBL-EBI…'
  if (status === 'RETRIEVING') return 'Retrieving UniProt annotations…'
  if (status === 'PENDING' || status === 'QUEUED') return 'The similarity search is queued…'
  return 'Searching UniProtKB for similar proteins…'
}

function interProStatusLabel(status: string) {
  if (status === 'SUBMITTING') return 'Submitting the sequence to EMBL-EBI…'
  if (status === 'RETRIEVING') return 'Retrieving InterPro/Pfam annotations…'
  if (status === 'PENDING' || status === 'QUEUED') return 'The InterProScan search is queued…'
  return 'Scanning the sequence for InterPro/Pfam domains…'
}

function annotationMeta(annotation: ProjectedUniProtAnnotation) {
  return [
    `${annotation.sourceRange} → ${annotation.targetRange ?? 'not mapped'}`,
    `${percent(annotation.identityPercent)} local identity`,
    `${percent(annotation.coveragePercent)} mapped`,
    annotation.experimentalEvidence ? 'Experimental evidence' : '',
  ].filter(Boolean).join(' · ')
}

function annotationKey(accession: string, annotationId: string) {
  return `${accession}\u0000${annotationId}`
}

export function ProteinUniProtAnnotationDialog({
  recordName,
  sequence,
  queryRange,
  onCancel,
  onApply,
  onApplyInterPro,
  onOpenExternal,
}: Props) {
  const [source, setSource] = useState<AnnotationSource>('uniprot')
  const [database, setDatabase] = useState<UniProtBlastDatabase>('uniprotkb_swissprot')
  const [organism, setOrganism] = useState('')
  const [maxHits, setMaxHits] = useState(20)
  const [hits, setHits] = useState<UniProtSimilarityHit[]>([])
  const [plans, setPlans] = useState<Map<string, UniProtAnnotationPlan>>(new Map())
  const [expandedAccessions, setExpandedAccessions] = useState<Set<string>>(new Set())
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [interProGroups, setInterProGroups] = useState<InterProAnnotationGroup[]>([])
  const [expandedInterProGroups, setExpandedInterProGroups] = useState<Set<string>>(new Set())
  const [selectedInterProIds, setSelectedInterProIds] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [completedSource, setCompletedSource] = useState<AnnotationSource | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const querySequence = sequence.slice(queryRange.start, queryRange.end)
  const wholeProtein = queryRange.start === 0 && queryRange.end === sequence.length
  const hasResults = hits.length > 0 || interProGroups.length > 0

  useEffect(() => () => abortRef.current?.abort(), [])

  const selectedAnnotations = useMemo(() => [...plans.values()].flatMap((plan) =>
    plan.annotations.filter((annotation) => selectedIds.has(annotationKey(plan.hit.accession, annotation.id)) && annotation.transferable)
      .map((annotation) => ({ annotation, plan }))), [plans, selectedIds])
  const selectedInterProMatches = useMemo(() => interProGroups.flatMap((group) =>
    group.matches.filter((match) => selectedInterProIds.has(match.id))), [interProGroups, selectedInterProIds])

  async function runSearch() {
    if (busy) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setBusy(true)
    setError('')
    setHits([])
    setPlans(new Map())
    setExpandedAccessions(new Set())
    setSelectedIds(new Set())
    setInterProGroups([])
    setExpandedInterProGroups(new Set())
    setSelectedInterProIds(new Set())
    setCompletedSource(null)
    try {
      const nextHits = await searchUniProtBySimilarity(querySequence, {
        database,
        maxHits,
        organism,
        signal: controller.signal,
        onStatus: setStatus,
      })
      setHits(nextHits)
      setStatus('')
      setCompletedSource('uniprot')
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === 'AbortError')) {
        setError(caught instanceof Error ? caught.message : String(caught))
      }
    } finally {
      if (abortRef.current === controller) setBusy(false)
    }
  }

  async function runInterProSearch() {
    if (busy) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setBusy(true)
    setError('')
    setHits([])
    setPlans(new Map())
    setExpandedAccessions(new Set())
    setSelectedIds(new Set())
    setInterProGroups([])
    setExpandedInterProGroups(new Set())
    setSelectedInterProIds(new Set())
    setCompletedSource(null)
    try {
      const groups = await searchInterProPfam(querySequence, {
        signal: controller.signal,
        onStatus: setStatus,
      })
      setInterProGroups(groups)
      setExpandedInterProGroups(new Set(groups.map((group) => group.id)))
      setSelectedInterProIds(new Set(groups.flatMap((group) => group.matches.map((match) => match.id))))
      setStatus('')
      setCompletedSource('interpro')
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === 'AbortError')) {
        setError(caught instanceof Error ? caught.message : String(caught))
      }
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

  function toggleHit(hit: UniProtSimilarityHit) {
    if (expandedAccessions.has(hit.accession)) {
      setExpandedAccessions((current) => {
        const next = new Set(current)
        next.delete(hit.accession)
        return next
      })
      return
    }
    try {
      if (!plans.has(hit.accession)) {
        const nextPlan = buildUniProtAnnotationPlan(querySequence, queryRange.start, hit)
        setPlans((current) => new Map(current).set(hit.accession, nextPlan))
      }
      setExpandedAccessions((current) => new Set(current).add(hit.accession))
      setError('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }

  function selectAnnotations(plan: UniProtAnnotationPlan, mode: 'recommended' | 'all' | 'none') {
    setSelectedIds((current) => {
      const next = new Set(current)
      for (const annotation of plan.annotations) {
        const key = annotationKey(plan.hit.accession, annotation.id)
        if (mode !== 'none' && annotation.transferable && (mode === 'all' || annotation.selectedByDefault)) next.add(key)
        else next.delete(key)
      }
      return next
    })
  }

  function applySelected() {
    if (!selectedAnnotations.length) return
    const selectedPlans = [...new Map(selectedAnnotations.map(({ plan }) => [plan.hit.accession, plan])).values()]
    onApply(
      selectedAnnotations.flatMap(({ annotation }) => annotation.feature ? [annotation.feature] : []),
      selectedAnnotations.flatMap(({ annotation }) => annotation.bond ? [annotation.bond] : []),
      selectedPlans,
    )
  }

  function applySelectedInterPro() {
    if (!selectedInterProMatches.length) return
    onApplyInterPro(
      selectedInterProMatches.map((match) => featureFromInterProMatch(match, queryRange.start)),
      selectedInterProMatches,
    )
  }

  function resetSearch() {
    setHits([])
    setPlans(new Map())
    setExpandedAccessions(new Set())
    setSelectedIds(new Set())
    setInterProGroups([])
    setExpandedInterProGroups(new Set())
    setSelectedInterProIds(new Set())
    setCompletedSource(null)
    setStatus('')
    setError('')
  }

  return (
    <div className="translation-dialog-backdrop" role="presentation" onPointerDown={() => !busy && onCancel()}>
      <div
        className="translation-dialog protein-uniprot-annotation-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="protein-uniprot-annotation-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="sequence-database-import-heading">
          <div>
            <h3 id="protein-uniprot-annotation-title">Annotate Protein from Databases</h3>
            <p>{recordName} · {wholeProtein ? 'Whole protein' : `Selected residues ${queryRange.start + 1}–${queryRange.end}`} · {querySequence.length.toLocaleString()} aa</p>
          </div>
          <button type="button" className="sequence-database-import-close" aria-label="Close" disabled={busy} onClick={onCancel}>×</button>
        </div>

        {!hasResults && (
          <div className={`protein-uniprot-search-settings protein-annotation-search-settings is-${source}`}>
            <div className="protein-uniprot-privacy-note">
              The submitted amino-acid sequence is sent to EMBL-EBI Job Dispatcher for analysis. Job data may be retained by EMBL-EBI for up to seven days.
            </div>
            {source === 'interpro' && (
              <div className="protein-uniprot-privacy-note protein-interpro-description">
                InterProScan searches Pfam profile HMMs and maps detected domains directly onto the submitted sequence, making it suitable for fusion proteins. This analysis is more computationally intensive and may take several minutes.
              </div>
            )}
            <label className="protein-annotation-source-field">
              <span>Annotation source</span>
              <select value={source} disabled={busy} onChange={(event) => {
                resetSearch()
                setSource(event.target.value as AnnotationSource)
              }}>
                <option value="uniprot">UniProt similarity — transfer curated features</option>
                <option value="interpro">InterPro/Pfam — detect domains directly</option>
              </select>
            </label>
            {source === 'uniprot' ? <>
              <label className="protein-annotation-database-field">
                <span>Search database</span>
                <select value={database} disabled={busy} onChange={(event) => setDatabase(event.target.value as UniProtBlastDatabase)}>
                  <option value="uniprotkb_swissprot">Reviewed UniProtKB/Swiss-Prot (recommended)</option>
                  <option value="uniprotkb">All UniProtKB</option>
                </select>
              </label>
              <label className="protein-annotation-organism-field">
                <span>Organism</span>
                <select value={organism} disabled={busy} onChange={(event) => setOrganism(event.target.value)}>
                  <option value="">All organisms</option>
                  {commonOrganisms.map((item) => <option key={item.taxonId} value={item.scientificName}>{item.commonName} — {item.scientificName}</option>)}
                </select>
              </label>
              <label className="protein-annotation-max-hits-field">
                <span>Maximum matches</span>
                <select value={maxHits} disabled={busy} onChange={(event) => setMaxHits(Number(event.target.value))}>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
              </label>
            </> : null}
            <div className="protein-uniprot-search-action">
              <span aria-hidden="true">Action</span>
              <button type="button" className={`primary protein-uniprot-search-button${busy ? ' is-cancel' : ''}`} disabled={!busy && querySequence.length < 10} onClick={() => busy ? cancelSearch() : void (source === 'uniprot' ? runSearch() : runInterProSearch())}>
                {busy ? <X size={15} /> : <Search size={15} />} {busy ? 'Cancel search' : source === 'uniprot' ? 'Search for similar proteins' : 'Scan for InterPro/Pfam domains'}
              </button>
            </div>
          </div>
        )}

        <div className="protein-uniprot-results" aria-busy={busy}>
          {busy ? (
            <div className="sequence-database-empty">{source === 'interpro' ? interProStatusLabel(status) : searchStatusLabel(status)}</div>
          ) : interProGroups.length ? (
            <>
              <div className="sequence-database-results-summary">
                {interProGroups.length} InterPro/Pfam annotation group{interProGroups.length === 1 ? '' : 's'} · {selectedInterProMatches.length} domain occurrence{selectedInterProMatches.length === 1 ? '' : 's'} selected
              </div>
              <div className="protein-uniprot-hit-list" aria-label="InterPro/Pfam domain matches">
                {interProGroups.map((group) => {
                  const expanded = expandedInterProGroups.has(group.id)
                  const selectedCount = group.matches.filter((match) => selectedInterProIds.has(match.id)).length
                  return (
                    <section key={group.id} className={`protein-uniprot-hit-container${expanded ? ' is-expanded' : ''}`}>
                      <div className="protein-uniprot-hit-heading">
                        <button type="button" className="protein-uniprot-hit-toggle" aria-expanded={expanded} onClick={() => setExpandedInterProGroups((current) => {
                          const next = new Set(current)
                          if (next.has(group.id)) next.delete(group.id)
                          else next.add(group.id)
                          return next
                        })}>
                          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          <FolderOpen size={17} />
                          <span>
                            <span className="sequence-database-result-title">
                              <strong>{group.name}</strong>
                              <code>{group.accession}</code>
                              <span className="is-reviewed">{group.analysis}</span>
                              {selectedCount > 0 && <b>{selectedCount} selected</b>}
                            </span>
                            <span className="sequence-database-result-description">{group.description}</span>
                            <span className="sequence-database-result-meta">
                              {group.matches.length} occurrence{group.matches.length === 1 ? '' : 's'} · {group.matches.map((match) => `${match.start + queryRange.start + 1}–${match.end + queryRange.start}`).join(', ')}
                            </span>
                          </span>
                        </button>
                        <button type="button" className="sequence-database-source-link" onClick={() => onOpenExternal(group.accession.startsWith('IPR')
                          ? `https://www.ebi.ac.uk/interpro/entry/InterPro/${encodeURIComponent(group.accession)}/`
                          : `https://www.ebi.ac.uk/interpro/entry/pfam/${encodeURIComponent(group.accession)}/`)}>
                          View source <ExternalLink size={12} />
                        </button>
                      </div>
                      {expanded && (
                        <div className="protein-uniprot-hit-contents">
                          <div className="protein-uniprot-selection-tools">
                            <span>{selectedCount} of {group.matches.length} occurrences selected</span>
                            <button type="button" onClick={() => setSelectedInterProIds((current) => new Set([...current, ...group.matches.map((match) => match.id)]))}>All</button>
                            <button type="button" onClick={() => setSelectedInterProIds((current) => {
                              const next = new Set(current)
                              group.matches.forEach((match) => next.delete(match.id))
                              return next
                            })}>None</button>
                          </div>
                          <div className="protein-uniprot-annotation-list">
                            {group.matches.map((match) => (
                              <label key={match.id}>
                                <input
                                  type="checkbox"
                                  checked={selectedInterProIds.has(match.id)}
                                  onChange={(event) => setSelectedInterProIds((current) => {
                                    const next = new Set(current)
                                    if (event.target.checked) next.add(match.id)
                                    else next.delete(match.id)
                                    return next
                                  })}
                                />
                                <span>
                                  <span className="protein-uniprot-annotation-title">
                                    <strong>{match.signatureDescription || match.signatureAccession}</strong>
                                    <em>domain</em>
                                    <b>Predicted</b>
                                  </span>
                                  <small>
                                    Residues {match.start + queryRange.start + 1}–{match.end + queryRange.start} · Pfam {match.signatureAccession}
                                    {match.score !== undefined ? ` · score ${match.score}` : ''}
                                    {match.goTerms.length ? ` · ${match.goTerms.length} GO term${match.goTerms.length === 1 ? '' : 's'}` : ''}
                                  </small>
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </section>
                  )
                })}
              </div>
            </>
          ) : hits.length ? (
            <>
              <div className="sequence-database-results-summary">
                {hits.length} annotated match{hits.length === 1 ? '' : 'es'} · Open any matches that cover parts of the fusion and select annotations from each
                {selectedAnnotations.length ? ` · ${selectedAnnotations.length} selected across ${new Set(selectedAnnotations.map(({ plan }) => plan.hit.accession)).size} matches` : ''}
              </div>
              <div className="protein-uniprot-hit-list" aria-label="UniProt similarity matches">
                {hits.map((hit) => {
                  const expanded = expandedAccessions.has(hit.accession)
                  const hitPlan = plans.get(hit.accession)
                  const hitSelectedCount = hitPlan?.annotations.filter((annotation) =>
                    selectedIds.has(annotationKey(hit.accession, annotation.id))).length ?? 0
                  return (
                    <section key={hit.accession} className={`protein-uniprot-hit-container${expanded ? ' is-expanded' : ''}`}>
                      <div className="protein-uniprot-hit-heading">
                        <button type="button" className="protein-uniprot-hit-toggle" aria-expanded={expanded} onClick={() => toggleHit(hit)}>
                          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          <FolderOpen size={17} />
                          <span>
                            <span className="sequence-database-result-title">
                              <strong>{hit.proteinName || hit.accession}</strong>
                              <code>{hit.accession}</code>
                              <span className={hit.reviewed ? 'is-reviewed' : undefined}>{hit.reviewed ? 'Reviewed' : 'Unreviewed'}</span>
                              {hitSelectedCount > 0 && <b>{hitSelectedCount} selected</b>}
                            </span>
                            <span className="sequence-database-result-description">{hit.description}</span>
                            <span className="sequence-database-result-organism">Organism: {hit.organism || 'not reported by UniProt'}</span>
                            <span className="sequence-database-result-meta">
                              {[`${percent(hit.identityPercent)} identity`, `${percent(hit.queryCoveragePercent)} coverage`, `E ${eValue(hit.eValue)}`, `${hit.featureCount} features`, `${hit.bondCount} bonds`].join(' · ')}
                            </span>
                          </span>
                        </button>
                        <button type="button" className="sequence-database-source-link" onClick={() => onOpenExternal(`https://www.uniprot.org/uniprotkb/${encodeURIComponent(hit.accession)}/entry`)}>
                          View source <ExternalLink size={12} />
                        </button>
                      </div>
                      {expanded && hitPlan && (
                        <div className="protein-uniprot-hit-contents">
                          <div className="protein-uniprot-selection-tools">
                            <span>{hitSelectedCount} of {hitPlan.annotations.filter((annotation) => annotation.transferable).length} transferable selected · {percent(hitPlan.alignmentIdentityPercent)} aligned identity · {percent(hitPlan.alignmentCoveragePercent)} query coverage</span>
                            <button type="button" onClick={() => selectAnnotations(hitPlan, 'recommended')}>Recommended</button>
                            <button type="button" onClick={() => selectAnnotations(hitPlan, 'all')}>All transferable</button>
                            <button type="button" onClick={() => selectAnnotations(hitPlan, 'none')}>None</button>
                          </div>
                          <div className="protein-uniprot-annotation-list">
                            {hitPlan.annotations.length ? hitPlan.annotations.map((annotation) => {
                              const key = annotationKey(hit.accession, annotation.id)
                              return (
                                <label key={key} className={!annotation.transferable ? 'is-disabled' : undefined}>
                                  <input
                                    type="checkbox"
                                    disabled={!annotation.transferable}
                                    checked={selectedIds.has(key)}
                                    onChange={(event) => setSelectedIds((current) => {
                                      const next = new Set(current)
                                      if (event.target.checked) next.add(key)
                                      else next.delete(key)
                                      return next
                                    })}
                                  />
                                  <span>
                                    <span className="protein-uniprot-annotation-title">
                                      <strong>{annotation.name}</strong>
                                      <em>{annotation.kind === 'bond' ? 'Bond' : annotation.type}</em>
                                      {annotation.experimentalEvidence && <b>Experimental</b>}
                                    </span>
                                    <small>{annotationMeta(annotation)}</small>
                                    {annotation.warning && <small className="is-warning">{annotation.warning}</small>}
                                  </span>
                                </label>
                              )
                            }) : <div className="sequence-database-empty">This match has no transferable UniProt features or bonds.</div>}
                          </div>
                        </div>
                      )}
                    </section>
                  )
                })}
              </div>
            </>
          ) : completedSource === 'uniprot' ? (
            <div className="sequence-database-empty" role="status">
              <strong>No annotated UniProt matches found</strong>
              <span>No similar proteins with transferable UniProt features or bonds were found for this sequence{organism ? ` in ${organism}` : ''}. Try All UniProtKB, All organisms, or a longer sequence.</span>
            </div>
          ) : completedSource === 'interpro' ? (
            <div className="sequence-database-empty" role="status">
              <strong>No InterPro/Pfam domains found</strong>
              <span>Pfam did not detect a domain in this sequence. Try submitting the whole protein or a longer selection.</span>
            </div>
          ) : (
            <div className="sequence-database-empty">Configure and start an annotation search.</div>
          )}
        </div>

        {error && <div className="sequence-database-error" role="alert">{error}</div>}

        <div className="translation-dialog-footer sequence-database-footer">
          <button type="button" disabled={busy} onClick={onCancel}>Cancel</button>
          <div>
            {hasResults && <button type="button" onClick={resetSearch}>New search</button>}
            {interProGroups.length > 0 && <button type="button" className="primary" disabled={!selectedInterProMatches.length} onClick={applySelectedInterPro}>Add {selectedInterProMatches.length || ''} selected annotation{selectedInterProMatches.length === 1 ? '' : 's'}</button>}
            {hits.length > 0 && <button type="button" className="primary" disabled={!selectedAnnotations.length} onClick={applySelected}>Add {selectedAnnotations.length || ''} selected annotation{selectedAnnotations.length === 1 ? '' : 's'}</button>}
          </div>
        </div>
      </div>
    </div>
  )
}
