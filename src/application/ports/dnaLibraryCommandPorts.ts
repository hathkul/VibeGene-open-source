import type { SequenceRecord } from '../../domain/types'

/** Native picker outcomes for convert-to-library member files (composition root assembles Tauri/dialog I/O). */
export type NativeConvertToLibraryMemberPickResult =
  | { kind: 'cancelled' }
  | { kind: 'unreadable' }
  | { kind: 'files'; files: File[] }

export type DnaLibraryNativePickerPort = {
  nativeRuntime: boolean
  pickCreateLibraryInNewWindow: () => Promise<SequenceRecord | null>
  pickConvertToLibraryMemberFiles: () => Promise<NativeConvertToLibraryMemberPickResult>
}

export type DnaLibraryConvertCommands = {
  convertOpenConstructToLibraryFromFiles: (files: File[]) => Promise<void>
  convertOpenConstructToLibraryFromDatabase: (projectIds: string[]) => Promise<void>
}

export type DnaLibraryCreationCommands = {
  createDnaLibraryFromFiles: (files: File[]) => Promise<void>
}
