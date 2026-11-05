import { useTraceAlignment } from './presentation/hooks/traceAlignmentContext'
import { useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { DatabaseConstructPickerDialog } from './cloning/DatabaseConstructPickerDialog'
import { ConstructSourceSelect } from './cloning/ConstructSourceOptions'
import { constructSourceOptionValue, groupConstructSourceOptions, useConstructSources } from './cloning/useConstructSources'
import type { CloningWorkspaceRenderArgs } from './cloningWorkspaceTypes'
import { MobileCloningLayout } from './MobileCloningLayout'
import { createRestrictionCloningProductLibraryAsync } from './domain/restrictionCloningBatch'
import { dnaTerminalEndDetail } from './domain/dnaEnds'
import { enzymes, findRestrictionSites } from './domain/enzymes'
import { SEQUENCE_OPEN_ACCEPT } from './domain/fileFormats'
import { isSnapGeneBytes, parseSequenceBytes, parseSnapGene } from './domain/parsers'
import { reverseComplement } from './domain/sequence'
import { presentAnnealedInsert } from './domain/annealedOligos'
import { listSgRnaCloningChoices, planSgRnaCloning, withSgRnaCloningLibraryHistory, type SgRnaCloningChoice } from './domain/sgrnaCloning'
import type { SgRNAAnnotation } from './domain/sgrna'
import type { RestrictionSite, SequenceRecord } from './domain/types'
import { saveTextAs } from './desktop/fileIo'
import { useClampDialogToViewport } from './ui/useClampDialogToViewport'

type Props = {
  source: SequenceRecord
  currentTabId: string
  guides: SgRNAAnnotation[]
  onCancel: () => void
  onClone: (products: SequenceRecord[]) => void
  onOpenAnnealedInsert?: (insert: SequenceRecord) => void
  renderWorkspace: (args: CloningWorkspaceRenderArgs) => ReactNode
}

function siteKey(site: RestrictionSite): string {
  return `${site.enzyme.name}@${site.start}`
}

function siteLabel(site: RestrictionSite, count: number): string {
  return `${site.enzyme.name} · ${site.start + 1}–${site.end} · ${count} site${count === 1 ? '' : 's'}`
}

function endLabel(record: SequenceRecord, side: 'upstream' | 'downstream'): string {
  const end = dnaTerminalEndDetail(record, side)
  if (end.polarity === 'unknown') return 'end chemistry not recorded'
  const modifier = end.modification === 'fivePrimePhosphorylated' ? '5′ phosphorylated' : end.modification === 'unmodified' ? 'unmodified' : end.modification ?? 'modification unknown'
  const overhang = end.bases5to3 ? `${end.bases5to3} (${end.polarity} overhang)` : end.polarity === 'blunt' ? 'blunt' : `${end.polarity} overhang, bases unresolved`
  return `${overhang} · ${modifier}${end.enzymeName ? ` · ${end.enzymeName}` : ''}`
}

function OligoSequence({ sequence, target, modification }: { sequence: string; target: string; modification: string }) {
  const targetStart = sequence.indexOf(target)
  if (targetStart < 0) return <div className="sgrna-cloning-oligo-value"><code>{sequence}</code><small>{modification}</small></div>
  const added5 = sequence.slice(0, targetStart)
  const added3 = sequence.slice(targetStart + target.length)
  return <div className="sgrna-cloning-oligo-value">
    <code className="sgrna-cloning-oligo-sequence">
      {added5 && <mark title="Added 5′ sequence">{added5}</mark>}{target}{added3 && <mark title="Added 3′ sequence">{added3}</mark>}
    </code>
    <small className="sgrna-cloning-oligo-additions">5′ added: <strong>{added5 || '—'}</strong> · 3′ added: <strong>{added3 || '—'}</strong> · {modification}</small>
  </div>
}

export function SgRNACloningDialog({ source, currentTabId, guides, onCancel, onClone, onOpenAnnealedInsert, renderWorkspace }: Props) {
  const alignPending = useTraceAlignment()
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  useClampDialogToViewport(dialogRef)
  const [vector, setVector] = useState<SequenceRecord | null>(null)
  const [sourceOptionValue, setSourceOptionValue] = useState('')
  const [choiceId, setChoiceId] = useState('auto')
  const [promoterSiteId, setPromoterSiteId] = useState('')
  const [scaffoldSiteId, setScaffoldSiteId] = useState('')
  const [databasePickerOpen, setDatabasePickerOpen] = useState(false)
  const [outputMode, setOutputMode] = useState<'tabs' | 'library'>('tabs')
  const [libraryName, setLibraryName] = useState('sgRNA cloning products')
  const [acceptMismatch, setAcceptMismatch] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const { options: allConstructOptions, refresh: refreshSources } = useConstructSources({ currentRecord: source, currentTabId })
  const constructOptions = useMemo(() => allConstructOptions.filter((option) => option.record.molecule === 'dna' && option.record.dna?.documentRole !== 'library'), [allConstructOptions])
  const constructGroups = useMemo(() => groupConstructSourceOptions(constructOptions), [constructOptions])

  const choices = useMemo(() => vector ? listSgRnaCloningChoices(vector) : [], [vector])
  const sites = useMemo(() => {
    if (!vector || vector.topology !== 'circular') return []
    const found = findRestrictionSites(vector.sequence, enzymes, { topology: vector.topology, construct: vector.construct })
    const counts = new Map<string, number>()
    for (const site of found) counts.set(site.enzyme.name, (counts.get(site.enzyme.name) ?? 0) + 1)
    const seen = new Set<string>()
    return found.filter((site) => {
      const key = siteKey(site)
      if ((counts.get(site.enzyme.name) ?? 0) > 2 || seen.has(key)) return false
      seen.add(key)
      return true
    }).sort((a, b) => a.start - b.start).map((site) => ({ site, label: siteLabel(site, counts.get(site.enzyme.name) ?? 0) }))
  }, [vector])
  const promoterSite = sites.find((entry) => siteKey(entry.site) === promoterSiteId)?.site
  const scaffoldSite = sites.find((entry) => siteKey(entry.site) === scaffoldSiteId)?.site
  const planState = useMemo(() => {
    if (!vector || (choiceId === 'manual-sites' && (!promoterSite || !scaffoldSite))) return { plan: null, error: '' }
    try {
      const chosen: SgRnaCloningChoice | string | undefined = choiceId === 'auto'
        ? undefined
        : choiceId === 'manual-sites'
          ? { id: 'manual-sites', kind: 'manual-sites', label: 'Manual sites', architecture: 'manual', promoterSite: promoterSite!, scaffoldSite: scaffoldSite! }
          : choiceId === 'existing-ends'
            ? { id: 'existing-ends', kind: 'existing-ends', label: 'Existing vector ends', architecture: 'pre-linearized' }
            : choiceId
      return { plan: planSgRnaCloning({ vector, guides, choice: chosen }), error: '' }
    } catch (error) {
      return { plan: null, error: error instanceof Error ? error.message : String(error) }
    }
  }, [vector, guides, choiceId, promoterSite, scaffoldSite])
  const plan = planState.plan
  const mismatch = plan?.items.some((item) => item.compatibility.status === 'incompatible') ?? false
  const ready = Boolean(plan && plan.products.length === guides.length && plan.primers.length === guides.length * 2 && (!mismatch || acceptMismatch))
  const selectedSites = [plan?.selectedChoice?.promoterSite, plan?.selectedChoice?.scaffoldSite].filter((site): site is RestrictionSite => Boolean(site))

  function setChosenVector(record: SequenceRecord) {
    setVector(record)
    setChoiceId('auto')
    setPromoterSiteId('')
    setScaffoldSiteId('')
    setAcceptMismatch(false)
    setStatus('')
  }

  async function importVector(file: File) {
    try {
      const buffer = await file.arrayBuffer()
      const bytes = new Uint8Array(buffer)
      const parsed = isSnapGeneBytes(bytes) ? parseSnapGene(bytes, file.name) : parseSequenceBytes(buffer, file.name)
      if (parsed.molecule !== 'dna' || parsed.dna?.documentRole === 'library') throw new Error('Choose one DNA cloning vector, not a protein or DNA library.')
      setChosenVector(parsed)
      setSourceOptionValue('')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function copyOligos() {
    if (!plan?.primerListTsv) return
    try {
      await navigator.clipboard.writeText(plan.primerListTsv)
      setStatus('Copied order-ready oligo list.')
    } catch {
      setStatus('Clipboard access failed; use Export oligos to save the list.')
    }
  }

  async function exportOligos() {
    if (!plan?.primerListTsv) return
    try {
      await saveTextAs(`sgRNA oligos for ${vector?.name ?? 'vector'}.txt`, plan.primerListTsv, 'text/plain')
      setStatus('Oligo list exported in primer-list format.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    }
  }

  async function clone() {
    if (!ready || !plan || busy) return
    setBusy(true)
    try {
      const products = outputMode === 'library'
        ? [withSgRnaCloningLibraryHistory(
            await createRestrictionCloningProductLibraryAsync(plan.products, libraryName.trim() || 'sgRNA cloning products', alignPending),
            plan.products,
          )]
        : plan.products
      onClone(products)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
      setBusy(false)
    }
  }

  return (
    <div className="translation-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel() }}>
      <div ref={dialogRef} className="translation-dialog restriction-cloning-dialog sgrna-cloning-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} onMouseDown={(event) => event.stopPropagation()}>
        <header className="restriction-cloning-header">
          <h3 id={titleId}>Clone sgRNA</h3>
          <span className="sgrna-cloning-header-detail">{guides.length} selected guide{guides.length === 1 ? '' : 's'} · {source.name}</span>
          <button type="button" className="sgrna-cloning-close" onClick={onCancel} aria-label="Close Clone sgRNA dialog">×</button>
        </header>
        <MobileCloningLayout designLabel="Oligos" className="sgrna-cloning-layout">
          <div className="restriction-cloning-main">
            {renderWorkspace({
              record: vector,
              title: vector ? `Cloning vector · ${vector.name}` : 'Choose a cloning vector',
              selectedRange: null,
              cutStrandSelection: null,
              selectedSites,
              allowEnzymeSelect: Boolean(vector),
              onRestrictionSelect: (site) => {
                if (!sites.some((entry) => siteKey(entry.site) === siteKey(site))) {
                  setStatus('Choose a unique or dual cutter from the cloning-site selectors.')
                  return
                }
                setChoiceId('manual-sites')
                if (!promoterSiteId || (promoterSiteId && scaffoldSiteId)) {
                  setStatus('')
                  setPromoterSiteId(siteKey(site))
                  setScaffoldSiteId('')
                  return
                }
                setStatus('')
                setScaffoldSiteId(siteKey(site))
              },
            })}
            <section className="cloning-schema-panel sgrna-cloning-results" aria-label="Guide oligos and products">
              <div className="sgrna-cloning-section-heading">
                <strong>Guide oligos and products</strong>
                <span>{plan?.products.length ?? 0} / {guides.length} constructs ready</span>
              </div>
              {!vector && <p className="sgrna-cloning-empty">Choose a vector to calculate its cloning junctions and order-ready oligos.</p>}
              {plan?.items.map((item) => (
                <article key={item.guide.id} className="sgrna-cloning-guide-card">
                  <div className="sgrna-cloning-guide-head"><strong>{item.guide.guide.name}</strong><span>{item.guide.nuclease} · {item.guide.spacer.length} nt</span></div>
                  <div className={`sgrna-cloning-compatibility is-${item.compatibility.status}`}>{item.compatibility.message}</div>
                  {item.oligos && <>
                    <div className="sgrna-cloning-oligo-row"><span>Sense · 5′→3′</span><OligoSequence sequence={item.oligos.sense} target={item.guide.spacer} modification={item.oligos.senseModification} /></div>
                    <div className="sgrna-cloning-oligo-row"><span>Antisense · 5′→3′</span><OligoSequence sequence={item.oligos.antisense} target={reverseComplement(item.guide.spacer)} modification={item.oligos.antisenseModification} /></div>
                    <small className="sgrna-cloning-note">{item.oligos.note}</small>
                  </>}
                  {item.insert && item.oligos && vector && onOpenAnnealedInsert && (
                    <div className="sgrna-cloning-source-actions">
                      <button type="button" onClick={() => {
                        const opened = presentAnnealedInsert({
                          parent: vector,
                          insert: item.insert,
                          sense: { name: `${item.guide.guide.name}_sense`, sequence: item.oligos!.sense },
                          antisense: { name: `${item.guide.guide.name}_antisense`, sequence: item.oligos!.antisense },
                        })
                        if (opened) onOpenAnnealedInsert(opened)
                      }}>Open as sequence</button>
                    </div>
                  )}
                  {item.issues.map((issue, index) => <p key={`${item.guide.id}-issue-${index}`} className="sgrna-cloning-issue">{issue}</p>)}
                  <div className="sgrna-cloning-product-state">{item.product ? `Construct: ${item.product.name} (${item.product.sequence.length.toLocaleString()} bp)` : 'Construct cannot be generated until the cloning junction is resolved.'}</div>
                </article>
              ))}
            </section>
          </div>
          <aside className="restriction-cloning-sidebar">
            <div className="restriction-cloning-sidebar-body">
              <section className="sgrna-cloning-section">
                <h4>Selected sgRNAs</h4>
                <div className="sgrna-cloning-guide-list">{guides.map((guide) => <div key={guide.id}><strong>{guide.guide.name}</strong><code>{guide.spacer}</code><span>{guide.pamMotif} PAM · {guide.nuclease}</span></div>)}</div>
              </section>
              <section className="sgrna-cloning-section">
                <h4>Cloning vector</h4>
                <label className="restriction-cloning-field">Open construct
                  <ConstructSourceSelect groups={constructGroups} value={sourceOptionValue} onOpen={refreshSources} onChange={(event) => {
                    const match = constructOptions.find((option) => constructSourceOptionValue(option) === event.target.value)
                    if (match) {
                      setChosenVector(match.record)
                      setSourceOptionValue(event.target.value)
                    }
                  }} />
                </label>
                <div className="sgrna-cloning-source-actions">
                  <button type="button" onClick={() => fileRef.current?.click()}>Choose file…</button>
                  <button type="button" onClick={() => setDatabasePickerOpen(true)}>Database…</button>
                </div>
                <input ref={fileRef} type="file" hidden accept={SEQUENCE_OPEN_ACCEPT} onChange={(event) => { const file = event.target.files?.[0]; if (file) void importVector(file) }} />
                {vector && <div className="sgrna-cloning-vector-summary"><strong>{vector.name}</strong><span>{vector.sequence.length.toLocaleString()} bp · {vector.topology}</span></div>}
              </section>
              {vector && <>
                <section className="sgrna-cloning-section">
                  <h4>Detected CRISPR features</h4>
                  <div className="sgrna-cloning-detection-row"><span>Cas</span><strong>{plan?.detection.nucleaseFindings.map((finding) => finding.name).join(', ') || 'Not detected'}</strong></div>
                  <div className="sgrna-cloning-detection-row"><span>Guide scaffold</span><strong>{plan?.detection.guideScaffoldFindings.map((finding) => finding.name).join(', ') || 'Not detected'}</strong></div>
                  {vector.topology === 'linear' && <>
                    <div className="sgrna-cloning-detection-row"><span>Left end</span><strong>{endLabel(vector, 'upstream')}</strong></div>
                    <div className="sgrna-cloning-detection-row"><span>Right end</span><strong>{endLabel(vector, 'downstream')}</strong></div>
                  </>}
                </section>
                <section className="sgrna-cloning-section">
                  <h4>Cloning junction</h4>
                  <label className="restriction-cloning-field">Cloning sites or ends
                    <select value={choiceId} onChange={(event) => { setChoiceId(event.target.value); setAcceptMismatch(false) }}>
                      <option value="auto">Auto · best validated choice</option>
                      {choices.map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
                      {vector.topology === 'linear' && !choices.some((choice) => choice.kind === 'existing-ends') && <option value="existing-ends">Use recorded vector ends</option>}
                      {vector.topology === 'circular' && <option value="manual-sites">Select enzyme sites manually…</option>}
                    </select>
                  </label>
                  {choiceId === 'manual-sites' && <>
                    <label className="restriction-cloning-field">Promoter-side cut
                      <select value={promoterSiteId} onChange={(event) => setPromoterSiteId(event.target.value)}>
                        <option value="">Choose enzyme site…</option>
                        {sites.map(({ site, label }) => <option key={`promoter-${siteKey(site)}`} value={siteKey(site)}>{label}</option>)}
                      </select>
                    </label>
                    <label className="restriction-cloning-field">Scaffold-side cut
                      <select value={scaffoldSiteId} onChange={(event) => setScaffoldSiteId(event.target.value)}>
                        <option value="">Choose enzyme site…</option>
                        {sites.map(({ site, label }) => <option key={`scaffold-${siteKey(site)}`} value={siteKey(site)}>{label}</option>)}
                      </select>
                    </label>
                  </>}
                  {plan?.selectedChoice && <p className="sgrna-cloning-choice-evidence">{plan.selectedChoice.label} · {plan.selectedChoice.architecture}{plan.selectedChoice.confidence ? ` · ${plan.selectedChoice.confidence} confidence` : ''}</p>}
                </section>
              </>}
              {(planState.error || plan?.issues.length || (choiceId === 'manual-sites' && (!promoterSite || !scaffoldSite))) && <section className="sgrna-cloning-blockers" role="alert">
                {choiceId === 'manual-sites' && (!promoterSite || !scaffoldSite) && <p>{sites.length === 0
                  ? 'This vector has no usable cut sites.'
                  : sites.length === 1
                    ? 'This vector has one usable cut. Choose it for both sides to linearize there and insert the guide.'
                    : 'Choose the promoter-side and scaffold-side cuts. The same cut in both fields linearizes the vector at that site.'}</p>}
                {planState.error && <p>{planState.error}</p>}
                {plan?.issues.map((issue, index) => <p key={`plan-issue-${index}`}>{issue}</p>)}
              </section>}
              {mismatch && <label className="sgrna-cloning-mismatch-ack"><input type="checkbox" checked={acceptMismatch} onChange={(event) => setAcceptMismatch(event.target.checked)} /> Continue despite the Cas–guide mismatch</label>}
              {plan?.primerListTsv && <section className="sgrna-cloning-section"><h4>Order list</h4><div className="sgrna-cloning-source-actions"><button type="button" onClick={() => void copyOligos()}>Copy oligos</button><button type="button" onClick={() => void exportOligos()}>Export oligos…</button></div></section>}
              <section className="sgrna-cloning-section"><h4>Output</h4>
                <label className="sgrna-cloning-radio"><input type="radio" name="sgrna-output" checked={outputMode === 'tabs'} onChange={() => setOutputMode('tabs')} /> Open separate constructs</label>
                <label className="sgrna-cloning-radio"><input type="radio" name="sgrna-output" checked={outputMode === 'library'} onChange={() => setOutputMode('library')} /> Open as DNA library</label>
                {outputMode === 'library' && <label className="restriction-cloning-field">Library name<input value={libraryName} onChange={(event) => setLibraryName(event.target.value)} /></label>}
              </section>
              {status && <p className="sgrna-cloning-status" role="status">{status}</p>}
            </div>
            <div className="restriction-cloning-sidebar-actions"><button type="button" onClick={onCancel}>Cancel</button><button type="button" className="primary" disabled={!ready || busy} onClick={() => void clone()}>{busy ? 'Preparing…' : `Clone ${guides.length} sgRNA${guides.length === 1 ? '' : 's'}`}</button></div>
          </aside>
        </MobileCloningLayout>
      </div>
      {databasePickerOpen && <DatabaseConstructPickerDialog title="Choose sgRNA cloning vector" molecules={['dna']} onCancel={() => setDatabasePickerOpen(false)} onSelect={(record) => {
        if (record.dna?.documentRole === 'library') {
          setStatus('Choose one DNA cloning vector rather than a DNA library.')
        } else {
          setChosenVector(record)
          setSourceOptionValue('')
        }
        setDatabasePickerOpen(false)
      }} />}
    </div>
  )
}
