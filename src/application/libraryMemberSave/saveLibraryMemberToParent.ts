import { isDnaLibraryRecord, syncTraceSequenceAndBaseCalls } from '../../domain/dnaLibrary'
import { realignTraceFileRecords } from '../../domain/traceFileWorkflow'
import type { SequenceRecord } from '../../domain/types'
import type { WorkspaceDocumentOrigin } from '../../domain/workspaceDocumentOrigin'
import type { SaveProjectExtras, StoredProject } from '../ports/projectPersistence'

type LibraryMemberOrigin = Extract<WorkspaceDocumentOrigin, { kind: 'library-member' }>

export type SaveLibraryMemberPorts = {
  getProject: (projectId: string) => Promise<StoredProject | null>
  saveProject: (record: SequenceRecord, extras: SaveProjectExtras) => Promise<SequenceRecord>
}

export type SavedLibraryMember = {
  parent: SequenceRecord
  origin: LibraryMemberOrigin
}

function copyFeatures(record: SequenceRecord) {
  return record.features.map((feature) => ({
    ...feature,
    locations: feature.locations.map((location) => ({ ...location })),
  }))
}

function copyPrimers(record: SequenceRecord) {
  return record.primers.map((primer) => ({
    ...primer,
    bindings: primer.bindings?.map((binding) => ({
      ...binding,
      components: binding.components.map((component) => ({ ...component })),
    })),
  }))
}

/** Save an independently edited construct back into the database library member it came from. */
export async function saveLibraryMemberToParent(
  edited: SequenceRecord,
  origin: LibraryMemberOrigin,
  ports: SaveLibraryMemberPorts,
): Promise<SavedLibraryMember> {
  const project = await ports.getProject(origin.projectId)
  if (!project || !isDnaLibraryRecord(project.record)) {
    throw new Error('The source DNA library is no longer available.')
  }
  if (project.record.updatedAt !== origin.parentUpdatedAt) {
    throw new Error('The source DNA library changed in another window. Reopen this member before saving.')
  }
  const members = project.record.traceFiles ?? []
  const memberIndex = members.findIndex((member) => member.id === origin.memberId)
  if (memberIndex < 0) throw new Error('This member is no longer present in the source DNA library.')

  const source = members[memberIndex]!
  const sequenceUpdated = syncTraceSequenceAndBaseCalls(source, edited.sequence)
  const member = {
    ...sequenceUpdated,
    fileName: edited.name.trim() || source.fileName,
    features: copyFeatures(edited),
    primers: copyPrimers(edited),
    history: edited.history,
    alignment: null,
  }
  const aligned = realignTraceFileRecords(
    [member],
    project.record.sequence,
    { force: true, topology: project.record.topology },
  )[0] ?? member
  const nextMembers = members.map((candidate, index) => index === memberIndex ? aligned : candidate)
  const nextParent = { ...project.record, traceFiles: nextMembers }
  const saved = await ports.saveProject(nextParent, {
    folderId: project.folderId ?? null,
    tags: project.tags ?? [],
    expectedProjectUpdatedAt: project.record.updatedAt,
  })
  return {
    parent: saved,
    origin: { ...origin, parentUpdatedAt: saved.updatedAt },
  }
}
