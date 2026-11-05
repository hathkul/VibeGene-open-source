import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  SPECIFICITY_DATABASES,
  SPECIFICITY_ORGANISMS,
  SPECIFICITY_WORD_SIZE,
  DEFAULT_SPECIFICITY_THRESHOLDS,
  checkSinglePrimerSpecificity,
  recommendFastSpecificitySearch,
  specificitySearchSetLabel,
  type SinglePrimerSpecificity,
  type SavedPrimerSpecificity,
  type SpecificitySearchSet,
} from './domain/primer3/specificity'
import { loadPrimer3DialogState, savePrimer3DialogState } from './domain/primer3/settingsStorage'
import { bindingLayoutMatchesPrimerSequence, primerPropertiesAnnealPreview } from './domain/primerBindingPolicy'
import type { PrimerBindingLayout, Strand } from './domain/types'
import './PrimerBindingSpecificityCheck.css'

type Props = {
  sequence: string
  templateSequence?: string
  preferredStrand?: Strand
  bindings?: PrimerBindingLayout[]
  toolbarLeading?: ReactNode
  reverseComplementButton?: ReactNode
  savedResult?: SavedPrimerSpecificity
  onResultChange?: (value: SavedPrimerSpecificity | undefined) => void
  storageNotice?: string
}

function knownFivePrimeOverhang(
  sequence: string,
  templateSequence?: string,
  preferredStrand?: Strand,
  bindings?: PrimerBindingLayout[],
) {
  if (!templateSequence || !bindings?.length) return ''
  const binding = bindings.find((candidate) =>
    (!preferredStrand || candidate.strand === preferredStrand)
      && bindingLayoutMatchesPrimerSequence(candidate, sequence),
  ) ?? bindings.find((candidate) => bindingLayoutMatchesPrimerSequence(candidate, sequence))
  if (!binding) return ''
  const preview = primerPropertiesAnnealPreview(templateSequence, sequence, { bindings: [binding] })
  const firstPaired = preview.mask.indexOf(true)
  if (firstPaired <= 0 || preview.mask.slice(firstPaired).some((paired) => !paired)) return ''
  return sequence.slice(0, firstPaired)
}

function shortStatus(status: string) {
  if (status === 'SUBMITTING') return 'Submitting to NCBI BLAST…'
  if (status.startsWith('RID:')) return 'NCBI BLAST search queued.'
  if (status.startsWith('WAITING:')) return 'Waiting for NCBI BLAST results…'
  if (status === 'RETRIEVING') return 'Retrieving individual primer hits…'
  return status ? `NCBI BLAST: ${status}` : ''
}

export function PrimerBindingSpecificityCheck({ sequence, templateSequence, preferredStrand, bindings, toolbarLeading, reverseComplementButton, savedResult, onResultChange, storageNotice }: Props) {
  const [open, setOpen] = useState(false)
  const [searchSet, setSearchSet] = useState<SpecificitySearchSet>(() => loadPrimer3DialogState().specificitySearchSet)
  const [fastSearch, setFastSearch] = useState(() => loadPrimer3DialogState().specificityFastSearch)
  const [customOrganism, setCustomOrganism] = useState(() => {
    const organism = loadPrimer3DialogState().specificitySearchSet.organism
    return organism !== '' && !SPECIFICITY_ORGANISMS.some((entry) => entry.taxId === organism)
  })
  const [useAnnealingRegion, setUseAnnealingRegion] = useState(false)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [errorState, setErrorState] = useState<{ key: string; message: string } | null>(null)
  const [snapshot, setSnapshot] = useState<SavedPrimerSpecificity | undefined>(savedResult)
  const abortRef = useRef<AbortController | null>(null)
  const overhang = useMemo(
    () => knownFivePrimeOverhang(sequence, templateSequence, preferredStrand, bindings),
    [bindings, preferredStrand, sequence, templateSequence],
  )
  const querySequence = useAnnealingRegion && overhang ? sequence.slice(overhang.length) : sequence
  const resultKey = JSON.stringify([querySequence.toUpperCase(), searchSet.database, searchSet.organism, fastSearch])
  const currentResult: SinglePrimerSpecificity | undefined = snapshot?.result
  const busy = busyKey === resultKey
  const error = errorState?.key === resultKey ? errorState.message : ''
  const hasOnlyDnaBases = /^[ACGT]+$/i.test(querySequence)
  const tooShort = querySequence.length < 7
  const missingCustomOrganism = customOrganism && !searchSet.organism.trim()

  useEffect(() => () => abortRef.current?.abort(), [])
  useEffect(() => {
    abortRef.current?.abort()
    abortRef.current = null
  }, [resultKey])

  function cancelActiveSearch() {
    abortRef.current?.abort()
    abortRef.current = null
    setBusyKey(null)
    setStatus('')
  }

  function persistOptions(nextSearchSet: SpecificitySearchSet, nextFastSearch: boolean) {
    savePrimer3DialogState({
      ...loadPrimer3DialogState(),
      specificitySearchSet: nextSearchSet,
      specificityFastSearch: nextFastSearch,
    })
  }

  function updateSearchSet(next: SpecificitySearchSet) {
    setSearchSet(next)
    const nextFast = recommendFastSpecificitySearch(next)
    setFastSearch(nextFast)
    persistOptions(next, nextFast)
  }

  async function runCheck() {
    if (busy) {
      cancelActiveSearch()
      return
    }
    if (!hasOnlyDnaBases || tooShort || missingCustomOrganism) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const query = querySequence.toUpperCase()
    setErrorState(null)
    setStatus('SUBMITTING')
    setBusyKey(resultKey)
    try {
      const value = await checkSinglePrimerSpecificity(query, searchSet, {
        signal: controller.signal,
        fast: fastSearch,
        onStatus: (next) => {
          if (abortRef.current === controller) setStatus(next)
        },
      })
      if (abortRef.current === controller && !controller.signal.aborted) {
        const next = { primerSequence: sequence.toUpperCase(), searchedSequence: query, completedAt: new Date().toISOString(), result: value }
        setSnapshot(next)
        onResultChange?.(next)
      }
    } catch (caught) {
      if (abortRef.current === controller && !(caught instanceof DOMException && caught.name === 'AbortError')) {
        setErrorState({ key: resultKey, message: caught instanceof Error ? caught.message : String(caught) })
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null
        setBusyKey(null)
        setStatus('')
      }
    }
  }

  return (
    <section className="primer-binding-specificity">
      <div className="primer-editor-toolbar primer-binding-specificity-toolbar">
        {toolbarLeading}
        <div className="primer-binding-specificity-actions">
          <button type="button" className="primer-binding-specificity-toggle" aria-expanded={open} onClick={() => {
            if (open) cancelActiveSearch()
            setOpen((value) => !value)
          }}>
            {open ? 'Hide specificity' : 'Check specificity'}
          </button>
          {reverseComplementButton}
        </div>
      </div>
      {open && <div className="primer-binding-specificity-panel">
        <p className="primer-binding-specificity-privacy">
          When you choose Check, this primer sequence is sent to NCBI BLAST and searched against the selected collection. NCBI limits the response to up to 250 sequence records, so results are not exhaustive. Results list individual binding hits; they do not predict PCR products or prove specificity.
        </p>
        {storageNotice && <p className="primer-binding-specificity-message">{storageNotice}</p>}
        {overhang && <label className="primer-binding-specificity-tail-choice">
          <input type="checkbox" checked={useAnnealingRegion} disabled={busy} onChange={(event) => {
            setUseAnnealingRegion(event.target.checked)
          }} />
          <span>Search the known template-annealed 3′ region only ({overhang.length} leading 5′ overhang base{overhang.length === 1 ? '' : 's'} excluded)</span>
        </label>}
        <div className="primer-binding-specificity-options">
          <label><span>Sequence collection</span><select aria-label="Sequence collection" value={searchSet.database} disabled={busy} onChange={(event) => updateSearchSet({ ...searchSet, database: event.target.value as SpecificitySearchSet['database'] })}>
            {SPECIFICITY_DATABASES.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
          </select></label>
          <label><span>Organism</span><select aria-label="Organism" value={customOrganism ? 'custom' : searchSet.organism} disabled={busy} onChange={(event) => {
            const custom = event.target.value === 'custom'
            setCustomOrganism(custom)
            updateSearchSet({ ...searchSet, organism: custom ? '' : event.target.value })
          }}>
            {SPECIFICITY_ORGANISMS.map((entry) => <option key={entry.taxId} value={entry.taxId}>{entry.label}</option>)}
            <option value="">Any organism</option><option value="custom">Other…</option>
          </select></label>
          {customOrganism && <label><span>Organism name or taxid</span><input aria-label="Organism name or taxonomy ID" value={searchSet.organism} disabled={busy} onChange={(event) => updateSearchSet({ ...searchSet, organism: event.target.value })} /></label>}
          <label className="primer-binding-specificity-fast"><input type="checkbox" checked={fastSearch} disabled={busy} onChange={(event) => {
            setFastSearch(event.target.checked)
            persistOptions(searchSet, event.target.checked)
          }} /> <span>Fast search (less sensitive){querySequence.length >= 7 && querySequence.length < SPECIFICITY_WORD_SIZE.fast ? '; 7-base seed used for this short primer' : ''}</span></label>
          <button type="button" className="primary" disabled={(!busy && (!hasOnlyDnaBases || tooShort || missingCustomOrganism))} onClick={() => void runCheck()}>{busy ? 'Cancel check' : 'Check single primer'}</button>
        </div>
        {!hasOnlyDnaBases && <p className="primer-binding-specificity-message" role="alert">Only unambiguous A, C, G, and T bases can be searched.</p>}
        {tooShort && hasOnlyDnaBases && <p className="primer-binding-specificity-message">BLAST checks require at least 7 bases.</p>}
        {missingCustomOrganism && <p className="primer-binding-specificity-message" role="alert">Enter an organism name or taxonomy ID, or choose Any organism.</p>}
        {busy && <p className="primer-binding-specificity-message" role="status">{shortStatus(status)}</p>}
        {error && <p className="primer-binding-specificity-message is-error" role="alert">{error}</p>}
        {currentResult && <div className="primer-binding-specificity-results" aria-live="polite">
          <p>Last checked: {new Date(snapshot!.completedAt).toLocaleString()}. {snapshot!.searchedSequence.length < snapshot!.primerSequence.length ? `Searched the 3′ region (${snapshot!.primerSequence.length - snapshot!.searchedSequence.length} leading bases excluded).` : 'Searched the full primer.'}</p>
          {snapshot!.primerSequence !== sequence.toUpperCase() && <p className="primer-binding-specificity-message is-error" role="status">The primer sequence has changed since this search. These results describe the previous sequence.</p>}
          {snapshot!.primerSequence === sequence.toUpperCase() && snapshot!.searchedSequence !== querySequence.toUpperCase() && <p className="primer-binding-specificity-message">The saved result used a different part of this primer than the current selection.</p>}
          {(currentResult.searchSet.database !== searchSet.database || currentResult.searchSet.organism !== searchSet.organism || currentResult.fastSearch !== (fastSearch && querySequence.length >= SPECIFICITY_WORD_SIZE.fast)) && <p className="primer-binding-specificity-message">These saved results use different search settings from the current selection.</p>}
          <button type="button" disabled={busy} onClick={() => { setSnapshot(undefined); onResultChange?.(undefined) }}>Delete result</button>
          <p>{currentResult.sites.length
            ? `${currentResult.sites.length}${currentResult.truncated ? '+' : ''} individual binding hit${currentResult.sites.length === 1 ? '' : 's'} in ${specificitySearchSetLabel(currentResult.searchSet)}${currentResult.fastSearch ? ' · fast search' : ''}. Mismatches include unaligned primer ends and gaps.`
            : `NCBI returned no BLAST hits in ${specificitySearchSetLabel(currentResult.searchSet)} at this search sensitivity. No hits do not prove specificity.`}</p>
          {currentResult.sites.length > 0 && <div className="primer-binding-specificity-table-scroll"><table>
            <caption className="sr-only">Individual NCBI BLAST binding hits</caption>
            <thead><tr><th scope="col">Sequence record</th><th scope="col">Strand</th><th scope="col">Estimated primer-span coordinates</th><th scope="col">Mismatches</th><th scope="col">3′ mismatches (last {DEFAULT_SPECIFICITY_THRESHOLDS.threePrimeWindow} bases)</th></tr></thead>
            <tbody>{currentResult.sites.map((site, index) => <tr key={`${site.accession}:${site.strand}:${site.low}:${site.high}:${index}`}>
              <td><strong>{site.accession}</strong><span className="primer-binding-specificity-record-title" title={site.title}>{site.title}</span></td><td>{site.strand === 'plus' ? '+' : '−'}</td><td>{site.low}–{site.high}</td><td>{site.mismatches}</td><td>{site.threePrimeMismatches}</td>
            </tr>)}</tbody>
          </table></div>}
        </div>}
      </div>}
    </section>
  )
}
