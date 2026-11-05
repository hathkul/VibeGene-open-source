import { useEffect, useLayoutEffect, useRef } from 'react'
import type { NativeAppMenuAction } from '../../application/ports/nativeMenu'
import { isTraceDocumentMutationAction } from '../../application/traceDocument'
import { isOrfFeature } from '../../domain/orfPrediction'
import { sanitizeDna, type StrandPairSelection } from '../../domain/sequence'
import type { SelectionRange, SelectionFocus, WorkspaceTab } from '../sequence'

export type RegisteredAppKeyboardShortcutMatch = {
  action: NativeAppMenuAction
  molecule?: 'dna' | 'protein'
}

export type RegisteredAppKeyboardShortcutPolicyPorts = {
  canHandleAppShortcut: (
    event: Pick<KeyboardEvent, 'defaultPrevented'>,
    targetIsEditable: boolean,
    hasOpenDialog: boolean,
  ) => boolean
  isEditableShortcutTarget: (target: EventTarget | null) => boolean
  isKeyboardShortcutAvailable: (
    shortcut: RegisteredAppKeyboardShortcutMatch,
    molecule?: 'dna' | 'protein' | 'rna',
  ) => boolean
  matchKeyboardShortcut: (
    event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>,
  ) => RegisteredAppKeyboardShortcutMatch | undefined
}

export type RegisteredAppKeyboardShortcutDocumentPorts = {
  hasOpenModalDialog: () => boolean
  hasSelectedSelectionBarText: () => boolean
  hasPrimerOrDbManagerDialog: () => boolean
}

export type RegisteredAppKeyboardShortcutEventPorts = {
  isNativeDesktop: boolean
  isWindowsNativeDesktop: boolean
  addKeyDownListener: (handler: (event: KeyboardEvent) => void) => () => void
  addPasteListener: (handler: (event: ClipboardEvent) => void) => () => void
  addCopyListener: (handler: (event: ClipboardEvent) => void) => () => void
}

export type RegisteredAppKeyboardShortcutDispatchPorts = {
  dispatch: (action: NativeAppMenuAction) => void
}

export type WorkspaceKeyboardCommands = {
  handleUndo: () => void
  handleRedo: () => void
  copySequenceSelection: () => void | Promise<void>
  copySequenceSelectionFromEvent: (event: ClipboardEvent) => void | Promise<void>
  openFeatureEditorFromSelection: () => void
  pasteSequenceFromClipboard: () => void | Promise<void>
  deleteProteinBond: (bondId: string) => void
  deleteSelectedFeature: () => void
  clearOrfSelection: () => void
  removeSelectedPrimers: () => void
  deleteSequenceSelection: () => boolean
  deleteSequenceAtCaret: (backspace: boolean) => boolean
  insertSequenceBases: (bases: string) => boolean
}

export type RegisteredAppKeyboardShortcutLifecycleState = {
  traceDocument: boolean
  molecule: 'dna' | 'protein' | 'rna' | undefined
  activeTab: WorkspaceTab
  dnaEndsEditorOpen: boolean
  featureEditor: boolean
  primerEditor: boolean
  hasFeatureSelected: boolean
  hasSequenceSelection: boolean
  cutStrandSelection: StrandPairSelection | null
  selectionFocus: SelectionFocus
  selectedProteinBondId: string | null
  selectedFeatureId: string | null
  selectedFeatureIds: readonly string[]
  hasSelectedFeature: boolean
  selectedPrimerId: string | null
  selectedRange: SelectionRange | null
  onTraceDocumentMutationBlocked: () => void
}

export type RegisteredAppKeyboardShortcutLifecyclePorts =
  RegisteredAppKeyboardShortcutPolicyPorts &
  RegisteredAppKeyboardShortcutDocumentPorts &
  RegisteredAppKeyboardShortcutEventPorts &
  RegisteredAppKeyboardShortcutDispatchPorts & {
    commands: WorkspaceKeyboardCommands
  }

function defaultAddKeyDownListener(handler: (event: KeyboardEvent) => void): () => void {
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}

function defaultAddPasteListener(handler: (event: ClipboardEvent) => void): () => void {
  window.addEventListener('paste', handler)
  return () => window.removeEventListener('paste', handler)
}

function defaultAddCopyListener(handler: (event: ClipboardEvent) => void): () => void {
  window.addEventListener('copy', handler)
  return () => window.removeEventListener('copy', handler)
}

function tryHandleRegisteredShortcut(
  event: KeyboardEvent,
  policy: RegisteredAppKeyboardShortcutPolicyPorts,
  nativeDesktop: boolean,
  nativeWindows: boolean,
  current: RegisteredAppKeyboardShortcutLifecycleState,
  dispatch: (action: NativeAppMenuAction) => void,
): boolean {
  const registeredShortcut = nativeDesktop && !nativeWindows
    ? undefined
    : policy.matchKeyboardShortcut(event)
  if (!registeredShortcut) return false
  // WebView2 reserves Ctrl+R for reload on Windows and can consume it before
  // the Tauri menu accelerator fires. Keep native menu accelerators as the
  // source for other commands, but handle Add Primer in the workspace here.
  if (nativeDesktop && registeredShortcut.action !== 'primers.add') return false
  if (nativeWindows && registeredShortcut.action === 'primers.add') event.preventDefault()

  if (current.traceDocument && isTraceDocumentMutationAction(registeredShortcut.action)) {
    event.preventDefault()
    current.onTraceDocumentMutationBlocked()
    return true
  }
  if (!policy.isKeyboardShortcutAvailable(registeredShortcut, current.molecule)) return true
  if (registeredShortcut.action === 'features.add' && current.activeTab !== 'Sequence') return true
  if (
    registeredShortcut.action === 'primers.add' &&
    ((!nativeWindows && current.activeTab !== 'Sequence') || current.dnaEndsEditorOpen)
  ) {
    return true
  }
  if (registeredShortcut.action === 'features.duplicate' && !current.hasFeatureSelected) return true
  if (
    (registeredShortcut.action === 'edit.uppercase' || registeredShortcut.action === 'edit.lowercase') &&
    (!current.hasSequenceSelection || current.cutStrandSelection)
  ) {
    return true
  }
  event.preventDefault()
  dispatch(registeredShortcut.action)
  return true
}

/**
 * Owns the workspace keyboard/paste/copy listener family in one bubble-phase
 * registration. Deterministic shortcut matching is injected from the shell.
 */
export function useRegisteredAppKeyboardShortcutLifecycle(
  state: RegisteredAppKeyboardShortcutLifecycleState,
  ports: Partial<RegisteredAppKeyboardShortcutLifecyclePorts> &
    Pick<RegisteredAppKeyboardShortcutDispatchPorts, 'dispatch'> &
    Pick<RegisteredAppKeyboardShortcutPolicyPorts, 'matchKeyboardShortcut'> &
    Pick<RegisteredAppKeyboardShortcutLifecyclePorts, 'commands'>,
) {
  const {
    canHandleAppShortcut,
    isEditableShortcutTarget,
    isKeyboardShortcutAvailable,
    matchKeyboardShortcut,
    hasOpenModalDialog,
    hasSelectedSelectionBarText,
    hasPrimerOrDbManagerDialog,
    isNativeDesktop = false,
    isWindowsNativeDesktop = false,
    addKeyDownListener = defaultAddKeyDownListener,
    addPasteListener = defaultAddPasteListener,
    addCopyListener = defaultAddCopyListener,
    dispatch,
    commands,
  } = ports

  const stateRef = useRef(state)
  useLayoutEffect(() => {
    stateRef.current = state
  })

  const dispatchRef = useRef(dispatch)
  useLayoutEffect(() => {
    dispatchRef.current = dispatch
  })

  const commandsRef = useRef(commands)
  useLayoutEffect(() => {
    commandsRef.current = commands
  })

  const policyPortsRef = useRef({
    canHandleAppShortcut,
    isEditableShortcutTarget,
    isKeyboardShortcutAvailable,
    matchKeyboardShortcut,
  })
  useLayoutEffect(() => {
    policyPortsRef.current = {
      canHandleAppShortcut,
      isEditableShortcutTarget,
      isKeyboardShortcutAvailable,
      matchKeyboardShortcut,
    }
  })

  const documentPortsRef = useRef({
    hasOpenModalDialog,
    hasSelectedSelectionBarText,
    hasPrimerOrDbManagerDialog,
  })
  useLayoutEffect(() => {
    documentPortsRef.current = {
      hasOpenModalDialog,
      hasSelectedSelectionBarText,
      hasPrimerOrDbManagerDialog,
    }
  })

  const eventPortsRef = useRef({
    isNativeDesktop,
    isWindowsNativeDesktop,
    addKeyDownListener,
    addPasteListener,
    addCopyListener,
  })
  useLayoutEffect(() => {
    eventPortsRef.current = {
      isNativeDesktop,
      isWindowsNativeDesktop,
      addKeyDownListener,
      addPasteListener,
      addCopyListener,
    }
  })

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const policy = policyPortsRef.current
      const documentPorts = documentPortsRef.current
      const {
        isNativeDesktop: nativeDesktop,
        isWindowsNativeDesktop: nativeWindows,
      } = eventPortsRef.current
      const current = stateRef.current
      const cmd = commandsRef.current

      if (
        !policy.canHandleAppShortcut?.(
          event,
          policy.isEditableShortcutTarget?.(event.target) ?? false,
          documentPorts.hasOpenModalDialog?.() ?? false,
        )
      ) {
        return
      }

      if (
        tryHandleRegisteredShortcut(
          event,
          policy as RegisteredAppKeyboardShortcutPolicyPorts,
          nativeDesktop ?? false,
          nativeWindows ?? false,
          current,
          (action) => dispatchRef.current(action),
        )
      ) {
        return
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) {
          cmd.handleRedo()
        } else {
          cmd.handleUndo()
        }
        return
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        cmd.handleRedo()
        return
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
        if (documentPorts.hasSelectedSelectionBarText?.()) return
        if (documentPorts.hasPrimerOrDbManagerDialog?.()) return
        if (current.dnaEndsEditorOpen || current.activeTab !== 'Sequence') return
        if (!current.hasSequenceSelection) return
        event.preventDefault()
        void cmd.copySequenceSelection()
        return
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 't') {
        if (
          current.activeTab !== 'Sequence' ||
          current.primerEditor ||
          current.featureEditor ||
          current.dnaEndsEditorOpen ||
          current.cutStrandSelection
        ) {
          return
        }
        event.preventDefault()
        cmd.openFeatureEditorFromSelection()
        return
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
        if (
          current.molecule === 'protein' ||
          current.activeTab !== 'Sequence' ||
          current.primerEditor ||
          current.dnaEndsEditorOpen ||
          current.cutStrandSelection
        ) {
          return
        }
        event.preventDefault()
        void cmd.pasteSequenceFromClipboard()
        return
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (current.primerEditor || current.featureEditor || current.dnaEndsEditorOpen || current.cutStrandSelection) {
          return
        }
        if ((current.selectionFocus === 'bond' || current.activeTab === 'Features') && current.selectedProteinBondId) {
          cmd.deleteProteinBond(current.selectedProteinBondId)
          event.preventDefault()
          return
        }
        if (
          (current.selectionFocus === 'feature' || current.activeTab === 'Features') &&
          (current.selectedFeatureIds.length > 0 || current.hasSelectedFeature)
        ) {
          cmd.deleteSelectedFeature()
          event.preventDefault()
          return
        }
        if (
          current.selectionFocus === 'feature' &&
          current.selectedFeatureId &&
          isOrfFeature({ id: current.selectedFeatureId })
        ) {
          cmd.clearOrfSelection()
          event.preventDefault()
          return
        }
        if (current.selectionFocus === 'primer' && current.selectedPrimerId) {
          cmd.removeSelectedPrimers()
          event.preventDefault()
          return
        }
        if (current.activeTab !== 'Sequence') return
        if (current.molecule === 'protein') return
        const deleted =
          current.selectedRange && current.selectedRange.start !== current.selectedRange.end
            ? cmd.deleteSequenceSelection()
            : cmd.deleteSequenceAtCaret(event.key === 'Backspace')
        if (!deleted) return
        event.preventDefault()
        return
      }

      if (
        current.activeTab === 'Sequence' &&
        current.molecule !== 'protein' &&
        !current.primerEditor &&
        !current.dnaEndsEditorOpen &&
        !current.cutStrandSelection &&
        event.key.length === 1 &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        const typed = sanitizeDna(event.key)
        if (!typed) return
        if (!cmd.insertSequenceBases(typed)) return
        event.preventDefault()
      }
    }

    function handlePaste(event: ClipboardEvent) {
      if (event.defaultPrevented) return
      const documentPorts = documentPortsRef.current
      const current = stateRef.current
      const cmd = commandsRef.current
      if (documentPorts.hasOpenModalDialog?.()) return
      if (policyPortsRef.current.isEditableShortcutTarget?.(event.target)) return
      if (
        current.molecule === 'protein' ||
        current.activeTab !== 'Sequence' ||
        current.primerEditor ||
        current.dnaEndsEditorOpen ||
        current.cutStrandSelection
      ) {
        return
      }
      event.preventDefault()
      void cmd.pasteSequenceFromClipboard()
    }

    function handleCopy(event: ClipboardEvent) {
      if (event.defaultPrevented) return
      const documentPorts = documentPortsRef.current
      const current = stateRef.current
      const cmd = commandsRef.current
      if (documentPorts.hasOpenModalDialog?.()) return
      if (documentPorts.hasSelectedSelectionBarText?.()) return
      if (documentPorts.hasPrimerOrDbManagerDialog?.()) return
      if (policyPortsRef.current.isEditableShortcutTarget?.(event.target)) return
      if (current.dnaEndsEditorOpen || current.activeTab !== 'Sequence') return
      if (!current.hasSequenceSelection) return
      event.preventDefault()
      void cmd.copySequenceSelectionFromEvent(event)
    }

    const { addKeyDownListener: bindKeyDown, addPasteListener: bindPaste, addCopyListener: bindCopy } =
      eventPortsRef.current
    const removeKeyDown = bindKeyDown(handleKeyDown)
    const removePaste = bindPaste(handlePaste)
    const removeCopy = bindCopy(handleCopy)
    return () => {
      removeKeyDown()
      removePaste()
      removeCopy()
    }
  }, [])
}
