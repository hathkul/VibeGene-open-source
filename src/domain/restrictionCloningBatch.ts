import type { AlignPendingTraces } from './traceFileWorkflow'
import { findRestrictionSites } from './enzymes'
import {
  createDnaLibraryFromMembers,
  createDnaLibraryFromMembersAsync,
  isDnaLibraryRecord,
} from './dnaLibrary'
import { withPackedLibraryMemberFeatures } from './libraryMemberFeatures'
import { sequenceRecordFromLibraryMember } from './libraryMemberRecord'
import { beginOperationProgress } from './operationProgress'
import { createId } from './sequence'
import {
  defaultDigestFragmentId,
  isSameRestrictionCut,
  listDigestFragmentsBetweenCuts,
  type CloningAssemblyMode,
  type CloningPartConfig,
} from './restrictionCloning'
import type { RestrictionEnzyme, RestrictionSite, SequenceRecord } from './types'
import type { TraceFileRecord } from './traceTypes'
import { traceRecordFromSequence } from './sequenceTraceFactory'

export const MASS_INSERT_NAME_TOKEN = '<insert_name>'
export const MASS_VECTOR_NAME_TOKEN = '<vector_name>'

export type RestrictionBatchSourceChoice = {
  key: string
  record: SequenceRecord
  librarySource?: {
    key: string
    name: string
    memberId: string
  }
}

/** Package mass-cloning products as annotated members of one DNA library document. */
export function createRestrictionCloningProductLibrary(
  products: readonly SequenceRecord[],
  name: string,
): SequenceRecord {
  const members = cloningProductMembers(products)
  const topology = cloningProductTopology(products)
  const library = createDnaLibraryFromMembers(members, {
    name,
    topology,
    seedMemberId: members[0]!.id,
  })
  return packCloningProductLibrary(library)
}

/** Worker-backed packaging for interactive mass-cloning output. */
export async function createRestrictionCloningProductLibraryAsync(
  products: readonly SequenceRecord[],
  name: string,
  alignPending?: AlignPendingTraces,
): Promise<SequenceRecord> {
  const progress = beginOperationProgress('Preparing cloned-output library', products.length)
  try {
    const members = cloningProductMembers(products)
    const topology = cloningProductTopology(products)
    const library = await createDnaLibraryFromMembersAsync(members, {
      name,
      topology,
      seedMemberId: members[0]!.id,
      alignPending,
    }, (completed, total) => progress.update(completed, total, `${completed} of ${total} members aligned`))
    return packCloningProductLibrary(library)
  } finally {
    progress.finish()
  }
}

function cloningProductMembers(products: readonly SequenceRecord[]): TraceFileRecord[] {
  if (!products.length) throw new Error('No cloning products were generated.')
  return products.map((product) => ({
    ...traceRecordFromSequence(product.sequence, product.name, { id: product.id }),
    features: product.features.map((feature) => ({
      ...feature,
      locations: feature.locations.map((location) => ({ ...location })),
    })),
    primers: product.primers.map((primer) => ({
      ...primer,
      bindings: primer.bindings?.map((binding) => ({
        ...binding,
        components: binding.components.map((component) => ({ ...component })),
      })),
    })),
    history: product.history,
  }))
}

function cloningProductTopology(products: readonly SequenceRecord[]): 'circular' | 'linear' {
  return products.every((product) => product.topology === 'circular')
    ? 'circular'
    : 'linear'
}

function packCloningProductLibrary(library: { record: SequenceRecord; members: TraceFileRecord[] }): SequenceRecord {
  // Use the first product as consensus seed (stable cloning / source-library order).
  // Longest-member seeding made Consensus inherit annotations from an arbitrary long insert
  // (e.g. the 13th library member) even though Consensus is shown as the first block.
  const seed = library.members[0]!
  const record = {
    ...library.record,
    features: (seed.features ?? []).map((feature) => ({
      ...feature,
      locations: feature.locations.map((location) => ({ ...location })),
    })),
    primers: (seed.primers ?? []).map((primer) => ({
      ...primer,
      bindings: primer.bindings?.map((binding) => ({
        ...binding,
        components: binding.components.map((component) => ({ ...component })),
      })),
    })),
    traceFiles: library.members,
  }
  const packed = withPackedLibraryMemberFeatures(record, library.members)
  const cloningMembers = library.members.filter((member) =>
    member.history?.operation === 'insertFragment' ||
    member.history?.operation === 'insertFragments' ||
    member.history?.operation === 'ligateFragments',
  )
  // A library has no one canonical assembly: its member histories hold the
  // individual reactions.  Give the library a compact aggregate root so the
  // History pane can offer those recipes without pretending it has one set of
  // parents itself.
  if (!cloningMembers.length) return packed
  return {
    ...packed,
    history: {
      id: createId('history'),
      name: packed.name,
      seqLen: packed.sequence.length,
      circular: packed.topology === 'circular',
      operation: 'cloneLibrary',
      resurrectable: false,
      hideHistory: false,
      oligos: [],
      regeneratedSites: [],
      inputSummaries: [],
      features: [],
      sequence: packed.sequence,
      children: [],
    },
  }
}

/** Expand DNA-library sources into one linear insert choice per member. */
export function expandRestrictionInsertSources(
  choices: readonly RestrictionBatchSourceChoice[],
  options: { topology?: 'linear' | 'source' } = {},
): RestrictionBatchSourceChoice[] {
  return choices.flatMap((choice) => {
    if (!isDnaLibraryRecord(choice.record)) return [choice]
    return (choice.record.traceFiles ?? []).map((member, index) => ({
      key: `${choice.key}|library-member:${member.id || index}`,
      record: sequenceRecordFromLibraryMember(member, {
        topology: options.topology === 'source' ? choice.record.topology : 'linear',
      }),
      librarySource: {
        key: choice.key,
        name: choice.record.name,
        memberId: member.id || String(index),
      },
    }))
  })
}

/** Expand the currently open library when a unary restriction operation starts. */
export function initialRestrictionOperationBatchSources(
  record: SequenceRecord,
  mode: CloningAssemblyMode,
): RestrictionBatchSourceChoice[] {
  if (
    (mode !== 'delete-fragment' && mode !== 'destroy-site') ||
    !isDnaLibraryRecord(record)
  ) {
    return []
  }
  return expandRestrictionInsertSources(
    [{ key: `current:${record.id}`, record }],
    { topology: 'source' },
  )
}

const KNOWN_CONSTRUCT_EXTENSION =
  /\.(?:dna|prot|json|gb|gbk|gbff|gbank|gbs|gbwithparts|gen|genbank|ape|flat|embl|emb|ebl|dat|fasta|fa|fas|fna|ffn|fsa|mpfa|seq|txt|gp|gpff|faa|pep|protein)$/i

export function constructNameStem(name: string, fallback = 'Insert'): string {
  return name.trim().replace(KNOWN_CONSTRUCT_EXTENSION, '') || fallback
}

export function hasMassInsertNameToken(template: string): boolean {
  return /<insert_name>/i.test(template)
}

export function hasMassVectorNameToken(template: string): boolean {
  return /<vector_name>/i.test(template)
}

export function renderMassRestrictionProductName(
  template: string,
  insertName: string,
  vectorName = 'Vector',
): string {
  const insertStem = constructNameStem(insertName)
  const vectorStem = constructNameStem(vectorName, 'Vector')
  const value = template.trim() || `Cloned ${MASS_INSERT_NAME_TOKEN}.dna`
  return value
    .replace(/<insert_name>/gi, insertStem)
    .replace(/<vector_name>/gi, vectorStem)
}

function humanList(values: string[]): string {
  if (values.length <= 1) return values[0] ?? ''
  return `${values.slice(0, -1).join(', ')} and ${values[values.length - 1]}`
}

/** Explain the common batch failure where a target insert lacks a configured digest site. */
export function describeMissingRestrictionSites(
  template: CloningPartConfig,
  mapped: CloningPartConfig,
): string | null {
  const missing = [
    template.leftCut.site && !mapped.leftCut.site ? template.leftCut.site.enzyme.name : null,
    template.rightCut.site && !mapped.rightCut.site ? template.rightCut.site.enzyme.name : null,
  ].filter((name): name is string => Boolean(name))
  const enzymeNames = [...new Set(missing)]
  if (!enzymeNames.length) return null
  return `missing ${humanList(enzymeNames)} restriction site${enzymeNames.length === 1 ? '' : 's'}`
}

export function formatSkippedRestrictionInserts(
  failures: Array<{ insertName: string; reason: string }>,
): string {
  if (!failures.length) return ''
  return `${failures.length} insert${failures.length === 1 ? '' : 's'} could not be cloned: ${failures
    .map(({ insertName, reason }) => `${insertName} — ${reason.replace(/[.\s]+$/, '')}`)
    .join('; ')}.`
}

export function formatSkippedRestrictionProducts(
  failures: Array<{ vectorName: string; insertName: string; reason: string }>,
  action = 'cloned',
): string {
  if (!failures.length) return ''
  return `${failures.length} product${failures.length === 1 ? '' : 's'} could not be ${action}: ${failures
    .map(
      ({ vectorName, insertName, reason }) =>
        `${insertName ? `${vectorName} ← ${insertName}` : vectorName} — ${reason.replace(/[.\s]+$/, '')}`,
    )
    .join('; ')}.`
}

/** Stable vector-major Cartesian product used by multi-vector/multi-insert cloning. */
export function restrictionBatchPairs<
  TVector extends { key: string },
  TInsert extends { key: string },
>(vectors: TVector[], inserts: TInsert[]) {
  return vectors.flatMap((vector) =>
    inserts.map((insert) => ({
      key: `vector:${vector.key}|insert:${insert.key}`,
      vector,
      insert,
    })),
  )
}

function sameSite(left: RestrictionSite, right: RestrictionSite): boolean {
  return (
    left.enzyme.name === right.enzyme.name &&
    left.start === right.start &&
    left.cutTop === right.cutTop &&
    left.cutBottom === right.cutBottom
  )
}

function sitesForEnzyme(record: SequenceRecord, enzyme: RestrictionEnzyme): RestrictionSite[] {
  const scanned = findRestrictionSites(record.sequence, [enzyme], {
    construct: record.construct,
    topology: record.topology,
    annotateMethylation: true,
  })
    .filter((site) => site.enzyme.name === enzyme.name)
    .sort((left, right) => left.start - right.start || left.cutTop - right.cutTop)
  return [
    ...new Map(
      scanned.map((site) => [
        `${site.enzyme.name}@${site.start}@${site.end}@${site.cutTop}@${site.cutBottom}`,
        site,
      ]),
    ).values(),
  ]
}

function matchingSite(
  templateRecord: SequenceRecord | null,
  templateSite: RestrictionSite | null,
  targetRecord: SequenceRecord,
): RestrictionSite | null {
  if (!templateSite) return null
  const candidates = sitesForEnzyme(targetRecord, templateSite.enzyme)
  if (!candidates.length) return null
  if (!templateRecord) return candidates[0] ?? null
  const templateCandidates = sitesForEnzyme(templateRecord, templateSite.enzyme)
  const occurrence = templateCandidates.findIndex((site) => sameSite(site, templateSite))
  return candidates[Math.max(0, occurrence)] ?? null
}

/**
 * Apply the enzyme choices and chemistry of one configured cloning part to another construct.
 * Restriction-site occurrence is preserved (first EcoRI site maps to first EcoRI site, etc.),
 * while fragment IDs preserve the chosen forward/reverse arc where possible.
 */
export function remapRestrictionPartConfig(
  template: CloningPartConfig,
  record: SequenceRecord,
): CloningPartConfig {
  if (template.record === record) return { ...template, record }

  const leftSite = matchingSite(template.record, template.leftCut.site, record)
  const rightSite =
    template.leftCut.site &&
    template.rightCut.site &&
    isSameRestrictionCut(template.leftCut.site, template.rightCut.site)
      ? leftSite
      : matchingSite(template.record, template.rightCut.site, record)

  let selectedFragmentId: string | null = null
  if (leftSite && rightSite) {
    const fragments = listDigestFragmentsBetweenCuts(record, leftSite, rightSite)
    selectedFragmentId = fragments.some((fragment) => fragment.id === template.selectedFragmentId)
      ? template.selectedFragmentId
      : defaultDigestFragmentId(template.role, fragments, record.sequence.length)
  }

  return {
    ...template,
    record,
    leftCut: {
      ...template.leftCut,
      enzymeName: template.leftCut.site?.enzyme.name ?? template.leftCut.enzymeName,
      site: leftSite,
    },
    rightCut: {
      ...template.rightCut,
      enzymeName: template.rightCut.site?.enzyme.name ?? template.rightCut.enzymeName,
      site: rightSite,
    },
    selectedFragmentId,
  }
}

/** Backwards-compatible insert-specific name for callers outside the batch matrix. */
export const remapRestrictionInsertConfig = remapRestrictionPartConfig
