// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { retainedKeysForFamily, useCloningWorkspaceController } from './useCloningWorkspaceController'

describe('useCloningWorkspaceController', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })

  function renderController() {
    let controller: ReturnType<typeof useCloningWorkspaceController>
    const reportLazyLoadFailure = vi.fn()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    function Harness() {
      controller = useCloningWorkspaceController({ reportLazyLoadFailure })
      return null
    }

    act(() => root.render(<Harness />))
    return { controller: () => controller!, reportLazyLoadFailure }
  }

  it('retains independent workspaces and discards only the requested workspace', () => {
    const { controller } = renderController()

    act(() => {
      controller().openRestrictionCloning('linear-ligation')
      controller().openGibsonAssembly('nebuilder-hifi')
      controller().openRetainedPcr()
    })

    expect(controller().restrictionCloningOpen).toBe(true)
    expect(controller().restrictionCloningMode).toBe('linear-ligation')
    expect(controller().gibsonAssemblyOpen).toBe(true)
    expect(controller().pcrOpen).toBe(true)
    expect(controller().pcrInvocation).toBe(1)
    expect(controller().retainedCloningDialogs).toEqual(
      new Set(['restriction:linear-ligation', 'gibson:nebuilder-hifi', 'pcr']),
    )

    act(() => controller().discardCloningDialog('restriction:linear-ligation'))
    expect(controller().retainedCloningDialogs).toEqual(
      new Set(['gibson:nebuilder-hifi', 'pcr']),
    )
  })

  it('allocates a fresh PCR invocation for every reopen of the retained dialog', () => {
    const { controller } = renderController()
    act(() => controller().openRetainedPcr())
    expect(controller().pcrInvocation).toBe(1)
    act(() => controller().setPcrOpen(false))
    act(() => controller().openRetainedPcr())
    expect(controller().pcrInvocation).toBe(2)
  })

  it('lists retained keys by family prefix without touching other families', () => {
    const retained = new Set([
      'restriction:insert',
      'restriction:linear-ligation',
      'gibson:nebuilder-hifi',
      'ta-gc:ta',
      'gateway:lr',
      'pcr',
      'pcr-multiplex',
      'mutagenesis',
    ])
    expect(retainedKeysForFamily(retained, 'restriction:')).toEqual([
      'restriction:insert',
      'restriction:linear-ligation',
    ])
    expect(retainedKeysForFamily(retained, 'gibson:')).toEqual(['gibson:nebuilder-hifi'])
    expect(retainedKeysForFamily(retained, 'gateway:')).toEqual(['gateway:lr'])
    // Bare and colon-terminated family names refer to the same family.
    expect(retainedKeysForFamily(retained, 'pcr:')).toEqual(['pcr'])
    expect(retainedKeysForFamily(retained, 'pcr')).toEqual(['pcr'])
    // Keys that merely share a prefix ('pcr-multiplex') are not family members.
    expect(retainedKeysForFamily(retained, 'pcr')).not.toContain('pcr-multiplex')
  })

  it('clears state, discards the retained family, and reports on cloning load failure', () => {
    const { controller, reportLazyLoadFailure } = renderController()
    act(() => {
      controller().openRestrictionCloning('insert')
      controller().openRestrictionCloning('linear-ligation')
      controller().openGibsonAssembly('nebuilder-hifi')
      controller().openRetainedPcr()
      controller().openRetainedMutagenesis()
    })

    act(() => controller().cloningDialogLifecycle.onRestrictionCloningLoadError())
    expect(controller().restrictionCloningOpen).toBe(false)
    expect(controller().retainedCloningDialogs).toEqual(
      new Set(['gibson:nebuilder-hifi', 'pcr', 'mutagenesis']),
    )
    expect(reportLazyLoadFailure).toHaveBeenLastCalledWith('Could not load the restriction cloning dialog.')

    act(() => controller().cloningDialogLifecycle.onGibsonAssemblyLoadError())
    expect(controller().gibsonAssemblyOpen).toBe(false)
    expect(controller().retainedCloningDialogs).toEqual(new Set(['pcr', 'mutagenesis']))
    expect(reportLazyLoadFailure).toHaveBeenLastCalledWith('Could not load the assembly dialog.')

    act(() => controller().cloningDialogLifecycle.onPcrLoadError())
    expect(controller().pcrOpen).toBe(false)
    expect(controller().retainedCloningDialogs).toEqual(new Set(['mutagenesis']))
    expect(reportLazyLoadFailure).toHaveBeenLastCalledWith('Could not load the PCR dialog.')

    // Mutagenesis is not a lazy dialog: its retained shell is untouched.
    expect(controller().mutagenesisOpen).toBe(true)
  })

  it('clears batch state and reports on mass-restriction load failures', () => {
    const { controller, reportLazyLoadFailure } = renderController()
    const result = { cloned: [], notCloned: [] }
    act(() => {
      controller().setMassRestrictionResult(result)
      controller().setBlockedBatchOpen({ products: [], openedCount: 0 })
    })

    act(() => controller().cloningDialogLifecycle.onMassRestrictionLoadError())
    expect(controller().massRestrictionResult).toBeNull()
    expect(controller().blockedBatchOpen).not.toBeNull()
    expect(reportLazyLoadFailure).toHaveBeenLastCalledWith('Could not load the batch results dialog.')

    act(() => controller().cloningDialogLifecycle.onBlockedBatchLoadError())
    expect(controller().blockedBatchOpen).toBeNull()
    expect(reportLazyLoadFailure).toHaveBeenLastCalledWith('Could not load the batch results dialog.')
  })

  it('owns the cancel and close callbacks for cloning dialogs', () => {
    const { controller } = renderController()
    act(() => {
      controller().openRestrictionCloning('insert')
      controller().openGibsonAssembly('nebuilder-hifi')
      controller().openTaGcCloning('ta')
      controller().openGatewayCloning('bp')
      controller().setMassRestrictionResult({ cloned: [], notCloned: [] })
      controller().setBlockedBatchOpen({ products: [], openedCount: 0 })
    })

    act(() => controller().cloningDialogLifecycle.cancelRestrictionCloning('restriction:insert'))
    expect(controller().restrictionCloningOpen).toBe(false)
    expect(controller().retainedCloningDialogs.has('restriction:insert')).toBe(false)

    act(() => controller().cloningDialogLifecycle.cancelGibsonAssembly())
    expect(controller().gibsonAssemblyOpen).toBe(false)
    expect(controller().retainedCloningDialogs.has('gibson:nebuilder-hifi')).toBe(true)

    act(() => controller().cloningDialogLifecycle.cancelTaGcCloning())
    expect(controller().taGcCloningOpen).toBe(false)
    act(() => controller().cloningDialogLifecycle.cancelGatewayCloning())
    expect(controller().gatewayCloningOpen).toBe(false)

    act(() => controller().cloningDialogLifecycle.closeMassRestriction())
    expect(controller().massRestrictionResult).toBeNull()
    act(() => controller().cloningDialogLifecycle.discardBlockedBatch())
    expect(controller().blockedBatchOpen).toBeNull()
  })
})
