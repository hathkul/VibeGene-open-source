import { describe, expect, it } from 'vitest'
import {
  managedDatabaseFilePath,
  normalizeManagedDatabaseRelativePath,
} from '../src/desktop/managedDatabaseFolders'

describe('managed database folder paths', () => {
  it('builds an app-data-relative path with normalized separators', () => {
    expect(managedDatabaseFilePath('folder_ab12', 'Gateway\\pUC19.gb')).toBe(
      'database-folders/folder_ab12/Gateway/pUC19.gb',
    )
  })

  it('rejects traversal, absolute paths, unsafe ids, and invalid segments', () => {
    expect(() => normalizeManagedDatabaseRelativePath('../outside.dna')).toThrow()
    expect(() => normalizeManagedDatabaseRelativePath('nested/../../outside.dna')).toThrow()
    expect(() => normalizeManagedDatabaseRelativePath('/absolute.dna')).toThrow()
    expect(() => normalizeManagedDatabaseRelativePath('C:\\absolute.dna')).toThrow()
    expect(() => managedDatabaseFilePath('../folder', 'safe.dna')).toThrow()
    expect(() => managedDatabaseFilePath('folder_ok', 'bad//name.dna')).toThrow()
  })
})
