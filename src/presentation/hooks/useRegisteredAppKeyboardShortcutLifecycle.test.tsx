// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NativeAppMenuAction } from '../../application/ports/nativeMenu'
import {
  useRegisteredAppKeyboardShortcutLifecycle,
  type RegisteredAppKeyboardShortcutLifecycleState,
  type RegisteredAppKeyboardShortcutMatch,
  type WorkspaceKeyboardCommands,
} from './useRegisteredAppKeyboardShortcutLifecycle'

function matchTestShortcut(
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>,
): RegisteredAppKeyboardShortcutMatch | undefined {
  const mod = event.ctrlKey || event.metaKey
  if (!mod || event.altKey) return undefined
  const key = event.key.toLowerCase()
  if (key === 's' && !event.shiftKey) return { action: 'file.save' }
  if (key === 'o' && !event.shiftKey) return { action: 'file.open' }
  if (key === 't' && !event.shiftKey) return { action: 'features.add' }
  if (key === 'r' && !event.shiftKey) return { action: 'primers.add' }
  if (key === 'z' && !event.shiftKey) return { action: 'edit.undo' }
  if (key === 'z' && event.shiftKey) return { action: 'edit.redo' }
  if (key === 'y' && !event.shiftKey) return { action: 'edit.redo' }
  return undefined
}

const testShortcutPolicy = {
  canHandleAppShortcut: (
    event: Pick<KeyboardEvent, 'defaultPrevented'>,
    targetIsEditable: boolean,
    hasOpenDialog: boolean,
  ) => !event.defaultPrevented && !targetIsEditable && !hasOpenDialog,
  isEditableShortcutTarget: (target: EventTarget | null) => target instanceof HTMLInputElement,
  isKeyboardShortcutAvailable: () => true,
  matchKeyboardShortcut: matchTestShortcut,
}

function baseCommands(overrides: Partial<WorkspaceKeyboardCommands> = {}): WorkspaceKeyboardCommands {
  return {
    handleUndo: vi.fn(),
    handleRedo: vi.fn(),
    copySequenceSelection: vi.fn(),
    copySequenceSelectionFromEvent: vi.fn(),
    openFeatureEditorFromSelection: vi.fn(),
    pasteSequenceFromClipboard: vi.fn(),
    deleteProteinBond: vi.fn(),
    deleteSelectedFeature: vi.fn(),
    clearOrfSelection: vi.fn(),
    removeSelectedPrimers: vi.fn(),
    deleteSequenceSelection: vi.fn(() => true),
    deleteSequenceAtCaret: vi.fn(() => true),
    insertSequenceBases: vi.fn(() => true),
    ...overrides,
  }
}

function baseState(
  overrides: Partial<RegisteredAppKeyboardShortcutLifecycleState> = {},
): RegisteredAppKeyboardShortcutLifecycleState {
  return {
    traceDocument: false,
    molecule: 'dna',
    activeTab: 'Sequence',
    dnaEndsEditorOpen: false,
    featureEditor: false,
    primerEditor: false,
    hasFeatureSelected: false,
    hasSequenceSelection: true,
    cutStrandSelection: null,
    selectionFocus: 'dna',
    selectedProteinBondId: null,
    selectedFeatureId: null,
    selectedFeatureIds: [],
    hasSelectedFeature: false,
    selectedPrimerId: null,
    selectedRange: null,
    onTraceDocumentMutationBlocked: vi.fn(),
    ...overrides,
  }
}

function keyDown(
  init: KeyboardEventInit & { key: string },
  target: EventTarget | null = document.body,
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ...init,
  })
  Object.defineProperty(event, 'target', { value: target })
  return event
}

function pasteEvent(target: EventTarget | null = document.body): ClipboardEvent {
  const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent
  Object.defineProperty(event, 'target', { value: target })
  return event
}

function copyEvent(target: EventTarget | null = document.body): ClipboardEvent {
  const event = new Event('copy', { bubbles: true, cancelable: true }) as ClipboardEvent
  Object.defineProperty(event, 'target', { value: target })
  return event
}

describe('useRegisteredAppKeyboardShortcutLifecycle', () => {
  let host: HTMLDivElement | undefined
  let root: ReturnType<typeof createRoot> | undefined

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
    vi.clearAllMocks()
  })

  function mountHarness(options: {
    state?: RegisteredAppKeyboardShortcutLifecycleState
    commands?: WorkspaceKeyboardCommands
    dispatch?: (action: NativeAppMenuAction) => void
    isNativeDesktop?: boolean
    isWindowsNativeDesktop?: boolean
    documentPorts?: {
      hasOpenModalDialog?: () => boolean
      hasSelectedSelectionBarText?: () => boolean
      hasPrimerOrDbManagerDialog?: () => boolean
    }
    listeners?: {
      keydown?: Array<(event: KeyboardEvent) => void>
      paste?: Array<(event: ClipboardEvent) => void>
      copy?: Array<(event: ClipboardEvent) => void>
    }
  }) {
    const keyListeners = options.listeners?.keydown ?? []
    const pasteListeners = options.listeners?.paste ?? []
    const copyListeners = options.listeners?.copy ?? []
    const commands = options.commands ?? baseCommands()
    const dispatch = options.dispatch ?? vi.fn()

    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    function Harness() {
      useRegisteredAppKeyboardShortcutLifecycle(options.state ?? baseState(), {
        dispatch,
        commands,
        ...testShortcutPolicy,
        hasOpenModalDialog: options.documentPorts?.hasOpenModalDialog ?? (() => false),
        hasSelectedSelectionBarText: options.documentPorts?.hasSelectedSelectionBarText ?? (() => false),
        hasPrimerOrDbManagerDialog: options.documentPorts?.hasPrimerOrDbManagerDialog ?? (() => false),
        isNativeDesktop: options.isNativeDesktop ?? false,
        isWindowsNativeDesktop: options.isWindowsNativeDesktop ?? false,
        addKeyDownListener: (handler) => {
          keyListeners.push(handler)
          return () => undefined
        },
        addPasteListener: (handler) => {
          pasteListeners.push(handler)
          return () => undefined
        },
        addCopyListener: (handler) => {
          copyListeners.push(handler)
          return () => undefined
        },
      })
      return null
    }

    return { Harness, keyListeners, pasteListeners, copyListeners, commands, dispatch }
  }

  it('skips modal and editable targets without dispatching', async () => {
    const keyListeners: Array<(event: KeyboardEvent) => void> = []
    const { Harness, dispatch } = mountHarness({
      listeners: { keydown: keyListeners },
      documentPorts: { hasOpenModalDialog: () => true },
    })

    await act(async () => {
      root!.render(<Harness />)
      await Promise.resolve()
    })

    const save = keyDown({ key: 's', ctrlKey: true })
    keyListeners[0]!(save)
    expect(dispatch).not.toHaveBeenCalled()
    expect(save.defaultPrevented).toBe(false)
  })

  it('dispatches registered shortcuts before undo/redo and Ctrl+T selection paths', async () => {
    const keyListeners: Array<(event: KeyboardEvent) => void> = []
    const order: string[] = []
    const commands = baseCommands({
      handleUndo: vi.fn(() => order.push('handleUndo')),
      handleRedo: vi.fn(() => order.push('handleRedo')),
      openFeatureEditorFromSelection: vi.fn(() => order.push('openFeatureEditor')),
    })
    const dispatch = vi.fn((action: NativeAppMenuAction) => order.push(`dispatch:${action}`))

    const { Harness } = mountHarness({
      listeners: { keydown: keyListeners },
      commands,
      dispatch,
    })

    await act(async () => {
      root!.render(<Harness />)
      await Promise.resolve()
    })

    const undo = keyDown({ key: 'z', ctrlKey: true })
    keyListeners[0]!(undo)
    expect(order).toEqual(['dispatch:edit.undo'])
    expect(commands.handleUndo).not.toHaveBeenCalled()
    expect(undo.defaultPrevented).toBe(true)

    const addFeature = keyDown({ key: 't', ctrlKey: true })
    keyListeners[0]!(addFeature)
    expect(order).toEqual(['dispatch:edit.undo', 'dispatch:features.add'])
    expect(commands.openFeatureEditorFromSelection).not.toHaveBeenCalled()
    expect(addFeature.defaultPrevented).toBe(true)
  })

  it('handles Ctrl+R in the Windows standalone webview as a fallback for the native menu accelerator', async () => {
    const keyListeners: Array<(event: KeyboardEvent) => void> = []
    const dispatch = vi.fn()
    const { Harness } = mountHarness({
      listeners: { keydown: keyListeners },
      dispatch,
      isNativeDesktop: true,
      isWindowsNativeDesktop: true,
    })

    await act(async () => {
      root!.render(<Harness />)
      await Promise.resolve()
    })

    const addPrimer = keyDown({ key: 'r', ctrlKey: true })
    keyListeners[0]!(addPrimer)

    expect(dispatch).toHaveBeenCalledWith('primers.add')
    expect(addPrimer.defaultPrevented).toBe(true)
  })

  it('handles Windows Ctrl+R on the map without reloading the webview', async () => {
    const keyListeners: Array<(event: KeyboardEvent) => void> = []
    const dispatch = vi.fn()
    const { Harness } = mountHarness({
      state: baseState({ activeTab: 'Map' }),
      listeners: { keydown: keyListeners },
      dispatch,
      isNativeDesktop: true,
      isWindowsNativeDesktop: true,
    })
    await act(async () => {
      root!.render(<Harness />)
      await Promise.resolve()
    })
    const event = keyDown({ key: 'r', ctrlKey: true })
    keyListeners[0]!(event)
    expect(event.defaultPrevented).toBe(true)
    expect(dispatch).toHaveBeenCalledWith('primers.add')
  })

  it('blocks trace Mod+Z via trace guard instead of undo dispatch or handleUndo', async () => {
    const keyListeners: Array<(event: KeyboardEvent) => void> = []
    const onTraceDocumentMutationBlocked = vi.fn()
    const commands = baseCommands({ handleUndo: vi.fn() })
    const dispatch = vi.fn()

    const { Harness } = mountHarness({
      state: baseState({
        traceDocument: true,
        onTraceDocumentMutationBlocked,
      }),
      listeners: { keydown: keyListeners },
      commands,
      dispatch,
    })

    await act(async () => {
      root!.render(<Harness />)
      await Promise.resolve()
    })

    const undo = keyDown({ key: 'z', ctrlKey: true })
    const stopSpy = vi.spyOn(undo, 'stopImmediatePropagation')
    keyListeners[0]!(undo)
    expect(onTraceDocumentMutationBlocked).toHaveBeenCalledTimes(1)
    expect(dispatch).not.toHaveBeenCalled()
    expect(commands.handleUndo).not.toHaveBeenCalled()
    expect(undo.defaultPrevented).toBe(true)
    expect(stopSpy).not.toHaveBeenCalled()
  })

  it('blocks Ctrl+T selection path when editor flags are true', async () => {
    const keyListeners: Array<(event: KeyboardEvent) => void> = []
    const openFeatureEditorFromSelection = vi.fn()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    function Harness() {
      useRegisteredAppKeyboardShortcutLifecycle(
        baseState({ featureEditor: true, primerEditor: true }),
        {
          dispatch: vi.fn(),
          commands: baseCommands({ openFeatureEditorFromSelection }),
          ...testShortcutPolicy,
          hasOpenModalDialog: () => false,
          hasSelectedSelectionBarText: () => false,
          hasPrimerOrDbManagerDialog: () => false,
          isNativeDesktop: true,
          addKeyDownListener: (handler) => {
            keyListeners.push(handler)
            return () => undefined
          },
          addPasteListener: () => () => undefined,
          addCopyListener: () => () => undefined,
        },
      )
      return null
    }

    await act(async () => {
      root!.render(<Harness />)
      await Promise.resolve()
    })

    const addFeature = keyDown({ key: 't', ctrlKey: true })
    keyListeners[0]!(addFeature)
    expect(openFeatureEditorFromSelection).not.toHaveBeenCalled()
    expect(addFeature.defaultPrevented).toBe(false)
  })

  it('falls through to handleUndo when registry matching is disabled on native desktop', async () => {
    const keyListeners: Array<(event: KeyboardEvent) => void> = []
    const handleUndo = vi.fn()
    mountHarness({
      listeners: { keydown: keyListeners },
      commands: baseCommands({ handleUndo }),
    })

    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    function NativeHarness() {
      useRegisteredAppKeyboardShortcutLifecycle(baseState(), {
        dispatch: vi.fn(),
        commands: baseCommands({ handleUndo }),
        ...testShortcutPolicy,
        hasOpenModalDialog: () => false,
        hasSelectedSelectionBarText: () => false,
        hasPrimerOrDbManagerDialog: () => false,
        isNativeDesktop: true,
        addKeyDownListener: (handler) => {
          keyListeners.push(handler)
          return () => undefined
        },
        addPasteListener: () => () => undefined,
        addCopyListener: () => () => undefined,
      })
      return null
    }

    await act(async () => {
      root!.render(<NativeHarness />)
      await Promise.resolve()
    })

    const undo = keyDown({ key: 'z', ctrlKey: true })
    keyListeners[0]!(undo)
    expect(handleUndo).toHaveBeenCalledTimes(1)
    expect(undo.defaultPrevented).toBe(true)
  })

  it('applies paste and copy guards through injected document ports', async () => {
    const pasteListeners: Array<(event: ClipboardEvent) => void> = []
    const copyListeners: Array<(event: ClipboardEvent) => void> = []
    const pasteSequenceFromClipboard = vi.fn()
    const copySequenceSelectionFromEvent = vi.fn()
    const { Harness, commands } = mountHarness({
      listeners: { paste: pasteListeners, copy: copyListeners },
      commands: baseCommands({ pasteSequenceFromClipboard, copySequenceSelectionFromEvent }),
      documentPorts: {
        hasOpenModalDialog: () => true,
        hasSelectedSelectionBarText: () => true,
        hasPrimerOrDbManagerDialog: () => true,
      },
    })

    await act(async () => {
      root!.render(<Harness />)
      await Promise.resolve()
    })

    const paste = pasteEvent()
    pasteListeners[0]!(paste)
    expect(paste.defaultPrevented).toBe(false)
    expect(commands.pasteSequenceFromClipboard).not.toHaveBeenCalled()

    const copy = copyEvent()
    copyListeners[0]!(copy)
    expect(copy.defaultPrevented).toBe(false)
    expect(commands.copySequenceSelectionFromEvent).not.toHaveBeenCalled()
  })

  it('uses fresh command/state refs without resubscribing listeners', async () => {
    const keyListeners: Array<(event: KeyboardEvent) => void> = []
    const addKeyDownListener = vi.fn((handler: (event: KeyboardEvent) => void) => {
      keyListeners.push(handler)
      return () => undefined
    })
    const firstUndo = vi.fn()
    const secondUndo = vi.fn()

    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    function Harness({ undo }: { undo: () => void }) {
      useRegisteredAppKeyboardShortcutLifecycle(baseState(), {
        dispatch: vi.fn(),
        commands: baseCommands({ handleUndo: undo }),
        ...testShortcutPolicy,
        hasOpenModalDialog: () => false,
        hasSelectedSelectionBarText: () => false,
        hasPrimerOrDbManagerDialog: () => false,
        isNativeDesktop: true,
        addKeyDownListener,
        addPasteListener: () => () => undefined,
        addCopyListener: () => () => undefined,
      })
      return null
    }

    await act(async () => {
      root!.render(<Harness undo={firstUndo} />)
      await Promise.resolve()
    })
    expect(addKeyDownListener).toHaveBeenCalledTimes(1)

    keyListeners[0]!(keyDown({ key: 'z', ctrlKey: true }))
    expect(firstUndo).toHaveBeenCalledTimes(1)

    await act(async () => {
      root!.render(<Harness undo={secondUndo} />)
      await Promise.resolve()
    })
    expect(addKeyDownListener).toHaveBeenCalledTimes(1)

    keyListeners[0]!(keyDown({ key: 'z', ctrlKey: true }))
    expect(secondUndo).toHaveBeenCalledTimes(1)
    expect(firstUndo).toHaveBeenCalledTimes(1)
  })

  it('registers bubble-phase keydown/paste/copy listeners and cleans up on unmount', async () => {
    const addListener = vi.spyOn(window, 'addEventListener')
    const removeListener = vi.spyOn(window, 'removeEventListener')
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    function Harness() {
      useRegisteredAppKeyboardShortcutLifecycle(baseState(), {
        dispatch: vi.fn(),
        commands: baseCommands(),
        ...testShortcutPolicy,
        hasOpenModalDialog: () => false,
        hasSelectedSelectionBarText: () => false,
        hasPrimerOrDbManagerDialog: () => false,
        isNativeDesktop: false,
      })
      return null
    }

    await act(async () => {
      root!.render(<Harness />)
      await Promise.resolve()
    })

    const keyHandler = addListener.mock.calls.find(([type]) => type === 'keydown')?.[1]
    const pasteHandler = addListener.mock.calls.find(([type]) => type === 'paste')?.[1]
    const copyHandler = addListener.mock.calls.find(([type]) => type === 'copy')?.[1]
    expect(keyHandler).toEqual(expect.any(Function))
    expect(pasteHandler).toEqual(expect.any(Function))
    expect(copyHandler).toEqual(expect.any(Function))

    act(() => root!.unmount())
    expect(removeListener).toHaveBeenCalledWith('keydown', keyHandler)
    expect(removeListener).toHaveBeenCalledWith('paste', pasteHandler)
    expect(removeListener).toHaveBeenCalledWith('copy', copyHandler)

    addListener.mockRestore()
    removeListener.mockRestore()
  })
})
