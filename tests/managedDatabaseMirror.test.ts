import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  configureManagedDatabaseMirror,
  deleteManagedDatabaseFile,
  readManagedDatabaseFile,
  writeManagedDatabaseFile,
} from '../src/storage/managedDatabaseMirror'

afterEach(() => configureManagedDatabaseMirror(null))

describe('managed database mirror port', () => {
  it('uses a safe no-op adapter until the platform adapter is installed', async () => {
    expect(await writeManagedDatabaseFile('folder', 'project/file.dna', new Uint8Array([1]))).toBe(false)
    expect(await readManagedDatabaseFile('folder', 'project/file.dna')).toBeNull()
    expect(await deleteManagedDatabaseFile('folder', 'project/file.dna')).toBe(false)
  })

  it('delegates storage operations to the installed platform adapter', async () => {
    const bytes = new Uint8Array([1, 2, 3])
    const writeFile = vi.fn(async () => true)
    const readFile = vi.fn(async () => bytes)
    const deleteFile = vi.fn(async () => true)
    configureManagedDatabaseMirror({ writeFile, readFile, deleteFile })

    await expect(writeManagedDatabaseFile('folder', 'project/file.dna', bytes)).resolves.toBe(true)
    await expect(readManagedDatabaseFile('folder', 'project/file.dna')).resolves.toBe(bytes)
    await expect(deleteManagedDatabaseFile('folder', 'project/file.dna')).resolves.toBe(true)
    expect(writeFile).toHaveBeenCalledWith('folder', 'project/file.dna', bytes)
  })
})
