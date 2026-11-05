import { labPlasmid } from '../../domain/fixtures'
import type { SequenceRecord } from '../../domain/types'

export function isPristineDemoWorkspace(
  record: SequenceRecord,
  workspaceDiskPath: string | null,
  libraryFolderId: string | null | undefined,
  isDirty = false,
): boolean {
  if (isDirty) return false
  if (workspaceDiskPath) return false
  if (libraryFolderId !== undefined) return false
  // The boot workspace uses cloneFixture(), which deliberately assigns a fresh
  // record ID. Identify that untouched demo by stable sequence identity too.
  return record.name === labPlasmid.name
    && record.molecule === labPlasmid.molecule
    && record.topology === labPlasmid.topology
    && record.sequence === labPlasmid.sequence
}

export function shouldOpenMenuDocumentInNewWindow(
  isNativeDesktop: boolean,
  record: SequenceRecord,
  workspaceDiskPath: string | null,
  libraryFolderId: string | null | undefined,
  isDirty = false,
): boolean {
  return isNativeDesktop && !isPristineDemoWorkspace(record, workspaceDiskPath, libraryFolderId, isDirty)
}
