import { describe, expect, it } from 'vitest'
import { buildWorkspaceTabBarModel } from './workspaceTabBarViewModel'

describe('buildWorkspaceTabBarModel', () => {
  it('selects search placeholders by tab and molecule', () => {
    expect(buildWorkspaceTabBarModel({
      tabs: ['Primers'],
      activeTab: 'Primers',
      mobileSearchOpen: false,
      searchQuery: '',
      molecule: 'dna',
      traceDocument: false,
      descriptionPanelVisible: false,
      searchHitCount: 0,
      searchHitLabel: 'hits',
      searchHitIndex: 0,
    }).searchPlaceholder).toBe('Find primer name or sequence')

    expect(buildWorkspaceTabBarModel({
      tabs: ['Sequence'],
      activeTab: 'Sequence',
      mobileSearchOpen: false,
      searchQuery: '',
      molecule: 'protein',
      traceDocument: false,
      descriptionPanelVisible: false,
      searchHitCount: 0,
      searchHitLabel: 'hits',
      searchHitIndex: 0,
    }).searchPlaceholder).toBe('Find amino acid sequence')

    expect(buildWorkspaceTabBarModel({
      tabs: ['Map'],
      activeTab: 'Map',
      mobileSearchOpen: false,
      searchQuery: '',
      molecule: 'dna',
      traceDocument: false,
      descriptionPanelVisible: false,
      searchHitCount: 0,
      searchHitLabel: 'hits',
      searchHitIndex: 0,
    }).searchPlaceholder).toBe('Find sequence or enzyme')

    const enzymeModel = buildWorkspaceTabBarModel({
      tabs: ['Enzymes'],
      activeTab: 'Enzymes',
      mobileSearchOpen: false,
      searchQuery: 'EcoRI',
      molecule: 'dna',
      traceDocument: false,
      descriptionPanelVisible: false,
      searchHitCount: 1,
      searchHitLabel: 'enzyme',
      searchHitIndex: 0,
    })
    expect(enzymeModel.searchPlaceholder).toBe('Find enzyme name or cut sequence')
    expect(enzymeModel.searchHitCountLabel).toBe('1 enzyme')
    expect(enzymeModel.searchHitPositionLabel).toBe('')
    expect(enzymeModel.showSearchNavigation).toBe(false)
  })

  it('formats search hit labels and hides the description toggle for trace documents', () => {
    const model = buildWorkspaceTabBarModel({
      tabs: ['Sequence'],
      activeTab: 'Sequence',
      mobileSearchOpen: true,
      searchQuery: 'atg',
      molecule: 'dna',
      traceDocument: true,
      descriptionPanelVisible: true,
      searchHitCount: 2,
      searchHitLabel: 'matches',
      searchHitIndex: 0,
    })
    expect(model.searchHitCountLabel).toBe('2 matches')
    expect(model.searchHitPositionLabel).toBe(' · 1/2')
    expect(model.searchNavDisabled).toBe(false)
    expect(model.showSearch).toBe(false)
    expect(model.showDescriptionPanelToggle).toBe(false)
  })
})
