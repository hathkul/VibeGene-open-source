import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { groupSgRNAFeatures, sgRnaCas12aIllustrativeCuts, sgRnaNominalCut } from './domain/sgrna'
import { defaultAlleleCandidateOptions, fitAlleles, type AlleleCandidateOptions, type AlleleEdit, type AlleleFit, type FittedAllele } from './domain/sangerAlleles/fit'
import { prepareEvidenceTrace } from './domain/sangerAlleles/peaks'
import { createAlleleLibrary } from './application/sangerAlleles/library'
import { IndependentReadResults } from './IndependentReadResults'
import { SangerAllelesHelpDialog } from './SangerAllelesHelpDialog'
import { useTraceAlignment } from './presentation/hooks/traceAlignmentContext'
import type { SequenceRecord } from './domain/types'
import type { TraceFileRecord } from './domain/traceTypes'
import type { AlleleGroupResult, AlleleVariantSelection, SavedSangerAlleleAnalysis } from './domain/sangerAlleles/savedAnalysis'
import './SangerAllelesDialog.css'

function CandidateEditOptions({ options, disabled, twoGuides, onChange }: {
  options: AlleleCandidateOptions
  disabled: boolean
  twoGuides: boolean
  onChange: (key: keyof AlleleCandidateOptions, checked: boolean) => void
}) {
  return <>
    <label><input type="checkbox" checked={options.localIndels} disabled={disabled} onChange={(event) => onChange('localIndels', event.target.checked)} /> Local insertions and deletions near cuts, including junction insertions</label>
    <label><input type="checkbox" checked={options.segmentDeletions} disabled={disabled || !twoGuides} onChange={(event) => onChange('segmentDeletions', event.target.checked)} /> Deletions between two guide cuts</label>
  </>
}

function groupExportReason(group: AlleleGroupResult, selected: AlleleVariantSelection) {
  const result = group.result
  if (!result || group.error) return 'No successful analysis is available for this group.'
  if (result.fit < 0.8) return 'Overall peak fit is below the 80% export threshold.'
  if (result.perRead.some((entry) => entry.fit < 0.8)) return 'At least one read has a peak fit below the 80% export threshold.'
  if (!result.alleles.length) return 'No candidate alleles are available for this group.'
  if (result.alleles.some((allele, index) => allele.ambiguous && !selected[index]?.length)) return 'Select at least one variant for each ambiguous allele.'
  return null
}

function belowFitThreshold(result: AlleleFit) {
  return result.fit < 0.8 || result.perRead.some((read) => read.fit < 0.8)
}

function editCoordinates(edit: AlleleEdit) {
  if (edit.start === edit.end && !edit.inserted) return 'Reference sequence'
  const deleted = edit.end > edit.start ? `deleted reference bases ${edit.start + 1}–${edit.end}` : edit.start === 0 ? 'insertion before reference base 1' : `insertion after reference base ${edit.start}`
  return edit.inserted ? `${deleted}; inserted ${edit.inserted}` : deleted
}

function junctionSequence(reference: string, edit: AlleleEdit) {
  const left = reference.slice(Math.max(0, edit.start - 12), edit.start)
  const right = reference.slice(edit.end, edit.end + 12)
  return `${left} | ${edit.inserted || '∅'} | ${right}`
}

export function AmbiguityDetails({ allele, reference, selected, disabled, onToggle }: { allele: FittedAllele; reference: string; selected: readonly number[]; disabled: boolean; onToggle: (index: number, checked: boolean) => void }) {
  if (!allele.ambiguous) return null
  return <details className="sanger-alleles-alternatives" open>
    <summary>Competing edits{allele.alternativesTruncated ? ' (first 20)' : ` (${allele.alternatives.length})`}</summary>
    <p>Select one or more variants to export. These are competing hypotheses for this allele, not additional inferred alleles; the displayed fraction applies to the allele as a whole. Coordinates are 1-based; junctions show up to 12 reference bases on each side, with inserted bases between bars (∅ means none).</p>
    <ul className="sanger-alleles-variant-list"><li>
      <label><input type="checkbox" checked={selected.includes(0)} disabled={disabled} onChange={(event) => onToggle(0, event.target.checked)} /> Variant 1 (reported): {editCoordinates(allele.edit)}</label>
      <code>{junctionSequence(reference, allele.edit)}</code>
    </li>{allele.alternatives.map(({ edit, reason }, index) => <li key={index}>
      <label><input type="checkbox" checked={selected.includes(index + 1)} disabled={disabled} onChange={(event) => onToggle(index + 1, event.target.checked)} /> Variant {index + 2}: {edit.label} · {editCoordinates(edit)} · {reason === 'same-profile' ? 'same predicted bases at the measured positions' : 'similar fit after refitting the mixture'}</label>
      <code>{junctionSequence(reference, edit)}</code>
    </li>)}</ul>
    {allele.alternativesTruncated && <p>More alternatives also meet the ambiguity criterion; only the first 20 are shown.</p>}
  </details>
}

export function SangerAllelesDialog({ record, traces, onCancel, onOpenLibrary, onAnalysisChange }: {
  record: SequenceRecord
  traces: readonly TraceFileRecord[]
  onCancel: () => void
  onOpenLibrary: (prepareLibrary: () => Promise<SequenceRecord>) => Promise<void>
  onAnalysisChange?: (analysis: SavedSangerAlleleAnalysis | undefined) => void
}) {
  const saved = record.dna?.sangerAlleleAnalysis
  const guides = useMemo(() => groupSgRNAFeatures(record.features), [record.features])
  const [helpOpen, setHelpOpen] = useState(false)
  const helpButtonRef = useRef<HTMLButtonElement>(null)
  const helpWasOpenRef = useRef(false)
  useEffect(() => {
    if (helpOpen) helpWasOpenRef.current = true
    else if (helpWasOpenRef.current) { helpButtonRef.current?.focus(); helpWasOpenRef.current = false }
  }, [helpOpen])
  const [guideIds, setGuideIds] = useState<string[]>([])
  const [selectedTraces, setSelectedTraces] = useState<string[]>([])
  const [groups, setGroups] = useState<Record<string, string>>({})
  const [focusedGroup, setFocusedGroup] = useState<string | null>(null)
  const [candidateOptions, setCandidateOptions] = useState(defaultAlleleCandidateOptions)
  const [groupOptions, setGroupOptions] = useState<Record<string, AlleleCandidateOptions>>({})
  const [variantSelections, setVariantSelections] = useState<ReadonlyMap<string, AlleleVariantSelection>>(() => new Map(Object.entries(saved?.variantSelections ?? {})))
  const variantSelectionsRef = useRef(variantSelections)
  const [tab, setTab] = useState<'setup' | 'results'>(saved ? 'results' : 'setup')
  const [openingGroup, setOpeningGroup] = useState<string | null>(null)
  const [openingSelected, setOpeningSelected] = useState(false)
  const [selectedResults, setSelectedResults] = useState<string[]>(saved?.selectedGroups ?? [])
  const groupSuggestionsId = useId()
  const tabsId = useId()
  const [results, setResults] = useState<AlleleGroupResult[] | null>(saved?.results ?? null)
  const [analysisReference, setAnalysisReference] = useState(saved?.referenceSequence ?? record.sequence)
  const [error, setError] = useState('')
  const [phase, setPhase] = useState<'analyzing' | 'opening' | null>(null)
  const busy = phase !== null
  const alignPending = useTraceAlignment()
  const available = traces.filter((trace) => trace.alignmentPurpose !== 'comparative')
  const selectedGroups = useMemo(() => {
    const grouped = new Map<string, TraceFileRecord[]>()
    for (const trace of available) {
      if (!selectedTraces.includes(trace.id)) continue
      const name = (groups[trace.id] ?? trace.fileName).trim()
      if (!name) continue
      grouped.set(name, [...(grouped.get(name) ?? []), trace])
    }
    return [...grouped.entries()]
  }, [selectedTraces, groups, available])
  const defaultGroupNames = new Set(available.map((trace) => trace.fileName.trim()))
  const groupSuggestions = [...new Set(Object.values(groups).map((name) => name.trim()).filter((name) => name && !defaultGroupNames.has(name)))]
  const unnamedTrace = available.some((trace) => selectedTraces.includes(trace.id) && !(groups[trace.id] ?? trace.fileName).trim())
  const invalidGroup = selectedGroups.some(([, group]) => group.length > 2)
  const canAnalyze = guideIds.length > 0 && selectedGroups.length > 0 && !unnamedTrace && !invalidGroup && !busy && record.topology === 'linear'
  const persistResults = (nextResults: AlleleGroupResult[], selections: ReadonlyMap<string, AlleleVariantSelection>, selected: string[], reference = analysisReference) => {
    onAnalysisChange?.({ version: 1, referenceSequence: reference, results: nextResults, variantSelections: Object.fromEntries(selections), selectedGroups: selected })
  }
  const clearResults = () => { if (results) onAnalysisChange?.(undefined); setResults(null); variantSelectionsRef.current = new Map(); setVariantSelections(variantSelectionsRef.current); setSelectedResults([]); setError('') }
  const selectionForGroup = (group: AlleleGroupResult, selections = variantSelections): AlleleVariantSelection => {
    const overrides = selections.get(group.label) ?? {}
    return Object.fromEntries((group.result?.alleles ?? []).map((allele, index) => [index, overrides[index] ?? (allele.ambiguous ? [0, ...allele.alternatives.map((_, alternativeIndex) => alternativeIndex + 1)] : [0])]))
  }
  const toggleVariant = (group: AlleleGroupResult, alleleIndex: number, variantIndex: number, checked: boolean) => {
      const selection = selectionForGroup(group, variantSelectionsRef.current)
      const current = selection[alleleIndex] ?? []
      const next = checked ? [...new Set([...current, variantIndex])] : current.filter((index) => index !== variantIndex)
      const updated = new Map(variantSelectionsRef.current).set(group.label, { ...selection, [alleleIndex]: next })
      variantSelectionsRef.current = updated
      setVariantSelections(updated)
      if (results) persistResults(results, updated, selectedResults)
  }
  const chooseResults = (selected: string[]) => { setSelectedResults(selected); if (results) persistResults(results, variantSelections, selected) }
  const startOver = () => {
    clearResults(); setGuideIds([]); setSelectedTraces([]); setGroups({}); setGroupOptions({}); setCandidateOptions(defaultAlleleCandidateOptions); setAnalysisReference(record.sequence); setTab('setup')
  }
  const updateAllOptions = (key: keyof AlleleCandidateOptions, checked: boolean) => {
    clearResults()
    setCandidateOptions((current) => ({ ...current, [key]: checked }))
    setGroupOptions((current) => Object.fromEntries(Object.entries(current).map(([name, options]) => [name, { ...options, [key]: checked }])))
  }
  const optionsForGroup = (name: string) => Object.hasOwn(groupOptions, name) ? groupOptions[name]! : candidateOptions
  const updateGroupOptions = (name: string, key: keyof AlleleCandidateOptions, checked: boolean) => {
    clearResults()
    setGroupOptions((current) => ({ ...current, [name]: { ...(Object.hasOwn(current, name) ? current[name] : candidateOptions), [key]: checked } }))
  }
  const guideCut = (id: string) => {
    const guide = guides.find((entry) => entry.id === id)
    if (!guide) return null
    const cas12 = sgRnaCas12aIllustrativeCuts(guide, record.sequence.length, record.topology)
    return sgRnaNominalCut(guide, record.sequence.length, record.topology) ?? cas12?.nonTarget ?? null
  }
  async function analyze() {
    if (!canAnalyze) return
    const cuts = guideIds.map(guideCut)
    if (cuts.some((value) => value === null) || new Set(cuts).size !== cuts.length) { setError('Selected guides must have distinct supported cut positions.'); return }
    if (/[^ACGT]/i.test(record.sequence)) { setError('The reference sequence must contain only A, C, G and T.'); return }
    setPhase('analyzing'); setError(''); setResults(null); variantSelectionsRef.current = new Map(); setVariantSelections(variantSelectionsRef.current)
    // Let the dialog paint before running the computation.
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    const output = selectedGroups.map(([label, group]): AlleleGroupResult => {
      const reference = record.sequence.toUpperCase()
      const prepared = group.map((trace) => {
        try { return { evidence: prepareEvidenceTrace(reference, cuts as number[], trace) } }
        catch (caught) { return { error: caught instanceof Error ? caught.message : String(caught) } }
      })
      const independentReads = group.length === 2 ? group.map((trace, index) => {
        const entry = prepared[index]!
        const identity = { name: trace.fileName, orientation: trace.alignment?.orientation ?? 'unknown' as const }
        if (!entry.evidence) return { ...identity, error: entry.error ?? 'Could not prepare this trace.' }
        try { return { ...identity, result: fitAlleles(reference, cuts as number[], [entry.evidence], optionsForGroup(label)) } }
        catch (caught) { return { ...identity, error: caught instanceof Error ? caught.message : String(caught) } }
      }) : undefined
      try {
        const readEvidence = prepared.map((entry) => { if (!entry.evidence) throw new Error(entry.error); return entry.evidence })
        const result = fitAlleles(reference, cuts as number[], readEvidence, optionsForGroup(label))
        result.warnings.unshift(...readEvidence.map((read) => `${read.name}: ${read.orientation} read; ${read.onset === null ? 'no sustained mixed-peak onset detected' : `mixed peaks begin near read base ${read.onset + 1}`}.`))
        return { label, traceNames: group.map((trace) => trace.fileName), result, independentReads }
      } catch (caught) {
        return { label, traceNames: group.map((trace) => trace.fileName), error: caught instanceof Error ? caught.message : String(caught), independentReads }
      }
    })
    const selected = output.filter((group) => !groupExportReason(group, selectionForGroup(group, new Map()))).map((group) => group.label)
    setSelectedResults(selected); setAnalysisReference(record.sequence); persistResults(output, new Map(), selected, record.sequence)
    setResults(output); setTab('results'); setPhase(null)
  }
  async function createLibrary(groups: AlleleGroupResult[], bulk = false) {
    const selections = new Map(groups.map((group) => [group.label, selectionForGroup(group)]))
    if (busy || analysisReference !== record.sequence || !groups.length || groups.some((group) => groupExportReason(group, selections.get(group.label)!))) return
    setPhase('opening'); setOpeningGroup(bulk ? null : groups[0]!.label); setOpeningSelected(bulk); setError('')
    try { await onOpenLibrary(() => createAlleleLibrary(record, groups, alignPending, selections)) } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)) } finally { setPhase(null); setOpeningGroup(null); setOpeningSelected(false) }
  }
  const eligibleResults = results?.filter((group) => !groupExportReason(group, selectionForGroup(group, new Map()))) ?? []
  const selectedResultGroups = results?.filter((group) => selectedResults.includes(group.label)) ?? []
  const referenceChanged = analysisReference !== record.sequence
  const selectedExportBlocked = referenceChanged || selectedResultGroups.some((group) => groupExportReason(group, selectionForGroup(group)))
  return <>
  <div className="translation-dialog-backdrop" role="presentation" onMouseDown={busy ? undefined : onCancel}>
    <section className="translation-dialog sanger-alleles-dialog" role="dialog" aria-modal="true" aria-labelledby="sanger-alleles-title" inert={helpOpen} aria-hidden={helpOpen || undefined} onMouseDown={(event) => event.stopPropagation()}>
      <header className="sanger-alleles-titlebar" data-dialog-drag-handle><h3 id="sanger-alleles-title">Alleles from Sanger data</h3><button type="button" ref={helpButtonRef} className="sanger-alleles-help-button" aria-label="Help: Alleles from Sanger data" title="Help: Alleles from Sanger data" onClick={() => setHelpOpen(true)}>?</button></header>
      <div className="sanger-alleles-tabs" role="tablist" aria-label="Allele analysis">
        <button type="button" role="tab" id={`${tabsId}-setup-tab`} aria-controls={`${tabsId}-setup`} aria-selected={tab === 'setup'} disabled={busy} onClick={() => setTab('setup')}>Setup</button>
        <button type="button" role="tab" id={`${tabsId}-results-tab`} aria-controls={`${tabsId}-results`} aria-selected={tab === 'results'} disabled={busy || !results} onClick={() => setTab('results')}>Results</button>
      </div>
      {tab === 'setup' && <div className="sanger-alleles-setup" role="tabpanel" id={`${tabsId}-setup`} aria-labelledby={`${tabsId}-setup-tab`}>
      <p>Choose one guide for local indels or two guides to also test a deletion between their cuts. Assign up to two chromatograms from the same sample to each group.</p>
      <p className="sanger-alleles-caution">Exploratory, unvalidated peak fitting. Alleles are hypotheses, not confirmed genotypes. Sequence outside the modeled edit is copied from the reference. Indels outside the supported search range and more than four alleles may be missed.</p>
      {record.topology !== 'linear' && <p role="alert">This analysis currently requires a linear reference sequence.</p>}
      <fieldset><legend>Guides (one or two)</legend>
        {guides.length === 0 && <p>No mapped sgRNAs are present in this document.</p>}
        {guides.map((guide) => <label key={guide.id}><input type="checkbox" checked={guideIds.includes(guide.id)} disabled={busy || (!guideIds.includes(guide.id) && guideIds.length >= 2)} onChange={(event) => { clearResults(); setGuideIds((current) => event.target.checked ? [...current, guide.id] : current.filter((id) => id !== guide.id)) }} /> {guide.guide.name} · {guide.nuclease}</label>)}
      </fieldset>
      <fieldset><legend>Candidate edits for all groups</legend>
        <CandidateEditOptions options={candidateOptions} disabled={busy} twoGuides={guideIds.length === 2} onChange={updateAllOptions} />
        <p className="sanger-alleles-group-help">Changing a setting here applies it to all groups. Adjust individual groups beside the trace list. The reference is always considered; excluded edit types cannot be detected. Between-cut deletions require two guides.</p>
      </fieldset>
      <div className={`sanger-alleles-grouping${selectedGroups.length ? ' has-groups' : ''}`}>
      <fieldset><legend>Chromatograms and groups</legend>
        <p className="sanger-alleles-group-help">Each trace starts in its own group named after its file. Use the same name to group two traces; names are case-sensitive and appear in the exported library.</p>
        {available.length === 0 && <p>No Sanger alignments are present in this document.</p>}
        {available.length > 0 && <label className="sanger-alleles-check-all"><input type="checkbox" disabled={busy} checked={selectedTraces.length === available.length} ref={(input) => { if (input) input.indeterminate = selectedTraces.length > 0 && selectedTraces.length < available.length }} onChange={(event) => { clearResults(); setSelectedTraces(event.target.checked ? available.map((trace) => trace.id) : []) }} /> Select all traces</label>}
        <datalist id={groupSuggestionsId}>{groupSuggestions.map((name) => <option key={name} value={name} />)}</datalist>
        {available.map((trace) => <div className="sanger-alleles-trace" key={trace.id}>
          <label><input type="checkbox" disabled={busy} checked={selectedTraces.includes(trace.id)} onChange={(event) => { clearResults(); setSelectedTraces((current) => event.target.checked ? [...current, trace.id] : current.filter((id) => id !== trace.id)) }} /><span>{trace.fileName}{trace.alignment ? ` (${trace.alignment.orientation})` : ' (not aligned)'}</span></label>
          <input type="text" aria-label={`Group for ${trace.fileName}`} placeholder="Group name" list={groupSuggestionsId} disabled={busy || !selectedTraces.includes(trace.id)} value={groups[trace.id] ?? (focusedGroup === trace.id ? '' : trace.fileName)} onFocus={() => setFocusedGroup(trace.id)} onBlur={() => setFocusedGroup(null)} onChange={(event) => { clearResults(); setGroups((current) => ({ ...current, [trace.id]: event.target.value })) }} />
        </div>)}
        {unnamedTrace && <p role="status">Enter a group name for each selected trace.</p>}
        {invalidGroup && <p role="alert">Each group can contain at most two traces.</p>}
      </fieldset>
      {selectedGroups.length > 0 && <div className="sanger-alleles-group-options"><h4>Candidate edits by group</h4>{selectedGroups.map(([name, members]) => <fieldset key={name}>
        <legend>{name}</legend>
        <p className="sanger-alleles-group-help">{members.map((member) => member.fileName).join(' + ')}</p>
        <CandidateEditOptions options={optionsForGroup(name)} disabled={busy} twoGuides={guideIds.length === 2} onChange={(key, checked) => updateGroupOptions(name, key, checked)} />
      </fieldset>)}</div>}
      </div>
      </div>}
      {error && <p role="alert">{error}</p>}
      {tab === 'results' && results && <div className="sanger-alleles-results" role="tabpanel" id={`${tabsId}-results`} aria-labelledby={`${tabsId}-results-tab`}><h4>Candidate results</h4>
      {referenceChanged && <p role="alert">The reference sequence has changed since this analysis. Analyze again before opening a library.</p>}
      <label><input type="checkbox" disabled={busy || !eligibleResults.length} checked={eligibleResults.length > 0 && eligibleResults.every((group) => selectedResults.includes(group.label))} ref={(input) => { if (input) input.indeterminate = selectedResults.length > 0 && selectedResults.length < eligibleResults.length }} onChange={(event) => chooseResults(event.target.checked ? eligibleResults.map((group) => group.label) : [])} /> Select all groups</label>
      {results.map((group) => <section key={group.label}>
        <label><input type="checkbox" aria-label={`Select group ${group.label}`} disabled={busy || !eligibleResults.includes(group)} checked={selectedResults.includes(group.label)} onChange={(event) => chooseResults(event.target.checked ? [...selectedResults, group.label] : selectedResults.filter((name) => name !== group.label))} /><strong>{group.label}: {group.traceNames.join(' + ')}</strong></label>
        {group.error ? <p role="alert">{group.error}</p> : group.result && <>
          <p className={belowFitThreshold(group.result) ? 'sanger-alleles-below-threshold' : undefined}>Peak-fit similarity: {(100 * group.result.fit).toFixed(1)}% over {group.result.positions} positions. {belowFitThreshold(group.result) ? 'Below export threshold.' : ''}</p>
          {group.result.perRead.length > 1 && <p>Per-read fit: {group.result.perRead.map((read) => `${read.name} ${(100 * read.fit).toFixed(1)}%`).join(' · ')}</p>}
          <ul>{group.result.alleles.map((allele, index) => <li key={index}>{allele.edit.label} · {(100 * allele.fraction).toFixed(1)}%{allele.ambiguous ? ' · competing alternatives' : ''}<AmbiguityDetails allele={allele} reference={analysisReference} selected={selectionForGroup(group)[index] ?? []} disabled={busy} onToggle={(variantIndex, checked) => toggleVariant(group, index, variantIndex, checked)} /></li>)}</ul>
          {group.result.warnings.map((warning, index) => <p className="sanger-alleles-caution" key={index}>{warning}</p>)}
        </>}
        <IndependentReadResults group={group} reference={analysisReference} />
        {groupExportReason(group, selectionForGroup(group)) && <p className="sanger-alleles-caution">{groupExportReason(group, selectionForGroup(group))}</p>}
        <button type="button" disabled={busy || referenceChanged || !!groupExportReason(group, selectionForGroup(group))} onClick={() => void createLibrary([group])}>{openingGroup === group.label ? 'Preparing library…' : 'Open allele library'}</button>
      </section>)}
      {selectedExportBlocked && !referenceChanged && <p className="sanger-alleles-caution">Select at least one variant for each ambiguous allele in the selected groups.</p>}
      <button type="button" className="sanger-alleles-export-selected" disabled={busy || !selectedResultGroups.length || selectedExportBlocked} onClick={() => void createLibrary(selectedResultGroups, true)}>{openingSelected ? 'Preparing library…' : 'Open library for selected groups'}</button>
      </div>}
      <div className="sgrna-dialog-actions"><button type="button" disabled={busy} onClick={onCancel}>Cancel</button>{results && <button type="button" disabled={busy} onClick={startOver}>Analyze again</button>}{tab === 'setup' && <button type="button" disabled={!canAnalyze} onClick={() => void analyze()}>{phase === 'analyzing' ? 'Analyzing…' : 'Analyze'}</button>}</div>
    </section>
  </div>
  {helpOpen && <SangerAllelesHelpDialog onDismiss={() => setHelpOpen(false)} />}
  </>
}
