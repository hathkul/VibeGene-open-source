import type { WorkspaceDocumentBinding } from './projectSaveSemantics'

/**
 * Durable ownership of the document currently mounted in a workspace.
 *
 * This deliberately keeps the parent database project separate from the
 * editable record id: a library member is a construct in its own window, but
 * its default Save target is the library project that supplied it.
 */
export type WorkspaceDocumentOrigin =
  | { kind: 'new' }
  | { kind: 'disk'; path: string }
  | { kind: 'database'; projectId: string; folderId: string | null }
  | {
      kind: 'library-member'
      projectId: string
      folderId: string | null
      memberId: string
      /** Parent revision observed when the member was opened; used for conflict detection. */
      parentUpdatedAt: string
    }

export const NEW_WORKSPACE_DOCUMENT_ORIGIN: WorkspaceDocumentOrigin = { kind: 'new' }

export function diskWorkspaceDocumentOrigin(path: string | null | undefined): WorkspaceDocumentOrigin {
  const normalized = path?.trim()
  return normalized ? { kind: 'disk', path: normalized } : NEW_WORKSPACE_DOCUMENT_ORIGIN
}

export function databaseWorkspaceDocumentOrigin(
  projectId: string,
  folderId: string | null | undefined,
): WorkspaceDocumentOrigin {
  return { kind: 'database', projectId, folderId: folderId ?? null }
}

export function libraryMemberWorkspaceDocumentOrigin(input: {
  projectId: string
  folderId: string | null | undefined
  memberId: string
  parentUpdatedAt: string
}): WorkspaceDocumentOrigin {
  return {
    kind: 'library-member',
    projectId: input.projectId,
    folderId: input.folderId ?? null,
    memberId: input.memberId,
    parentUpdatedAt: input.parentUpdatedAt,
  }
}

export function workspaceDocumentBindingForOrigin(origin: WorkspaceDocumentOrigin): WorkspaceDocumentBinding {
  if (origin.kind === 'disk') return 'disk'
  if (origin.kind === 'database') return 'database'
  if (origin.kind === 'library-member') return 'database'
  return 'new'
}

/** Validate untrusted localStorage/IndexedDB handoff metadata. */
export function parseWorkspaceDocumentOrigin(value: unknown): WorkspaceDocumentOrigin | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  if (raw.kind === 'new') return NEW_WORKSPACE_DOCUMENT_ORIGIN
  if (raw.kind === 'disk' && typeof raw.path === 'string' && raw.path.trim()) {
    return diskWorkspaceDocumentOrigin(raw.path)
  }
  if (
    raw.kind === 'database'
    && typeof raw.projectId === 'string'
    && raw.projectId.trim()
    && (typeof raw.folderId === 'string' || raw.folderId === null || raw.folderId === undefined)
  ) {
    return databaseWorkspaceDocumentOrigin(raw.projectId, typeof raw.folderId === 'string' ? raw.folderId : null)
  }
  if (
    raw.kind === 'library-member'
    && typeof raw.projectId === 'string'
    && raw.projectId.trim()
    && typeof raw.memberId === 'string'
    && raw.memberId.trim()
    && typeof raw.parentUpdatedAt === 'string'
    && raw.parentUpdatedAt.trim()
    && (typeof raw.folderId === 'string' || raw.folderId === null || raw.folderId === undefined)
  ) {
    return libraryMemberWorkspaceDocumentOrigin({
      projectId: raw.projectId,
      folderId: typeof raw.folderId === 'string' ? raw.folderId : null,
      memberId: raw.memberId,
      parentUpdatedAt: raw.parentUpdatedAt,
    })
  }
  return null
}
