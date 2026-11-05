import { describe, expect, it } from 'vitest'
import {
  commonPrimersDetectNativeAction,
  enzymeSetNativeAction,
  gatewayCloningNativeAction,
  gibsonAssemblyNativeAction,
  taGcCloningNativeAction,
  tryViewTabNativeAction,
} from './workspaceDocumentMenuDispatchMaps'

describe('workspaceDocumentMenuDispatchMaps', () => {
  it('maps workspace tabs to native view actions', () => {
    expect(tryViewTabNativeAction('Map')).toBe('view.tab.map')
    expect(tryViewTabNativeAction('Enzymes')).toBe('view.tab.enzymes')
    expect(tryViewTabNativeAction('History')).toBe('view.tab.history')
    expect(tryViewTabNativeAction('Members')).toBeNull()
  })

  it('maps enzyme sets and cloning methods', () => {
    expect(enzymeSetNativeAction('unique-dual')).toBe('enzymes.set.unique-dual')
    expect(enzymeSetNativeAction('type-iis')).toBe('enzymes.set.type-iis')
    expect(gibsonAssemblyNativeAction('nebuilder-hifi')).toBe('actions.gibson.nebuilder')
    expect(taGcCloningNativeAction('ta')).toBe('actions.tagc.ta')
    expect(gatewayCloningNativeAction('lr')).toBe('actions.gateway.lr')
  })

  it('maps common primer detect scopes', () => {
    expect(commonPrimersDetectNativeAction('all')).toBe('primers.detect-common')
    expect(commonPrimersDetectNativeAction({ tag: 'vector' })).toBe('primers.detect-common.tag:vector')
  })
})
