import { useCallback } from 'react'
import { restrictionSiteRange, siteKey } from '../map/mapPrimitives'
import type { RestrictionSite, SequenceRecord } from '../../domain/types'
import type { SelectionRange } from '../sequence'

type Options = {
  record: SequenceRecord
  alignmentsVisible: boolean
  setSelectedFeatureId: (id: string | null) => void
  setSelectedFeatureIds: (ids: string[]) => void
  setSelectedPrimerId: (id: string | null) => void
  setSelectedPrimerIds: (ids: string[]) => void
  setSelectionFocus: (focus: 'dna' | 'feature' | 'primer' | 'bond') => void
  setCutStrandSelection: (value: null) => void
  setCutSelectionEnzymes: (value: null) => void
  setCutSelectionAnchor: (value: null) => void
  setSelectedRange: (range: SelectionRange) => void
  setSequenceScrollTarget: (position: number | null) => void
  setSequenceHoverSiteKey: (key: string | null) => void
  scrollAlignmentToTemplate: (position: number) => void
  setStatus: (status: string) => void
  formatRange: (range: SelectionRange) => string
}

export function useRestrictionSiteNavigationController(options: Options) {
  const selectRestrictionSite = useCallback((site: RestrictionSite) => {
    const range = restrictionSiteRange(site, options.record.sequence.length)
    options.setSelectedFeatureId(null); options.setSelectedFeatureIds([]); options.setSelectedPrimerId(null); options.setSelectedPrimerIds([])
    options.setSelectionFocus('dna'); options.setCutStrandSelection(null); options.setCutSelectionEnzymes(null); options.setCutSelectionAnchor(null); options.setSelectedRange(range)
    options.setStatus(`Selected ${site.enzyme.name} site ${options.formatRange(range)}; cuts top ${site.cutTop + 1}, bottom ${site.cutBottom + 1}.`)
  }, [options])

  const navigateToEnzymeSite = useCallback((site: RestrictionSite) => {
    selectRestrictionSite(site)
    if (options.alignmentsVisible) options.scrollAlignmentToTemplate(site.start)
    else options.setSequenceScrollTarget(site.start)
    options.setSequenceHoverSiteKey(siteKey(site))
    options.setStatus(`Selected ${site.enzyme.name} site at position ${site.start + 1}. Open Sequence to view.`)
  }, [options, selectRestrictionSite])

  return { selectRestrictionSite, navigateToEnzymeSite }
}
