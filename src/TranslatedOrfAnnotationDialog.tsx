import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, FolderOpen, Search, X } from 'lucide-react'
import { databaseImportError } from './domain/externalSequences/http'
import { searchUniProtBySimilarity } from './domain/proteinUniProtAnnotation'
import { buildTranslatedOrfHitPlan, detectTranslatedOrfs, type TranslatedOrfHitPlan } from './domain/translatedOrfAnnotation'
import type { SequenceFeature } from './domain/types'
import { commonOrganisms } from './domain/externalSequences/organisms'

type Props = { recordName: string; sequence: string; queryRange: { start: number; end: number }; onCancel: () => void; onApply: (features: SequenceFeature[], plans: TranslatedOrfHitPlan[]) => void }
const keyOf = (plan: TranslatedOrfHitPlan, id: string) => `${plan.orf.id}\0${plan.hit.accession}\0${id}`
const percent = (value: number) => `${Math.round(value * 10) / 10}%`

export function TranslatedOrfAnnotationDialog({ recordName, sequence, queryRange, onCancel, onApply }: Props) {
  const wholeSequence = queryRange.start === 0 && queryRange.end === sequence.length
  const [minimumLength, setMinimumLength] = useState(wholeSequence ? 40 : 8)
  const [maxOrfs, setMaxOrfs] = useState(6)
  const [database, setDatabase] = useState<'uniprotkb_swissprot' | 'uniprotkb'>('uniprotkb_swissprot')
  const [organism, setOrganism] = useState('')
  const [plans, setPlans] = useState<TranslatedOrfHitPlan[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [searchedOrfCount, setSearchedOrfCount] = useState(0)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const querySequence = sequence.slice(queryRange.start, queryRange.end)
  const orfs = useMemo(() => detectTranslatedOrfs(querySequence, minimumLength, queryRange.start), [querySequence, minimumLength, queryRange.start])
  const selectedAnnotations = plans.flatMap((plan) => plan.annotations.filter((annotation) => annotation.transferable && selected.has(keyOf(plan, annotation.id))).map((annotation) => ({ plan, annotation })))
  useEffect(() => () => abortRef.current?.abort(), [])

  async function runSearch() {
    if (busy) return
    const controller = new AbortController(); abortRef.current?.abort(); abortRef.current = controller
    setBusy(true); setHasSearched(false); setPlans([]); setSelected(new Set()); setExpanded(new Set()); setError('')
    try {
      const candidates = orfs.slice(0, maxOrfs)
      setSearchedOrfCount(candidates.length)
      const next: TranslatedOrfHitPlan[] = []
      for (let index = 0; index < candidates.length; index += 1) {
        const orf = candidates[index]!
        setStatus(`Searching ${orf.name} (${index + 1} of ${candidates.length})…`)
        const hits = await searchUniProtBySimilarity(orf.proteinSequence, { database, maxHits: 5, organism, signal: controller.signal })
        next.push(...hits.map((hit) => buildTranslatedOrfHitPlan(orf, hit)))
      }
      setPlans(next)
      setExpanded(new Set(next.map((plan) => plan.orf.id)))
      setSelected(new Set())
      setHasSearched(true)
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === 'AbortError')) setError(databaseImportError(caught))
    } finally { if (abortRef.current === controller) setBusy(false) }
  }

  function cancelSearch() {
    abortRef.current?.abort()
    abortRef.current = null
    setBusy(false)
    setStatus('')
    setError('Search cancelled. Adjust the settings and search again when ready.')
  }

  function setFolderSelection(group: TranslatedOrfHitPlan[], mode: 'all' | 'none' | 'perfect') {
    setSelected((current) => {
      const next = new Set(current)
      group.forEach((plan) => plan.annotations.forEach((annotation) => {
        const key = keyOf(plan, annotation.id)
        if (mode === 'none') next.delete(key)
        else if (annotation.transferable && (mode === 'all' || annotation.identityPercent >= 99.999)) next.add(key)
        else if (mode === 'perfect') next.delete(key)
      }))
      return next
    })
  }

  return <div className="translation-dialog-backdrop" role="presentation" onPointerDown={() => !busy && onCancel()}>
    <div className="translation-dialog protein-uniprot-annotation-dialog" role="dialog" aria-modal="true" aria-labelledby="translated-orf-title" onPointerDown={(event) => event.stopPropagation()}>
      <div className="sequence-database-import-heading"><div><h3 id="translated-orf-title">Annotate Translated ORFs</h3><p>{recordName} · {wholeSequence ? 'Whole sequence' : `Selected bases ${queryRange.start + 1}–${queryRange.end}`} · {querySequence.length.toLocaleString()} bp · {orfs.length} ORF{orfs.length === 1 ? '' : 's'} detected</p></div><button type="button" className="sequence-database-import-close" disabled={busy} onClick={onCancel}>×</button></div>
      {!plans.length && <>
        <div className="protein-uniprot-privacy-note translated-orf-privacy-note">Detected ORFs are translated locally, then their amino-acid sequences are sent to EMBL-EBI for UniProt similarity searches. This finds codon-optimized coding sequences and may take several minutes for multiple ORFs.</div>
        <div className="protein-uniprot-search-settings dna-database-annotation-settings translated-orf-search-settings">
          <label className="protein-annotation-source-field"><span>Protein database</span><select value={database} disabled={busy} onChange={(event) => setDatabase(event.target.value as typeof database)}><option value="uniprotkb_swissprot">UniProtKB/Swiss-Prot — reviewed</option><option value="uniprotkb">UniProtKB — broader</option></select></label>
          <label className="protein-annotation-organism-field"><span>Organism</span><select value={organism} disabled={busy} onChange={(event) => setOrganism(event.target.value)}><option value="">All organisms</option>{commonOrganisms.map((item) => <option key={item.taxonId} value={item.scientificName}>{item.commonName} — {item.scientificName}</option>)}</select></label>
          <label className="protein-annotation-max-hits-field"><span>Minimum ORF</span><select value={minimumLength} disabled={busy} onChange={(event) => setMinimumLength(Number(event.target.value))}>{!wholeSequence && <><option value={5}>5 aa</option><option value={8}>8 aa</option><option value={10}>10 aa</option><option value={15}>15 aa</option></>}<option value={25}>25 aa</option><option value={40}>40 aa</option><option value={75}>75 aa</option><option value={100}>100 aa</option></select></label>
          <label className="protein-annotation-max-hits-field translated-orf-limit-field"><span>Maximum ORFs</span><select value={maxOrfs} disabled={busy} onChange={(event) => setMaxOrfs(Number(event.target.value))}><option value={3}>3</option><option value={6}>6</option><option value={10}>10</option></select></label>
          <div className="protein-uniprot-search-action"><span aria-hidden="true">Action</span><button type="button" className={`primary protein-uniprot-search-button${busy ? ' is-cancel' : ''}`} disabled={!busy && !orfs.length} onClick={() => busy ? cancelSearch() : void runSearch()}>{busy ? <X size={15} /> : <Search size={15} />}{busy ? 'Cancel search' : 'Search translated ORFs'}</button></div>
        </div>
      </>}
      <div className="protein-uniprot-results translated-orf-search-results" aria-busy={busy}>{busy ? <div className="sequence-database-empty">{status}</div> : plans.length ? <>
        <div className="sequence-database-results-summary">{plans.length} protein match{plans.length === 1 ? '' : 'es'} · {selectedAnnotations.length} feature{selectedAnnotations.length === 1 ? '' : 's'} selected</div>
        <div className="protein-uniprot-hit-list">{[...new Set(plans.map((plan) => plan.orf.id))].map((orfId) => {
          const group = plans.filter((plan) => plan.orf.id === orfId)
          const open = expanded.has(orfId)
          const folderKeys = group.flatMap((plan) => plan.annotations.filter((annotation) => annotation.transferable).map((annotation) => keyOf(plan, annotation.id)))
          const selectedCount = folderKeys.filter((key) => selected.has(key)).length
          return <section key={orfId} className={`protein-uniprot-hit-container${open ? ' is-expanded' : ''}`}>
            <div className="protein-uniprot-hit-heading"><button type="button" className="protein-uniprot-hit-toggle" onClick={() => setExpanded((current) => { const next = new Set(current); if (next.has(orfId)) next.delete(orfId); else next.add(orfId); return next })}>{open ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}<FolderOpen size={17}/><span><strong>{group[0]!.orf.name}</strong><small>{group.length} UniProt matches · {selectedCount} selected</small></span></button></div>
            {open && <div className="protein-uniprot-hit-contents">
              <div className="protein-uniprot-selection-tools"><span>{selectedCount} of {folderKeys.length} transferable selected</span><button type="button" onClick={() => setFolderSelection(group, 'all')}>All on</button><button type="button" onClick={() => setFolderSelection(group, 'none')}>All off</button><button type="button" onClick={() => setFolderSelection(group, 'perfect')}>100% on</button></div>
              {group.map((plan) => <section key={plan.hit.accession} className="translated-orf-hit"><div className="sequence-database-result-title"><strong>{plan.hit.proteinName || plan.hit.description}</strong><code>{plan.hit.accession}</code></div><div className="sequence-database-result-organism">Organism: {plan.hit.organism || 'not reported by UniProt'}</div><div className="sequence-database-result-meta">{percent(plan.hit.identityPercent)} identity · {percent(plan.hit.queryCoveragePercent)} ORF coverage · {plan.annotations.length} mapped features</div><div className="protein-uniprot-annotation-list">{plan.annotations.map((annotation) => { const key = keyOf(plan, annotation.id); return <label key={key} className={!annotation.transferable ? 'is-disabled' : undefined}><input type="checkbox" disabled={!annotation.transferable} checked={selected.has(key)} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(key); else next.delete(key); return next })}/><span><span className="protein-uniprot-annotation-title"><strong>{annotation.name}</strong><em>{annotation.type}</em></span><small>{annotation.sourceRange} → DNA {annotation.targetRange}</small>{annotation.warning && <small className="is-warning">{annotation.warning}</small>}</span></label>})}</div></section>)}
            </div>}
          </section>
        })}</div>
      </> : hasSearched
        ? <div className="sequence-database-empty translated-orf-no-results" role="status"><strong>No protein matches found</strong><span>UniProt returned no matches for the {searchedOrfCount} translated ORF{searchedOrfCount === 1 ? '' : 's'} searched{organism ? ` in ${organism}` : ''}. Try a shorter minimum ORF, another organism, the broader UniProtKB database, or a larger selection.</span><button type="button" onClick={() => setHasSearched(false)}>Adjust search</button></div>
        : <div className="sequence-database-empty">{orfs.length ? `Ready to search the ${Math.min(orfs.length, maxOrfs)} longest detected ORFs.` : 'No start-to-stop ORFs meet the selected minimum length.'}</div>}</div>
      {error && <div className="sequence-database-error" role="alert">{error}</div>}
      <div className="translation-dialog-footer sequence-database-footer"><button type="button" disabled={busy} onClick={onCancel}>Cancel</button><div>{plans.length > 0 && <button type="button" onClick={() => { setPlans([]); setSelected(new Set()); setHasSearched(false); setError('') }}>New search</button>}{plans.length > 0 && <button type="button" className="primary" disabled={!selectedAnnotations.length} onClick={() => onApply(selectedAnnotations.map(({ annotation }) => annotation.feature), [...new Set(selectedAnnotations.map(({ plan }) => plan))])}>Add {selectedAnnotations.length || ''} selected feature{selectedAnnotations.length === 1 ? '' : 's'}</button>}</div></div>
    </div>
  </div>
}
