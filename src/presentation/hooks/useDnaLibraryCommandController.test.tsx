// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { convertConstructToLibrary } from '../../domain/dnaLibrary'
import { labPlasmid } from '../../domain/fixtures'
import { traceRecordFromSequence } from '../../domain/sequenceTraceFactory'
import type { DnaLibraryCreationCommands, DnaLibraryConvertCommands, DnaLibraryNativePickerPort } from '../../application/ports/dnaLibraryCommandPorts'
import type { SequenceRecord } from '../../domain/types'
import { useDnaLibraryCommandController } from './useDnaLibraryCommandController'

function mountController(
  initial: {
    record: SequenceRecord
    nativePicker: DnaLibraryNativePickerPort
    createCommandsRef?: { current: DnaLibraryCreationCommands }
    convertCommandsRef: { current: DnaLibraryConvertCommands }
  },
  setup?: (controller: ReturnType<typeof useDnaLibraryCommandController>) => void,
) {
  let controller!: ReturnType<typeof useDnaLibraryCommandController>
  const recordRef = { current: initial.record }
  const setStatus = vi.fn()
  const setConvertToLibrarySourceOpen = vi.fn()
  const openDatabaseForLibraryMembers = vi.fn()
  const onTraceFilesChange = vi.fn()
  const updateRecord = vi.fn((updater: (current: SequenceRecord) => SequenceRecord) => {
    recordRef.current = updater(recordRef.current)
  })
  const pushDocumentHistorySnapshot = vi.fn()
  const setSelectedLibraryMemberIds = vi.fn()
  const setMemberTabAnchorId = vi.fn()
  const setSelectedAlignmentTraceId = vi.fn()
  const createCommandsRef = initial.createCommandsRef ?? { current: { createDnaLibraryFromFiles: vi.fn() } }

  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)

  function Harness() {
    controller = useDnaLibraryCommandController({
      record: recordRef.current,
      recordRef,
      nativePicker: initial.nativePicker,
      createCommandsRef,
      convertCommandsRef: initial.convertCommandsRef,
      setStatus,
      setConvertToLibrarySourceOpen,
      openDatabaseForLibraryMembers,
      onTraceFilesChange,
      updateRecord,
      pushDocumentHistorySnapshot,
      setSelectedLibraryMemberIds,
      setMemberTabAnchorId,
      setSelectedAlignmentTraceId,
    })
    setup?.(controller)
    return null
  }

  return {
    render: async () => {
      await act(async () => root.render(<Harness />))
    },
    unmount: () => {
      act(() => root.unmount())
      host.remove()
    },
    controller: () => controller,
    recordRef,
    setStatus,
    setConvertToLibrarySourceOpen,
    openDatabaseForLibraryMembers,
    onTraceFilesChange,
    updateRecord,
    pushDocumentHistorySnapshot,
    setSelectedLibraryMemberIds,
    setMemberTabAnchorId,
    setSelectedAlignmentTraceId,
    createCommandsRef,
    convertCommandsRef: initial.convertCommandsRef,
  }
}

describe('useDnaLibraryCommandController', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('routes new-library creation through native picker or browser file input', async () => {
    const pickCreate = vi.fn().mockResolvedValue({ ...labPlasmid, name: 'Lib' })
    const nativeHarness = mountController({
      record: labPlasmid,
      nativePicker: {
        nativeRuntime: true,
        pickCreateLibraryInNewWindow: pickCreate,
        pickConvertToLibraryMemberFiles: vi.fn(),
      },
      convertCommandsRef: { current: { convertOpenConstructToLibraryFromFiles: vi.fn(), convertOpenConstructToLibraryFromDatabase: vi.fn() } },
    })
    await nativeHarness.render()
    await act(async () => {
      nativeHarness.controller().openNewDnaLibraryPicker()
      await Promise.resolve()
    })
    expect(pickCreate).toHaveBeenCalled()
    expect(nativeHarness.setStatus).toHaveBeenCalledWith(expect.stringContaining('Created DNA library'))

    const click = vi.spyOn(HTMLInputElement.prototype, 'click')
    const browserHarness = mountController({
      record: labPlasmid,
      nativePicker: {
        nativeRuntime: false,
        pickCreateLibraryInNewWindow: vi.fn(),
        pickConvertToLibraryMemberFiles: vi.fn(),
      },
      convertCommandsRef: { current: { convertOpenConstructToLibraryFromFiles: vi.fn(), convertOpenConstructToLibraryFromDatabase: vi.fn() } },
    })
    await browserHarness.render()
    browserHarness.controller().libraryFileInputRef.current = document.createElement('input')
    await act(async () => browserHarness.controller().openNewDnaLibraryPicker())
    expect(click).toHaveBeenCalled()
    click.mockRestore()
    nativeHarness.unmount()
    browserHarness.unmount()
  })

  it('routes browser library commands through the latest ports and reports Error and non-Error failures', async () => {
    const files = [new File(['ATGC'], 'peer.seq')]
    const create = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('create failed'))
      .mockRejectedValueOnce('create failed without Error')
    const convert = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('convert failed'))
      .mockRejectedValueOnce('convert failed without Error')
    const harness = mountController({
      record: labPlasmid,
      nativePicker: {
        nativeRuntime: false,
        pickCreateLibraryInNewWindow: vi.fn(),
        pickConvertToLibraryMemberFiles: vi.fn(),
      },
      createCommandsRef: { current: { createDnaLibraryFromFiles: create } },
      convertCommandsRef: { current: { convertOpenConstructToLibraryFromFiles: convert, convertOpenConstructToLibraryFromDatabase: vi.fn() } },
    })
    await harness.render()

    await act(async () => harness.controller().createDnaLibraryFromFiles(files))
    await act(async () => harness.controller().createDnaLibraryFromFiles(files))
    expect(harness.setStatus).toHaveBeenLastCalledWith('create failed')
    await act(async () => harness.controller().createDnaLibraryFromFiles(files))
    expect(harness.setStatus).toHaveBeenLastCalledWith('Could not create DNA library.')

    await act(async () => harness.controller().convertOpenConstructToLibraryFromFiles(files))
    await act(async () => harness.controller().convertOpenConstructToLibraryFromFiles(files))
    expect(harness.setStatus).toHaveBeenLastCalledWith('convert failed')
    await act(async () => harness.controller().convertOpenConstructToLibraryFromFiles(files))
    expect(harness.setStatus).toHaveBeenLastCalledWith('Could not convert to library.')
    expect(create).toHaveBeenCalledTimes(3)
    expect(convert).toHaveBeenCalledTimes(3)
    harness.unmount()
  })

  it('reads refreshed browser command ports without replacing the returned callbacks', async () => {
    const initialCreate = vi.fn().mockResolvedValue(undefined)
    const latestCreate = vi.fn().mockResolvedValue(undefined)
    const initialConvert = vi.fn().mockResolvedValue(undefined)
    const latestConvert = vi.fn().mockResolvedValue(undefined)
    const harness = mountController({
      record: labPlasmid,
      nativePicker: {
        nativeRuntime: false,
        pickCreateLibraryInNewWindow: vi.fn(),
        pickConvertToLibraryMemberFiles: vi.fn(),
      },
      createCommandsRef: { current: { createDnaLibraryFromFiles: initialCreate } },
      convertCommandsRef: { current: { convertOpenConstructToLibraryFromFiles: initialConvert, convertOpenConstructToLibraryFromDatabase: vi.fn() } },
    })
    await harness.render()
    const createCommand = harness.controller().createDnaLibraryFromFiles
    const convertCommand = harness.controller().convertOpenConstructToLibraryFromFiles
    harness.createCommandsRef.current = { createDnaLibraryFromFiles: latestCreate }
    harness.convertCommandsRef.current = { convertOpenConstructToLibraryFromFiles: latestConvert, convertOpenConstructToLibraryFromDatabase: vi.fn() }

    await act(async () => {
      await createCommand([])
      await convertCommand([])
    })
    expect(initialCreate).not.toHaveBeenCalled()
    expect(initialConvert).not.toHaveBeenCalled()
    expect(latestCreate).toHaveBeenCalledWith([])
    expect(latestConvert).toHaveBeenCalledWith([])
    harness.unmount()
  })

  it('reports invalid convert status and opens the source dialog when allowed', async () => {
    const peer = traceRecordFromSequence('ATGC', 'peer')
    const { record: library } = convertConstructToLibrary(labPlasmid, [peer])
    const blockedHarness = mountController({
      record: library,
      nativePicker: {
        nativeRuntime: false,
        pickCreateLibraryInNewWindow: vi.fn(),
        pickConvertToLibraryMemberFiles: vi.fn(),
      },
      convertCommandsRef: { current: { convertOpenConstructToLibraryFromFiles: vi.fn(), convertOpenConstructToLibraryFromDatabase: vi.fn() } },
    })
    await blockedHarness.render()
    await act(async () => blockedHarness.controller().openConvertToLibraryPicker())
    expect(blockedHarness.setStatus).toHaveBeenCalledWith('This file is already a DNA library.')
    expect(blockedHarness.setConvertToLibrarySourceOpen).not.toHaveBeenCalled()
    blockedHarness.unmount()

    const allowedHarness = mountController({
      record: labPlasmid,
      nativePicker: {
        nativeRuntime: false,
        pickCreateLibraryInNewWindow: vi.fn(),
        pickConvertToLibraryMemberFiles: vi.fn(),
      },
      convertCommandsRef: { current: { convertOpenConstructToLibraryFromFiles: vi.fn(), convertOpenConstructToLibraryFromDatabase: vi.fn() } },
    })
    await allowedHarness.render()
    await act(async () => allowedHarness.controller().openConvertToLibraryPicker())
    expect(allowedHarness.setConvertToLibrarySourceOpen).toHaveBeenCalledWith(true)
    allowedHarness.unmount()
  })

  it('closes the convert-source dialog before clicking the controller-owned browser convert input', async () => {
    const harness = mountController({
      record: labPlasmid,
      nativePicker: {
        nativeRuntime: false,
        pickCreateLibraryInNewWindow: vi.fn(),
        pickConvertToLibraryMemberFiles: vi.fn(),
      },
      convertCommandsRef: { current: { convertOpenConstructToLibraryFromFiles: vi.fn(), convertOpenConstructToLibraryFromDatabase: vi.fn() } },
    })
    await harness.render()

    const convertInput = document.createElement('input')
    convertInput.type = 'file'
    const routedSequence: string[] = []
    harness.setConvertToLibrarySourceOpen.mockImplementation((open: boolean) => {
      routedSequence.push(`dialog:${open}`)
    })
    const clickSpy = vi.spyOn(convertInput, 'click').mockImplementation(() => {
      routedSequence.push('convertInputClick')
    })
    harness.controller().convertToLibraryFileInputRef.current = convertInput

    await act(async () => {
      harness.controller().openConvertToLibraryFromFiles()
    })

    expect(routedSequence).toEqual(['dialog:false', 'convertInputClick'])
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(harness.setConvertToLibrarySourceOpen.mock.invocationCallOrder[0]).toBeLessThan(
      clickSpy.mock.invocationCallOrder[0]!,
    )
    harness.unmount()
  })

  it('handles native convert picker cancel, unreadable files, and errors', async () => {
    const convertFromFiles = vi.fn()
    const harness = mountController({
      record: labPlasmid,
      nativePicker: {
        nativeRuntime: true,
        pickCreateLibraryInNewWindow: vi.fn(),
        pickConvertToLibraryMemberFiles: vi.fn()
          .mockResolvedValueOnce({ kind: 'cancelled' })
          .mockResolvedValueOnce({ kind: 'unreadable' })
          .mockRejectedValueOnce(new Error('dialog failed')),
      },
      convertCommandsRef: { current: { convertOpenConstructToLibraryFromFiles: convertFromFiles, convertOpenConstructToLibraryFromDatabase: vi.fn() } },
    })
    await harness.render()
    await act(async () => {
      harness.controller().openConvertToLibraryFromFiles()
      await Promise.resolve()
    })
    expect(convertFromFiles).not.toHaveBeenCalled()
    await act(async () => {
      harness.controller().openConvertToLibraryFromFiles()
      await Promise.resolve()
    })
    expect(harness.setStatus).toHaveBeenCalledWith('Could not read the selected files.')
    await act(async () => {
      harness.controller().openConvertToLibraryFromFiles()
      await Promise.resolve()
    })
    expect(harness.setStatus).toHaveBeenCalledWith('dialog failed')
    harness.unmount()
  })

  it('keeps multi-member commits, collapses zero/one-member libraries, and orders history before collapse', async () => {
    const peerA = traceRecordFromSequence('ATGC', 'peer-a', { id: 'peer-a' })
    const peerB = traceRecordFromSequence('ATGC', 'peer-b', { id: 'peer-b' })
    const { record: library, members } = convertConstructToLibrary(labPlasmid, [peerA, peerB])
    const harness = mountController({
      record: library,
      nativePicker: {
        nativeRuntime: false,
        pickCreateLibraryInNewWindow: vi.fn(),
        pickConvertToLibraryMemberFiles: vi.fn(),
      },
      convertCommandsRef: { current: { convertOpenConstructToLibraryFromFiles: vi.fn(), convertOpenConstructToLibraryFromDatabase: vi.fn() } },
    })
    await harness.render()

    const kept = members.slice(0, 2)
    let collapsed = false
    await act(async () => {
      collapsed = harness.controller().commitLibraryMembersOrCollapse(kept, { statusIfMembers: 'kept' })
    })
    expect(collapsed).toBe(false)
    expect(harness.onTraceFilesChange).toHaveBeenCalledWith(kept)
    expect(harness.setStatus).toHaveBeenCalledWith('kept')
    expect(harness.pushDocumentHistorySnapshot).not.toHaveBeenCalled()

    harness.unmount()

    const oneMemberHarness = mountController({
      record: library,
      nativePicker: {
        nativeRuntime: false,
        pickCreateLibraryInNewWindow: vi.fn(),
        pickConvertToLibraryMemberFiles: vi.fn(),
      },
      convertCommandsRef: { current: { convertOpenConstructToLibraryFromFiles: vi.fn(), convertOpenConstructToLibraryFromDatabase: vi.fn() } },
    })
    const collapseSequence: string[] = []
    oneMemberHarness.pushDocumentHistorySnapshot.mockImplementation(() => {
      collapseSequence.push('pushHistory')
    })
    oneMemberHarness.updateRecord.mockImplementation((updater) => {
      collapseSequence.push('updateRecord')
      oneMemberHarness.recordRef.current = updater(oneMemberHarness.recordRef.current)
    })
    oneMemberHarness.onTraceFilesChange.mockImplementation(() => {
      collapseSequence.push('clearTraces')
    })
    oneMemberHarness.setSelectedLibraryMemberIds.mockImplementation(() => {
      collapseSequence.push('clearMemberIds')
    })
    oneMemberHarness.setMemberTabAnchorId.mockImplementation(() => {
      collapseSequence.push('clearAnchor')
    })
    oneMemberHarness.setSelectedAlignmentTraceId.mockImplementation(() => {
      collapseSequence.push('clearAlignment')
    })
    oneMemberHarness.setStatus.mockImplementation(() => {
      collapseSequence.push('status')
    })
    await oneMemberHarness.render()
    await act(async () => {
      collapsed = oneMemberHarness.controller().commitLibraryMembersOrCollapse([members[0]!])
    })
    expect(collapsed).toBe(true)
    expect(collapseSequence).toEqual([
      'pushHistory',
      'updateRecord',
      'clearTraces',
      'clearMemberIds',
      'clearAnchor',
      'clearAlignment',
      'status',
    ])
    expect(oneMemberHarness.pushDocumentHistorySnapshot.mock.invocationCallOrder[0]).toBeLessThan(
      oneMemberHarness.updateRecord.mock.invocationCallOrder[0]!,
    )
    expect(oneMemberHarness.onTraceFilesChange).toHaveBeenCalledWith([])
    expect(oneMemberHarness.setSelectedLibraryMemberIds).toHaveBeenCalledWith([])
    expect(oneMemberHarness.setMemberTabAnchorId).toHaveBeenCalledWith(null)
    expect(oneMemberHarness.setSelectedAlignmentTraceId).toHaveBeenCalledWith(null)
    expect(oneMemberHarness.setStatus).toHaveBeenCalledWith('Converted back to a DNA construct (one member left).')
    oneMemberHarness.unmount()

    const emptyHarness = mountController({
      record: library,
      nativePicker: {
        nativeRuntime: false,
        pickCreateLibraryInNewWindow: vi.fn(),
        pickConvertToLibraryMemberFiles: vi.fn(),
      },
      convertCommandsRef: { current: { convertOpenConstructToLibraryFromFiles: vi.fn(), convertOpenConstructToLibraryFromDatabase: vi.fn() } },
    })
    await emptyHarness.render()
    await act(async () => {
      collapsed = emptyHarness.controller().commitLibraryMembersOrCollapse([], { alreadyPushedHistory: true })
    })
    expect(collapsed).toBe(true)
    expect(emptyHarness.pushDocumentHistorySnapshot).not.toHaveBeenCalled()
    expect(emptyHarness.setStatus).toHaveBeenCalledWith('Converted back to a DNA construct (no members left).')
    emptyHarness.unmount()
  })
})
