import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import {
  PRIMER3_VERSION,
  Primer3InputError,
  parsePrimer3SettingsFile,
  formatPrimer3SettingsFile,
  type Primer3Pair,
  type Primer3Request,
  type Primer3Result,
  type Primer3SelectionMode,
  type Primer3Oligo,
} from './domain/primer3'
import { runPrimer3 } from './primer3/client'
import {
  PRIMER3_SETTINGS,
  primer3DefaultSettings,
  type Primer3SettingDef,
  type Primer3SettingGroup,
} from './domain/primer3/settingsCatalog'
import {
  loadPrimer3DialogState,
  persistedLibraryToSource,
  savePrimer3DialogState,
  type PersistedMisprimingLibrary,
} from './domain/primer3/settingsStorage'
import {
  SPECIFICITY_DATABASES,
  SPECIFICITY_MAX_WAIT_MS,
  SPECIFICITY_ORGANISMS,
  SPECIFICITY_WORD_SIZE,
  checkPrimerPairSpecificity,
  recommendFastSpecificitySearch,
  productRoles,
  specificitySearchSetLabel,
  type PairSpecificity,
  type PrimerBindingSite,
  type SpecificityDatabase,
  type SpecificityProductKind,
  type SpecificitySearchSet,
} from './domain/primer3/specificity'
import { toVibegenePrimers } from './domain/primer3/toVibegenePrimers'
import { PRIMER3_BUILTIN_LIBRARY_HUMREP } from './domain/primer3/types'
import type { Primer } from './domain/types'
import { saveTextAs } from './desktop/fileIo'
import { openExternalUrl } from './desktop/openExternalUrl'
import { useClampDialogToViewport } from './ui/useClampDialogToViewport'
import { DialogResizeGrip } from './ui/DialogResizeGrip'
import './PickPrimersDialog.css'

type PickPrimersDialogProps = {
  recordName: string
  sequence: string
  topology: 'linear' | 'circular'
  selection: { start: number; end: number }
  onCancel: () => void
  onAddPrimers: (primers: Primer[]) => void
}

type SettingsTab = Primer3SettingGroup | 'boulder'

const TAB_LABELS: Record<SettingsTab, string> = {
  sequence: 'Sequence',
  general: 'General',
  advanced: 'Advanced',
  internal: 'Internal oligo',
  penalties: 'Penalty weights',
  quality: 'Sequence quality',
  boulder: 'Boulder I/O',
}

const TOOLBAR_SETTING_TAGS = new Set([
  'PRIMER_TASK',
  'PRIMER_PICK_LEFT_PRIMER',
  'PRIMER_PICK_RIGHT_PRIMER',
  'PRIMER_PICK_INTERNAL_OLIGO',
  'PRIMER_NUM_RETURN',
])

const TASK_CHOICES =
  PRIMER3_SETTINGS.find((d) => d.tag === 'PRIMER_TASK')?.choices ?? []

const KNOWN_SETTING_TAGS = new Set(PRIMER3_SETTINGS.map((d) => d.tag))

function selectionLength(range: { start: number; end: number }, sequenceLength: number): number {
  if (range.end >= range.start) return range.end - range.start
  return sequenceLength - range.start + range.end
}

function formatSelectionSummary(
  range: { start: number; end: number },
  sequenceLength: number,
): string {
  const len = selectionLength(range, sequenceLength)
  const start1 = range.start + 1
  const endDisplay = range.end >= range.start ? range.end : `${range.end} (wrap)`
  return `Selection ${start1.toLocaleString()}–${typeof endDisplay === 'number' ? endDisplay.toLocaleString() : endDisplay} · ${len.toLocaleString()} bp`
}

function boolFromSetting(value: string | undefined, fallback: string): boolean {
  const v = value ?? fallback
  return v === '1' || v.toLowerCase() === 'true'
}

function settingFromBool(checked: boolean): string {
  return checked ? '1' : '0'
}

function diffFromDefaults(
  values: Record<string, string>,
  defaults: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [tag, value] of Object.entries(values)) {
    if (value === '' && defaults[tag] === '') continue
    if (value !== defaults[tag]) out[tag] = value
  }
  return out
}

function mergeSettings(
  persisted: Record<string, string>,
  defaults: Record<string, string>,
): Record<string, string> {
  return { ...defaults, ...persisted }
}

function resultsMode(result: Primer3Result | null, pickInternal: boolean): 'pairs' | 'lefts' | 'rights' | 'internals' {
  if (!result) return 'pairs'
  if (result.pairs.length > 0) return 'pairs'
  if (result.lefts.length > 0) return 'lefts'
  if (result.rights.length > 0) return 'rights'
  if (result.internals.length > 0 || pickInternal) return 'internals'
  return 'pairs'
}

function explainParts(result: Primer3Result): { key: string; text: string }[] {
  const parts: { key: string; text: string }[] = []
  if (result.explain.pair) parts.push({ key: 'pair', text: `Pairs: ${result.explain.pair}` })
  if (result.explain.left) parts.push({ key: 'left', text: `Left: ${result.explain.left}` })
  if (result.explain.right) parts.push({ key: 'right', text: `Right: ${result.explain.right}` })
  if (result.explain.internal) parts.push({ key: 'internal', text: `Internal: ${result.explain.internal}` })
  return parts
}

function explainSummaryFull(result: Primer3Result): string {
  return explainParts(result)
    .map((part) => part.text)
    .join(' · ')
}

function rowMemberOrder(def: Primer3SettingDef): number {
  const label = def.label.trim().toLowerCase()
  if (label === 'min' || def.tag.includes('_MIN_')) return 0
  if (label === 'opt' || def.tag.includes('_OPT_')) return 1
  if (label === 'max' || def.tag.includes('_MAX_')) return 2
  return 3
}

function sortRowMembers(defs: Primer3SettingDef[]): Primer3SettingDef[] {
  return defs
    .map((def, index) => ({ def, index }))
    .sort((a, b) => rowMemberOrder(a.def) - rowMemberOrder(b.def) || a.index - b.index)
    .map(({ def }) => def)
}

function isSequenceTag(tag: string): boolean {
  return tag.startsWith('SEQUENCE_')
}

const SETTING_BY_TAG = new Map(PRIMER3_SETTINGS.map((def) => [def.tag, def]))

function settingDisplayName(tag: string): string {
  const def = SETTING_BY_TAG.get(tag)
  if (!def) return tag
  return def.row ? `${def.section} ${def.label.toLowerCase()}` : def.label
}

function findSettingConflicts(changed: Record<string, string>): string[] {
  const issues: string[] = []
  const reported = new Set<string>()
  for (const [tag, value] of Object.entries(changed)) {
    if (!value) continue
    for (const other of SETTING_BY_TAG.get(tag)?.conflictsWith ?? []) {
      const key = [tag, other].sort().join('|')
      if (!changed[other] || reported.has(key)) continue
      reported.add(key)
      issues.push(`${settingDisplayName(tag)} and ${settingDisplayName(other)} cannot both be set; reset one of them.`)
    }
  }
  return issues
}

function rowSharedPrefix(defs: Primer3SettingDef[]): string {
  if (defs.length < 2) return ''
  const words = defs.map((def) => def.label.split(' '))
  const shared: string[] = []
  for (let i = 0; i < words[0]!.length - 1; i += 1) {
    if (!words.every((w) => w.length > i + 1 && w[i] === words[0]![i])) break
    shared.push(words[0]![i]!)
  }
  return shared.join(' ')
}

function isLibrarySection(sectionName: string, group: Primer3SettingGroup): boolean {
  if (group === 'general') return /mispriming/i.test(sectionName)
  if (group === 'internal') return /mishyb|mispriming|hybrid/i.test(sectionName)
  return false
}

function recordCoord1Based(recordStart: number): number {
  return recordStart + 1
}

function pairKey(pair: Primer3Pair): string {
  return `${pair.left?.sequence ?? ''}|${pair.right?.sequence ?? ''}`
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function specificityStatusText(status: string, rid: string, startedAt: number, now: number): string {
  const ridNote = rid ? ` (RID ${rid})` : ''
  const elapsed = startedAt ? ` · ${formatElapsed(now - startedAt)} elapsed` : ''
  if (status === 'SUBMITTING') return `Submitting primers to NCBI BLAST…${elapsed}`
  if (status === 'RETRIEVING') return `Retrieving BLAST hits${ridNote}…${elapsed}`
  if (status.startsWith('WAITING:')) {
    const [, rtoe, nextCheck, , phase] = status.split(':')
    const estimateMin = Math.max(1, Math.ceil((Number(rtoe) || 60) / 60))
    const untilCheck = Math.ceil((Number(nextCheck) - now) / 1000)
    const check = Number.isFinite(untilCheck) && untilCheck > 0 ? `next status check in ${untilCheck} s` : 'checking status…'
    const limit = ` (stops at ${SPECIFICITY_MAX_WAIT_MS / 60_000} min)`
    return `${phase ? `NCBI: ${phase}` : 'Queued at NCBI'}${ridNote}${elapsed}${startedAt ? limit : ''} · ${check} · NCBI estimated ~${estimateMin} min`
  }
  return status ? `NCBI status ${status}${ridNote}…${elapsed}` : ''
}

const FAST_SEARCH_NOTE =
  `Uses ${SPECIFICITY_WORD_SIZE.fast}-base BLAST seeds instead of ${SPECIFICITY_WORD_SIZE.full}, so NCBI finishes large searches ` +
  `(whole genomes, any organism) in minutes rather than hours. Binding sites with several scattered mismatches can be missed. ` +
  `Turned on automatically for RefSeq genomes and broad organism choices.`

const PRODUCT_KIND_LABELS: Record<SpecificityProductKind, string> = {
  exact: 'Exact',
  similar: 'Similar',
  offtarget: 'Off-target',
}

function productKindCounts(spec: PairSpecificity): Record<SpecificityProductKind, number> {
  const counts: Record<SpecificityProductKind, number> = { exact: 0, similar: 0, offtarget: 0 }
  for (const product of spec.products) counts[product.kind] += 1
  return counts
}

function productKindSummary(spec: PairSpecificity): string {
  const counts = productKindCounts(spec)
  return `${counts.exact} exact, ${counts.similar} similar, ${counts.offtarget} off-target`
}

function specificityVerdict(spec: PairSpecificity): { text: string; className: string } {
  const counts = productKindCounts(spec)
  if (spec.verdict === 'none') return { text: 'No products', className: 'is-none' }
  if (spec.verdict === 'offtarget') return { text: `${counts.offtarget} off-target`, className: 'is-offtarget' }
  if (counts.similar) return { text: `${counts.similar} similar`, className: 'is-similar' }
  return { text: `Specific · ${counts.exact}`, className: 'is-specific' }
}

function siteMismatches(site: PrimerBindingSite): string {
  return `${site.mismatches}/${site.threePrimeMismatches}`
}

function SpecificityDetails({ spec }: { spec: PairSpecificity }) {
  const subjects = new Set(spec.products.map((product) => product.accession)).size
  return (
    <div className="pick-primers-spec-detail">
      <p className="pick-primers-spec-summary">
        {specificitySearchSetLabel(spec.searchSet)}
        {spec.products.length > 0 &&
          ` · ${spec.products.length} product${spec.products.length === 1 ? '' : 's'} on ${subjects} sequence${subjects === 1 ? '' : 's'} (${productKindSummary(spec)})`}
        {` · priming sites: left ${spec.leftSites}, right ${spec.rightSites}`}
        {spec.truncated ? ' · list truncated' : ''}
        {spec.fastSearch && (
          <span className="pick-primers-spec-fast" title={FAST_SEARCH_NOTE}>
            {' · fast search: sites with several mismatches may be missing'}
          </span>
        )}
      </p>
      {spec.products.length ? (
        <div className="pick-primers-spec-table-scroll">
        <table className="pick-primers-spec-table">
          <thead>
            <tr>
              <th>Sequence</th>
              <th>Description</th>
              <th title="Primer on the forward strand + primer on the reverse strand">Primers</th>
              <th>Size</th>
              <th>Range</th>
              <th title="Forward-strand primer mismatches: total / within the last 5 bases at the 3′ end">Fwd mm</th>
              <th title="Reverse-strand primer mismatches: total / within the last 5 bases at the 3′ end">Rev mm</th>
              <th title="Exact: perfect primer matches at the Primer3 product size. Similar: left+right product within a few bp of that size, with tolerated mismatches. Off-target: any other product.">
                Kind
              </th>
            </tr>
          </thead>
          <tbody>
            {spec.products.map((product) => (
              <tr
                key={`${product.accession}:${product.start}:${product.end}:${productRoles(product)}`}
                className={`is-${product.kind}`}
              >
                <td>
                  <button
                    type="button"
                    className="pick-primers-link"
                    title={`Open ${product.accession} at NCBI`}
                    onClick={() => void openExternalUrl(`https://www.ncbi.nlm.nih.gov/nuccore/${encodeURIComponent(product.accession)}`)}
                  >
                    {product.accession}
                  </button>
                </td>
                <td className="pick-primers-spec-title" title={product.title}>
                  {product.title}
                </td>
                <td>{productRoles(product)}</td>
                <td>{product.size}</td>
                <td>
                  {product.start}–{product.end}
                </td>
                <td>{siteMismatches(product.forward.site)}</td>
                <td>{siteMismatches(product.reverse.site)}</td>
                <td>{PRODUCT_KIND_LABELS[product.kind]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      ) : (
        <p className="pick-primers-spec-summary">
          No amplicons predicted. The template may be absent from this collection (for example a synthetic construct).
        </p>
      )}
    </div>
  )
}

function SettingControl({
  def,
  value,
  defaultValue,
  onChange,
  layout = 'grid',
  showLabel = true,
}: {
  def: Primer3SettingDef
  value: string
  defaultValue: string
  onChange: (next: string) => void
  layout?: 'grid' | 'inline'
  showLabel?: boolean
}) {
  const modified = value !== defaultValue
  const disabled = Boolean(def.unsupported)
  const title = disabled ? `${def.help} (${def.unsupported})` : def.help
  const labelClass = modified ? 'pick-primers-setting-label pick-primers-modified-label' : 'pick-primers-setting-label'

  const control = (() => {
    if (def.kind === 'bool') {
      return (
        <label className={`pick-primers-bool-control ${modified ? 'is-modified' : ''}`} title={title}>
          <input
            type="checkbox"
            checked={boolFromSetting(value, defaultValue)}
            disabled={disabled}
            onChange={(e) => onChange(settingFromBool(e.target.checked))}
          />
          {layout === 'inline' && showLabel && <span className={labelClass}>{def.label}</span>}
        </label>
      )
    }

    if (def.kind === 'choice' && def.choices) {
      return (
        <select
          className="pick-primers-select-input"
          value={value || defaultValue}
          disabled={disabled}
          title={title}
          onChange={(e) => onChange(e.target.value)}
        >
          {def.choices.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      )
    }

    const inputType = def.kind === 'int' || def.kind === 'float' ? 'number' : 'text'
    const className =
      def.kind === 'sequence'
        ? 'pick-primers-seq-input'
        : def.kind === 'coordinates' || def.kind === 'sizeRangeList' || def.kind === 'text'
          ? 'pick-primers-text-input'
          : 'pick-primers-num-input'

    return (
      <input
        type={inputType}
        className={className}
        value={value}
        disabled={disabled}
        step={def.step}
        title={title}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  })()

  if (layout === 'inline') {
    return (
      <span className={`pick-primers-inline-control ${modified ? 'is-modified' : ''}`} title={title}>
        {showLabel && <span className={labelClass}>{def.label}</span>}
        {control}
      </span>
    )
  }

  if (def.kind === 'bool') {
    return (
      <>
        <span className={labelClass} title={title}>
          {def.label}
        </span>
        <div className="pick-primers-setting-control">{control}</div>
      </>
    )
  }

  return (
    <>
      <span className={labelClass} title={title}>
        {def.label}
        {def.unit ? ` (${def.unit})` : ''}
      </span>
      <div className={`pick-primers-setting-control ${modified ? 'is-modified' : ''}`}>{control}</div>
    </>
  )
}

export function PickPrimersDialog({
  recordName,
  sequence,
  topology,
  selection,
  onCancel,
  onAddPrimers,
}: PickPrimersDialogProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const misFileRef = useRef<HTMLInputElement | null>(null)
  const mishybFileRef = useRef<HTMLInputElement | null>(null)
  const importFileRef = useRef<HTMLInputElement | null>(null)
  const runAbortRef = useRef<AbortController | null>(null)

  useClampDialogToViewport(dialogRef, 16)

  const defaults = useMemo(() => primer3DefaultSettings(), [])
  const catalogByGroup = useMemo(() => {
    const map = new Map<Primer3SettingGroup, Primer3SettingDef[]>()
    for (const def of PRIMER3_SETTINGS) {
      if (TOOLBAR_SETTING_TAGS.has(def.tag)) continue
      const list = map.get(def.group) ?? []
      list.push(def)
      map.set(def.group, list)
    }
    return map
  }, [])

  const [activeTab, setActiveTab] = useState<SettingsTab>('general')
  const [selectionMode, setSelectionMode] = useState<Primer3SelectionMode>(
    () => loadPrimer3DialogState().selectionMode,
  )
  const [settings, setSettings] = useState<Record<string, string>>(() =>
    mergeSettings(loadPrimer3DialogState().settings, defaults),
  )
  const [sequenceTags, setSequenceTags] = useState<Record<string, string>>(() => {
    const seqDefaults: Record<string, string> = {}
    for (const def of PRIMER3_SETTINGS) {
      if (isSequenceTag(def.tag)) seqDefaults[def.tag] = def.defaultValue
    }
    return seqDefaults
  })
  const [misprimingLibrary, setMisprimingLibrary] = useState<PersistedMisprimingLibrary>(
    () => loadPrimer3DialogState().misprimingLibrary,
  )
  const [internalMishybLibrary, setInternalMishybLibrary] = useState<PersistedMisprimingLibrary>(
    () => loadPrimer3DialogState().internalMishybLibrary,
  )
  const [customMisName, setCustomMisName] = useState('')
  const [customMishybName, setCustomMishybName] = useState('')

  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<Primer3Result | null>(null)
  const [stale, setStale] = useState(false)
  const [status, setStatus] = useState('')
  const [inputError, setInputError] = useState<string[] | null>(null)
  const [checkedRanks, setCheckedRanks] = useState<Set<number>>(new Set())
  const [settingsRevision, setSettingsRevision] = useState(0)
  const [lastRunRevision, setLastRunRevision] = useState<number | null>(null)
  const [pane, setPane] = useState<'configure' | 'results'>('configure')
  const [searchSet, setSearchSet] = useState<SpecificitySearchSet>(() => loadPrimer3DialogState().specificitySearchSet)
  const [fastSearch, setFastSearch] = useState(() => loadPrimer3DialogState().specificityFastSearch)
  const [customOrganism, setCustomOrganism] = useState(
    () => searchSet.organism !== '' && !SPECIFICITY_ORGANISMS.some((entry) => entry.taxId === searchSet.organism),
  )
  const [specificity, setSpecificity] = useState<Map<string, PairSpecificity>>(() => new Map())
  const [expandedPairs, setExpandedPairs] = useState<Set<string>>(() => new Set())
  const [specBusy, setSpecBusy] = useState(false)
  const [specStatus, setSpecStatus] = useState('')
  const [specRid, setSpecRid] = useState('')
  const [specStartedAt, setSpecStartedAt] = useState(0)
  const [specNow, setSpecNow] = useState(0)
  const specAbortRef = useRef<AbortController | null>(null)

  const task = settings.PRIMER_TASK || defaults.PRIMER_TASK || 'pick_pcr_primers'
  const numReturn = settings.PRIMER_NUM_RETURN ?? defaults.PRIMER_NUM_RETURN
  const pickLeft = boolFromSetting(settings.PRIMER_PICK_LEFT_PRIMER, defaults.PRIMER_PICK_LEFT_PRIMER)
  const pickRight = boolFromSetting(settings.PRIMER_PICK_RIGHT_PRIMER, defaults.PRIMER_PICK_RIGHT_PRIMER)
  const pickInternal = boolFromSetting(settings.PRIMER_PICK_INTERNAL_OLIGO, defaults.PRIMER_PICK_INTERNAL_OLIGO)

  const markStale = useCallback(() => {
    setSettingsRevision((r) => r + 1)
    setStale(true)
  }, [])

  const updateSetting = useCallback(
    (tag: string, value: string) => {
      setSettings((prev) => ({ ...prev, [tag]: value }))
      markStale()
    },
    [markStale],
  )

  const updateSequenceTag = useCallback(
    (tag: string, value: string) => {
      setSequenceTags((prev) => ({ ...prev, [tag]: value }))
      markStale()
    },
    [markStale],
  )

  const persistState = useCallback(() => {
    savePrimer3DialogState({
      settings: diffFromDefaults(settings, defaults),
      selectionMode,
      misprimingLibrary,
      internalMishybLibrary,
      specificitySearchSet: searchSet,
      specificityFastSearch: fastSearch,
    })
  }, [settings, defaults, selectionMode, misprimingLibrary, internalMishybLibrary, searchSet, fastSearch])

  const changeSearchSet = (next: SpecificitySearchSet) => {
    setSearchSet(next)
    setFastSearch(recommendFastSpecificitySearch(next))
  }

  useEffect(() => () => specAbortRef.current?.abort(), [])

  useEffect(() => {
    if (!specBusy) return
    const timer = window.setInterval(() => setSpecNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [specBusy])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  const buildRequest = useCallback((): Primer3Request => {
    const prSettings = diffFromDefaults(settings, defaults)
    const seqOut: Record<string, string> = {}
    for (const [tag, value] of Object.entries(sequenceTags)) {
      if (value && value !== defaults[tag]) seqOut[tag] = value
    }
    return {
      context: {
        sequence,
        topology,
        selection,
        mode: selectionMode,
        name: recordName,
      },
      settings: prSettings,
      sequenceTags: seqOut,
      misprimingLibrary: persistedLibraryToSource(misprimingLibrary),
      internalMishybLibrary: persistedLibraryToSource(internalMishybLibrary),
    }
  }, [
    settings,
    defaults,
    sequenceTags,
    sequence,
    topology,
    selection,
    selectionMode,
    recordName,
    misprimingLibrary,
    internalMishybLibrary,
  ])

  const runPick = async () => {
    if (running) {
      runAbortRef.current?.abort()
      return
    }
    setInputError(null)
    setStatus('Running Primer3…')
    const controller = new AbortController()
    runAbortRef.current = controller
    setRunning(true)
    try {
      const request = buildRequest()
      const conflicts = findSettingConflicts({ ...request.settings, ...request.sequenceTags })
      if (conflicts.length) throw new Primer3InputError(conflicts)
      const next = await runPrimer3(request, { signal: controller.signal })
      setResult(next)
      setStale(false)
      setLastRunRevision(settingsRevision)
      const mode = resultsMode(next, pickInternal)
      const firstRank =
        mode === 'pairs'
          ? next.pairs[0]?.rank
          : mode === 'lefts'
            ? next.lefts[0]?.rank
            : mode === 'rights'
              ? next.rights[0]?.rank
              : next.internals[0]?.rank
      setCheckedRanks(firstRank != null ? new Set([firstRank]) : new Set())
      setStatus(`Found ${next.pairs.length || next.lefts.length || next.rights.length || next.internals.length} result row(s).`)
      setPane('results')
      persistState()
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setStatus('Cancelled.')
      } else if (error instanceof Primer3InputError) {
        setInputError(error.issues)
        setStatus('Input error.')
        setPane('configure')
      } else {
        setStatus(error instanceof Error ? error.message : 'Primer3 failed.')
      }
    } finally {
      setRunning(false)
      runAbortRef.current = null
    }
  }

  const resetTab = (group: Primer3SettingGroup) => {
    setSettings((prev) => {
      const next = { ...prev }
      for (const def of PRIMER3_SETTINGS) {
        if (def.group === group) next[def.tag] = defaults[def.tag]
      }
      return next
    })
    if (PRIMER3_SETTINGS.some((def) => def.group === group && isSequenceTag(def.tag))) {
      setSequenceTags((prev) => {
        const next = { ...prev }
        for (const def of PRIMER3_SETTINGS) {
          if (def.group === group && isSequenceTag(def.tag)) next[def.tag] = defaults[def.tag]
        }
        return next
      })
    }
    markStale()
  }

  const resetAll = () => {
    setSettings({ ...defaults })
    const seq: Record<string, string> = {}
    for (const def of PRIMER3_SETTINGS) {
      if (isSequenceTag(def.tag)) seq[def.tag] = def.defaultValue
    }
    setSequenceTags(seq)
    markStale()
  }

  const handleImportSettings = async (file: File) => {
    const text = await file.text()
    const imported = parsePrimer3SettingsFile(text)
    const unknown: string[] = []
    setSettings((prev) => {
      const next = { ...prev }
      for (const [tag, value] of Object.entries(imported)) {
        if (KNOWN_SETTING_TAGS.has(tag)) next[tag] = value
        else unknown.push(tag)
      }
      return next
    })
    markStale()
    setStatus(
      unknown.length
        ? `Imported settings; ignored unknown tags: ${unknown.join(', ')}`
        : 'Imported settings.',
    )
  }

  const handleExportSettings = async () => {
    const tags = { ...diffFromDefaults(settings, defaults) }
    const text = formatPrimer3SettingsFile(tags)
    await saveTextAs('primer3_settings.txt', text)
    setStatus('Exported settings file.')
  }

  const renderLibrarySelector = (
    label: string,
    value: PersistedMisprimingLibrary,
    onChange: (next: PersistedMisprimingLibrary) => void,
    fileRef: RefObject<HTMLInputElement | null>,
    customName: string,
    onCustomName: (name: string) => void,
  ) => {
    const selectValue =
      value.kind === 'none' ? 'none' : value.kind === 'builtin' ? 'builtin' : 'custom'
    return (
      <div className="pick-primers-library-row">
        <span className="pick-primers-setting-label">{label}</span>
        <div className="pick-primers-setting-control">
          <select
            className="pick-primers-library-select"
            value={selectValue}
            onChange={(e) => {
              const v = e.target.value
              if (v === 'none') onChange({ kind: 'none' })
              else if (v === 'builtin') onChange({ kind: 'builtin', id: PRIMER3_BUILTIN_LIBRARY_HUMREP })
              else fileRef.current?.click()
              markStale()
            }}
          >
            <option value="none">None</option>
            <option value="builtin">Human repeats &amp; simple (built-in)</option>
            <option value="custom">Custom FASTA…</option>
          </select>
          {value.kind === 'custom' && (
            <span className="pick-primers-library-file" title={value.name}>
              {customName || value.name}
            </span>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".fa,.fasta,.txt"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (!file) return
              const fasta = await file.text()
              onCustomName(file.name)
              onChange({ kind: 'custom', name: file.name, fasta })
              markStale()
            }}
          />
        </div>
      </div>
    )
  }

  const renderLibraryForGroup = (group: Primer3SettingGroup) => {
    if (group === 'general') {
      return renderLibrarySelector(
        'Mispriming library',
        misprimingLibrary,
        setMisprimingLibrary,
        misFileRef,
        customMisName,
        setCustomMisName,
      )
    }
    if (group === 'internal') {
      return renderLibrarySelector(
        'Internal mishyb library',
        internalMishybLibrary,
        setInternalMishybLibrary,
        mishybFileRef,
        customMishybName,
        setCustomMishybName,
      )
    }
    return null
  }

  const renderSettingsGroup = (group: Primer3SettingGroup) => {
    const defs = catalogByGroup.get(group) ?? []
    const sections = new Map<string, Primer3SettingDef[]>()
    for (const def of defs) {
      const list = sections.get(def.section) ?? []
      list.push(def)
      sections.set(def.section, list)
    }
    const sectionEntries = [...sections.entries()]
    const librarySectionIndex = sectionEntries.findIndex(([sectionName]) => isLibrarySection(sectionName, group))
    const libraryBlock = renderLibraryForGroup(group)
    let libraryPlaced = false

    return (
      <div className="pick-primers-tab-panel">
        <div className="pick-primers-sections-grid">
          {librarySectionIndex < 0 && libraryBlock && (
            <section className="pick-primers-section pick-primers-section-library">{libraryBlock}</section>
          )}
          {sectionEntries.map(([section, sectionDefs], sectionIndex) => {
            const items: (Primer3SettingDef | { rowId: string; defs: Primer3SettingDef[] })[] = []
            const rows = new Map<string, Primer3SettingDef[]>()
            for (const def of sectionDefs) {
              if (!def.row) {
                items.push(def)
                continue
              }
              const list = rows.get(def.row)
              if (list) {
                list.push(def)
              } else {
                const defs = [def]
                rows.set(def.row, defs)
                items.push({ rowId: def.row, defs })
              }
            }
            const showLibraryHere = libraryBlock && sectionIndex === librarySectionIndex
            if (showLibraryHere) libraryPlaced = true
            return (
              <section key={section} className="pick-primers-section">
                <h4 className="pick-primers-section-title">{section}</h4>
                <div className="pick-primers-section-grid">
                  {showLibraryHere && libraryBlock}
                  {items.map((item) => {
                    if (!('rowId' in item)) {
                      const def = item
                      return (
                        <SettingControl
                          key={def.tag}
                          def={def}
                          value={isSequenceTag(def.tag) ? sequenceTags[def.tag] ?? '' : settings[def.tag] ?? ''}
                          defaultValue={defaults[def.tag] ?? ''}
                          onChange={(v) =>
                            isSequenceTag(def.tag) ? updateSequenceTag(def.tag, v) : updateSetting(def.tag, v)
                          }
                        />
                      )
                    }
                    const { rowId } = item
                    const ordered = sortRowMembers(item.defs)
                    const unit = ordered.find((def) => def.unit)?.unit
                    const prefix = rowSharedPrefix(ordered)
                    return (
                      <div key={rowId} className="pick-primers-triplet-row">
                        {prefix && <span className="pick-primers-setting-label">{prefix}</span>}
                        <div className="pick-primers-triplet-controls">
                          {ordered.map((def) => (
                            <SettingControl
                              key={def.tag}
                              def={prefix ? { ...def, label: def.label.slice(prefix.length).trim() } : def}
                              layout="inline"
                              value={settings[def.tag] ?? ''}
                              defaultValue={defaults[def.tag] ?? ''}
                              onChange={(v) => updateSetting(def.tag, v)}
                            />
                          ))}
                          {unit && <span className="pick-primers-unit">{unit}</span>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })}
          {!libraryPlaced && libraryBlock && (
            <section className="pick-primers-section pick-primers-section-library">{libraryBlock}</section>
          )}
        </div>
      </div>
    )
  }

  const isSettingsTab = activeTab !== 'boulder'

  const mode = resultsMode(result, pickInternal)
  const showProbeCol =
    pickInternal &&
    result != null &&
    (result.pairs.some((p: Primer3Pair) => p.internal) || result.internals.length > 0)

  const toggleRank = (rank: number) => {
    setCheckedRanks((prev) => {
      const next = new Set(prev)
      if (next.has(rank)) next.delete(rank)
      else next.add(rank)
      return next
    })
  }

  const visibleRanks = !result
    ? []
    : mode === 'pairs'
      ? result.pairs.map((pair) => pair.rank)
      : (mode === 'lefts' ? result.lefts : mode === 'rights' ? result.rights : result.internals).map(
          (oligo) => oligo.rank,
        )
  const checkedVisibleCount = visibleRanks.filter((rank) => checkedRanks.has(rank)).length
  const allChecked = visibleRanks.length > 0 && checkedVisibleCount === visibleRanks.length

  const setAllChecked = (checked: boolean) => {
    setCheckedRanks(checked ? new Set(visibleRanks) : new Set())
  }

  const checkedPairs = mode === 'pairs' && result
    ? result.pairs.filter((pair) => checkedRanks.has(pair.rank) && pair.left && pair.right)
    : []
  const hasSpecificity = mode === 'pairs' && !!result?.pairs.some((pair) => specificity.has(pairKey(pair)))
  const specStatusText = specBusy ? specificityStatusText(specStatus, specRid, specStartedAt, specNow) : ''

  const checkSpecificity = async () => {
    if (specBusy) {
      specAbortRef.current?.abort()
      return
    }
    if (!checkedPairs.length) return
    const controller = new AbortController()
    specAbortRef.current = controller
    setSpecBusy(true)
    setSpecRid('')
    setSpecStatus('SUBMITTING')
    const startedAt = Date.now()
    setSpecStartedAt(startedAt)
    setSpecNow(startedAt)
    persistState()
    try {
      const checked = await checkPrimerPairSpecificity(
        checkedPairs.map((pair) => ({
          key: pairKey(pair),
          left: pair.left!.sequence,
          right: pair.right!.sequence,
          productSize: pair.productSize,
        })),
        searchSet,
        {
          signal: controller.signal,
          fast: fastSearch,
          onStatus: (next) => {
            if (next.startsWith('RID:')) setSpecRid(next.slice(4))
            else setSpecStatus(next)
            setSpecNow(Date.now())
          },
        },
      )
      setSpecificity((prev) => {
        const next = new Map(prev)
        for (const entry of checked) next.set(entry.key, entry)
        return next
      })
      if (checked.length === 1) setExpandedPairs((prev) => new Set(prev).add(checked[0]!.key))
      setStatus(
        `Checked specificity of ${checked.length} pair${checked.length === 1 ? '' : 's'} against ${specificitySearchSetLabel(searchSet)}.`,
      )
    } catch (error: unknown) {
      setStatus(
        error instanceof DOMException && error.name === 'AbortError'
          ? 'Specificity check cancelled.'
          : `Specificity check failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    } finally {
      setSpecBusy(false)
      setSpecStatus('')
      specAbortRef.current = null
    }
  }

  const togglePairDetails = (key: string) => {
    setExpandedPairs((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const resultColumnCount =
    2 + (hasSpecificity ? 1 : 0) + (mode === 'pairs' ? 10 : 5) + (showProbeCol && mode === 'pairs' ? 2 : 0) + (mode === 'pairs' ? 1 : 0) + 1

  const handleAdd = () => {
    if (!result || checkedRanks.size === 0) return
    const primers = toVibegenePrimers(recordName, result, {
      mode,
      ranks: [...checkedRanks],
    })
    persistState()
    onAddPrimers(primers)
  }

  const handleClose = () => {
    persistState()
    onCancel()
  }

  const isStale = stale || (lastRunRevision != null && lastRunRevision !== settingsRevision)

  return (
    <div className="translation-dialog-backdrop pick-primers-backdrop" role="presentation" onMouseDown={handleClose}>
      <div
        ref={dialogRef}
        className="translation-dialog pick-primers-dialog compact-scientific-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pick-primers-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="pick-primers-header" data-dialog-drag-handle>
          <h3 id="pick-primers-title">Pick Primers — Primer3 {PRIMER3_VERSION}</h3>
          <div className="pick-primers-pane-tabs" role="tablist" aria-label="Dialog view">
            <button
              type="button"
              role="tab"
              aria-selected={pane === 'configure'}
              className={pane === 'configure' ? 'is-active' : undefined}
              onClick={() => setPane('configure')}
            >
              Configure
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={pane === 'results'}
              className={pane === 'results' ? 'is-active' : undefined}
              onClick={() => setPane('results')}
            >
              {result ? `Results (${visibleRanks.length})` : 'Results'}
              {result && isStale && <span className="pick-primers-pane-stale" title="Settings changed since this run"> •</span>}
            </button>
          </div>
        </header>

        {pane === 'configure' && (
        <div className="pick-primers-toolbar">
          <span className="pick-primers-selection-summary">{formatSelectionSummary(selection, sequence.length)}</span>
          <fieldset className="pick-primers-radio-group">
            <legend className="pick-primers-sr-only">Use selection as</legend>
            <span className="pick-primers-toolbar-label">Use selection as</span>
            {(
              [
                ['template', 'Template'],
                ['target', 'Target (flank it)'],
                ['included', 'Included region'],
              ] as const
            ).map(([modeKey, label]) => (
              <label key={modeKey} className="pick-primers-inline-radio">
                <input
                  type="radio"
                  name="pick-primers-selection-mode"
                  checked={selectionMode === modeKey}
                  onChange={() => {
                    setSelectionMode(modeKey)
                    markStale()
                  }}
                />
                {label}
              </label>
            ))}
          </fieldset>
          <div className="pick-primers-toolbar-group">
            <label className="pick-primers-toolbar-field">
              <span>Task</span>
              <select
                value={task || 'pick_pcr_primers'}
                onChange={(e) => updateSetting('PRIMER_TASK', e.target.value)}
              >
                {TASK_CHOICES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="pick-primers-inline-check">
              <input
                type="checkbox"
                checked={pickLeft}
                onChange={(e) => updateSetting('PRIMER_PICK_LEFT_PRIMER', settingFromBool(e.target.checked))}
              />
              Left
            </label>
            <label className="pick-primers-inline-check">
              <input
                type="checkbox"
                checked={pickInternal}
                onChange={(e) => updateSetting('PRIMER_PICK_INTERNAL_OLIGO', settingFromBool(e.target.checked))}
              />
              Internal (probe)
            </label>
            <label className="pick-primers-inline-check">
              <input
                type="checkbox"
                checked={pickRight}
                onChange={(e) => updateSetting('PRIMER_PICK_RIGHT_PRIMER', settingFromBool(e.target.checked))}
              />
              Right
            </label>
            <label className="pick-primers-toolbar-field pick-primers-num-return">
              <span>Return</span>
              <input
                type="number"
                min={1}
                max={100}
                value={numReturn}
                onChange={(e) => updateSetting('PRIMER_NUM_RETURN', e.target.value)}
              />
            </label>
            <button type="button" className="primary pick-primers-run" onClick={() => void runPick()}>
              {running ? 'Cancel run' : 'Pick Primers'}
            </button>
          </div>
        </div>
        )}

        <div className="pick-primers-body">
          {pane === 'configure' && (
          <div className="pick-primers-settings-pane">
            {inputError && (
              <ul className="pick-primers-error-list">
                {inputError.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            )}
            <div className="pick-primers-tabs-row">
              <div className="pick-primers-tabs" role="tablist">
                {(Object.keys(TAB_LABELS) as SettingsTab[]).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === tab}
                    className={activeTab === tab ? 'is-active' : undefined}
                    onClick={() => setActiveTab(tab)}
                  >
                    {TAB_LABELS[tab]}
                  </button>
                ))}
              </div>
              {isSettingsTab && (
                <div className="pick-primers-tab-actions">
                  <button type="button" className="pick-primers-link" onClick={() => resetTab(activeTab)}>
                    Reset tab
                  </button>
                  <span className="pick-primers-tab-actions-sep" aria-hidden>
                    ·
                  </span>
                  <button type="button" className="pick-primers-link" onClick={resetAll}>
                    Reset all
                  </button>
                  {isSettingsTab && (
                    <>
                      <span className="pick-primers-tab-actions-sep" aria-hidden>
                        ·
                      </span>
                      <button type="button" className="pick-primers-link" onClick={() => importFileRef.current?.click()}>
                        Import settings…
                      </button>
                      <span className="pick-primers-tab-actions-sep" aria-hidden>
                        ·
                      </span>
                      <button type="button" className="pick-primers-link" onClick={() => void handleExportSettings()}>
                        Export settings…
                      </button>
                      <input
                        ref={importFileRef}
                        type="file"
                        accept=".txt"
                        hidden
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          e.target.value = ''
                          if (file) void handleImportSettings(file)
                        }}
                      />
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="pick-primers-tab-content">
              {activeTab === 'boulder' ? (
                <div className="pick-primers-boulder-panel">
                  <label>
                    Input sent
                    <textarea readOnly value={result?.input ?? ''} spellCheck={false} />
                    <button
                      type="button"
                      onClick={() => result?.input && void navigator.clipboard.writeText(result.input)}
                    >
                      Copy
                    </button>
                  </label>
                  <label>
                    Raw output
                    <textarea readOnly value={result?.output ?? ''} spellCheck={false} />
                    <button
                      type="button"
                      onClick={() => result?.output && void navigator.clipboard.writeText(result.output)}
                    >
                      Copy
                    </button>
                  </label>
                </div>
              ) : (
                // Library file inputs attach refs; panel is not a separate component to keep tab layout local.
                // eslint-disable-next-line react-hooks/refs -- refs are only used from event handlers inside the panel.
                renderSettingsGroup(activeTab)
              )}
            </div>
          </div>
          )}

          {pane === 'results' && (
          <div className={`pick-primers-results-pane ${isStale ? 'is-stale' : ''}`}>
            {!result && (
              <p className="pick-primers-results-empty">No results yet. Set up the search in Configure and press Pick Primers.</p>
            )}
            {result && (
              <p className="pick-primers-explain" title={explainSummaryFull(result)}>
                {explainParts(result).map((part, index) => (
                  <span key={part.key}>
                    {index > 0 ? ' · ' : ''}
                    {part.text}
                  </span>
                ))}
                {result.warnings.length > 0 && (
                  <span className="pick-primers-warn"> · {result.warnings.join(' · ')}</span>
                )}
                {result.errors.length > 0 && (
                  <span className="pick-primers-error-inline"> · {result.errors.join(' · ')}</span>
                )}
              </p>
            )}
            {isStale && result && (
              <p className="pick-primers-stale-note">
                Settings changed since this run.{' '}
                <button type="button" className="pick-primers-link" onClick={() => void runPick()} disabled={running}>
                  {running ? 'Running…' : 'Pick again'}
                </button>
              </p>
            )}
            {mode === 'pairs' && (checkedPairs.length > 0 || specBusy) && (
              <div className="pick-primers-spec-toolbar">
                <span className="pick-primers-spec-heading">Specificity</span>
                <select
                  className="pick-primers-spec-database"
                  aria-label="Sequence collection"
                  title="Sequence collection searched with BLAST"
                  value={searchSet.database}
                  disabled={specBusy}
                  onChange={(e) => changeSearchSet({ ...searchSet, database: e.target.value as SpecificityDatabase })}
                >
                  {SPECIFICITY_DATABASES.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.label}
                    </option>
                  ))}
                </select>
                <select
                  className="pick-primers-spec-organism"
                  aria-label="Organism"
                  title="Restrict BLAST hits to this organism"
                  value={customOrganism ? 'custom' : searchSet.organism}
                  disabled={specBusy}
                  onChange={(e) => {
                    const value = e.target.value
                    setCustomOrganism(value === 'custom')
                    changeSearchSet({ ...searchSet, organism: value === 'custom' ? '' : value })
                  }}
                >
                  {SPECIFICITY_ORGANISMS.map((entry) => (
                    <option key={entry.taxId} value={entry.taxId}>
                      {entry.label}
                    </option>
                  ))}
                  <option value="">Any organism</option>
                  <option value="custom">Other (name or taxid)…</option>
                </select>
                {customOrganism && (
                  <input
                    type="text"
                    className="pick-primers-spec-custom"
                    aria-label="Organism name or taxonomy ID"
                    placeholder="Name or taxid"
                    value={searchSet.organism}
                    disabled={specBusy}
                    onChange={(e) => setSearchSet((prev) => ({ ...prev, organism: e.target.value }))}
                  />
                )}
                <label className="pick-primers-inline-check" title={FAST_SEARCH_NOTE}>
                  <input
                    type="checkbox"
                    checked={fastSearch}
                    disabled={specBusy}
                    onChange={(e) => setFastSearch(e.target.checked)}
                  />
                  Fast search
                </label>
                <button type="button" onClick={() => void checkSpecificity()}>
                  {specBusy ? 'Cancel check' : `Check specificity (${checkedPairs.length})`}
                </button>
                {specBusy ? (
                  <span className="pick-primers-spec-status" title={specStatusText}>
                    {specStatusText}
                  </span>
                ) : !fastSearch && recommendFastSpecificitySearch(searchSet) ? (
                  <span className="pick-primers-spec-status is-warning" title={FAST_SEARCH_NOTE}>
                    Large search: can take many minutes at NCBI; consider Fast search
                  </span>
                ) : null}
              </div>
            )}
            {result && (
            <div className="pick-primers-results-scroll">
              <table className="pick-primers-results-table">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        aria-label={allChecked ? 'Uncheck all' : 'Check all'}
                        title={allChecked ? 'Uncheck all' : 'Check all'}
                        checked={allChecked}
                        disabled={visibleRanks.length === 0}
                        ref={(el) => {
                          if (el) el.indeterminate = checkedVisibleCount > 0 && !allChecked
                        }}
                        onChange={() => setAllChecked(!allChecked)}
                      />
                    </th>
                    <th>#</th>
                    {hasSpecificity && <th>Specificity</th>}
                    {mode === 'pairs' || mode === 'lefts' ? (
                      <>
                        <th>Left primer</th>
                        <th>Start</th>
                        <th>Len</th>
                        <th>Tm</th>
                        <th>GC%</th>
                      </>
                    ) : null}
                    {mode === 'pairs' || mode === 'rights' ? (
                      <>
                        <th>Right primer</th>
                        <th>Start</th>
                        <th>Len</th>
                        <th>Tm</th>
                        <th>GC%</th>
                      </>
                    ) : null}
                    {mode === 'internals' ? (
                      <>
                        <th>Probe</th>
                        <th>Start</th>
                        <th>Len</th>
                        <th>Tm</th>
                        <th>GC%</th>
                      </>
                    ) : null}
                    {showProbeCol && mode === 'pairs' ? (
                      <>
                        <th>Probe</th>
                        <th>Tm</th>
                      </>
                    ) : null}
                    {mode === 'pairs' ? <th>Product (bp)</th> : null}
                    <th>Penalty</th>
                  </tr>
                </thead>
                <tbody>
                  {mode === 'pairs' &&
                    result?.pairs.map((pair: Primer3Pair) => {
                      const key = pairKey(pair)
                      const spec = specificity.get(key)
                      const expanded = !!spec && expandedPairs.has(key)
                      const verdict = spec ? specificityVerdict(spec) : null
                      return (
                      <Fragment key={pair.rank}>
                      <tr className={expanded ? 'is-expanded' : undefined}>
                        <td>
                          <input
                            type="checkbox"
                            checked={checkedRanks.has(pair.rank)}
                            onChange={() => toggleRank(pair.rank)}
                          />
                        </td>
                        <td>{pair.rank + 1}</td>
                        {hasSpecificity && (
                          <td>
                            {spec && verdict && (
                              <button
                                type="button"
                                className={`pick-primers-spec-toggle ${verdict.className}`}
                                aria-expanded={expanded}
                                title={`${specificitySearchSetLabel(spec.searchSet)}: ${productKindSummary(spec)}. Click to ${expanded ? 'hide' : 'show'} products.`}
                                onClick={() => togglePairDetails(key)}
                              >
                                <span className="pick-primers-spec-caret" aria-hidden>
                                  {expanded ? '▾' : '▸'}
                                </span>
                                {verdict.text}
                              </button>
                            )}
                          </td>
                        )}
                        <td className="pick-primers-seq" title={pair.left?.sequence}>
                          {pair.left?.sequence ?? '—'}
                        </td>
                        <td>{pair.left ? recordCoord1Based(pair.left.recordStart) : '—'}</td>
                        <td>{pair.left?.length ?? '—'}</td>
                        <td>{pair.left ? pair.left.tm.toFixed(1) : '—'}</td>
                        <td>{pair.left ? Math.round(pair.left.gcPercent) : '—'}</td>
                        <td className="pick-primers-seq" title={pair.right?.sequence}>
                          {pair.right?.sequence ?? '—'}
                        </td>
                        <td>{pair.right ? recordCoord1Based(pair.right.recordStart) : '—'}</td>
                        <td>{pair.right?.length ?? '—'}</td>
                        <td>{pair.right ? pair.right.tm.toFixed(1) : '—'}</td>
                        <td>{pair.right ? Math.round(pair.right.gcPercent) : '—'}</td>
                        {showProbeCol && (
                          <>
                            <td className="pick-primers-seq" title={pair.internal?.sequence}>
                              {pair.internal?.sequence ?? '—'}
                            </td>
                            <td>{pair.internal ? pair.internal.tm.toFixed(1) : '—'}</td>
                          </>
                        )}
                        <td>{pair.productSize ?? '—'}</td>
                        <td>{pair.penalty.toFixed(2)}</td>
                      </tr>
                      {expanded && spec && (
                        <tr className="pick-primers-spec-row">
                          <td colSpan={resultColumnCount}>
                            <SpecificityDetails spec={spec} />
                          </td>
                        </tr>
                      )}
                      </Fragment>
                      )
                    })}
                  {mode === 'lefts' &&
                    result?.lefts.map((oligo: Primer3Oligo) => (
                      <tr key={oligo.rank}>
                        <td>
                          <input type="checkbox" checked={checkedRanks.has(oligo.rank)} onChange={() => toggleRank(oligo.rank)} />
                        </td>
                        <td>{oligo.rank + 1}</td>
                        <td className="pick-primers-seq" title={oligo.sequence}>
                          {oligo.sequence}
                        </td>
                        <td>{recordCoord1Based(oligo.recordStart)}</td>
                        <td>{oligo.length}</td>
                        <td>{oligo.tm.toFixed(1)}</td>
                        <td>{Math.round(oligo.gcPercent)}</td>
                        <td>{oligo.penalty.toFixed(2)}</td>
                      </tr>
                    ))}
                  {mode === 'rights' &&
                    result?.rights.map((oligo: Primer3Oligo) => (
                      <tr key={oligo.rank}>
                        <td>
                          <input type="checkbox" checked={checkedRanks.has(oligo.rank)} onChange={() => toggleRank(oligo.rank)} />
                        </td>
                        <td>{oligo.rank + 1}</td>
                        <td className="pick-primers-seq" title={oligo.sequence}>
                          {oligo.sequence}
                        </td>
                        <td>{recordCoord1Based(oligo.recordStart)}</td>
                        <td>{oligo.length}</td>
                        <td>{oligo.tm.toFixed(1)}</td>
                        <td>{Math.round(oligo.gcPercent)}</td>
                        <td>{oligo.penalty.toFixed(2)}</td>
                      </tr>
                    ))}
                  {mode === 'internals' &&
                    result?.internals.map((oligo: Primer3Oligo) => (
                      <tr key={oligo.rank}>
                        <td>
                          <input type="checkbox" checked={checkedRanks.has(oligo.rank)} onChange={() => toggleRank(oligo.rank)} />
                        </td>
                        <td>{oligo.rank + 1}</td>
                        <td className="pick-primers-seq" title={oligo.sequence}>
                          {oligo.sequence}
                        </td>
                        <td>{recordCoord1Based(oligo.recordStart)}</td>
                        <td>{oligo.length}</td>
                        <td>{oligo.tm.toFixed(1)}</td>
                        <td>{Math.round(oligo.gcPercent)}</td>
                        <td>{oligo.penalty.toFixed(2)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            )}
          </div>
          )}
        </div>

        <footer className="translation-dialog-footer pick-primers-footer">
          <span className="pick-primers-status">{status}</span>
          <div className="translation-actions">
            {pane === 'results' && (
              <button type="button" disabled={visibleRanks.length === 0} onClick={() => setAllChecked(!allChecked)}>
                {allChecked ? 'Uncheck all' : 'Check all'}
              </button>
            )}
            <button type="button" onClick={handleClose}>
              Close
            </button>
            <button
              type="button"
              className="primary"
              disabled={checkedRanks.size === 0}
              onClick={handleAdd}
            >
              Add Selected to Primers
            </button>
          </div>
        </footer>
        <DialogResizeGrip dialogRef={dialogRef} />
      </div>
    </div>
  )
}
