import { describe, expect, it } from 'vitest'
import {
  commonPrimerAddStatus,
  fileRenameSuccessStatus,
  folderDeleteSuccessStatus,
  projectTagsUpdateStatus,
} from './fileSelectionMessages'

describe('database manager status messages', () => {
  it('formats rename and folder delete copy', () => {
    expect(fileRenameSuccessStatus({ fileName: 'new.dna', constructName: 'pA' })).toContain('Construct name remains')
    expect(folderDeleteSuccessStatus('Lab')).toBe('Deleted folder “Lab”.')
  })

  it('formats tag and common primer updates', () => {
    expect(projectTagsUpdateStatus({ count: 2, cleared: false })).toContain('Updated tags on 2 files')
    expect(commonPrimerAddStatus({ addedNames: ['Oligo1'], skipped: 0 })).toContain('Added “Oligo1”')
    expect(commonPrimerAddStatus({ addedNames: [], skipped: 1 })).toBe('already-common')
  })
})
