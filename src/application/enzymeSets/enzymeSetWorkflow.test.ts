import { describe, expect, it } from 'vitest'
import {
  findSavedEnzymeSet,
  normalizeRecordFileEnzymeSets,
  planChooseEnzymesConfirmation,
  planEnzymeSetModeSelection,
  planEnzymeSupplierSelection,
  planEnzymesVisibilityToggle,
  planExportEnzymeSet,
  planManageEnzymeSetsResult,
  planSaveEnzymeSet,
  planSavedEnzymeSetSelection,
} from './enzymeSetWorkflow'
import type { SavedEnzymeSet } from '../../domain/enzymePreferences'

function makeSet(id: string, name: string, enzymeNames: string[] = ['EcoRI']): SavedEnzymeSet {
  return { id, name, enzymeNames }
}

const createId = () => 'new-id'

describe('planEnzymeSetModeSelection', () => {
  it('selects a mode, makes enzymes visible, and keeps the supplier id only for the supplier mode', () => {
    expect(planEnzymeSetModeSelection({ set: 'supplier', currentSupplierSetId: 'neb' })).toEqual({
      set: 'supplier',
      visible: true,
      supplierSetId: 'neb',
    })
    expect(planEnzymeSetModeSelection({ set: 'all', currentSupplierSetId: 'neb' })).toEqual({
      set: 'all',
      visible: true,
      supplierSetId: null,
    })
  })
})

describe('planEnzymeSupplierSelection', () => {
  it('switches to the supplier mode with the chosen supplier', () => {
    expect(planEnzymeSupplierSelection('thermo')).toEqual({
      set: 'supplier',
      supplierSetId: 'thermo',
      visible: true,
    })
  })
})

describe('findSavedEnzymeSet', () => {
  it('finds by id and returns null for unknown ids', () => {
    const sets = [makeSet('a', 'Set A'), makeSet('b', 'Set B')]
    expect(findSavedEnzymeSet(sets, 'b')).toEqual(makeSet('b', 'Set B'))
    expect(findSavedEnzymeSet(sets, 'missing')).toBeNull()
    expect(findSavedEnzymeSet([], 'a')).toBeNull()
  })
})

describe('planSavedEnzymeSetSelection', () => {
  it('selects a copy of the saved enzyme names as a visible custom set', () => {
    const saved = makeSet('a', 'Set A', ['EcoRI', 'BamHI'])
    const patch = planSavedEnzymeSetSelection(saved)
    expect(patch).toEqual({ set: 'custom', selectedNames: ['EcoRI', 'BamHI'], supplierSetId: null, visible: true })
    expect(patch.selectedNames).not.toBe(saved.enzymeNames)
  })
})

describe('planChooseEnzymesConfirmation', () => {
  it('applies the chosen names as a visible custom set', () => {
    expect(planChooseEnzymesConfirmation(['EcoRI'])).toEqual({
      set: 'custom',
      selectedNames: ['EcoRI'],
      visible: true,
    })
  })
})

describe('planEnzymesVisibilityToggle', () => {
  it('flips the current visibility', () => {
    expect(planEnzymesVisibilityToggle(true)).toEqual({ visible: false })
    expect(planEnzymesVisibilityToggle(false)).toEqual({ visible: true })
  })
})

describe('planSaveEnzymeSet', () => {
  const base = {
    scope: 'global' as const,
    enzymeNames: ['EcoRI', 'BamHI'],
    savedEnzymeSets: [] as SavedEnzymeSet[],
    fileEnzymeSets: [] as SavedEnzymeSet[],
    createId,
  }

  it('rejects blank names and empty enzyme lists', () => {
    expect(planSaveEnzymeSet({ ...base, rawName: '   ' })).toEqual({ kind: 'invalid' })
    expect(planSaveEnzymeSet({ ...base, rawName: 'Set', enzymeNames: [] })).toEqual({ kind: 'invalid' })
  })

  it('trims the name before saving globally', () => {
    const plan = planSaveEnzymeSet({ ...base, rawName: '  My Set  ' })
    expect(plan).toMatchObject({
      kind: 'saved',
      nextSavedSets: [{ id: 'new-id', name: 'My Set', enzymeNames: ['EcoRI', 'BamHI'] }],
      statusMessage: 'Saved enzyme set “My Set”.',
    })
    if (plan.kind === 'saved') {
      expect(plan.displayPatch).toEqual({
        set: 'custom',
        selectedNames: ['EcoRI', 'BamHI'],
        supplierSetId: null,
        visible: true,
      })
    }
  })

  it('replaces a same-name global set case-insensitively, preserving id and metadata', () => {
    const existing = { ...makeSet('keep-id', 'My Set'), note: 'metadata' }
    const plan = planSaveEnzymeSet({
      ...base,
      rawName: 'my set',
      savedEnzymeSets: [existing] as unknown as SavedEnzymeSet[],
    })
    expect(plan.kind).toBe('saved')
    if (plan.kind === 'saved') {
      expect(plan.nextSavedSets).toHaveLength(1)
      expect(plan.nextSavedSets[0]).toMatchObject({ id: 'keep-id', name: 'my set', enzymeNames: ['EcoRI', 'BamHI'] })
    }
  })

  it('saves to the file scope with the file-specific status message', () => {
    const plan = planSaveEnzymeSet({ ...base, scope: 'file', rawName: 'File Set' })
    expect(plan.kind).toBe('file')
    if (plan.kind === 'file') {
      expect(plan.nextFileSets).toEqual([{ id: 'new-id', name: 'File Set', enzymeNames: ['EcoRI', 'BamHI'] }])
      expect(plan.statusMessage).toBe('Saved enzyme set “File Set” to this file.')
    }
  })

  it('replaces a same-name file set case-insensitively', () => {
    const plan = planSaveEnzymeSet({
      ...base,
      scope: 'file',
      rawName: 'FILE SET',
      fileEnzymeSets: [makeSet('file-id', 'File Set', ['HindIII'])],
    })
    expect(plan.kind).toBe('file')
    if (plan.kind === 'file') {
      expect(plan.nextFileSets).toEqual([{ id: 'file-id', name: 'FILE SET', enzymeNames: ['EcoRI', 'BamHI'] }])
    }
  })

  it('does not mutate the input set lists', () => {
    const saved = [makeSet('a', 'A')]
    const file = [makeSet('b', 'B')]
    planSaveEnzymeSet({ ...base, rawName: 'A', savedEnzymeSets: saved, fileEnzymeSets: file })
    planSaveEnzymeSet({ ...base, scope: 'file', rawName: 'New', savedEnzymeSets: saved, fileEnzymeSets: file })
    expect(saved).toHaveLength(1)
    expect(file).toHaveLength(1)
  })
})

describe('planManageEnzymeSetsResult', () => {
  it('passes saved sets through and clears empty file sets', () => {
    expect(
      planManageEnzymeSetsResult({ savedEnzymeSets: [makeSet('a', 'A')], fileEnzymeSets: [] }),
    ).toEqual({ nextSavedSets: [makeSet('a', 'A')], nextFileSets: undefined })
    expect(
      planManageEnzymeSetsResult({ savedEnzymeSets: [], fileEnzymeSets: [makeSet('b', 'B')] }),
    ).toEqual({ nextSavedSets: [], nextFileSets: [makeSet('b', 'B')] })
  })
})

describe('normalizeRecordFileEnzymeSets', () => {
  it('keeps non-empty lists and clears empty ones', () => {
    expect(normalizeRecordFileEnzymeSets([makeSet('a', 'A')])).toHaveLength(1)
    expect(normalizeRecordFileEnzymeSets([])).toBeUndefined()
  })
})

describe('planExportEnzymeSet', () => {
  it('reports the empty-set status without a download', () => {
    expect(planExportEnzymeSet({ name: 'Custom (0)', enzymeNames: [] })).toEqual({
      kind: 'empty',
      statusMessage: 'No enzymes in the current set to export.',
    })
  })

  it('prepares a sanitized download file with formatted content and status', () => {
    const plan = planExportEnzymeSet({ name: 'My Set', enzymeNames: ['BamHI', 'EcoRI'] })
    expect(plan.kind).toBe('download')
    if (plan.kind === 'download') {
      expect(plan.fileName).toBe('My_Set.txt')
      expect(plan.statusMessage).toBe('Exported enzyme set “My Set”.')
      expect(plan.content).toContain('My Set')
      expect(plan.content).toContain('BamHI')
      expect(plan.content).toContain('EcoRI')
    }
  })
})
