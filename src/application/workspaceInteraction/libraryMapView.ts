import { isDnaLibraryRecord } from '../../domain/dnaLibrary'
import { resolveDnaEnds } from '../../domain/dnaEnds'
import { findRestrictionSites } from '../../domain/enzymes'
import { isLibraryConsensusEnabled } from '../../domain/libraryMemberFeatures'
import { sequenceRecordFromLibraryMember } from '../../domain/libraryMemberRecord'
import { regeneratedEndRestrictionSites } from '../../domain/newFileFromSelection'
import { displayableRecordFeatures } from '../../domain/primerPaneEntries'
import { resolveDisplayablePrimerSites } from '../../domain/primerSequenceLayout'
import type { PrimerHybridizationParams } from '../../domain/primerHybridization'
import { filterRestrictionSitesForEnzymeSet, type EnzymeSetFilter } from '../../domain/restrictionSiteFilters'
import type { TraceFileRecord } from '../../domain/traceTypes'
import type {
  PrimerBinding,
  RestrictionEnzyme,
  RestrictionSite,
  SequenceFeature,
  SequenceRecord,
} from '../../domain/types'
import type { SelectionRange } from '../selectionEditing/selectionEditing'

export type MapEnzymeDisplaySettings = EnzymeSetFilter & { visible: boolean; hiddenNames?: string[] }

export type MapFeatureDisplaySettings = {
  featuresVisible: boolean
  orfsVisible: boolean
  sgRnasVisible: boolean
}

export type MapPrimerDisplaySettings = {
  visible: boolean
  hybridization: PrimerHybridizationParams
}

function filterRestrictionSitesForMapDisplay(
  sites: RestrictionSite[],
  settings: MapEnzymeDisplaySettings,
): RestrictionSite[] {
  if (!settings.visible) return []
  const hiddenNames = new Set(settings.hiddenNames ?? [])
  return filterRestrictionSitesForEnzymeSet(sites, settings).filter((site) => !hiddenNames.has(site.enzyme.name))
}

export function resolveMainDisplayablePrimerSites(
  record: SequenceRecord,
  hybridization: PrimerHybridizationParams,
) {
  return resolveDisplayablePrimerSites(record, hybridization)
}

export function selectLibraryMapMembers(input: {
  alignmentsVisible: boolean
  record: SequenceRecord
  traceFiles: TraceFileRecord[]
}): TraceFileRecord[] {
  if (input.alignmentsVisible || !isDnaLibraryRecord(input.record)) return []
  return input.traceFiles.filter((member) => member.enabled && member.sequence.length > 0)
}

export function libraryMapConsensusVisible(record: SequenceRecord): boolean {
  return isDnaLibraryRecord(record) && isLibraryConsensusEnabled(record)
}

export function resolveLibraryMapBrowseMemberId(input: {
  browseActive: boolean
  consensusVisible: boolean
  members: TraceFileRecord[]
  selectedAlignmentTraceId: string | null
}): string | null {
  if (!input.browseActive) return null
  if (
    input.selectedAlignmentTraceId
    && input.members.some((member) => member.id === input.selectedAlignmentTraceId)
  ) {
    return input.selectedAlignmentTraceId
  }
  if (!input.consensusVisible) return input.members[0]?.id ?? null
  return null
}

export function resolveLibraryMapBrowseMember(
  browseMemberId: string | null,
  members: TraceFileRecord[],
): TraceFileRecord | null {
  if (!browseMemberId) return null
  return members.find((member) => member.id === browseMemberId) ?? null
}

export function buildLibraryMapBrowseKeys(
  consensusVisible: boolean,
  members: TraceFileRecord[],
): Array<string | null> {
  return consensusVisible
    ? ([null, ...members.map((member) => member.id)] as Array<string | null>)
    : members.map((member) => member.id)
}

export function libraryMapBrowseIndex(
  browseKeys: Array<string | null>,
  browseMemberId: string | null,
): number {
  return Math.max(0, browseKeys.findIndex((key) => key === browseMemberId))
}

export function resolveMapViewRecord(
  record: SequenceRecord,
  browseMember: TraceFileRecord | null,
): SequenceRecord {
  if (!browseMember) return record
  return sequenceRecordFromLibraryMember(browseMember, { topology: record.topology })
}

export function resolveMapViewRestrictionSites(input: {
  activeEnzymePool: RestrictionEnzyme[]
  browseMember: TraceFileRecord | null
  construct: SequenceRecord['construct']
  displayedRestrictionSites: RestrictionSite[]
  enzymeDisplay: MapEnzymeDisplaySettings
  mapViewRecord: SequenceRecord
  restrictionEnzymesEnabled: boolean
}): RestrictionSite[] {
  if (!input.browseMember) return input.displayedRestrictionSites
  if (!input.restrictionEnzymesEnabled || !input.enzymeDisplay.visible) return []
  const filtered = filterRestrictionSitesForMapDisplay(
    findRestrictionSites(input.browseMember.sequence, input.activeEnzymePool, {
      construct: input.construct,
      topology: input.mapViewRecord.topology,
      annotateMethylation: true,
    }),
    input.enzymeDisplay,
  )
  const regenerated = regeneratedEndRestrictionSites(
    resolveDnaEnds(input.mapViewRecord),
    input.mapViewRecord.sequence.length,
  )
  const hiddenNames = new Set(input.enzymeDisplay.hiddenNames ?? [])
  const visibleRegenerated = regenerated.filter((site) => !hiddenNames.has(site.enzyme.name))
  return visibleRegenerated.length ? [...filtered, ...visibleRegenerated] : filtered
}

export function resolveMapViewAnnotationFeatures(input: {
  browseMember: TraceFileRecord | null
  featureDisplay: MapFeatureDisplaySettings
  mapAnnotationFeatures: SequenceFeature[]
  memberOrfFeatures: SequenceFeature[]
  orfPredictionEnabled: boolean
}): SequenceFeature[] {
  if (!input.browseMember) return input.mapAnnotationFeatures
  const stored = displayableRecordFeatures(input.browseMember.features ?? [], {
    featuresVisible: input.featureDisplay.featuresVisible,
    sgRnasVisible: input.featureDisplay.sgRnasVisible,
  })
  const orfs = input.featureDisplay.orfsVisible && input.orfPredictionEnabled
    ? input.memberOrfFeatures
    : []
  return [...stored, ...orfs]
}

export function resolveMapViewPrimerBindings(input: {
  browseMember: TraceFileRecord | null
  mapViewRecord: SequenceRecord
  primerBindings: PrimerBinding[]
  primerDisplay: MapPrimerDisplaySettings
}): PrimerBinding[] {
  if (!input.browseMember) return input.primerBindings
  if (!input.primerDisplay.visible) return []
  return resolveDisplayablePrimerSites(
    input.mapViewRecord,
    input.primerDisplay.hybridization,
  ).bindings
}

export function clampMapViewSelectedRange(input: {
  cutStrandForward: SelectionRange | null | undefined
  mapViewSequenceLength: number
  selectedRange: SelectionRange | null
}): SelectionRange | null {
  const range = input.selectedRange ?? input.cutStrandForward ?? null
  if (!range) return null
  const length = input.mapViewSequenceLength
  if (length <= 0 || range.start >= length) return null
  return {
    start: Math.max(0, Math.min(length, range.start)),
    end: Math.max(0, Math.min(length, range.end)),
  }
}
