// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultDisplaySettings } from '../sequence'
import { defaultEnzymePreferences, manufacturerLabel } from '../../domain/enzymePreferences'
import { labPlasmid } from '../../domain/fixtures'
import { WorkspaceDocumentMenus, type WorkspaceDocumentMenuResiduals } from './WorkspaceDocumentMenus'
import type { NativeMenuState } from './useNativeAppMenuController'

function makeResiduals(overrides: Partial<WorkspaceDocumentMenuResiduals> = {}): WorkspaceDocumentMenuResiduals {
  return {
    onOpenRecent: () => {},
    onRestoreDraft: () => {},
    onDiscardDraft: () => {},
    onGenerateLink: () => {},
    onSelectSupplier: () => {},
    onSelectSavedSet: () => {},
    onSelectFileSet: () => {},
    onOpenAsProtein: () => {},
    onSaveAsFile: () => {},
    onOpenDoubleDigest: () => {},
    loadCommonPrimers: async () => [],
    loadPrimerTagMap: async () => new Map(),
    onSelectTab: () => {},
    onSetOrigin: () => {},
    ...overrides,
  }
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function makeMenuState(overrides: Partial<NativeMenuState> = {}): NativeMenuState {
  return {
    record: labPlasmid,
    documentSaveBinding: 'disk',
    canCreateFromSelection: false,
    canConvertToLibrary: false,
    canUndo: true,
    canRedo: false,
    canCopySelection: false,
    canCopyTranslation: false,
    hasSelection: false,
    canInvertSelection: false,
    canCropLibrary: false,
    canRenameFile: true,
    enzymesVisible: true,
    canSaveEnzymeSet: false,
    hasFeatureSelected: false,
    canMergeFeatures: false,
    canCloneSgRna: false,
    canExportSgRnas: false,
    hasSelectionRange: false,
    hasSelectionPoint: false,
    canRemoveCleavageSite: false,
    canShowSelectedFeatures: false,
    canHideSelectedFeatures: false,
    hasPrimerSelected: false,
    canShowSelectedPrimers: false,
    canHideSelectedPrimers: false,
    activeTab: 'Sequence',
    displaySettings: defaultDisplaySettings,
    effectiveDescriptionPanelVisible: true,
    traceDocument: false,
    nucleotideStrands: true,
    selectedRange: null,
    enzymeTabCaretPosition: 0,
    ...overrides,
  }
}

describe('WorkspaceDocumentMenus', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it('dispatches file and enzyme actions from menu wiring', () => {
    const dispatch = vi.fn<(action: string) => void>()
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    act(() => root.render(
      <WorkspaceDocumentMenus
        dispatch={dispatch}
        menuState={makeMenuState()}
        availableTabs={['Map', 'Sequence', 'Enzymes']}
        moleculeCapabilities={{ nucleotideStrands: true, restrictionEnzymes: true, primers: true, cloning: true }}
        workspaceFeatures={{ canOpenAsProtein: false, selected: null }}
        workspaceEnzymes={{ parentalRestrictionSites: [] }}
        workspacePrimers={{ selectedSgRnasForCloning: [], selectedSgRnasForExport: [] }}
        recentFiles={[]}
        sessionDrafts={[]}
        enzymePreferences={defaultEnzymePreferences}
        fileEnzymeSets={[]}
        canAddCleavageSite={false}
        showBrowserOnlyMenus
        residuals={makeResiduals({ onOpenFromUrl: () => {} })}
      />,
    ))

    const fileTrigger = host.querySelector('.toolbar-edit-trigger')
    expect(fileTrigger).toBeTruthy()
    act(() => fileTrigger?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    const saveItem = Array.from(host.querySelectorAll('[role="menuitem"]')).find((node) => node.textContent?.includes('Save'))
    act(() => saveItem?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(dispatch).toHaveBeenCalledWith('file.save')

    act(() => root.unmount())
  })

  it('dispatches features, primers, and actions menu actions', () => {
    const dispatch = vi.fn<(action: string) => void>()
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    act(() => root.render(
      <WorkspaceDocumentMenus
        dispatch={dispatch}
        menuState={makeMenuState({ hasFeatureSelected: true, hasPrimerSelected: true })}
        availableTabs={['Sequence']}
        moleculeCapabilities={{ nucleotideStrands: true, restrictionEnzymes: true, primers: true, cloning: true }}
        workspaceFeatures={{ canOpenAsProtein: true, selected: null }}
        workspaceEnzymes={{ parentalRestrictionSites: [] }}
        workspacePrimers={{ selectedSgRnasForCloning: [], selectedSgRnasForExport: [] }}
        recentFiles={[]}
        sessionDrafts={[]}
        enzymePreferences={defaultEnzymePreferences}
        fileEnzymeSets={[]}
        canAddCleavageSite
        showBrowserOnlyMenus={false}
        residuals={makeResiduals()}
      />,
    ))

    const openTrigger = (label: string) => {
      const trigger = Array.from(host.querySelectorAll('.toolbar-edit-trigger')).find((node) => node.textContent?.startsWith(label))
      act(() => trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    }
    const clickItem = (text: string) => {
      const item = Array.from(host.querySelectorAll('[role="menuitem"]')).find((node) => node.textContent?.includes(text))
      act(() => item?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    }

    openTrigger('Features')
    clickItem('Add Feature…')
    expect(dispatch).toHaveBeenCalledWith('features.add')

    openTrigger('Primers')
    clickItem('Add Primer…')
    expect(dispatch).toHaveBeenCalledWith('primers.add')

    openTrigger('Actions')
    clickItem('PCR…')
    expect(dispatch).toHaveBeenCalledWith('actions.pcr')

    openTrigger('Help')
    clickItem('Source code on GitHub')
    expect(dispatch).toHaveBeenCalledWith('help.source-code')

    act(() => root.unmount())
  })

  it('routes enzyme supplier selection through residuals', () => {
    const dispatch = vi.fn()
    const onSelectSupplier = vi.fn()
    const supplierId = defaultEnzymePreferences.supplierOrder[0]!
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    act(() => root.render(
      <WorkspaceDocumentMenus
        dispatch={dispatch}
        menuState={makeMenuState()}
        availableTabs={['Enzymes']}
        moleculeCapabilities={{ nucleotideStrands: true, restrictionEnzymes: true, primers: false, cloning: false }}
        workspaceFeatures={{ canOpenAsProtein: false, selected: null }}
        workspaceEnzymes={{ parentalRestrictionSites: [] }}
        workspacePrimers={{ selectedSgRnasForCloning: [], selectedSgRnasForExport: [] }}
        recentFiles={[]}
        sessionDrafts={[]}
        enzymePreferences={defaultEnzymePreferences}
        fileEnzymeSets={[]}
        canAddCleavageSite={false}
        showBrowserOnlyMenus={false}
        residuals={makeResiduals({ onSelectSupplier })}
      />,
    ))

    const enzymesTrigger = Array.from(host.querySelectorAll('.toolbar-edit-trigger')).find((node) => node.textContent?.startsWith('Enzymes'))
    act(() => enzymesTrigger?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    const supplierButton = Array.from(host.querySelectorAll('.orf-mode-item')).find((node) => node.textContent?.includes(manufacturerLabel(supplierId)))
    act(() => supplierButton?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(onSelectSupplier).toHaveBeenCalledWith(supplierId)
    expect(dispatch).not.toHaveBeenCalledWith('enzymes.choose')

    act(() => root.unmount())
  })

  it('routes residual double digest separately from native dispatch', () => {
    const dispatch = vi.fn()
    const onOpenDoubleDigest = vi.fn()
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    act(() => root.render(
      <WorkspaceDocumentMenus
        dispatch={dispatch}
        menuState={makeMenuState()}
        availableTabs={['Sequence']}
        moleculeCapabilities={{ nucleotideStrands: true, restrictionEnzymes: false, primers: false, cloning: false }}
        workspaceFeatures={{ canOpenAsProtein: false, selected: null }}
        workspaceEnzymes={{ parentalRestrictionSites: [] }}
        workspacePrimers={{ selectedSgRnasForCloning: [], selectedSgRnasForExport: [] }}
        recentFiles={[]}
        sessionDrafts={[]}
        enzymePreferences={defaultEnzymePreferences}
        fileEnzymeSets={[]}
        canAddCleavageSite={false}
        showBrowserOnlyMenus={false}
        residuals={makeResiduals({ onOpenDoubleDigest })}
      />,
    ))

    const toolsTrigger = Array.from(host.querySelectorAll('.toolbar-edit-trigger')).find((node) => node.textContent?.startsWith('Tools'))
    act(() => toolsTrigger?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    const doubleDigest = Array.from(host.querySelectorAll('[role="menuitem"]')).find((node) => node.textContent?.includes('Double digest'))
    act(() => doubleDigest?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(onOpenDoubleDigest).toHaveBeenCalledOnce()
    expect(dispatch).not.toHaveBeenCalledWith('tools.dna-mw')

    act(() => root.unmount())
  })

  it('selects Members through onSelectTab without mapping to Sequence', () => {
    const dispatch = vi.fn()
    const onSelectTab = vi.fn()
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    act(() => root.render(
      <WorkspaceDocumentMenus
        dispatch={dispatch}
        menuState={makeMenuState({ activeTab: 'Sequence' })}
        availableTabs={['Map', 'Sequence', 'Members']}
        moleculeCapabilities={{ nucleotideStrands: true, restrictionEnzymes: false, primers: false, cloning: false }}
        workspaceFeatures={{ canOpenAsProtein: false, selected: null }}
        workspaceEnzymes={{ parentalRestrictionSites: [] }}
        workspacePrimers={{ selectedSgRnasForCloning: [], selectedSgRnasForExport: [] }}
        recentFiles={[]}
        sessionDrafts={[]}
        enzymePreferences={defaultEnzymePreferences}
        fileEnzymeSets={[]}
        canAddCleavageSite={false}
        showBrowserOnlyMenus={false}
        residuals={makeResiduals({ onSelectTab })}
      />,
    ))

    const viewTrigger = Array.from(host.querySelectorAll('.toolbar-edit-trigger')).find((node) => node.textContent?.startsWith('View'))
    act(() => viewTrigger?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    const membersItem = Array.from(host.querySelectorAll('[role="menuitemradio"]')).find((node) => node.textContent?.includes('Members'))
    act(() => membersItem?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(onSelectTab).toHaveBeenCalledWith('Members')
    expect(dispatch).not.toHaveBeenCalledWith('view.tab.sequence')

    act(() => root.unmount())
  })

  it('dispatches native view tab actions when available', () => {
    const dispatch = vi.fn()
    const onSelectTab = vi.fn()
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    act(() => root.render(
      <WorkspaceDocumentMenus
        dispatch={dispatch}
        menuState={makeMenuState()}
        availableTabs={['Map', 'Sequence']}
        moleculeCapabilities={{ nucleotideStrands: true, restrictionEnzymes: false, primers: false, cloning: false }}
        workspaceFeatures={{ canOpenAsProtein: false, selected: null }}
        workspaceEnzymes={{ parentalRestrictionSites: [] }}
        workspacePrimers={{ selectedSgRnasForCloning: [], selectedSgRnasForExport: [] }}
        recentFiles={[]}
        sessionDrafts={[]}
        enzymePreferences={defaultEnzymePreferences}
        fileEnzymeSets={[]}
        canAddCleavageSite={false}
        showBrowserOnlyMenus={false}
        residuals={makeResiduals({ onSelectTab })}
      />,
    ))

    const viewTrigger = Array.from(host.querySelectorAll('.toolbar-edit-trigger')).find((node) => node.textContent?.startsWith('View'))
    act(() => viewTrigger?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    const mapItem = Array.from(host.querySelectorAll('[role="menuitemradio"]')).find((node) => node.textContent?.includes('Map'))
    act(() => mapItem?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(dispatch).toHaveBeenCalledWith('view.tab.map')
    expect(onSelectTab).not.toHaveBeenCalled()

    act(() => root.unmount())
  })

  it('passes parsed origin from Edit menu input, not enzyme caret dispatch', () => {
    const dispatch = vi.fn()
    const onSetOrigin = vi.fn()
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    act(() => root.render(
      <WorkspaceDocumentMenus
        dispatch={dispatch}
        menuState={makeMenuState({ enzymeTabCaretPosition: 50 })}
        availableTabs={['Sequence']}
        moleculeCapabilities={{ nucleotideStrands: true, restrictionEnzymes: false, primers: false, cloning: false }}
        workspaceFeatures={{ canOpenAsProtein: false, selected: null }}
        workspaceEnzymes={{ parentalRestrictionSites: [] }}
        workspacePrimers={{ selectedSgRnasForCloning: [], selectedSgRnasForExport: [] }}
        recentFiles={[]}
        sessionDrafts={[]}
        enzymePreferences={defaultEnzymePreferences}
        fileEnzymeSets={[]}
        canAddCleavageSite={false}
        showBrowserOnlyMenus={false}
        residuals={makeResiduals({ onSetOrigin })}
      />,
    ))

    const editTrigger = Array.from(host.querySelectorAll('.toolbar-edit-trigger')).find((node) => node.textContent?.startsWith('Edit'))
    act(() => editTrigger?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    const originInput = host.querySelector('.toolbar-edit-origin-input') as HTMLInputElement
    expect(originInput.value).toBe('51')
    act(() => setInputValue(originInput, '20'))
    const setOriginButton = host.querySelector('.toolbar-edit-origin-button') as HTMLButtonElement
    act(() => setOriginButton.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(onSetOrigin).toHaveBeenCalledWith(19)
    expect(dispatch).not.toHaveBeenCalledWith('edit.set-origin-caret')

    act(() => root.unmount())
  })

  it('shows browser-only standalone app menu when enabled', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const renderMenus = (showBrowserOnlyMenus: boolean) => {
      act(() => root.render(
        <WorkspaceDocumentMenus
          dispatch={() => {}}
          menuState={makeMenuState()}
          availableTabs={['Sequence']}
          moleculeCapabilities={{ nucleotideStrands: true, restrictionEnzymes: false, primers: false, cloning: false }}
          workspaceFeatures={{ canOpenAsProtein: false, selected: null }}
          workspaceEnzymes={{ parentalRestrictionSites: [] }}
          workspacePrimers={{ selectedSgRnasForCloning: [], selectedSgRnasForExport: [] }}
          recentFiles={[]}
          sessionDrafts={[]}
          enzymePreferences={defaultEnzymePreferences}
          fileEnzymeSets={[]}
          canAddCleavageSite={false}
          showBrowserOnlyMenus={showBrowserOnlyMenus}
          residuals={makeResiduals()}
        />,
      ))
    }

    renderMenus(true)
    expect(host.textContent).toContain('Standalone app')
    renderMenus(false)
    expect(host.textContent).not.toContain('Standalone app')

    act(() => root.unmount())
  })

  it('dispatches enzyme set selection through native actions', () => {
    const dispatch = vi.fn()
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    act(() => root.render(
      <WorkspaceDocumentMenus
        dispatch={dispatch}
        menuState={makeMenuState()}
        availableTabs={['Enzymes']}
        moleculeCapabilities={{ nucleotideStrands: true, restrictionEnzymes: true, primers: false, cloning: false }}
        workspaceFeatures={{ canOpenAsProtein: false, selected: null }}
        workspaceEnzymes={{ parentalRestrictionSites: [] }}
        workspacePrimers={{ selectedSgRnasForCloning: [], selectedSgRnasForExport: [] }}
        recentFiles={[]}
        sessionDrafts={[]}
        enzymePreferences={defaultEnzymePreferences}
        fileEnzymeSets={[]}
        canAddCleavageSite={false}
        showBrowserOnlyMenus={false}
        residuals={makeResiduals()}
      />,
    ))

    const enzymesTrigger = Array.from(host.querySelectorAll('.toolbar-edit-trigger')).find((node) => node.textContent?.startsWith('Enzymes'))
    act(() => enzymesTrigger?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    const allCommercial = Array.from(host.querySelectorAll('.orf-mode-item')).find((node) => node.textContent?.startsWith('All Commercial'))
    act(() => allCommercial?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(dispatch).toHaveBeenCalledWith('enzymes.set.all')

    act(() => root.unmount())
  })
})
