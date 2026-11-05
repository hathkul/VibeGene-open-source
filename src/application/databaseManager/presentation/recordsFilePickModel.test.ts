import { describe, expect, it } from 'vitest'
import {
  buildAppDatabaseManagerFilesPickChromeSlice,
  buildAppDatabaseManagerFilesRowActionSlice,
} from './recordsFilePickModel'

describe('database manager files pick chrome', () => {
  it('uses normal open row actions without pick context', () => {
    expect(
      buildAppDatabaseManagerFilesPickChromeSlice({
        constructPick: null,
        libraryMemberPick: null,
      }),
    ).toEqual({
      pickRowToggleMode: false,
      fileCheckboxReplaceSelection: false,
      showHeaderSelectAll: true,
    })

    expect(
      buildAppDatabaseManagerFilesRowActionSlice({
        constructPick: null,
        libraryMemberPick: null,
        selected: false,
        eligible: true,
      }),
    ).toEqual({ rowActionLabel: 'Open', rowActionDisabled: false })
  })

  it('uses pick row toggle and select/remove labels for library member pick', () => {
    expect(
      buildAppDatabaseManagerFilesPickChromeSlice({
        constructPick: null,
        libraryMemberPick: { targetRecordId: 'lib' },
      }).pickRowToggleMode,
    ).toBe(true)

    expect(
      buildAppDatabaseManagerFilesRowActionSlice({
        constructPick: null,
        libraryMemberPick: { targetRecordId: 'lib' },
        selected: true,
        eligible: false,
      }),
    ).toEqual({ rowActionLabel: 'Remove', rowActionDisabled: true })
  })

  it('uses single-select construct pick checkbox replacement', () => {
    expect(
      buildAppDatabaseManagerFilesPickChromeSlice({
        constructPick: { multiple: false },
        libraryMemberPick: null,
      }),
    ).toMatchObject({
      fileCheckboxReplaceSelection: true,
      showHeaderSelectAll: false,
    })

    expect(
      buildAppDatabaseManagerFilesRowActionSlice({
        constructPick: { multiple: false },
        libraryMemberPick: null,
        selected: false,
        eligible: true,
      }).rowActionLabel,
    ).toBe('Add')
  })
})
