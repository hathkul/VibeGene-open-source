import type { PrimerHybridizationParams } from '../../domain/primerHybridization'
import {
  projectPrimerOntoLibraryMembers,
  redistributeConsensusPrimersOntoLibraryMembers,
  removePrimerFromLibraryMembers,
  upsertMemberPrimer,
  deleteMemberPrimers,
} from '../../domain/libraryMemberPrimers'
import { exportPrimerDataTsv, resolvePrimerImportCandidates, retainHybridizingPrimersAgainstAny, type PrimerImportCandidate, type PrimerListEntry } from '../../domain/primerExport'
import { normalizeDna } from '../../domain/sequence'
import type { TraceFileRecord } from '../../domain/traceTypes'
import type { Primer, SequenceRecord } from '../../domain/types'

export type PrimerWorkflowContext = {
  record: SequenceRecord
  members: TraceFileRecord[]
  isLibrary: boolean
  referenceMemberId: string | null
  hybridization: PrimerHybridizationParams
}

export type PrimerWorkflowResult = {
  record: SequenceRecord
  members: TraceFileRecord[]
}

export type PrimerMutationResult = PrimerWorkflowResult & {
  added: Primer[]
  removed: Primer[]
}

export function exportPrimers(primers: readonly Primer[]): string {
  return exportPrimerDataTsv([...primers])
}

export function preparePrimerImport(
  template: string,
  entries: readonly PrimerListEntry[],
  existing: readonly Primer[],
  hybridization: PrimerHybridizationParams,
  options?: {
    additionalTemplates?: readonly string[]
    additionalExistingPrimers?: readonly Primer[]
  },
): { candidates: PrimerImportCandidate[]; skipped: number } {
  return resolvePrimerImportCandidates(
    template,
    [...entries],
    [...existing],
    hybridization,
    options
      ? {
        additionalTemplates: options.additionalTemplates ? [...options.additionalTemplates] : undefined,
        additionalExistingPrimers: options.additionalExistingPrimers ? [...options.additionalExistingPrimers] : undefined,
      }
      : undefined,
  )
}

function clonePrimer(primer: Primer): Primer {
  return {
    ...primer,
    bindings: primer.bindings?.map((binding) => ({
      ...binding,
      components: binding.components.map((component) => ({ ...component })),
    })),
  }
}

function upsertConsensusPrimer(record: SequenceRecord, primer: Primer): SequenceRecord {
  const exists = record.primers.some((entry) => entry.id === primer.id)
  return {
    ...record,
    primers: exists
      ? record.primers.map((entry) => entry.id === primer.id ? primer : entry)
      : [...record.primers, primer],
  }
}

/** Apply a primer editor save while preserving native reference-member semantics. */
export function savePrimer(
  context: PrimerWorkflowContext,
  primer: Primer,
  editingMemberId: string | null,
): PrimerWorkflowResult {
  if (!editingMemberId) {
    const record = context.record.primers.some((entry) => entry.id === primer.id)
      ? { ...context.record, primers: context.record.primers.map((entry) => entry.id === primer.id ? primer : entry) }
      : { ...context.record, primers: [...context.record.primers, primer] }
    const members = context.isLibrary && !context.referenceMemberId
      ? projectPrimerOntoLibraryMembers(primer, context.members, { hybridization: context.hybridization })
      : context.members
    return { record, members }
  }

  const member = context.members.find((entry) => entry.id === editingMemberId)
  if (!member) return { record: context.record, members: context.members }

  if (context.referenceMemberId === editingMemberId) {
    const withNative = context.members.map((entry) =>
      entry.id === editingMemberId ? upsertMemberPrimer(entry, primer) : entry,
    )
    const projected = projectPrimerOntoLibraryMembers(primer, withNative, {
      hybridization: context.hybridization,
    })
    return {
      record: upsertConsensusPrimer(context.record, primer),
      members: projected.map((entry) => entry.id === editingMemberId
        ? upsertMemberPrimer(entry, primer)
        : entry),
    }
  }

  return {
    record: context.record,
    members: context.members.map((entry) =>
      entry.id === editingMemberId ? upsertMemberPrimer(entry, primer) : entry,
    ),
  }
}

/** Duplicate primers into the selected member or consensus, projecting consensus copies. */
export function duplicatePrimers(
  context: PrimerWorkflowContext,
  primers: readonly Primer[],
  createId: () => string,
  selectedMemberId: string | null,
): PrimerMutationResult {
  const added = primers.map((primer) => ({
    ...clonePrimer(primer),
    id: createId(),
    name: `${primer.name} copy`,
  }))
  if (selectedMemberId) {
    let members = [...context.members]
    for (const primer of added) {
      members = members.map((entry) => entry.id === selectedMemberId
        ? upsertMemberPrimer(entry, primer)
        : entry)
    }
    return { record: context.record, members, added, removed: [] }
  }
  let record = context.record
  let members = [...context.members]
  for (const primer of added) {
    record = { ...record, primers: [...record.primers, primer] }
    if (context.isLibrary) {
      members = projectPrimerOntoLibraryMembers(primer, members, {
        hybridization: context.hybridization,
      })
    }
  }
  return { record, members, added, removed: [] }
}

/** Delete primers from one member, or from consensus and every projected member. */
export function deletePrimers(
  context: PrimerWorkflowContext,
  primers: readonly Primer[],
  editingMemberId: string | null,
): PrimerMutationResult {
  const ids = new Set(primers.map((primer) => primer.id))
  if (editingMemberId) {
    return {
      record: context.record,
      members: context.members.map((member) => member.id === editingMemberId
        ? deleteMemberPrimers(member, ids)
        : member),
      added: [],
      removed: [...primers],
    }
  }
  return {
    record: { ...context.record, primers: context.record.primers.filter((primer) => !ids.has(primer.id)) },
    members: context.isLibrary
      ? primers.reduce((members, primer) => removePrimerFromLibraryMembers(primer.id, members), [...context.members])
      : context.members,
    added: [],
    removed: [...primers],
  }
}

/** Change visibility in one explicit scope; UI selection and status remain adapter concerns. */
export function setPrimerVisibility(
  context: PrimerWorkflowContext,
  primerIds: readonly string[],
  visible: boolean,
  memberId: string | null,
): PrimerWorkflowResult {
  const ids = new Set(primerIds)
  const apply = (primers: readonly Primer[]) => primers.map((primer) =>
    ids.has(primer.id) ? { ...primer, visible: visible ? undefined : false } : primer,
  )
  if (memberId) {
    return {
      record: context.record,
      members: context.members.map((member) => member.id === memberId
        ? { ...member, primers: apply(member.primers ?? []) }
        : member),
    }
  }
  return { record: { ...context.record, primers: apply(context.record.primers) }, members: context.members }
}

export function setPrimerColor(
  context: PrimerWorkflowContext,
  primerIds: readonly string[],
  color: string,
  memberId: string | null,
): PrimerWorkflowResult {
  const ids = new Set(primerIds)
  const apply = (primers: readonly Primer[]) => primers.map((primer) =>
    ids.has(primer.id) ? { ...primer, color } : primer,
  )
  if (memberId) {
    return {
      record: context.record,
      members: context.members.map((member) => member.id === memberId
        ? { ...member, primers: apply(member.primers ?? []) }
        : member),
    }
  }
  const record = { ...context.record, primers: apply(context.record.primers) }
  const members = context.isLibrary
    ? context.members.map((member) => ({ ...member, primers: apply(member.primers ?? []) }))
    : context.members
  return { record, members }
}

/** Re-anneal consensus primers and discard entries that no longer hybridize. */
export function refreshPrimerHybridization(
  context: PrimerWorkflowContext,
  templates: readonly string[],
): PrimerWorkflowResult & { dropped: Primer[] } {
  const { kept } = retainHybridizingPrimersAgainstAny(
    templates,
    context.record.primers,
    context.hybridization,
  )
  const keptIds = new Set(kept.map((primer) => primer.id))
  const dropped = context.record.primers.filter((primer) => !keptIds.has(primer.id))
  return {
    record: { ...context.record, primers: kept },
    members: context.isLibrary
      ? redistributeConsensusPrimersOntoLibraryMembers(kept, context.members, context.hybridization)
      : context.members,
    dropped,
  }
}

/** Add imported/picked/database primers, de-duplicating by normalized sequence. */
export function addPrimers(
  context: PrimerWorkflowContext,
  incoming: readonly Primer[],
  options: { refreshExisting?: boolean } = {},
): PrimerMutationResult {
  const templates = context.isLibrary
    ? [context.record.sequence, ...context.members.filter((member) => !member.parseError && member.sequence).map((member) => member.sequence)]
    : [context.record.sequence]
  const existing = options.refreshExisting === false
    ? { kept: context.record.primers, dropped: 0 }
    : retainHybridizingPrimersAgainstAny(templates, context.record.primers, context.hybridization)
  const { kept: incomingKept } = retainHybridizingPrimersAgainstAny(
    templates,
    [...incoming],
    context.hybridization,
  )
  const seen = new Set(existing.kept.map((primer) => normalizeDna(primer.sequence)))
  const added = incomingKept.filter((primer) => {
    const sequence = normalizeDna(primer.sequence)
    if (!sequence || seen.has(sequence)) return false
    seen.add(sequence)
    return true
  })
  const primers = [...existing.kept, ...added]
  return {
    record: { ...context.record, primers },
    members: context.isLibrary
      ? redistributeConsensusPrimersOntoLibraryMembers(primers, context.members, context.hybridization)
      : context.members,
    added,
    removed: context.record.primers.filter((primer) => !existing.kept.some((entry) => entry.id === primer.id)),
  }
}
