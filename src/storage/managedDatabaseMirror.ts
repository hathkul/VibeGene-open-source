export type ManagedDatabaseMirror = {
  writeFile(folderId: string, relativePath: string, bytes: Uint8Array): Promise<boolean>
  readFile(folderId: string, relativePath: string): Promise<Uint8Array | null>
  deleteFile(folderId: string, relativePath: string): Promise<boolean>
}

const unavailableMirror: ManagedDatabaseMirror = {
  writeFile: async () => false,
  readFile: async () => null,
  deleteFile: async () => false,
}

let managedDatabaseMirror: ManagedDatabaseMirror = unavailableMirror

/** Install the platform adapter at the composition root. Web/tests keep the no-op default. */
export function configureManagedDatabaseMirror(adapter: ManagedDatabaseMirror | null): void {
  managedDatabaseMirror = adapter ?? unavailableMirror
}

export function writeManagedDatabaseFile(folderId: string, relativePath: string, bytes: Uint8Array) {
  return managedDatabaseMirror.writeFile(folderId, relativePath, bytes)
}

export function readManagedDatabaseFile(folderId: string, relativePath: string) {
  return managedDatabaseMirror.readFile(folderId, relativePath)
}

export function deleteManagedDatabaseFile(folderId: string, relativePath: string) {
  return managedDatabaseMirror.deleteFile(folderId, relativePath)
}
