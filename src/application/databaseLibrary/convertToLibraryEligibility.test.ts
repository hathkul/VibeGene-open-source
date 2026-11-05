import { describe, expect, it } from 'vitest'
import { convertConstructToLibrary } from '../../domain/dnaLibrary'
import { labPlasmid } from '../../domain/fixtures'
import { traceRecordFromSequence } from '../../domain/sequenceTraceFactory'
import {
  canConvertConstructToLibrary,
  convertToLibraryPickerBlockedStatus,
  createdDnaLibraryStatusMessage,
  libraryCollapseStatusMessage,
} from './convertToLibraryEligibility'

describe('convert to library eligibility', () => {
  it('allows DNA constructs with sequence and blocks libraries or empty constructs', () => {
    expect(canConvertConstructToLibrary(labPlasmid)).toBe(true)
    expect(canConvertConstructToLibrary({ ...labPlasmid, sequence: '   ' })).toBe(false)
    expect(canConvertConstructToLibrary({ ...labPlasmid, molecule: 'protein' })).toBe(false)

    const peer = traceRecordFromSequence('ATGC', 'peer')
    const { record: library } = convertConstructToLibrary(labPlasmid, [peer])
    expect(canConvertConstructToLibrary(library)).toBe(false)
  })

  it('returns deterministic blocked-status copy', () => {
    const peer = traceRecordFromSequence('ATGC', 'peer')
    const { record: library } = convertConstructToLibrary(labPlasmid, [peer])
    expect(convertToLibraryPickerBlockedStatus(labPlasmid)).toBe(
      'Open a DNA construct with a sequence to convert it to a library.',
    )
    expect(convertToLibraryPickerBlockedStatus(library)).toBe('This file is already a DNA library.')
  })

  it('formats collapse and created-library status messages', () => {
    expect(libraryCollapseStatusMessage(1)).toContain('one member left')
    expect(libraryCollapseStatusMessage(0)).toContain('no members left')
    expect(createdDnaLibraryStatusMessage({ ...labPlasmid, traceFiles: [{ id: 'm1' } as never] })).toContain('1 member')
  })
})
