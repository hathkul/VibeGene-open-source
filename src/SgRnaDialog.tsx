import { useEffect, useMemo, useRef, useState } from 'react'
import { SgRnaGuideScanValidation } from './SgRnaGuideScanValidation'
import type { GuideScanEvidence } from './domain/guidescan'
import { reverseComplement } from './domain/sequence'
import type { SequenceFeature } from './domain/types'
import {
  SGRNA_PRESETS,
  findSgRNATargets,
  groupSgRNAFeatures,
  type SgRNAAnnotation,
  type SgRNATargetHit,
} from './domain/sgrna'
import type { SequenceRecord, Strand } from './domain/types'

export type SgRnaDraft = {
  name: string
  nuclease: string
  pamMotif: string
  pamSide: '3prime' | '5prime'
  spacer: string
  hit: SgRNATargetHit
  existingId?: string
  /** GuideScan2 design or validation evidence to persist with the annotation. */
  guideScanEvidence?: GuideScanEvidence | null
}

function locationLabel(hit: SgRNATargetHit) {
  const coordinates = hit.guideLocations.map((part) => `${part.start + 1}–${part.end}`).join(' + ')
  return `${coordinates} · ${hit.strand === 'forward' ? '+' : '−'} strand · ${hit.pamSequence} PAM`
}

function sameSelectedRange(hit: SgRNATargetHit, selection: { start: number; end: number } | null) {
  return Boolean(selection && hit.guideLocations.length === 1
    && hit.guideLocations[0]?.start === selection.start
    && hit.guideLocations[0]?.end === selection.end)
}

export function SgRnaDialog({ record, selection, editing, onCancel, onSave }: {
  record: SequenceRecord
  selection: { start: number; end: number } | null
  selectedFeature?: SequenceFeature | null
  editing?: SgRNAAnnotation | null
  onCancel: () => void
  onSave: (draft: SgRnaDraft) => void
}) {
  const selectedBases = selection && selection.end > selection.start
    ? record.sequence.slice(selection.start, selection.end).toUpperCase()
    : ''
  const editingPreset = SGRNA_PRESETS.find((preset) => preset.id === editing?.nuclease)
  const initialPreset = editingPreset ?? SGRNA_PRESETS[0]
  const selectedGuideBases = selectedBases.length >= (initialPreset?.guideMinLength ?? 20)
    && selectedBases.length <= (initialPreset?.guideMaxLength ?? 20) ? selectedBases : ''
  const [name, setName] = useState(
    editing?.guide.name ?? `sgRNA ${groupSgRNAFeatures(record.features).length + 1}`,
  )
  const [presetId, setPresetId] = useState(editing ? (initialPreset?.id === editing.nuclease ? initialPreset.id : 'custom') : (initialPreset?.id ?? 'custom'))
  const [customName, setCustomName] = useState(editing?.nuclease ?? 'Custom nuclease')
  const [pamMotif, setPamMotif] = useState(editing?.pamMotif ?? initialPreset?.pamMotif ?? 'NGG')
  const [pamSide, setPamSide] = useState<'3prime' | '5prime'>(editing?.pamSide ?? initialPreset?.pamSide ?? '3prime')
  const [guideMinLength, setGuideMinLength] = useState(editing && !editingPreset ? editing.spacer.length : (initialPreset?.guideMinLength ?? 20))
  const [guideMaxLength, setGuideMaxLength] = useState(editing && !editingPreset ? editing.spacer.length : (initialPreset?.guideMaxLength ?? 20))
  const [selectedStrand, setSelectedStrand] = useState<Strand>('forward')
  const [spacer, setSpacer] = useState(editing?.spacer ?? selectedGuideBases)
  const [chosenHitKey, setChosenHitKey] = useState('')
  const [guideScanEvidence, setGuideScanEvidence] = useState<GuideScanEvidence | null>(
    editing?.guideScanEvidence ?? null,
  )

  const preset = SGRNA_PRESETS.find((candidate) => candidate.id === presetId)
  const nuclease = preset?.id ?? customName.trim()
  const motif = (preset?.pamMotif ?? pamMotif).toUpperCase().replace(/\s/g, '')
  const side = preset?.pamSide ?? pamSide
  const minLength = preset?.guideMinLength ?? guideMinLength
  const maxLength = preset?.guideMaxLength ?? guideMaxLength
  const normalizedSpacer = spacer.toUpperCase().replace(/\s/g, '')
  const result = useMemo(() => {
    try {
      return {
        hits: findSgRNATargets(record.sequence, normalizedSpacer, record.topology, {
          pamMotif: motif,
          pamSide: side,
          guideMinLength: minLength,
          guideMaxLength: maxLength,
        }),
        error: '',
      }
    } catch (error) {
      return { hits: [] as SgRNATargetHit[], error: error instanceof Error ? error.message : 'Invalid sgRNA target.' }
    }
  }, [record.sequence, record.topology, normalizedSpacer, motif, side, minLength, maxLength])
  const hits = selectedGuideBases && normalizedSpacer === (selectedStrand === 'forward' ? selectedGuideBases : reverseComplement(selectedGuideBases))
    ? result.hits.filter((hit) => sameSelectedRange(hit, selection) && hit.strand === selectedStrand)
    : result.hits
  const hitKey = (hit: SgRNATargetHit) => `${hit.strand}:${hit.guideStart}:${hit.pamStart}`
  const priorHit = editing ? hits.find((hit) => hit.guideLocations.every((part) =>
    editing.guide.locations.some((location) => location.start === part.start && location.end === part.end && location.strand === part.strand),
  )) : null
  const chosenHit = hits.find((hit) => hitKey(hit) === chosenHitKey) ?? priorHit ?? (hits.length === 1 ? hits[0] : null)
  const validName = name.trim().length > 0 && nuclease.length > 0
  const evidenceBindingKey = `${normalizedSpacer}|${presetId}|${nuclease}`
  const lastEvidenceBindingKeyRef = useRef(evidenceBindingKey)

  // Clear persisted scores only when spacer or nuclease actually changes after open.
  // Compare keys so React StrictMode's double effect does not wipe the initial value.
  useEffect(() => {
    if (lastEvidenceBindingKeyRef.current === evidenceBindingKey) return
    lastEvidenceBindingKeyRef.current = evidenceBindingKey
    setGuideScanEvidence(null)
  }, [evidenceBindingKey])

  return (
    <div className="translation-dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <section className="translation-dialog sgrna-dialog" role="dialog" aria-modal="true" aria-labelledby="sgrna-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
        <h3 id="sgrna-dialog-title">{editing ? 'Edit sgRNA' : 'Add sgRNA'}</h3>
        <p className="sgrna-dialog-help">Enter the guide sequence without its PAM. Green frames mark the guide; the thicker frame marks the adjacent PAM.</p>
        <label>Name<input value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>Nuclease
          <select value={presetId} onChange={(event) => {
            const nextId = event.target.value
            setPresetId(nextId)
            const next = SGRNA_PRESETS.find((candidate) => candidate.id === nextId)
            if (next) {
              setPamMotif(next.pamMotif)
              setPamSide(next.pamSide)
              setGuideMinLength(next.guideMinLength)
              setGuideMaxLength(next.guideMaxLength)
            }
            setChosenHitKey('')
          }}>
            {SGRNA_PRESETS.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.label}</option>)}
            <option value="custom">Custom</option>
          </select>
        </label>
        {!preset && <div className="sgrna-custom-fields">
          <label>Nuclease name<input value={customName} onChange={(event) => setCustomName(event.target.value)} /></label>
          <label>PAM motif<input value={pamMotif} onChange={(event) => setPamMotif(event.target.value.toUpperCase())} placeholder="NGG" spellCheck={false} /></label>
          <label>PAM location<select value={pamSide} onChange={(event) => setPamSide(event.target.value as '3prime' | '5prime')}><option value="3prime">3′ of guide</option><option value="5prime">5′ of guide</option></select></label>
          <label>Minimum guide length<input type="number" min={1} max={100} value={guideMinLength} onChange={(event) => setGuideMinLength(Number(event.target.value))} /></label>
          <label>Maximum guide length<input type="number" min={1} max={100} value={guideMaxLength} onChange={(event) => setGuideMaxLength(Number(event.target.value))} /></label>
        </div>}
        <label>Guide (5′→3′, no PAM)<input value={spacer} onChange={(event) => { setSpacer(event.target.value.toUpperCase().replace(/\s/g, '')); setChosenHitKey('') }} placeholder={`${minLength}${maxLength !== minLength ? `–${maxLength}` : ''} nt`} spellCheck={false} autoComplete="off" /></label>
        {selectedGuideBases && !editing && <fieldset className="sgrna-strand-choice"><legend>Selected DNA strand</legend>
          {(['forward', 'reverse'] as const).map((strand) => <label key={strand}><input type="radio" name="sgrna-strand" checked={selectedStrand === strand} onChange={() => { setSelectedStrand(strand); setSpacer(strand === 'forward' ? selectedGuideBases : reverseComplement(selectedGuideBases)); setChosenHitKey('') }} />{strand === 'forward' ? 'Forward (+)' : 'Reverse (−)'}</label>)}
        </fieldset>}
        <p className="sgrna-dialog-preview">{nuclease} · {minLength}{minLength === maxLength ? '' : `–${maxLength}`} nt guide · {motif || 'PAM required'} on the {side === '3prime' ? '3′' : '5′'} side</p>
        {normalizedSpacer && result.error ? <p className="sgrna-dialog-warning" role="alert">{result.error}</p> : normalizedSpacer && hits.length === 0 ? <p className="sgrna-dialog-warning" role="alert">No target with an adjacent matching PAM was found{selectedGuideBases ? ' at this selection' : ' in this sequence'}. Check the strand, guide, and PAM.</p> : null}
        {hits.length > 0 && <fieldset className="sgrna-hit-list"><legend>Target location{hits.length === 1 ? '' : 's'} ({hits.length})</legend>
          {hits.map((hit) => <label key={hitKey(hit)}><input type="radio" name="sgrna-hit" checked={chosenHit === hit} onChange={() => setChosenHitKey(hitKey(hit))} />{locationLabel(hit)}</label>)}
        </fieldset>}
        <SgRnaGuideScanValidation
          record={record}
          presetId={presetId}
          spacer={normalizedSpacer}
          persistedEvidence={guideScanEvidence}
          onEvidenceChange={setGuideScanEvidence}
        />
        <div className="sgrna-dialog-actions"><button type="button" onClick={onCancel}>Cancel</button><button type="button" disabled={!validName || !chosenHit} onClick={() => { if (chosenHit) onSave({ name: name.trim(), nuclease, pamMotif: motif, pamSide: side, spacer: normalizedSpacer, hit: chosenHit, existingId: editing?.id, guideScanEvidence }) }}>{editing ? 'Save sgRNA' : 'Add sgRNA'}</button></div>
      </section>
    </div>
  )
}
