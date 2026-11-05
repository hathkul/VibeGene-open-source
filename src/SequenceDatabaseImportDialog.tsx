import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ExternalLink, Search } from 'lucide-react'
import { databaseImportError } from './domain/externalSequences/http'
import { sequenceProviders } from './domain/externalSequences'
import {
  fetchNcbiGeneSequences,
  searchNcbiGenes,
  type NcbiGeneSearchResult,
} from './domain/externalSequences/ncbi'
import { commonOrganisms, organismQueryValue } from './domain/externalSequences/organisms'
import type {
  EnsemblSequenceType,
  SequenceSearchResult,
} from './domain/externalSequences'
import type { ExternalSequenceProvider, SequenceRecord } from './domain/types'

type Props = {
  onCancel: () => void
  onOpen: (record: SequenceRecord, saveToDatabase: boolean) => void
  onOpenExternal: (url: string) => void
}

type ActivityLogLevel = 'info' | 'success' | 'error'

type ActivityLogEntry = {
  atMs: number
  text: string
  level: ActivityLogLevel
}

type AbortReason = 'user' | 'switch' | 'close'

const providerOrder: ExternalSequenceProvider[] = ['ncbi', 'uniprot', 'ensembl']

function resultKey(result: SequenceSearchResult) {
  return `${result.provider}:${result.database ?? ''}:${result.id || result.accession}`
}

function formatLength(result: SequenceSearchResult) {
  if (result.length == null) return 'Length unavailable'
  return `${result.length.toLocaleString()} ${result.molecule === 'protein' ? 'aa' : 'bp'}`
}

function defaultSequenceType(result: SequenceSearchResult): EnsemblSequenceType {
  if (result.availableSequenceTypes?.includes('genomic')) return 'genomic'
  return result.availableSequenceTypes?.[0] ?? (result.molecule === 'protein' ? 'protein' : 'genomic')
}

function progressHost(providerId: ExternalSequenceProvider): string {
  if (providerId === 'ncbi') return 'eutils.ncbi.nlm.nih.gov'
  if (providerId === 'uniprot') return 'rest.uniprot.org'
  return 'rest.ensembl.org'
}

function moleculeLabel(molecule: 'all' | 'nucleotide' | 'protein') {
  if (molecule === 'nucleotide') return 'DNA / RNA'
  if (molecule === 'protein') return 'protein'
  return 'all molecules'
}

function organismDisplayLabel(
  providerId: ExternalSequenceProvider,
  organismChoice: string,
  customOrganism: string,
) {
  if (organismChoice === 'custom') return customOrganism.trim() || 'any'
  if (!organismChoice) {
    return providerId === 'ensembl' ? 'Homo sapiens (default)' : 'any'
  }
  const match = commonOrganisms.find((item) => item.taxonId === organismChoice)
  return match?.scientificName ?? organismChoice
}

function ncbiSequenceDatabaseLabel(molecule: 'all' | 'nucleotide' | 'protein') {
  if (molecule === 'protein') return 'NCBI Protein'
  if (molecule === 'nucleotide') return 'NCBI Nucleotide'
  return 'NCBI Nucleotide and Protein'
}

function ncbiSearchScopeLabel(scope: 'sequences' | 'genes') {
  return scope === 'genes' ? 'Genes and linked sequences' : 'Sequence records'
}

function noResultsMessage(
  providerId: ExternalSequenceProvider,
  query: string,
  scope: 'sequences' | 'genes',
  activeGene: NcbiGeneSearchResult | null,
  molecule: 'all' | 'nucleotide' | 'protein',
) {
  const quoted = `"${query}"`
  if (providerId === 'ncbi' && scope === 'genes' && activeGene) {
    const mol = molecule === 'all' ? 'sequence records' : molecule === 'protein' ? 'proteins' : 'nucleotide records'
    return `No linked RefSeq ${mol} for ${activeGene.symbol} (GeneID ${activeGene.geneId}). Try All molecules or pick another gene.`
  }
  if (providerId === 'ncbi' && scope === 'genes') {
    return `No matching NCBI Gene records for ${quoted}. Check the spelling, remove the organism filter, or try Sequence records.`
  }
  if (providerId === 'ncbi') {
    return `No matching sequence records for ${quoted} in ${ncbiSequenceDatabaseLabel(molecule)}. Check the spelling, remove the organism filter, or try Genes and linked sequences / another database.`
  }
  if (providerId === 'uniprot') {
    return `No matching UniProtKB entries for ${quoted}. Check the accession or gene symbol, or remove the organism filter.`
  }
  return `No matching Ensembl records for ${quoted}. Check the stable ID or symbol, or adjust the organism.`
}

export function SequenceDatabaseImportDialog({ onCancel, onOpen, onOpenExternal }: Props) {
  const [providerId, setProviderId] = useState<ExternalSequenceProvider>('ncbi')
  const [term, setTerm] = useState('')
  const [organismChoice, setOrganismChoice] = useState('')
  const [customOrganism, setCustomOrganism] = useState('')
  const [molecule, setMolecule] = useState<'all' | 'nucleotide' | 'protein'>('all')
  const [ncbiSearchScope, setNcbiSearchScope] = useState<'sequences' | 'genes'>('sequences')
  const [geneResults, setGeneResults] = useState<NcbiGeneSearchResult[]>([])
  const [geneTotal, setGeneTotal] = useState(0)
  const [activeGene, setActiveGene] = useState<NcbiGeneSearchResult | null>(null)
  const [results, setResults] = useState<SequenceSearchResult[]>([])
  const [total, setTotal] = useState(0)
  const [selectedKey, setSelectedKey] = useState('')
  const [sequenceType, setSequenceType] = useState<EnsemblSequenceType>('genomic')
  const [includeAnnotations, setIncludeAnnotations] = useState(true)
  const [busy, setBusy] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [statusIsError, setStatusIsError] = useState(false)
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([])
  const [elapsedTick, setElapsedTick] = useState(0)
  const [liveStatusBase, setLiveStatusBase] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const abortReasonRef = useRef<AbortReason | null>(null)
  const operationStartedAtRef = useRef<number | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const activityLogRef = useRef<HTMLUListElement | null>(null)

  const selected = useMemo(
    () => results.find((result) => resultKey(result) === selectedKey) ?? null,
    [results, selectedKey],
  )
  const isNcbiGeneSearch = providerId === 'ncbi' && ncbiSearchScope === 'genes'
  const searchTermLabel = providerId === 'ensembl' ? 'Stable ID or gene symbol' : isNcbiGeneSearch ? 'Gene symbol, name, or NCBI Gene ID' : 'Accession, gene, protein, or keywords'
  const geneExpandedResultCount = results.filter((result) => result.sourceGeneId).length

  const appendLog = useCallback((level: ActivityLogLevel, text: string) => {
    const startedAt = operationStartedAtRef.current
    const atMs = startedAt == null ? 0 : Math.max(0, Date.now() - startedAt) / 1000
    setActivityLog((current) => [...current, { atMs, level, text }])
  }, [])

  const beginOperation = useCallback((initialEntry: string) => {
    operationStartedAtRef.current = Date.now()
    setActivityLog([{ atMs: 0, level: 'info', text: initialEntry }])
    setStatusIsError(false)
    setElapsedTick(0)
  }, [])

  const abortInFlight = useCallback((reason: AbortReason) => {
    if (!abortRef.current) return
    abortReasonRef.current = reason
    abortRef.current.abort()
  }, [])

  useEffect(() => {
    searchInputRef.current?.focus()
    return () => abortRef.current?.abort()
  }, [])

  useEffect(() => {
    if (!activityLog.length) return
    const list = activityLogRef.current
    if (!list) return
    list.scrollTop = list.scrollHeight
  }, [activityLog])

  useEffect(() => {
    if (!busy) return undefined
    const timer = globalThis.setInterval(() => {
      setElapsedTick((tick) => tick + 1)
    }, 1000)
    return () => globalThis.clearInterval(timer)
  }, [busy])

  const displayLiveStatus = useMemo(() => {
    if (!busy || !liveStatusBase) return statusMessage
    const seconds = Math.max(1, elapsedTick)
    let message = `${liveStatusBase} (${seconds} s)`
    if (seconds >= 10) {
      message += ` — still waiting for ${progressHost(providerId)}; you can Stop request and retry`
    }
    return message
  }, [busy, statusMessage, elapsedTick, providerId, liveStatusBase])

  function handleClose() {
    if (busy) abortInFlight('close')
    onCancel()
  }

  function stopRequest() {
    if (!busy) {
      onCancel()
      return
    }
    abortInFlight('user')
  }

  function switchProvider(id: ExternalSequenceProvider) {
    if (busy && id !== providerId) {
      appendLog('info', `Cancelled: switched to ${sequenceProviders[id].label}`)
      abortInFlight('switch')
    } else {
      abortRef.current?.abort()
    }
    setProviderId(id)
    setGeneResults([])
    setGeneTotal(0)
    setActiveGene(null)
    setResults([])
    setTotal(0)
    setSelectedKey('')
    setStatusMessage('')
    setStatusIsError(false)
    if (id === 'uniprot') setMolecule('protein')
  }

  function switchNcbiSearchScope(scope: 'sequences' | 'genes') {
    if (busy && scope !== ncbiSearchScope) {
      appendLog('info', `Cancelled: switched to ${scope === 'genes' ? 'Genes and linked sequences' : 'Sequence records'}`)
      abortInFlight('switch')
    } else {
      abortRef.current?.abort()
    }
    setNcbiSearchScope(scope)
    setGeneResults([])
    setGeneTotal(0)
    setActiveGene(null)
    setResults([])
    setTotal(0)
    setSelectedKey('')
    setStatusMessage('')
    setStatusIsError(false)
  }

  function handleAbortInCatch(controller: AbortController, startedAt: number) {
    if (!controller.signal.aborted) return false
    const reason = abortReasonRef.current
    abortReasonRef.current = null
    const elapsed = Math.max(0, Date.now() - startedAt) / 1000
    if (reason === 'user') {
      appendLog('info', `Cancelled by user after ${elapsed.toFixed(1)} s`)
      setStatusMessage('Request cancelled.')
      setStatusIsError(false)
    } else if (reason !== 'switch') {
      setStatusMessage('Request cancelled.')
      setStatusIsError(false)
    }
    setLiveStatusBase('')
    return true
  }

  function searchStatusBase(query: string) {
    if (isNcbiGeneSearch) return `Searching NCBI Gene for "${query}"`
    if (providerId === 'ncbi') return `Searching ${ncbiSequenceDatabaseLabel(molecule)} for "${query}"`
    if (providerId === 'uniprot') return `Searching UniProtKB for "${query}"`
    return `Searching Ensembl for "${query}"`
  }

  async function runSearch() {
    const query = term.trim()
    if (!query || busy) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const startedAt = Date.now()
    operationStartedAtRef.current = startedAt
    setBusy(true)
    setStatusMessage('')
    setStatusIsError(false)
    const organism = organismQueryValue(
      providerId,
      organismChoice === 'custom' ? customOrganism : organismChoice,
    ) || undefined
    const scopeLabel = providerId === 'ncbi' ? ncbiSearchScopeLabel(ncbiSearchScope) : 'Sequence records'
    beginOperation(
      `Search requested: "${query}" · ${sequenceProviders[providerId].label} · ${scopeLabel} · organism ${organismDisplayLabel(providerId, organismChoice, customOrganism)} · molecule ${moleculeLabel(providerId === 'uniprot' ? 'protein' : molecule)}`,
    )
    setLiveStatusBase(searchStatusBase(query))
    setStatusMessage(searchStatusBase(query))
    try {
      const onProgress = (message: string) => {
        appendLog('info', message)
        const base = message.replace(/…$/, '')
        setLiveStatusBase(base)
        setStatusMessage(base)
      }
      if (isNcbiGeneSearch) {
        const page = await searchNcbiGenes({
          term: query,
          organism,
          molecule,
          pageSize: 25,
          onProgress,
        }, controller.signal)
        setGeneResults(page.results)
        setGeneTotal(page.total)
        setActiveGene(null)
        setResults([])
        setTotal(0)
        setSelectedKey('')
        const elapsed = Math.max(0, Date.now() - startedAt) / 1000
        if (!page.results.length) {
          const message = noResultsMessage(providerId, query, ncbiSearchScope, null, molecule)
          setStatusMessage(message)
          setStatusIsError(true)
          appendLog('error', message)
        } else {
          const success = `Found ${page.results.length.toLocaleString()} gene${page.results.length === 1 ? '' : 's'}${page.total > page.results.length ? ` of ${page.total.toLocaleString()}` : ''} in ${elapsed.toFixed(1)} s`
          appendLog('success', success)
          setStatusMessage(success)
          setStatusIsError(false)
        }
        return
      }
      const page = await sequenceProviders[providerId].search({
        term: query,
        organism,
        molecule: providerId === 'uniprot' ? 'protein' : molecule,
        pageSize: 25,
        onProgress,
      }, controller.signal)
      setResults(page.results)
      setTotal(page.total)
      const first = page.results[0]
      setSelectedKey(first ? resultKey(first) : '')
      if (first) setSequenceType(defaultSequenceType(first))
      const elapsed = Math.max(0, Date.now() - startedAt) / 1000
      if (!page.results.length) {
        const message = noResultsMessage(providerId, query, ncbiSearchScope, null, molecule)
        setStatusMessage(message)
        setStatusIsError(true)
        appendLog('error', message)
      } else {
        const success = `Found ${page.results.length.toLocaleString()} of ${page.total.toLocaleString()} sequence records in ${elapsed.toFixed(1)} s`
        appendLog('success', success)
        setStatusMessage(success)
        setStatusIsError(false)
      }
    } catch (caught) {
      if (handleAbortInCatch(controller, startedAt)) return
      const detail = databaseImportError(caught)
      const scopeName = isNcbiGeneSearch
        ? 'NCBI Gene'
        : providerId === 'ncbi'
          ? ncbiSequenceDatabaseLabel(molecule)
          : sequenceProviders[providerId].label
      const message = `Search failed — ${scopeName}: ${detail}`
      setStatusMessage(message)
      setStatusIsError(true)
      appendLog('error', message)
    } finally {
      if (abortRef.current === controller) {
        setLiveStatusBase('')
        setBusy(false)
      }
    }
  }

  async function loadGeneSequences(
    gene: NcbiGeneSearchResult,
    requestedMolecule: typeof molecule = molecule,
  ) {
    if (busy) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const startedAt = Date.now()
    operationStartedAtRef.current = startedAt
    setActiveGene(gene)
    setResults([])
    setTotal(0)
    setSelectedKey('')
    setBusy(true)
    setStatusIsError(false)
    beginOperation(
      `Load linked sequences: ${gene.symbol} (GeneID ${gene.geneId}) · molecule ${moleculeLabel(requestedMolecule)}`,
    )
    setLiveStatusBase(`Finding linked RefSeq records for ${gene.symbol}`)
    setStatusMessage(`Finding linked RefSeq records for ${gene.symbol}`)
    try {
      const onProgress = (message: string) => {
        appendLog('info', message)
        const base = message.replace(/…$/, '')
        setLiveStatusBase(base)
        setStatusMessage(base)
      }
      const linked = await fetchNcbiGeneSequences(gene.geneId, requestedMolecule, controller.signal, onProgress)
      setResults(linked)
      setTotal(linked.length)
      const first = linked[0]
      setSelectedKey(first ? resultKey(first) : '')
      const elapsed = Math.max(0, Date.now() - startedAt) / 1000
      if (!linked.length) {
        const message = noResultsMessage(providerId, term.trim(), ncbiSearchScope, gene, requestedMolecule)
        setStatusMessage(message)
        setStatusIsError(true)
        appendLog('error', message)
      } else {
        const success = `${linked.length.toLocaleString()} linked RefSeq record${linked.length === 1 ? '' : 's'} for ${gene.symbol} in ${elapsed.toFixed(1)} s`
        appendLog('success', success)
        setStatusMessage(success)
        setStatusIsError(false)
      }
    } catch (caught) {
      if (handleAbortInCatch(controller, startedAt)) return
      const detail = databaseImportError(caught)
      const message = `Load failed — NCBI Gene: ${detail}`
      setStatusMessage(message)
      setStatusIsError(true)
      appendLog('error', message)
    } finally {
      if (abortRef.current === controller) {
        setLiveStatusBase('')
        setBusy(false)
      }
    }
  }

  function returnToGeneResults() {
    abortRef.current?.abort()
    setActiveGene(null)
    setResults([])
    setTotal(0)
    setSelectedKey('')
    setStatusMessage('')
    setStatusIsError(false)
  }

  async function importSelected(saveToDatabase: boolean) {
    if (!selected || busy) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const startedAt = Date.now()
    operationStartedAtRef.current = startedAt
    setBusy(true)
    setStatusIsError(false)
    const lengthHint = selected.length != null
      ? `${selected.length.toLocaleString()} ${selected.molecule === 'protein' ? 'aa' : 'bp'}`
      : formatLength(selected)
    beginOperation(
      `Import requested: ${selected.accession} (${lengthHint}) · annotations ${includeAnnotations ? 'on' : 'off'}${saveToDatabase ? ' · save to Database' : ''}`,
    )
    setLiveStatusBase(`Downloading ${selected.accession} from ${sequenceProviders[selected.provider].label}`)
    setStatusMessage(`Downloading ${selected.accession} from ${sequenceProviders[selected.provider].label}`)
    try {
      const onProgress = (message: string) => {
        appendLog('info', message)
        const base = message.replace(/…$/, '')
        setLiveStatusBase(base)
        setStatusMessage(base)
      }
      const record = await sequenceProviders[selected.provider].fetch(selected, {
        includeAnnotations,
        sequenceType: selected.provider === 'ensembl' ? sequenceType : undefined,
        onProgress,
      }, controller.signal)
      const elapsed = Math.max(0, Date.now() - startedAt) / 1000
      const featureCount = record.features.length
      const unit = record.molecule === 'protein' ? 'aa' : 'bp'
      const success = saveToDatabase
        ? `Downloaded ${selected.accession}: ${record.sequence.length.toLocaleString()} ${unit}, ${featureCount} feature${featureCount === 1 ? '' : 's'} in ${elapsed.toFixed(1)} s; opening and saving to Database…`
        : `Downloaded ${selected.accession}: ${record.sequence.length.toLocaleString()} ${unit}, ${featureCount} feature${featureCount === 1 ? '' : 's'} in ${elapsed.toFixed(1)} s; opening…`
      appendLog('success', success)
      setStatusMessage(success)
      onOpen(record, saveToDatabase)
    } catch (caught) {
      if (handleAbortInCatch(controller, startedAt)) return
      const detail = databaseImportError(caught)
      const message = `Import failed — ${sequenceProviders[selected.provider].label}: ${detail}`
      setStatusMessage(message)
      setStatusIsError(true)
      appendLog('error', message)
    } finally {
      if (abortRef.current === controller) {
        setLiveStatusBase('')
        setBusy(false)
      }
    }
  }

  const statusVisible = Boolean(displayLiveStatus)
  const logVisible = activityLog.length > 0

  return (
    <div className="translation-dialog-backdrop" role="presentation" onPointerDown={() => !busy && handleClose()}>
      <div
        className="translation-dialog sequence-database-import-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sequence-database-import-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="sequence-database-import-heading">
          <div>
            <h3 id="sequence-database-import-title">Import from Sequence Database</h3>
            <p>Search for annotated DNA, RNA, and protein molecules.</p>
          </div>
          <button type="button" className="sequence-database-import-close" aria-label="Close" onClick={handleClose}>×</button>
        </div>

        <div className="sequence-database-tabs">
          <div className="sequence-database-provider-tabs" role="tablist" aria-label="Sequence database">
            {providerOrder.map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={providerId === id}
                className={providerId === id ? 'is-active' : undefined}
                onClick={() => switchProvider(id)}
              >
                {sequenceProviders[id].label}
              </button>
            ))}
          </div>
          {providerId === 'ncbi' && (
            <div className="sequence-database-ncbi-scope" role="radiogroup" aria-label="NCBI search type">
              <button type="button" role="radio" aria-checked={ncbiSearchScope === 'sequences'} className={ncbiSearchScope === 'sequences' ? 'is-active' : undefined} onClick={() => switchNcbiSearchScope('sequences')}>Sequence records</button>
              <button type="button" role="radio" aria-checked={ncbiSearchScope === 'genes'} className={ncbiSearchScope === 'genes' ? 'is-active' : undefined} onClick={() => switchNcbiSearchScope('genes')}>Genes and linked sequences</button>
            </div>
          )}
        </div>

        <form className="sequence-database-search" onSubmit={(event) => { event.preventDefault(); void runSearch() }}>
          <input
            ref={searchInputRef}
            className="sequence-database-search-term"
            value={term}
            aria-label={searchTermLabel}
            title={searchTermLabel}
            placeholder={`${searchTermLabel}, ${providerId === 'ncbi' ? isNcbiGeneSearch ? 'e.g. TP53 or 7157' : 'e.g. NM_000546.6 or TP53' : providerId === 'uniprot' ? 'e.g. P04637 or TP53' : 'e.g. ENSG00000141510 or TP53'}`}
            onChange={(event) => setTerm(event.target.value)}
          />
          <select
            className="sequence-database-organism"
            value={organismChoice}
            aria-label="Organism (optional)"
            title="Organism (optional)"
            onChange={(event) => setOrganismChoice(event.target.value)}
          >
            <option value="">{providerId === 'ensembl' ? 'Homo sapiens (default)' : 'Any organism'}</option>
            {commonOrganisms.map((item) => (
              <option key={item.taxonId} value={item.taxonId}>
                {item.scientificName} ({item.commonName}) · {item.taxonId}
              </option>
            ))}
            <option value="custom">Other organism…</option>
          </select>
          {organismChoice === 'custom' && (
            <input
              className="sequence-database-custom-organism"
              value={customOrganism}
              placeholder={providerId === 'ensembl' ? 'e.g. bos_taurus' : 'Name or taxonomy ID'}
              aria-label="Custom organism scientific name or taxonomy ID"
              title="Custom organism scientific name or taxonomy ID"
              onChange={(event) => setCustomOrganism(event.target.value)}
            />
          )}
          <select
            className="sequence-database-molecule"
            value={providerId === 'uniprot' ? 'protein' : molecule}
            aria-label="Molecule"
            title="Molecule"
            disabled={providerId === 'uniprot' || busy}
            onChange={(event) => {
              const nextMolecule = event.target.value as typeof molecule
              setMolecule(nextMolecule)
              if (activeGene) void loadGeneSequences(activeGene, nextMolecule)
            }}
          >
            <option value="all">All molecules</option>
            <option value="nucleotide">DNA / RNA</option>
            <option value="protein">Protein</option>
          </select>
          <button type="submit" className="sequence-database-search-submit" disabled={busy || !term.trim()}><Search size={15} /> {busy && !selected ? 'Searching…' : 'Search'}</button>
        </form>

        <div className="sequence-database-results" aria-busy={busy}>
          {isNcbiGeneSearch && !activeGene ? geneResults.length ? (
            <>
              <div className="sequence-database-results-summary">
                Showing {geneResults.length.toLocaleString()}{geneTotal > geneResults.length ? ` of ${geneTotal.toLocaleString()}` : ''} gene{geneTotal === 1 ? '' : 's'} · Select a gene to see its RefSeq molecules
              </div>
              <div className="sequence-database-result-list" role="list" aria-label="NCBI Gene search results">
                {geneResults.map((gene) => (
                  <button key={gene.geneId} type="button" onClick={() => void loadGeneSequences(gene)}>
                    <div className="sequence-database-result-title">
                      <strong>{gene.symbol}</strong>
                      <code>GeneID: {gene.geneId}</code>
                      <span>Gene</span>
                    </div>
                    <div className="sequence-database-result-description">{gene.description || 'No description'}</div>
                    <div className="sequence-database-result-meta">
                      {[gene.organism, gene.chromosome && `Chr ${gene.chromosome}`, gene.mapLocation, gene.aliases && `Aliases: ${gene.aliases}`].filter(Boolean).join(' · ')}
                    </div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="sequence-database-empty">
              {busy ? displayLiveStatus || 'Searching NCBI Gene…' : 'Enter a gene symbol, name, or Gene ID.'}
            </div>
          ) : results.length ? (
            <>
              <div className="sequence-database-results-summary">
                {activeGene && (
                  <button type="button" className="sequence-database-gene-back" disabled={busy} onClick={returnToGeneResults}>
                    <ChevronLeft size={13} /> Genes
                  </button>
                )}
                {activeGene && <strong>{activeGene.symbol}</strong>}
                Showing {results.length.toLocaleString()}{total > results.length ? ` of ${total.toLocaleString()}` : ''} sequence{total === 1 ? '' : 's'}
                {!activeGene && geneExpandedResultCount > 0 && ` · ${geneExpandedResultCount} linked through NCBI Gene names or aliases`}
              </div>
              <div className="sequence-database-result-list" role="listbox" aria-label="Sequence search results">
                {results.map((result) => {
                  const key = resultKey(result)
                  return (
                    <button
                      key={key}
                      type="button"
                      role="option"
                      aria-selected={selectedKey === key}
                      className={selectedKey === key ? 'is-selected' : undefined}
                      onClick={() => {
                        setSelectedKey(key)
                        setSequenceType(defaultSequenceType(result))
                      }}
                    >
                      <div className="sequence-database-result-title">
                        <strong>{result.name}</strong>
                        <code>{result.accession}</code>
                        {result.reviewed != null && <span className={result.reviewed ? 'is-reviewed' : undefined}>{result.reviewed ? 'Reviewed' : 'Unreviewed'}</span>}
                      </div>
                      <div className="sequence-database-result-description">{result.description || 'No description'}</div>
                      <div className="sequence-database-result-meta">
                        {[
                          result.organism,
                          result.objectType,
                          result.sourceGeneSymbol && `NCBI Gene: ${result.sourceGeneSymbol} (GeneID ${result.sourceGeneId})${result.sourceGeneMatch === 'alias' ? ` · matched alias ${result.sourceGeneQuery}` : ''}`,
                          result.assembly,
                          formatLength(result),
                        ].filter(Boolean).join(' · ')}
                      </div>
                    </button>
                  )
                })}
              </div>
            </>
          ) : (
            <div className="sequence-database-empty">
              {busy
                ? displayLiveStatus || (activeGene ? `Finding linked RefSeq records for ${activeGene.symbol}…` : 'Searching the database…')
                : activeGene ? `No linked sequences found for ${activeGene.symbol}.` : `Enter a query to search ${sequenceProviders[providerId].label}.`}
            </div>
          )}
        </div>

        {selected && (
          <div className="sequence-database-import-options">
            {selected.provider === 'ensembl' && (
              <label>
                <span>Molecule to import</span>
                <select value={sequenceType} onChange={(event) => setSequenceType(event.target.value as EnsemblSequenceType)}>
                  {(selected.availableSequenceTypes ?? ['genomic']).map((type) => (
                    <option key={type} value={type}>{type === 'cdna' ? 'Spliced transcript (cDNA)' : type === 'cds' ? 'Coding sequence (CDS)' : type[0]!.toUpperCase() + type.slice(1)}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="sequence-database-annotation-option">
              <input type="checkbox" checked={includeAnnotations} onChange={(event) => setIncludeAnnotations(event.target.checked)} />
              Import available annotations
            </label>
            <button
              type="button"
              className="sequence-database-source-link"
              onClick={() => onOpenExternal(selected.provider === 'ncbi'
                ? selected.sequenceRange && selected.sourceGeneId
                  ? `https://www.ncbi.nlm.nih.gov/gene/${encodeURIComponent(selected.sourceGeneId)}`
                  : `https://www.ncbi.nlm.nih.gov/${selected.database === 'protein' ? 'protein' : 'nuccore'}/${encodeURIComponent(selected.accession)}`
                : selected.provider === 'uniprot'
                  ? `https://www.uniprot.org/uniprotkb/${encodeURIComponent(selected.accession)}/entry`
                  : `https://www.ensembl.org/id/${encodeURIComponent(selected.accession)}`)}
            >View source <ExternalLink size={12} /></button>
          </div>
        )}

        {statusVisible && (
          <p
            className={statusIsError ? 'sequence-database-error sequence-database-status-line' : 'sequence-database-status'}
            role={statusIsError ? 'alert' : 'status'}
          >
            {displayLiveStatus}
          </p>
        )}

        {logVisible && (
          <ul ref={activityLogRef} className="sequence-database-activity-log" aria-label="Database activity">
            {activityLog.map((entry, index) => (
              <li
                key={`${entry.atMs}-${index}`}
                className={entry.level === 'error' ? 'is-error' : entry.level === 'success' ? 'is-success' : ''}
                title={entry.text}
              >
                <span className="sequence-database-activity-log-time">{`${entry.atMs.toFixed(1)} s`}</span>
                <span className="sequence-database-activity-log-text">{entry.text}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="translation-dialog-footer sequence-database-footer">
          <button type="button" onClick={stopRequest}>{busy ? 'Stop request' : 'Cancel'}</button>
          <div>
            <button type="button" disabled={!selected || busy} onClick={() => void importSelected(true)}>Open and save to Database…</button>
            <button type="button" className="primary" disabled={!selected || busy} onClick={() => void importSelected(false)}>{busy && selected ? 'Importing…' : 'Open'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
