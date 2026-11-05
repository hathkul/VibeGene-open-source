import { useState } from 'react'
import type { CrisprCutSite, CrisprExcisionPlan } from './application/selectionEditing/crisprExcision'
import { cutOverhangLength, previewCrisprJunction, type CrisprArc, type JunctionSettings } from './application/selectionEditing/crisprJunction'
import type { SequenceRecord } from './domain/types'
import { reverseComplement } from './domain/sequence'
import './CrisprExcisionDialog.css'

export function CrisprExcisionDialog({ record, plan, onCancel, onExcise }: {
  record: SequenceRecord
  plan: CrisprExcisionPlan
  onCancel: () => void
  onExcise: (arc: CrisprArc, settings?: JunctionSettings) => void
}) {
  const [arc, setArc] = useState<CrisprArc>('between')
  const [sites, setSites] = useState<[CrisprCutSite, CrisprCutSite]>(plan.sites)
  const [fills, setFills] = useState<[number, number]>(() => plan.sites.map((site) => cutOverhangLength(site, record)) as [number, number])
  const [start, end] = plan.cuts
  const hasCas12a = plan.guides.some((guide) => guide.nuclease === 'Cas12a')
  const leftIndex = arc === 'between' ? 0 : 1
  const rightIndex = 1 - leftIndex
  const leftLength = cutOverhangLength(sites[leftIndex]!, record)
  const rightLength = cutOverhangLength(sites[rightIndex]!, record)
  const leftFill = Math.min(fills[0], Math.max(0, leftLength))
  const rightFill = Math.min(fills[1], Math.max(0, rightLength))
  const settings: JunctionSettings = { arc, sites, leftFill, rightFill }
  const result = hasCas12a ? previewCrisprJunction(record, plan, settings) : null
  const setRegion = (next: CrisprArc) => {
    setArc(next)
    const first = next === 'between' ? 0 : 1
    setFills([cutOverhangLength(sites[first]!, record), cutOverhangLength(sites[1 - first]!, record)])
  }
  const changeCut = (index: number, strand: 'top' | 'bottom', value: string) => {
    const next = sites.map((site, i) => i === index ? { ...site, [strand]: value === '' ? Number.NaN : Number(value) } : site) as [CrisprCutSite, CrisprCutSite]
    setSites(next)
    setFills([Math.max(0, cutOverhangLength(next[leftIndex]!, record)), Math.max(0, cutOverhangLength(next[rightIndex]!, record))])
  }
  const preview = result?.preview
  const ends = preview ?? result?.ends
  return <div className="translation-dialog-backdrop" role="presentation" onMouseDown={onCancel}>
    <section className="translation-dialog sgrna-dialog crispr-excision-dialog" role="dialog" aria-modal="true" aria-labelledby="crispr-excision-title" onMouseDown={(event) => event.stopPropagation()}>
      <h3 id="crispr-excision-title">Excise region</h3>
      <p className="sgrna-dialog-help">Model a junction between {plan.guides[0].guide.name} and {plan.guides[1].guide.name}. These are assumed cuts and repair steps; actual outcomes can vary.</p>
      {record.topology === 'circular' ? <fieldset className="crispr-excision-options">
        <legend>Region to remove</legend>
        <label><input type="radio" name="crispr-excision-arc" checked={arc === 'between'} onChange={() => setRegion('between')} /> Between cut sites (excluding the origin)</label>
        <label><input type="radio" name="crispr-excision-arc" checked={arc === 'across-origin'} onChange={() => setRegion('across-origin')} /> Across the origin</label>
      </fieldset> : !hasCas12a && <p>Remove bases {start + 1}–{end} ({end - start} bp).</p>}
      {hasCas12a && <>
        <p className="sgrna-dialog-help">Adjust strand cuts if needed. Positions are boundaries after the numbered base (0 means before base 1). Cas12a defaults are illustrative; Cas9 defaults are blunt.</p>
        <div className="crispr-junction-cuts">
          {sites.map((site, index) => <fieldset key={site.guide.id}>
            <legend>{site.guide.guide.name} · {site.guide.nuclease}</legend>
            <label>Top strand <input aria-label={`${site.guide.guide.name} top strand cut`} type="number" min={0} max={record.topology === 'circular' ? record.sequence.length - 1 : record.sequence.length} value={Number.isNaN(site.top) ? '' : site.top} onChange={(event) => changeCut(index, 'top', event.target.value)} /></label>
            <label>Bottom strand <input aria-label={`${site.guide.guide.name} bottom strand cut`} type="number" min={0} max={record.topology === 'circular' ? record.sequence.length - 1 : record.sequence.length} value={Number.isNaN(site.bottom) ? '' : site.bottom} onChange={(event) => changeCut(index, 'bottom', event.target.value)} /></label>
          </fieldset>)}
        </div>
        <div className="crispr-junction-ends">
          {(['left', 'right'] as const).map((side, index) => {
            const length = side === 'left' ? leftLength : rightLength
            const fill = side === 'left' ? leftFill : rightFill
            return <label key={side}>{side === 'left' ? 'Left' : 'Right'} retained end fill
              <select value={Number.isFinite(fill) && fill >= 0 ? fill : 0} onChange={(event) => setFills((previous) => index === 0 ? [Number(event.target.value), previous[1]] : [previous[0], Number(event.target.value)])}>
                {Array.from({ length: Number.isInteger(length) && length >= 0 && length <= 10 ? length + 1 : 1 }, (_, count) => <option key={count} value={count}>{count} nt{count === 0 ? ' (no fill)' : count === length ? ' (complete)' : ''}</option>)}
              </select>
            </label>
          })}
        </div>
        {ends && <div className="crispr-junction-preview">
          <div>Left overhang: <code>{ends.leftOverhang ? `5′-${reverseComplement(ends.leftOverhang)}-3′` : 'blunt'}</code> · Right overhang: <code>{ends.rightOverhang ? `5′-${ends.rightOverhang}-3′` : 'blunt'}</code></div>
          <div>Remaining: <code>{ends.leftRemaining ? `5′-${reverseComplement(ends.leftRemaining)}-3′` : 'blunt'}</code> / <code>{ends.rightRemaining ? `5′-${ends.rightRemaining}-3′` : 'blunt'}</code></div>
        </div>}
        {preview ? <div className="crispr-junction-preview" role="status">
          <div>{preview.leftRemaining ? `Compatible remaining sticky ends: ${preview.leftRemaining}` : 'Blunt ends after filling'}</div>
          <div>Product: {preview.sequence.length.toLocaleString()} bp · {Math.max(0, record.sequence.length - preview.sequence.length).toLocaleString()} bp removed</div>
          <div>Junction: <code>{preview.deletionArc === 'between' ? preview.sequence.slice(Math.max(0, preview.deletionPlan.cuts[0] - 12), preview.deletionPlan.cuts[0]) : preview.sequence.slice(-12)} | {preview.deletionArc === 'between' ? preview.sequence.slice(preview.deletionPlan.cuts[0], preview.deletionPlan.cuts[0] + 12) : preview.sequence.slice(0, 12)}</code></div>
        </div> : <p className="crispr-junction-error" role="status">{result?.error}</p>}
      </>}
      <div className="sgrna-dialog-actions"><button type="button" onClick={onCancel}>Cancel</button><button type="button" disabled={hasCas12a && !preview} onClick={() => hasCas12a ? onExcise(arc, settings) : onExcise(arc)}>Excise region</button></div>
    </section>
  </div>
}
