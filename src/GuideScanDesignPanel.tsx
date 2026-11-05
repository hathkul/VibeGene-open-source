import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  GUIDESCAN_DEFAULT_TOP_N,
  GUIDESCAN_ORGANISMS,
  autocompleteGuideScanGenesDetailed,
  completeGuideScanDesign,
  defaultGuideScanGuideName,
  enzymesForGuideScanOrganism,
  evidenceFromDesignCandidate,
  fetchGuideScanGeneSequence,
  formatGuideScanMappingSummary,
  formatGuideScanOffTargetSummary,
  GUIDESCAN_METRIC_HELP,
  guideScanDesignEligibilityForRecord,
  guidescanErrorMessage,
  guideScanNucleaseLabel,
  guideScanNucleasePresetId,
  guideScanPamSide,
  loadGuideScanCatalog,
  mapGuideScanCandidateToHit,
  pickGuideScanCatalogDefaults,
  sgRNAAnnotationExists,
  startGuideScanDesign,
  buildGuideScanDesignCacheEntry,
  expandGuideScanDesignResult,
  guideScanDesignCacheMatchesRecord,
  guideScanDesignRunContextKey,
  guideScanGeneFetchUsesNcbiFirst,
  isLikelyEntrezGeneId,
  resolvedGeneFromDesignCache,
  buildGuideScanSelectionFailureCopy,
  resolveGuideScanSelectionCoordinates,
  selectionModeHasGenomicPlacementPath,
  type GuideScanDesignCacheEntry,
  type GuideScanDesignRegionSelection,
  type GuideScanDesignResult,
  type GuideScanGeneSuggestion,
  type GuideScanGuideCandidate,
  type GuideScanRecordDesignEligibility,
  type GuideScanSupportedInfo,
} from './domain/guidescan'
import type { GenomicReferenceAnchor } from './domain/dnaComparisonTypes'
import { enzymePamInfo } from './domain/guidescan/organisms'
import { groupSgRNAFeatures } from './domain/sgrna'
import type { SequenceRecord } from './domain/types'
import type { SgRnaDraft } from './SgRnaDialog'
import { GuideScanMetricHelp } from './GuideScanMetricHelp'

export type GuideScanAddPayload = {
  annotationRecord: SequenceRecord
  drafts: SgRnaDraft[]
}

export type { GuideScanDesignRegionSelection }

type InputMode = 'gene' | 'current_record' | 'selection'

const GUIDESCAN_SELECTION_EMPTY_HINT =
  'Nothing is selected. Close this dialog, select a stretch on the map or sequence (or click a feature), then reopen Design sgRNA and choose "Selected region".'

type GeneSuggestionSearchStatus = 'idle' | 'searching' | 'done' | 'error'

type GeneSuggestionSearch = {
  forQuery: string
  status: GeneSuggestionSearchStatus
  message?: string
}

const GENE_SUGGEST_SUBMIT_HINT =
  'You can still enter an exact symbol or Entrez ID and press Design.'

function geneInputMatchesResolvedGene(query: string, resolved: GuideScanGeneSuggestion | null): boolean {
  const trimmed = query.trim()
  if (!trimmed || !resolved?.symbol) return false
  return resolved.symbol.trim().toLowerCase() === trimmed.toLowerCase()
}

function soleCaseInsensitiveSymbolSuggestion(
  query: string,
  entries: GuideScanGeneSuggestion[],
): GuideScanGeneSuggestion | undefined {
  if (isLikelyEntrezGeneId(query)) return undefined
  let match: GuideScanGeneSuggestion | undefined
  const seenSymbols = new Set<string>()
  for (const entry of entries) {
    if (entry.symbol.localeCompare(query, undefined, { sensitivity: 'accent' }) !== 0) continue
    const key = entry.symbol.toLowerCase()
    if (seenSymbols.has(key)) continue
    seenSymbols.add(key)
    if (seenSymbols.size > 1) return undefined
    match = entry
  }
  return match
}

function applySelectedGeneSuggestion(
  entry: GuideScanGeneSuggestion,
  inputBeforeSelection: string,
  preserveSearchDoneForQuery?: string,
): {
  geneInput: string
  resolvedGene: GuideScanGeneSuggestion
  geneSuggestSearch: GeneSuggestionSearch
} {
  const keepInputText = isLikelyEntrezGeneId(inputBeforeSelection.trim())
  return {
    geneInput: keepInputText ? inputBeforeSelection : entry.symbol,
    resolvedGene: entry,
    geneSuggestSearch: preserveSearchDoneForQuery
      ? { forQuery: preserveSearchDoneForQuery, status: 'done' }
      : { forQuery: entry.symbol.trim(), status: 'idle' },
  }
}

function geneSuggestStatusDisplay(
  search: GeneSuggestionSearch,
  trimmedQuery: string,
  suggestionCount: number,
  organismId: string,
): { text: string; title?: string; isError?: boolean } | null {
  if (!trimmedQuery || search.forQuery !== trimmedQuery || search.status === 'idle') return null
  if (search.status === 'searching') {
    const progress = search.message?.trim()
    return {
      text: progress || `Searching Ensembl for "${trimmedQuery}"…`,
      title: progress || undefined,
    }
  }
  if (search.status === 'error') {
    const detail = search.message?.trim() || guidescanErrorMessage(new Error('Gene suggestions failed.'))
    const text = /^gene suggestions failed/i.test(detail) ? detail : `Suggestions failed: ${detail}`
    return { text, title: text, isError: true }
  }
  if (search.status === 'done' && suggestionCount === 0) {
    const organismLabel = organismLabelForGuideScan(organismId)
    return { text: `No genes named "${trimmedQuery}" found for ${organismLabel}` }
  }
  return null
}

type GuideScanRunLogLevel = 'info' | 'success' | 'error'

type GuideScanRunLogEntry = {
  atMs: number
  level: GuideScanRunLogLevel
  text: string
}

type GuideScanRunSnapshot = {
  contextKey: string
  phase: 'idle' | 'running' | 'results' | 'error'
  statusMessage: string
  designResult: GuideScanDesignResult | null
  selectedIds: Set<string>
  /** Downloaded gene record for gene-input mode only. */
  geneAnnotationRecord: SequenceRecord | null
  runStartedAtMs: number | null
  runLog: GuideScanRunLogEntry[]
}

function formatGeneDesignTarget(
  resolved: GuideScanGeneSuggestion | null,
  geneInput: string,
): string {
  if (resolved?.symbol) {
    const entrez = resolved.entrezId?.trim()
      || (isLikelyEntrezGeneId(geneInput) ? geneInput.trim() : '')
    return entrez ? `${resolved.symbol} (Entrez ${entrez})` : resolved.symbol
  }
  return geneInput.trim()
}

function organismLabelForGuideScan(organismId: string): string {
  return GUIDESCAN_ORGANISMS.find((entry) => entry.id === organismId)?.label ?? organismId
}

function appendRunLogEntry(
  snapshot: GuideScanRunSnapshot,
  level: GuideScanRunLogLevel,
  text: string,
  startedAtMs: number | null,
): GuideScanRunLogEntry[] {
  const atMs = startedAtMs == null ? 0 : Math.max(0, Date.now() - startedAtMs) / 1000
  return [...snapshot.runLog, { atMs, level, text }]
}

const EMPTY_GUIDE_SELECTION = new Set<string>()

function formatLocus(candidate: GuideScanGuideCandidate) {
  return `${candidate.chromosome}:${candidate.start}-${candidate.end}`
}

function formatStrand(candidate: GuideScanGuideCandidate) {
  return candidate.strand === 'forward' ? '+' : '−'
}

function formatScore(value: number | null) {
  if (value == null || !Number.isFinite(value)) return '—'
  return value.toFixed(2)
}

function truncateRecordName(name: string, maxLen = 24): string {
  const trimmed = name.trim()
  if (trimmed.length <= maxLen) return trimmed
  return `${trimmed.slice(0, maxLen - 1)}…`
}

function currentRecordHint(eligibility: GuideScanRecordDesignEligibility): string {
  if (eligibility.eligible) return eligibility.label
  return eligibility.reason
}

function buildGeneModeResultsStatusMessage(
  result: GuideScanDesignResult,
  geneRecord: SequenceRecord,
  enzyme: string,
  targetSymbol: string,
): string {
  const mappedCount = result.guides.filter((candidate) => (
    mapGuideScanCandidateToHit(candidate, geneRecord, enzyme)
  )).length
  return `${formatGuideScanMappingSummary(mappedCount, result.guides.length, targetSymbol)}. "Open ${targetSymbol} and add…" opens the gene sequence in this window with the selected guides.`
}

function geneModeRestoreFetchingStatus(geneSymbol: string): string {
  const label = geneSymbol.trim() || 'gene'
  return `Restoring previous results… fetching ${label} sequence for mapping.`
}

function geneModeRestoreMappingFailedStatus(geneSymbol: string, guideCount: number): string {
  const label = geneSymbol.trim() || 'the target gene'
  return `Restored ${guideCount} GuideScan2 candidates for ${label}, but the gene sequence could not be loaded for mapping. Run again to retry.`
}

function guideScanDesignHydrateKey(
  record: Pick<SequenceRecord, 'id' | 'sequence'>,
  cache: GuideScanDesignCacheEntry | undefined,
): string {
  if (!cache || !guideScanDesignCacheMatchesRecord(cache, record)) {
    return ''
  }
  return [
    record.id,
    cache.capturedAt,
    cache.hostRecordId,
    cache.sequenceDigest,
    cache.inputMode,
    cache.queryText,
    cache.organism,
    cache.enzyme,
    String(cache.topN),
  ].join('\0')
}

export function GuideScanDesignPanel({
  record,
  designSelection = null,
  persistedCache,
  onPersistDesignCache,
  onCancel,
  onAddSelected,
}: {
  record: SequenceRecord
  designSelection?: GuideScanDesignRegionSelection | null
  persistedCache?: GuideScanDesignCacheEntry
  onPersistDesignCache?: (entry: GuideScanDesignCacheEntry) => void
  onCancel?: () => void
  onAddSelected: (payload: GuideScanAddPayload) => void
}) {
  const eligibility = useMemo(() => guideScanDesignEligibilityForRecord(record), [record])

  const [catalog, setCatalog] = useState<GuideScanSupportedInfo | null>(null)
  const defaults = useMemo(() => pickGuideScanCatalogDefaults(catalog), [catalog])
  const [organism, setOrganism] = useState('hg38')
  const [enzyme, setEnzyme] = useState('cas9')
  const [inputMode, setInputMode] = useState<InputMode>(() => designSelection ? 'selection' : 'gene')
  const [geneInput, setGeneInput] = useState('')
  const [resolvedGene, setResolvedGene] = useState<GuideScanGeneSuggestion | null>(null)
  const [geneSuggestions, setGeneSuggestions] = useState<GuideScanGeneSuggestion[]>([])
  const [geneSuggestSearch, setGeneSuggestSearch] = useState<GeneSuggestionSearch>({
    forQuery: '',
    status: 'idle',
  })
  const [topN, setTopN] = useState(GUIDESCAN_DEFAULT_TOP_N)
  const [runSnapshot, setRunSnapshot] = useState<GuideScanRunSnapshot>({
    contextKey: '',
    phase: 'idle',
    statusMessage: '',
    designResult: null,
    selectedIds: new Set(),
    geneAnnotationRecord: null,
    runStartedAtMs: null,
    runLog: [],
  })
  const [runningElapsedSec, setRunningElapsedSec] = useState(0)
  const [pane, setPane] = useState<'configure' | 'results'>('configure')
  const abortRef = useRef<AbortController | null>(null)
  const sessionGenomicAnchorRef = useRef<GenomicReferenceAnchor | null>(null)
  const [selectionRecoveryInstructions, setSelectionRecoveryInstructions] = useState<string | null>(null)
  const hydratedCacheRef = useRef('')
  const persistCacheRef = useRef(onPersistDesignCache)
  const persistedCacheRef = useRef(persistedCache)
  const recordRef = useRef(record)

  useLayoutEffect(() => {
    persistCacheRef.current = onPersistDesignCache
    persistedCacheRef.current = persistedCache
    recordRef.current = record
  })

  const hydrateKey = useMemo(
    () => guideScanDesignHydrateKey(record, persistedCache),
    [record, persistedCache],
  )

  useEffect(() => () => {
    hydratedCacheRef.current = ''
  }, [])

  useEffect(() => {
    if (runSnapshot.phase !== 'running' || runSnapshot.runStartedAtMs == null || import.meta.env.VITEST) {
      return undefined
    }
    const startedAtMs = runSnapshot.runStartedAtMs
    const tick = () => {
      setRunningElapsedSec(Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000)))
    }
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [runSnapshot.phase, runSnapshot.runStartedAtMs])

  const geneQueryKey = inputMode === 'current_record' && eligibility.eligible
    ? eligibility.queryText.trim().toUpperCase()
    : inputMode === 'selection' && designSelection
      ? `SEL:${designSelection.kind}:${designSelection.start}:${designSelection.end}:${designSelection.label}`
      : geneInput.trim().toUpperCase()

  const designOrganism = (inputMode === 'current_record' || inputMode === 'selection') && eligibility.eligible
    ? eligibility.organism
    : organism

  const runContextKey = guideScanDesignRunContextKey({
    inputMode,
    queryText: geneQueryKey,
    organism: designOrganism,
    enzyme,
    topN,
  })
  const runMatchesContext = runSnapshot.contextKey === runContextKey
  const hasStoredResults = runSnapshot.phase === 'results'
    && runSnapshot.designResult != null
    && runSnapshot.contextKey.startsWith(`${inputMode}|`)
  const showRunSnapshot = hasStoredResults || runMatchesContext
  const phase = runSnapshot.phase === 'running' || runSnapshot.phase === 'error'
    ? runSnapshot.phase
    : hasStoredResults
      ? 'results'
      : runMatchesContext
        ? runSnapshot.phase
        : 'idle'
  const resultsStale = hasStoredResults && !runMatchesContext
  const statusMessage = runSnapshot.phase === 'running' || runSnapshot.phase === 'error'
    ? runSnapshot.statusMessage
    : showRunSnapshot
      ? (resultsStale
        ? `${runSnapshot.statusMessage || 'Showing previous GuideScan2 results.'} Run again after changing genome, enzyme, target, or candidate count.`
        : runSnapshot.statusMessage)
      : ''
  const runLogVisible = runSnapshot.runLog.length > 0
  const runLogRef = useRef<HTMLUListElement | null>(null)

  useEffect(() => {
    if (!runSnapshot.runLog.length) return
    const list = runLogRef.current
    if (!list) return
    list.scrollTop = list.scrollHeight
  }, [runSnapshot.runLog])
  const designResult = showRunSnapshot ? runSnapshot.designResult : null
  const selectedIds = showRunSnapshot ? runSnapshot.selectedIds : EMPTY_GUIDE_SELECTION
  const geneAnnotationRecord = showRunSnapshot ? runSnapshot.geneAnnotationRecord : null

  const annotationRecord = inputMode === 'gene' ? geneAnnotationRecord : record

  const organismOptions = useMemo(() => {
    const ids = catalog?.organisms ?? GUIDESCAN_ORGANISMS.map((entry) => entry.id)
    return ids.map((id) => ({
      id,
      label: GUIDESCAN_ORGANISMS.find((entry) => entry.id === id)?.label ?? id,
    }))
  }, [catalog])

  const enzymeOptions = useMemo(
    () => enzymesForGuideScanOrganism(catalog, organism),
    [catalog, organism],
  )

  const currentRecordDisabled = !eligibility.eligible

  const selectionPrecheckFailure = useMemo(() => {
    if (inputMode !== 'selection' || !designSelection) return null
    if (selectionModeHasGenomicPlacementPath(record)) return null
    return buildGuideScanSelectionFailureCopy({
      recordName: record.name,
      organismLabel: organismLabelForGuideScan(designOrganism),
      detail: 'no genome coordinates and no Entrez Gene identity on this record',
    })
  }, [designOrganism, designSelection, inputMode, record])

  const canSubmitGene = inputMode === 'gene' && Boolean(geneInput.trim() || resolvedGene?.symbol)
  const canSubmitCurrent = inputMode === 'current_record' && eligibility.eligible
  const canSubmitSelection = inputMode === 'selection'
    && Boolean(designSelection)
    && !selectionPrecheckFailure
  const canSubmit = (canSubmitGene || canSubmitCurrent || canSubmitSelection) && phase !== 'running'

  function handleGeneInputChange(value: string) {
    setGeneInput(value)
    setResolvedGene(null)
    const query = value.trim()
    if (!query) {
      setGeneSuggestions([])
      setGeneSuggestSearch({ forQuery: '', status: 'idle' })
    } else {
      setGeneSuggestSearch({ forQuery: query, status: 'searching' })
    }
  }

  function handleOrganismChange(value: string) {
    setOrganism(value)
    setResolvedGene(null)
    setGeneSuggestions([])
    const query = geneInput.trim()
    setGeneSuggestSearch(
      query
        ? { forQuery: query, status: 'searching' }
        : { forQuery: '', status: 'idle' },
    )
  }

  function handleInputModeChange(mode: InputMode) {
    if (mode === 'current_record' && !eligibility.eligible) return
    setInputMode(mode)
    setSelectionRecoveryInstructions(null)
    if ((mode === 'current_record' || mode === 'selection') && eligibility.eligible) {
      setOrganism(eligibility.organism)
    }
  }

  useEffect(() => {
    let cancelled = false
    void loadGuideScanCatalog()
      .then((info) => {
        if (cancelled) return
        setCatalog(info)
        if (persistedCache && guideScanDesignCacheMatchesRecord(persistedCache, record)) {
          return
        }
        const picked = pickGuideScanCatalogDefaults(info)
        const recordEligibility = guideScanDesignEligibilityForRecord(record)
        if (recordEligibility.eligible && recordEligibility.organism) {
          setOrganism(recordEligibility.organism)
        } else {
          setOrganism(picked.organism)
        }
        setEnzyme(String(picked.enzyme))
      })
      .catch(() => {
        if (!cancelled) setCatalog(null)
      })
    return () => {
      cancelled = true
    }
  }, [persistedCache, record])

  useEffect(() => {
    if (!hydrateKey) return
    const cached = persistedCacheRef.current
    if (!cached || !guideScanDesignCacheMatchesRecord(cached, recordRef.current)) return
    if (hydratedCacheRef.current === hydrateKey) return
    if (cached.inputMode === 'selection') {
      hydratedCacheRef.current = hydrateKey
      return
    }
    hydratedCacheRef.current = hydrateKey

    setInputMode(cached.inputMode)
    setOrganism(cached.organism)
    setEnzyme(cached.enzyme)
    setTopN(cached.topN)
    if (cached.inputMode === 'gene') {
      setGeneInput(cached.queryText)
      setResolvedGene(resolvedGeneFromDesignCache(cached))
      setGeneSuggestions([])
    }

    const contextKey = guideScanDesignRunContextKey({
      inputMode: cached.inputMode,
      queryText: cached.queryText,
      organism: cached.organism,
      enzyme: cached.enzyme,
      topN: cached.topN,
    })
    const designResult = expandGuideScanDesignResult(cached.designResult)
    if (cached.inputMode !== 'gene') {
      setPane('results')
      setRunSnapshot({
        contextKey,
        phase: 'results',
        statusMessage: cached.statusMessage?.trim()
          || 'Restored previous GuideScan2 results for this sequence.',
        designResult,
        selectedIds: new Set(),
        geneAnnotationRecord: null,
        runStartedAtMs: null,
        runLog: [],
      })
      return
    }

    const restoredGene = resolvedGeneFromDesignCache(cached)
    const geneSymbol = restoredGene?.symbol ?? cached.queryText.trim()
    setPane('results')
    setRunSnapshot({
      contextKey,
      phase: 'results',
      statusMessage: geneModeRestoreFetchingStatus(geneSymbol),
      designResult,
      selectedIds: new Set(),
      geneAnnotationRecord: null,
      runStartedAtMs: null,
      runLog: [],
    })

    const controller = new AbortController()
    void (async () => {
      try {
        const opened = await fetchGuideScanGeneSequence(
          cached.organism,
          geneSymbol || cached.queryText,
          {
            signal: controller.signal,
            resolved: restoredGene ?? undefined,
          },
        )
        if (controller.signal.aborted) return
        const statusMessage = buildGeneModeResultsStatusMessage(
          designResult,
          opened.record,
          cached.enzyme,
          opened.suggestion.symbol,
        )
        setRunSnapshot((current) => (
          current.contextKey === contextKey
            ? { ...current, statusMessage, geneAnnotationRecord: opened.record }
            : current
        ))
      } catch {
        if (controller.signal.aborted) return
        setRunSnapshot((current) => (
          current.contextKey === contextKey
            ? {
                ...current,
                statusMessage: geneModeRestoreMappingFailedStatus(geneSymbol, designResult.guides.length),
              }
            : current
        ))
      }
    })()

    return () => {
      controller.abort()
    }
  }, [hydrateKey])

  useEffect(() => {
    if (inputMode !== 'gene') return
    const query = geneInput.trim()
    if (!query) return
    if (geneInputMatchesResolvedGene(query, resolvedGene)) return

    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void autocompleteGuideScanGenesDetailed(organism, query, {
        limit: 12,
        signal: controller.signal,
        onSourceNote: (note) => {
          if (controller.signal.aborted) return
          setGeneSuggestSearch((current) => (
            current.forQuery === query && current.status === 'searching'
              ? { ...current, message: note }
              : current
          ))
        },
      })
        .then(({ suggestions: entries, note }) => {
          if (controller.signal.aborted) return
          setGeneSuggestions(entries)
          setGeneSuggestSearch({ forQuery: query, status: 'done', message: note })
          const autoLock = soleCaseInsensitiveSymbolSuggestion(query, entries)
          if (autoLock) {
            const applied = applySelectedGeneSuggestion(autoLock, query, query)
            setResolvedGene(applied.resolvedGene)
            setGeneInput(applied.geneInput)
            setGeneSuggestSearch({ ...applied.geneSuggestSearch, message: note })
          }
        })
        .catch((error) => {
          if (controller.signal.aborted) return
          setGeneSuggestions([])
          const reason = guidescanErrorMessage(error)
          setGeneSuggestSearch({
            forQuery: query,
            status: 'error',
            message: `${reason.replace(/\.?\s*$/, '.')} ${GENE_SUGGEST_SUBMIT_HINT}`,
          })
        })
    }, 280)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [geneInput, organism, inputMode, resolvedGene])

  const mappedRows = useMemo(() => {
    if (!designResult) return [] as Array<{
      candidate: GuideScanGuideCandidate
      hit: ReturnType<typeof mapGuideScanCandidateToHit>
      duplicate: boolean
    }>
    return designResult.guides.map((candidate) => {
      const hit = annotationRecord
        ? mapGuideScanCandidateToHit(candidate, annotationRecord, enzyme)
        : null
      const duplicate = hit && annotationRecord
        ? sgRNAAnnotationExists(annotationRecord, hit, candidate.spacer)
        : false
      return { candidate, hit, duplicate }
    })
  }, [annotationRecord, designResult, enzyme])

  function cancelRun() {
    abortRef.current?.abort()
    abortRef.current = null
    setRunSnapshot((current) => {
      const cancelledMessage = 'GuideScan design cancelled.'
      const runLog = appendRunLogEntry(current, 'info', 'Cancelled by user.', current.runStartedAtMs)
      return {
        ...current,
        phase: 'idle',
        statusMessage: cancelledMessage,
        runStartedAtMs: null,
        runLog,
      }
    })
  }

  async function runDesign() {
    if (!canSubmit) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const contextKey = runContextKey
    const runStartedAtMs = Date.now()
    const geneModeResolved = inputMode === 'gene' ? resolvedGene : null
    const designTargetLabel = inputMode === 'gene'
      ? formatGeneDesignTarget(geneModeResolved, geneInput)
      : inputMode === 'selection' && designSelection
        ? `${designSelection.label} of ${record.name}`
        : (eligibility.eligible ? eligibility.label : record.name)
    const initialLog: GuideScanRunLogEntry[] = [{
      atMs: 0,
      level: 'info',
      text: `Design requested: ${designTargetLabel} · ${organismLabelForGuideScan(designOrganism)} · ${guideScanNucleaseLabel(enzyme)} · ${topN} candidates`,
    }]
    if (geneModeResolved) {
      initialLog.push({
        atMs: 0,
        level: 'info',
        text: `Using selected gene ${formatGeneDesignTarget(geneModeResolved, geneInput)}; skipping lookup`,
      })
    }
    setPane('configure')
    setRunSnapshot({
      contextKey,
      phase: 'running',
      statusMessage: 'Submitting GuideScan2 job…',
      designResult: null,
      selectedIds: new Set(),
      geneAnnotationRecord: null,
      runStartedAtMs,
      runLog: initialLog,
    })

    const onProgress = (message: string) => {
      setRunSnapshot((current) => {
        if (current.contextKey !== contextKey || current.runStartedAtMs !== runStartedAtMs) return current
        return {
          ...current,
          runLog: appendRunLogEntry(current, 'info', message, current.runStartedAtMs),
        }
      })
    }

    try {
      if (inputMode === 'selection') {
        if (!designSelection) throw new Error(GUIDESCAN_SELECTION_EMPTY_HINT)
        const organismLabel = organismLabelForGuideScan(designOrganism)
        const coordResult = await resolveGuideScanSelectionCoordinates({
          record,
          selection: designSelection,
          organism: designOrganism,
          organismLabel,
          signal: controller.signal,
          onProgress,
          sessionAnchor: sessionGenomicAnchorRef.current,
        })
        if (!coordResult.ok) {
          setSelectionRecoveryInstructions(coordResult.failure.instructions)
          setRunSnapshot((current) => ({
            ...current,
            runLog: appendRunLogEntry(current, 'error', coordResult.failure.logLine, current.runStartedAtMs),
          }))
          throw new Error(coordResult.failure.headline)
        }
        sessionGenomicAnchorRef.current = coordResult.anchor
        setSelectionRecoveryInstructions(null)
        for (const line of coordResult.logLines) {
          onProgress(line)
        }
        onProgress(`Submitting ${coordResult.coordinateQuery} to GuideScan2…`)
        const session = await startGuideScanDesign({
          organism: designOrganism,
          enzyme,
          kind: 'coordinates',
          coordinates: coordResult.coordinates,
          queryText: coordResult.coordinateQuery,
          topN,
        }, {
          signal: controller.signal,
          resolveGeneSymbol: false,
          onProgress,
        })
        setRunSnapshot((current) => (
          current.contextKey === contextKey
            ? { ...current, statusMessage: 'GuideScan2 is scoring candidate guides…' }
            : current
        ))
        const result = await completeGuideScanDesign(session, { signal: controller.signal, onProgress })
        const mappedCount = result.guides.filter((candidate) => (
          mapGuideScanCandidateToHit(candidate, record, enzyme)
        )).length
        const mappingSummary = formatGuideScanMappingSummary(mappedCount, result.guides.length, record.name)
        const statusMessage = `${mappingSummary}. Selected guides will be added to the opened sequence.`
        setPane('results')
        setRunSnapshot((current) => ({
          contextKey,
          phase: 'results',
          designResult: result,
          geneAnnotationRecord: null,
          selectedIds: new Set(),
          statusMessage,
          runStartedAtMs: null,
          runLog: appendRunLogEntry(current, 'success', statusMessage, current.runStartedAtMs),
        }))
        return
      }

      let geneName: string
      if (inputMode === 'current_record') {
        if (!eligibility.eligible) throw new Error(eligibility.reason)
        geneName = eligibility.queryText
      } else {
        geneName = resolvedGene?.symbol ?? geneInput.trim()
        if (!geneName) throw new Error('Enter a gene symbol or Entrez Gene ID and pick a suggestion when offered.')
      }

      const skipGeneResolve = inputMode === 'gene' && Boolean(resolvedGene)
      const session = await startGuideScanDesign({
        organism: designOrganism,
        enzyme,
        kind: 'gene',
        geneName,
        topN,
      }, {
        signal: controller.signal,
        resolveGeneSymbol: inputMode === 'gene' && !skipGeneResolve,
        resolvedGene: skipGeneResolve ? resolvedGene ?? undefined : undefined,
        onProgress,
      })

      setRunSnapshot((current) => (
        current.contextKey === contextKey
          ? { ...current, statusMessage: 'GuideScan2 is scoring candidate guides…' }
          : current
      ))
      const result = await completeGuideScanDesign(session, { signal: controller.signal, onProgress })

      if (inputMode === 'gene') {
        const symbol = session.resolvedGene?.symbol ?? geneName
        const ncbiFetch = guideScanGeneFetchUsesNcbiFirst(designOrganism, session.resolvedGene ?? resolvedGene)
        setRunSnapshot((current) => (
          current.contextKey === contextKey
            ? {
                ...current,
                statusMessage: ncbiFetch
                  ? `Downloading ${symbol} gene record from NCBI…`
                  : 'Fetching genomic sequence for annotation…',
              }
            : current
        ))
        const opened = await fetchGuideScanGeneSequence(designOrganism, symbol, {
          signal: controller.signal,
          resolved: session.resolvedGene ?? resolvedGene ?? undefined,
          onProgress,
        })
        const resolvedSymbol = session.resolvedGene?.symbol ?? geneName
        const mappingTargetLabel = isLikelyEntrezGeneId(resolvedSymbol)
          ? opened.suggestion.symbol
          : resolvedSymbol
        const statusMessage = buildGeneModeResultsStatusMessage(
          result,
          opened.record,
          enzyme,
          mappingTargetLabel,
        )
        setPane('results')
        setRunSnapshot((current) => ({
          contextKey,
          phase: 'results',
          designResult: result,
          geneAnnotationRecord: opened.record,
          selectedIds: new Set(),
          statusMessage,
          runStartedAtMs: null,
          runLog: appendRunLogEntry(current, 'success', statusMessage, current.runStartedAtMs),
        }))
        const cacheEntry = buildGuideScanDesignCacheEntry({
          record,
          inputMode: 'gene',
          queryText: mappingTargetLabel,
          organism: designOrganism,
          enzyme,
          topN,
          resolvedGene: session.resolvedGene ?? resolvedGene,
          statusMessage,
          designResult: result,
        })
        persistCacheRef.current?.(cacheEntry)
        hydratedCacheRef.current = guideScanDesignHydrateKey(record, cacheEntry)
      } else {
        const mappedCount = result.guides.filter((candidate) => (
          mapGuideScanCandidateToHit(candidate, record, enzyme)
        )).length
        const targetName = eligibility.eligible
          ? (eligibility.identity.symbol ?? record.name)
          : record.name
        const mappingSummary = formatGuideScanMappingSummary(mappedCount, result.guides.length, targetName)
        const statusMessage = `${mappingSummary}. Selected guides will be added to the opened sequence.`
        setPane('results')
        setRunSnapshot((current) => ({
          contextKey,
          phase: 'results',
          designResult: result,
          geneAnnotationRecord: null,
          selectedIds: new Set(),
          statusMessage,
          runStartedAtMs: null,
          runLog: appendRunLogEntry(current, 'success', statusMessage, current.runStartedAtMs),
        }))
        const cacheEntry = buildGuideScanDesignCacheEntry({
          record,
          inputMode: 'current_record',
          queryText: geneName,
          organism: designOrganism,
          enzyme,
          topN,
          statusMessage,
          designResult: result,
        })
        persistCacheRef.current?.(cacheEntry)
        hydratedCacheRef.current = guideScanDesignHydrateKey(record, cacheEntry)
      }
    } catch (error) {
      if (controller.signal.aborted) {
        console.error('[GuideScan design]', error)
        setRunSnapshot((current) => {
          if (current.contextKey !== contextKey) return current
          const cancelledMessage = 'GuideScan design cancelled.'
          return {
            ...current,
            phase: 'idle',
            statusMessage: cancelledMessage,
            runStartedAtMs: null,
            runLog: appendRunLogEntry(current, 'info', 'Cancelled by user.', current.runStartedAtMs),
          }
        })
        return
      }
      console.error('[GuideScan design]', error)
      const message = guidescanErrorMessage(error) || 'GuideScan design failed for an unknown reason.'
      setPane('configure')
      setRunSnapshot((current) => ({
        contextKey,
        phase: 'error',
        designResult: null,
        geneAnnotationRecord: null,
        selectedIds: new Set(),
        statusMessage: message,
        runStartedAtMs: null,
        runLog: appendRunLogEntry(current, 'error', message, current.runStartedAtMs),
      }))
    } finally {
      if (abortRef.current === controller) abortRef.current = null
    }
  }

  function toggleCandidate(id: string, enabled: boolean) {
    setRunSnapshot((current) => {
      if (current.contextKey !== runContextKey) return current
      const next = new Set(current.selectedIds)
      if (enabled) next.add(id)
      else next.delete(id)
      return { ...current, selectedIds: next }
    })
  }

  function selectAllMappable() {
    setRunSnapshot((current) => {
      if (current.contextKey !== runContextKey) return current
      return {
        ...current,
        selectedIds: new Set(mappedRows.filter((row) => row.hit && !row.duplicate).map((row) => row.candidate.id)),
      }
    })
  }

  function clearAll() {
    setRunSnapshot((current) => (
      current.contextKey === runContextKey ? { ...current, selectedIds: new Set() } : current
    ))
  }

  function addSelectedGuides() {
    if (!annotationRecord) {
      const reason = inputMode === 'gene'
        ? 'Cannot add guides: the gene sequence is not loaded yet.'
        : 'Cannot add guides: no sequence is open for annotation.'
      setRunSnapshot((current) => ({
        ...current,
        statusMessage: reason,
        runLog: appendRunLogEntry(current, 'error', reason, current.runStartedAtMs),
      }))
      return
    }
    const pam = enzymePamInfo(enzyme)
    const drafts: SgRnaDraft[] = []
    const jobId = designResult?.jobId
    const existingSgRnaCount = groupSgRNAFeatures(annotationRecord.features).length
    mappedRows.forEach((row) => {
      if (!selectedIds.has(row.candidate.id) || !row.hit || row.duplicate) return
      drafts.push({
        name: defaultGuideScanGuideName(row.candidate, drafts.length, existingSgRnaCount, enzyme),
        nuclease: guideScanNucleasePresetId(enzyme),
        pamMotif: pam.pam,
        pamSide: guideScanPamSide(enzyme),
        spacer: row.candidate.spacer,
        hit: row.hit,
        guideScanEvidence: evidenceFromDesignCandidate(row.candidate, { jobId }),
      })
    })
    if (!drafts.length) {
      const reason = 'No mappable guides were selected.'
      setRunSnapshot((current) => (
        current.contextKey === runContextKey
          ? {
              ...current,
              statusMessage: reason,
              runLog: appendRunLogEntry(current, 'error', reason, current.runStartedAtMs),
            }
          : current
      ))
      return
    }
    const targetName = annotationRecord.name || mappingTargetLabel
    const addedMessage = `Adding ${drafts.length} GuideScan sgRNA${drafts.length === 1 ? '' : 's'} to ${targetName}…`
    setRunSnapshot((current) => (
      current.contextKey === runContextKey
        ? {
            ...current,
            runLog: appendRunLogEntry(current, 'info', addedMessage, current.runStartedAtMs),
          }
        : current
    ))
    onAddSelected({ annotationRecord, drafts })
  }

  const pamPreview = enzymePamInfo(enzyme)
  const useCurrentTitle = currentRecordHint(eligibility)
  const mappingTargetLabel = inputMode === 'selection'
    ? record.name
    : inputMode === 'current_record' && eligibility.eligible
    ? (eligibility.identity.symbol ?? record.name)
    : (geneAnnotationRecord?.name || resolvedGene?.symbol || geneInput.trim() || 'target gene')
  const mappedCount = mappedRows.filter((row) => row.hit).length
  const liveMappingSummary = inputMode === 'gene' && designResult && !geneAnnotationRecord
    ? `${mappingTargetLabel} — awaiting gene sequence for mapping`
    : formatGuideScanMappingSummary(mappedCount, mappedRows.length, mappingTargetLabel)
  const addSelectedOpensGeneHere = inputMode === 'gene'
    && geneAnnotationRecord != null
    && geneAnnotationRecord.id !== record.id
  const selectedMappableCount = mappedRows.filter(
    (row) => selectedIds.has(row.candidate.id) && row.hit && !row.duplicate,
  ).length
  const addSelectedButton = (() => {
    if (inputMode === 'gene' && designResult && !geneAnnotationRecord) {
      return {
        label: 'Open gene and add selected',
        disabled: true,
        title: 'The gene sequence is still loading. Wait for mapping to finish before adding guides.',
      }
    }
    if (addSelectedOpensGeneHere) {
      const geneName = (resolvedGene?.symbol || geneAnnotationRecord?.name || geneInput.trim() || 'gene').trim()
      return {
        label: selectedMappableCount > 0
          ? `Open ${geneName} and add ${selectedMappableCount} selected`
          : 'Add selected',
        disabled: selectedMappableCount === 0,
        title: selectedMappableCount > 0
          ? `Open ${geneName} in this window and add ${selectedMappableCount} selected guide${selectedMappableCount === 1 ? '' : 's'}`
          : undefined,
      }
    }
    const targetName = annotationRecord?.name || record.name
    const shortName = truncateRecordName(targetName)
    return {
      label: selectedMappableCount > 0
        ? `Add ${selectedMappableCount} selected to ${shortName}`
        : 'Add selected',
      disabled: selectedMappableCount === 0,
      title: selectedMappableCount > 0
        ? `Add ${selectedMappableCount} selected to ${targetName}`
        : undefined,
    }
  })()
  const showFooterResultActions = pane === 'results' && Boolean(designResult && mappedRows.length > 0)
  const showFooterDesignAction = pane === 'configure' || phase === 'running'
  const resultCount = designResult?.guides.length ?? 0
  const trimmedGeneInput = geneInput.trim()
  const showGeneSuggestionsForInput = inputMode === 'gene' && (
    (geneSuggestSearch.status === 'done' && geneSuggestSearch.forQuery === trimmedGeneInput)
    || geneInputMatchesResolvedGene(trimmedGeneInput, resolvedGene)
  )
  const visibleGeneSuggestions = showGeneSuggestionsForInput ? geneSuggestions : []
  const geneSuggestStatus = inputMode === 'gene'
    ? geneSuggestStatusDisplay(geneSuggestSearch, trimmedGeneInput, geneSuggestions.length, organism)
    : null
  const geneSuggestSourceNote = inputMode === 'gene'
    && geneSuggestSearch.status === 'done'
    && geneSuggestSearch.forQuery === trimmedGeneInput
    && geneSuggestSearch.message?.trim()
    && visibleGeneSuggestions.length > 0
    ? geneSuggestSearch.message.trim()
    : null
  const displayStatusMessage = phase === 'running' && runSnapshot.runStartedAtMs != null
    ? `${statusMessage} (${runningElapsedSec} s)`
    : statusMessage

  return (
    <div className="guidescan-design-panel">
      <header className="guidescan-design-header" data-dialog-drag-handle>
        <h3 id="guidescan-design-dialog-title">Design sgRNA with GuideScan2</h3>
        <div className="guidescan-design-pane-tabs" role="tablist" aria-label="Dialog view">
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
            {resultCount > 0 ? `Results (${resultCount})` : 'Results'}
            {resultCount > 0 && resultsStale && (
              <span className="guidescan-design-pane-stale" title="Settings changed since this run"> •</span>
            )}
          </button>
        </div>
      </header>
      <div className="guidescan-design-panel-body">
      {pane === 'configure' && (
      <div className="guidescan-design-configure-pane">
      <p className="guidescan-design-intro">
        Design ranked sgRNAs with GuideScan2 by gene symbol or Entrez Gene ID, from the opened sequence&apos;s gene identity, or from a selected region when it maps to the reference genome.
      </p>
      <fieldset className="guidescan-target-modes">
        <legend>Target</legend>
        <div className="guidescan-target-choices choices">
          <label title="Ensembl gene symbol or Entrez Gene ID for the chosen reference genome.">
            <input
              type="radio"
              name="guidescan-input-mode"
              checked={inputMode === 'gene'}
              onChange={() => handleInputModeChange('gene')}
            />
            Gene / Entrez ID
          </label>
          <label title={useCurrentTitle}>
            <input
              type="radio"
              name="guidescan-input-mode"
              checked={inputMode === 'current_record'}
              disabled={currentRecordDisabled}
              onChange={() => handleInputModeChange('current_record')}
            />
            Use current sequence
          </label>
          <label title="Design guides for the DNA range or feature selected on the opened sequence.">
            <input
              type="radio"
              name="guidescan-input-mode"
              checked={inputMode === 'selection'}
              onChange={() => handleInputModeChange('selection')}
            />
            Selected region
          </label>
        </div>
        {!eligibility.eligible && inputMode !== 'selection' && (
          <p className="guidescan-target-hint">{eligibility.reason}</p>
        )}
        {inputMode === 'current_record' && eligibility.eligible && (
          <p className="guidescan-target-hint" id="guidescan-current-record-help">
            Designing for {eligibility.label}. Guides map onto the opened sequence.
          </p>
        )}
        {inputMode === 'selection' && !designSelection && (
          <p className="guidescan-target-hint" role="status">
            {GUIDESCAN_SELECTION_EMPTY_HINT}
          </p>
        )}
        {inputMode === 'selection' && designSelection && selectionPrecheckFailure && (
          <div className="guidescan-selection-precheck" role="alert">
            <p className="guidescan-design-error guidescan-target-hint">{selectionPrecheckFailure.headline}</p>
            <p className="guidescan-target-hint guidescan-selection-recovery">{selectionPrecheckFailure.instructions}</p>
          </div>
        )}
        {inputMode === 'selection' && designSelection && !selectionPrecheckFailure && (
          <p className="guidescan-target-hint" role="status">
            {`Target: ${designSelection.label} of ${record.name}`}
          </p>
        )}
      </fieldset>

      <div className="guidescan-design-form compact-scientific-form">
      {inputMode === 'gene' && (
        <label className="compact-field compact-field-gene">
          <span>Gene symbol or Entrez ID</span>
          <span className="compact-field-gene-input-row">
            <input
              value={geneInput}
              onChange={(event) => handleGeneInputChange(event.target.value)}
              list="guidescan-gene-suggestions"
              placeholder="BRCA1 or 672"
              spellCheck={false}
              autoComplete="off"
              aria-describedby="guidescan-gene-help"
            />
            {geneSuggestStatus && !geneSuggestStatus.isError ? (
              <span
                className="guidescan-gene-suggest-status"
                role="status"
                aria-live="polite"
                title={geneSuggestStatus.title}
              >
                {geneSuggestStatus.text}
              </span>
            ) : null}
          </span>
          <datalist id="guidescan-gene-suggestions">
            {visibleGeneSuggestions.map((entry) => (
              <option key={entry.ensemblId || entry.symbol} value={entry.symbol}>
                {entry.description}
              </option>
            ))}
          </datalist>
        </label>
      )}
      {inputMode === 'gene' && (
        <p id="guidescan-gene-help" className="guidescan-target-hint compact-field-hint">
          Suggestions come from Ensembl (NCBI Gene if Ensembl is down); an exact match (any case) is picked automatically.
        </p>
      )}
      {geneSuggestStatus?.isError ? (
        <p className="guidescan-gene-suggest-status is-error" role="alert">
          {geneSuggestStatus.text}
        </p>
      ) : null}
      {inputMode === 'gene' && geneSuggestSourceNote ? (
        <p className="guidescan-gene-suggest-note" role="status">
          {geneSuggestSourceNote}
        </p>
      ) : null}
      {inputMode === 'gene' && visibleGeneSuggestions.length > 0 && (
        <ul className="guidescan-gene-suggest-list" aria-label="Gene suggestions">
          {visibleGeneSuggestions.slice(0, 8).map((entry) => (
            <li key={`${entry.ensemblId}:${entry.symbol}`}>
              <button
                type="button"
                className={resolvedGene?.symbol === entry.symbol ? 'is-active' : ''}
                onClick={() => {
                  const applied = applySelectedGeneSuggestion(entry, geneInput)
                  setResolvedGene(applied.resolvedGene)
                  setGeneInput(applied.geneInput)
                  setGeneSuggestSearch(applied.geneSuggestSearch)
                }}
              >
                {entry.symbol}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="guidescan-design-controls compact-scientific-toolbar">
        <label className="compact-field compact-field-select">
          <span>Reference genome</span>
          <select
            value={(inputMode === 'current_record' || inputMode === 'selection') && eligibility.eligible
              ? eligibility.organism
              : organism}
            disabled={(inputMode === 'current_record' || inputMode === 'selection') && eligibility.eligible}
            onChange={(event) => handleOrganismChange(event.target.value)}
          >
            {organismOptions.map((entry) => (
              <option key={entry.id} value={entry.id}>{entry.label}</option>
            ))}
          </select>
        </label>
        <label className="compact-field compact-field-select">
          <span>Cas enzyme</span>
          <select value={enzyme} onChange={(event) => setEnzyme(event.target.value)}>
            {enzymeOptions.map((entry) => (
              <option key={entry} value={entry}>{guideScanNucleaseLabel(entry)}</option>
            ))}
          </select>
        </label>
        <label className="compact-field compact-field-narrow">
          <span>Candidates</span>
          <input
            type="number"
            min={1}
            max={100}
            value={topN}
            onChange={(event) => setTopN(Math.max(1, Math.min(100, Number(event.target.value) || GUIDESCAN_DEFAULT_TOP_N)))}
          />
        </label>
      </div>
      </div>
      <p className="guidescan-target-hint">
        {guideScanNucleaseLabel(enzyme)} · {pamPreview.spacerLength} nt · {pamPreview.pam} PAM on the {pamPreview.pamSide === '3prime' ? '3′' : '5′'} side
        {!catalog && defaults.organism ? ` · using ${defaults.organism}/${defaults.enzyme} defaults` : ''}
      </p>

      {displayStatusMessage && (
        <div className={phase === 'error' ? 'guidescan-design-error-block' : undefined}>
          <p className={phase === 'error' ? 'guidescan-design-error' : 'guidescan-design-status'} role={phase === 'error' ? 'alert' : 'status'}>
            {displayStatusMessage}
          </p>
          {phase === 'error' && inputMode === 'selection' && selectionRecoveryInstructions ? (
            <p className="guidescan-target-hint guidescan-selection-recovery">{selectionRecoveryInstructions}</p>
          ) : null}
        </div>
      )}

      {runLogVisible && (
        <ul ref={runLogRef} className="guidescan-design-run-log" aria-label="GuideScan design activity">
          {runSnapshot.runLog.map((entry, index) => (
            <li
              key={`${entry.atMs}-${index}`}
              className={entry.level === 'error' ? 'is-error' : entry.level === 'success' ? 'is-success' : ''}
              title={entry.text}
            >
              <span className="guidescan-design-run-log-time">{`${entry.atMs.toFixed(1)} s`}</span>
              <span className="guidescan-design-run-log-text">{entry.text}</span>
            </li>
          ))}
        </ul>
      )}
      </div>
      )}

      {pane === 'results' && (
      <div className={`guidescan-design-results-pane${resultsStale ? ' is-stale' : ''}`}>
      {displayStatusMessage && (
        <p className={phase === 'error' ? 'guidescan-design-error' : 'guidescan-design-status'} role="status">
          {displayStatusMessage}
        </p>
      )}
      {resultsStale && designResult && (
        <p className="guidescan-design-stale-note">
          Settings changed since this run.{' '}
          <button
            type="button"
            className="guidescan-design-link"
            onClick={() => {
              setPane('configure')
              void runDesign()
            }}
            disabled={!canSubmit}
          >
            Run again
          </button>
        </p>
      )}
      {!designResult && (
        <p className="guidescan-design-results-empty">
          No results yet. Set up the search in Configure and press Design with GuideScan2.
        </p>
      )}
      {designResult && mappedRows.length > 0 && (
        <div className="guidescan-results compact-scientific-results">
          <div className="guidescan-results-toolbar">
            <span>{liveMappingSummary}</span>
          </div>
          <table className="guidescan-results-table guidescan-design-results-table">
            <thead>
              <tr>
                <th scope="col" className="guidescan-col-select" aria-label="Select" />
                <th scope="col" className="guidescan-col-rank">#</th>
                <th scope="col" className="guidescan-col-guide">Guide (spacer · PAM)</th>
                <th scope="col" className="guidescan-col-strand">Strand</th>
                <th scope="col" className="guidescan-col-locus">Locus</th>
                <th scope="col" className="guidescan-col-score">
                  <span className="guidescan-col-heading">
                    Spec.
                    <GuideScanMetricHelp label="About specificity (Spec.)">{GUIDESCAN_METRIC_HELP.specificity}</GuideScanMetricHelp>
                  </span>
                </th>
                <th scope="col" className="guidescan-col-score">
                  <span className="guidescan-col-heading">
                    Cut
                    <GuideScanMetricHelp label="About cutting efficiency (Cut)">{GUIDESCAN_METRIC_HELP.cuttingEfficiency}</GuideScanMetricHelp>
                  </span>
                </th>
                <th scope="col" className="guidescan-col-offtargets">
                  <span className="guidescan-col-heading">
                    Off-targets
                    <GuideScanMetricHelp label="About off-target counts">{GUIDESCAN_METRIC_HELP.offTargets}</GuideScanMetricHelp>
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {mappedRows.map(({ candidate, hit, duplicate }) => {
                const spacerPam = `${candidate.spacer}${candidate.pam ? ` · ${candidate.pam}` : ''}`
                const locus = formatLocus(candidate)
                const disabled = !hit || duplicate
                const offTargetSummary = formatGuideScanOffTargetSummary(candidate.offTargetCounts)
                const statusNote = !hit ? 'unmapped' : duplicate ? 'exists' : ''
                return (
                  <tr key={candidate.id} className={disabled ? 'is-disabled' : ''}>
                    <td className="guidescan-col-select">
                      <input
                        type="checkbox"
                        aria-label={`Select guide rank ${candidate.rank}`}
                        checked={selectedIds.has(candidate.id)}
                        disabled={disabled}
                        onChange={(event) => toggleCandidate(candidate.id, event.target.checked)}
                      />
                    </td>
                    <td className="guidescan-col-rank">{candidate.rank}</td>
                    <td className="guidescan-col-guide guidescan-seq" title={spacerPam}>
                      {candidate.spacer}
                      {candidate.pam ? <span className="guidescan-pam">{` · ${candidate.pam}`}</span> : null}
                    </td>
                    <td className="guidescan-col-strand guidescan-strand" title={formatStrand(candidate)}>{formatStrand(candidate)}</td>
                    <td className="guidescan-col-locus guidescan-locus" title={locus}>{locus}</td>
                    <td className="guidescan-col-score">{formatScore(candidate.specificity)}</td>
                    <td className="guidescan-col-score">{formatScore(candidate.cuttingEfficiency)}</td>
                    <td className="guidescan-col-offtargets guidescan-offtargets" title={[offTargetSummary, statusNote].filter(Boolean).join(' · ')}>
                      {offTargetSummary}
                      {statusNote ? <span className="guidescan-row-status">{` · ${statusNote}`}</span> : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      </div>
      )}
      </div>
      <div className="sgrna-dialog-actions guidescan-design-dialog-actions">
        {onCancel || showFooterResultActions ? (
          <div className="guidescan-footer-actions-left">
            {onCancel ? (
              <button type="button" className="sgrna-action-neutral" onClick={onCancel}>Cancel</button>
            ) : null}
            {showFooterResultActions ? (
              <div className="guidescan-footer-selection-actions">
                <button type="button" onClick={selectAllMappable}>Select all</button>
                <button type="button" onClick={clearAll}>Clear all</button>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="guidescan-footer-actions-spacer" aria-hidden="true" />
        <div className="guidescan-footer-actions-right">
          {showFooterDesignAction ? (
            phase === 'running'
              ? <button type="button" className="sgrna-action-neutral" onClick={cancelRun}>Cancel run</button>
              : (
                <button type="button" className="sgrna-action-neutral" disabled={!canSubmit} onClick={() => void runDesign()}>
                  {phase === 'results' ? 'Run again' : 'Design with GuideScan2'}
                </button>
              )
          ) : null}
          {showFooterResultActions ? (
            <button
              type="button"
              className="guidescan-add-selected is-primary"
              onClick={addSelectedGuides}
              disabled={addSelectedButton.disabled}
              title={addSelectedButton.title}
            >
              {addSelectedButton.label}
            </button>
          ) : onCancel ? null : null}
        </div>
      </div>
    </div>
  )
}
