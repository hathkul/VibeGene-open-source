import { useCallback, useEffect, useMemo } from 'react'
import { findMotifs } from '../../domain/sequence'
import { findPrimerSearchHits } from '../../domain/primerExport'
import { findProteinMotifs } from '../../domain/protein'
import type { Primer, SequenceRecord } from '../../domain/types'
import type { EnzymeTabRow } from '../sequence'
import { filterEnzymeTabRows } from '../workspaceTabs/enzymeTabModel'
import { mapZoomCaretPosition } from '../map'
import { nextSearchHitIndex, searchHitRange, searchQueryLength } from '../../application/workspaceInteraction/searchNavigation'

type SearchTab = 'Primers' | string

type WorkspaceSearchOptions = {
  record: SequenceRecord
  activeTab: SearchTab
  searchQuery: string
  primers: Primer[]
  enzymeRows: EnzymeTabRow[]
  searchHitIndex: number
  setSearchHitIndex: (index: number) => void
  setPrimerTabAnchorId: (id: string) => void
  selectPrimerById: (id: string) => void
  setSequenceRange: (range: { start: number; end: number }) => void
  setSequenceScrollTarget: (position: number | null) => void
  actionProfileSync: <T>(name: string, category: string, run: () => T, detail: string) => T
}

/** Owns search hit derivation, cycling, and sequence/primer reveal coordination. */
export function useWorkspaceSearchController(options: WorkspaceSearchOptions) {
  const {
    record,
    activeTab,
    searchQuery,
    primers,
    enzymeRows,
    searchHitIndex,
    setSearchHitIndex,
    setPrimerTabAnchorId,
    selectPrimerById,
    setSequenceRange,
    setSequenceScrollTarget,
    actionProfileSync,
  } = options
  const motifHits = useMemo(
    () => activeTab === 'Enzymes'
      ? []
      : actionProfileSync(
        'findMotifs',
        'search',
        () => record.molecule === 'protein'
          ? findProteinMotifs(record.sequence, searchQuery)
          : findMotifs(record.sequence, searchQuery),
        searchQuery ? `${searchQuery.length} chars` : 'empty',
      ),
    [activeTab, actionProfileSync, record.molecule, record.sequence, searchQuery],
  )
  const primerSearchHitIds = useMemo(() => {
    if (activeTab !== 'Primers') return []
    const hitSet = new Set(findPrimerSearchHits(primers, searchQuery))
    return primers.filter((primer) => hitSet.has(primer.id)).map((primer) => primer.id)
  }, [activeTab, primers, searchQuery])
  const enzymeSearchRows = useMemo(() => filterEnzymeTabRows(enzymeRows, searchQuery), [enzymeRows, searchQuery])
  const searchHitCount = activeTab === 'Primers'
    ? primerSearchHitIds.length
    : activeTab === 'Enzymes'
      ? enzymeSearchRows.length
      : motifHits.length
  const searchHitLabel = activeTab === 'Primers'
    ? 'primer hits'
    : activeTab === 'Enzymes'
      ? (enzymeSearchRows.length === 1 ? 'enzyme' : 'enzymes')
      : 'hits'

  const revealSearchHit = useCallback((index: number) => {
    if (activeTab === 'Enzymes') return
    if (activeTab === 'Primers') {
      const primerId = primerSearchHitIds[index]
      if (!primerId) return
      setPrimerTabAnchorId(primerId)
      selectPrimerById(primerId)
      return
    }
    const start = motifHits[index]
    if (start === undefined) return
    const range = searchHitRange({ molecule: record.molecule, sequence: record.sequence }, searchQuery, start)
    if (!range) return
    setSequenceRange(range)
    setSequenceScrollTarget(null)
    const scrollTo = mapZoomCaretPosition(range, record.sequence.length)
    queueMicrotask(() => setSequenceScrollTarget(scrollTo))
  }, [activeTab, motifHits, primerSearchHitIds, record.molecule, record.sequence, searchQuery, selectPrimerById, setPrimerTabAnchorId, setSequenceRange, setSequenceScrollTarget])

  useEffect(() => {
    setSearchHitIndex(0)
  }, [activeTab, searchQuery, searchHitCount, setSearchHitIndex])

  useEffect(() => {
    if (!searchQuery.trim() || searchHitCount <= 0 || activeTab === 'Primers' || activeTab === 'Enzymes') return
    revealSearchHit(0)
    // Reveal the first match when the query changes; Next/Prev call revealSearchHit directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- first-hit reveal on search input only
  }, [activeTab, searchQuery, searchHitCount, record.molecule])

  const goToSearchHit = useCallback((direction: -1 | 1) => {
    const next = nextSearchHitIndex(searchHitIndex, direction, searchHitCount)
    if (next === null) return
    setSearchHitIndex(next)
    revealSearchHit(next)
  }, [searchHitIndex, searchHitCount, setSearchHitIndex, revealSearchHit])

  return {
    motifHits,
    primerSearchHitIds,
    primerSearchHitSet: new Set(primerSearchHitIds),
    searchHitCount,
    searchHitLabel,
    motifQueryLength: searchQueryLength(record.molecule, searchQuery),
    revealSearchHit,
    goToSearchHit,
  }
}
