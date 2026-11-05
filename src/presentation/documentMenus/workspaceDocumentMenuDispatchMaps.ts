import type { GibsonAssemblyMethod } from '../../domain/gibsonAssembly'
import type { GatewayCloningMethod } from '../../domain/gatewayBpCloning'
import type { TaGcCloningMethod } from '../../domain/taGcCloning'
import type { NativeAppMenuAction } from '../../application/ports/nativeMenu'
import type { EnzymeSetMode, WorkspaceTab } from '../sequence'

/** Native menu action for a view tab, or null when App must handle tab selection directly. */
export function tryViewTabNativeAction(tab: WorkspaceTab): NativeAppMenuAction | null {
  switch (tab) {
    case 'Map': return 'view.tab.map'
    case 'Sequence': return 'view.tab.sequence'
    case 'Properties': return 'view.tab.properties'
    case 'Enzymes': return 'view.tab.enzymes'
    case 'Features': return 'view.tab.features'
    case 'Primers': return 'view.tab.primers'
    case 'History': return 'view.tab.history'
    case 'Members': return null
    default: return null
  }
}

export function enzymeSetNativeAction(set: EnzymeSetMode): NativeAppMenuAction {
  switch (set) {
    case 'all': return 'enzymes.set.all'
    case 'nonredundant': return 'enzymes.set.nonredundant'
    case 'type-iis': return 'enzymes.set.type-iis'
    case 'unique': return 'enzymes.set.unique'
    case 'unique-dual': return 'enzymes.set.unique-dual'
    case 'six-plus': return 'enzymes.set.six-plus'
    case 'unique-six-plus': return 'enzymes.set.unique-six-plus'
    default: return 'enzymes.set.all'
  }
}

export function gibsonAssemblyNativeAction(method: GibsonAssemblyMethod): NativeAppMenuAction {
  switch (method) {
    case 'classic-gibson': return 'actions.gibson.classic'
    case 'nebuilder-hifi': return 'actions.gibson.nebuilder'
    case 'infusion': return 'actions.gibson.infusion'
    default: return 'actions.gibson.classic'
  }
}

export function taGcCloningNativeAction(method: TaGcCloningMethod): NativeAppMenuAction {
  return method === 'gc' ? 'actions.tagc.gc' : 'actions.tagc.ta'
}

export function gatewayCloningNativeAction(method: GatewayCloningMethod): NativeAppMenuAction {
  return method === 'lr' ? 'actions.gateway.lr' : 'actions.gateway.bp'
}

export function commonPrimersDetectNativeAction(scope: 'all' | { tag: string }): NativeAppMenuAction {
  if (scope === 'all') return 'primers.detect-common'
  return `primers.detect-common.tag:${scope.tag}`
}
