import { describe, expect, it, vi } from 'vitest'
import {
  requestDocumentExit,
  resolveDocumentExit,
  type DocumentExitChoice,
  type PendingDocumentExit,
  type ResolveDocumentExitPorts,
} from './documentExit'

function ports(overrides: Partial<ResolveDocumentExitPorts> = {}) {
  const events: string[] = []
  const pending: PendingDocumentExit = { action: () => { events.push('action') } }
  let current: PendingDocumentExit | null = pending
  let installedCompletion: (() => void | Promise<void>) | null = null
  const base: ResolveDocumentExitPorts = {
    pending: current,
    clearPending: () => {
      events.push('clear-pending')
      current = null
    },
    restorePending: (next) => {
      events.push('restore-pending')
      current = next
    },
    isNativeDesktop: () => true,
    documentSaveBinding: 'disk',
    saveDiskFile: async () => {
      events.push('save-disk')
      if (installedCompletion) await installedCompletion()
      return true
    },
    save: async (completion) => {
      events.push('save')
      await completion()
    },
    installSaveCompletion: (completion) => {
      events.push('install-completion')
      installedCompletion = completion
    },
    clearSaveCompletion: () => {
      events.push('clear-completion')
      installedCompletion = null
    },
    exportFile: async () => {
      events.push('export')
      return '/tmp/export.dna'
    },
    completeDatabaseSave: async () => {
      events.push('complete-save')
      if (installedCompletion) await installedCompletion()
    },
    saveToDatabase: () => { events.push('save-to-database') },
    clearSessionDraftForRecord: async () => { events.push('clear-draft') },
    refreshSessionDrafts: async () => { events.push('refresh-drafts') },
    currentRecordId: () => 'record-1',
    suppressPageHideDraftSave: () => {},
    ...overrides,
  }
  return { base, events, pending, getCurrent: () => current }
}

describe('requestDocumentExit', () => {
  it('runs clean actions immediately without staging context', async () => {
    const events: string[] = []
    requestDocumentExit(() => { events.push('action') }, {
      isDirty: () => false,
      stage: () => events.push('stage'),
    })
    expect(events).toEqual(['action'])
  })

  it('stages dirty actions with the requested context', () => {
    const stage = vi.fn()
    const action = () => undefined
    requestDocumentExit(action, { isDirty: () => true, stage }, { context: 'window-close' })
    expect(stage).toHaveBeenCalledWith({ action, context: 'window-close' })
  })

  it('uses document context by default for dirty actions', () => {
    const stage = vi.fn()
    const action = () => undefined
    requestDocumentExit(action, { isDirty: () => true, stage })
    expect(stage).toHaveBeenCalledWith({ action, context: 'document' })
  })

  it('preserves synchronous errors from a clean action', () => {
    const stage = vi.fn()
    expect(() => requestDocumentExit(() => {
      throw new Error('action unavailable')
    }, { isDirty: () => false, stage })).toThrow('action unavailable')
    expect(stage).not.toHaveBeenCalled()
  })
})

describe('resolveDocumentExit', () => {
  it.each<DocumentExitChoice>(['cancel', 'discard', 'save-file', 'save-as-file', 'save-to-database'])(
    'does nothing for %s when there is no pending exit',
    async (choice) => {
      const { base, events } = ports({ pending: null })
      await resolveDocumentExit(choice, base)
      expect(events).toEqual([])
    },
  )

  it('clears before cancel and does not execute the action', async () => {
    const { base, events, getCurrent } = ports()
    await resolveDocumentExit('cancel', base)
    expect(events).toEqual(['clear-pending'])
    expect(getCurrent()).toBeNull()
  })

  it('notifies a waiting coordinator when the user cancels', async () => {
    const onCancel = vi.fn()
    const action = vi.fn()
    const stage = vi.fn()
    requestDocumentExit(action, { isDirty: () => true, stage }, { context: 'window-close', onCancel })
    const { base } = ports({ pending: stage.mock.calls[0]![0] })
    await resolveDocumentExit('cancel', base)
    expect(onCancel).toHaveBeenCalledOnce()
    expect(action).not.toHaveBeenCalled()
  })

  it('delegates web/database Save and completes exactly once', async () => {
    const { base, events } = ports({
      isNativeDesktop: () => false,
      documentSaveBinding: 'database',
    })
    await resolveDocumentExit('save-file', base)
    expect(events).toEqual(['clear-pending', 'save', 'action'])
  })

  it('runs the pending action after a successful native Save', async () => {
    const { base, events } = ports()
    await resolveDocumentExit('save-file', base)
    expect(events).toEqual(['clear-pending', 'install-completion', 'save-disk', 'action'])
  })

  it('restores pending after a cancelled native Save for retry', async () => {
    const { base, events, pending, getCurrent } = ports({
      saveDiskFile: async () => {
        events.push('save-disk')
        return false
      },
    })
    await resolveDocumentExit('save-file', base)
    expect(events).toEqual([
      'clear-pending',
      'install-completion',
      'save-disk',
      'clear-completion',
      'restore-pending',
    ])
    expect(getCurrent()).toBe(pending)
  })

  it('restores the pending action after native Save cancellation for retry', async () => {
    const { base, events, pending, getCurrent } = ports({
      saveDiskFile: async () => {
        events.push('save-disk')
        return false
      },
    })
    await resolveDocumentExit('save-as-file', base)
    expect(events).toEqual([
      'clear-pending',
      'install-completion',
      'save-disk',
      'clear-completion',
      'restore-pending',
    ])
    expect(getCurrent()).toBe(pending)
  })

  it('runs the pending action after a successful native Save As', async () => {
    const { base, events } = ports()
    await resolveDocumentExit('save-as-file', base)
    expect(events).toEqual(['clear-pending', 'install-completion', 'save-disk', 'action'])
  })

  it('restores pending when database Save As is cancelled in the native dialog', async () => {
    const { base, events, pending, getCurrent } = ports({
      documentSaveBinding: 'database',
      exportFile: async () => {
        events.push('export')
        return null
      },
    })
    await resolveDocumentExit('save-as-file', base)
    expect(events).toEqual([
      'clear-pending',
      'install-completion',
      'export',
      'clear-completion',
      'restore-pending',
    ])
    expect(getCurrent()).toBe(pending)
  })

  it('restores pending before opening Save to Database and never runs action eagerly', async () => {
    const { base, events } = ports()
    await resolveDocumentExit('save-to-database', base)
    expect(events).toEqual([
      'clear-pending',
      'restore-pending',
      'install-completion',
      'save-to-database',
    ])
  })

  it('clears and refreshes the draft before an in-document discard action', async () => {
    const { base, events } = ports()
    await resolveDocumentExit('discard', base)
    expect(events).toEqual(['clear-pending', 'clear-draft', 'refresh-drafts', 'action'])
  })

  it('runs a window-close discard action without waiting for draft cleanup', async () => {
    const events: string[] = []
    const { base } = ports({
      pending: { context: 'window-close', action: () => { events.push('action') } },
      suppressPageHideDraftSave: () => { events.push('suppress-pagehide-save') },
      clearSessionDraftForRecord: () => {
        events.push('clear-draft')
        return new Promise<void>(() => {})
      },
      refreshSessionDrafts: async () => { events.push('refresh-drafts') },
    })

    await resolveDocumentExit('discard', base)

    expect(events).toEqual(['suppress-pagehide-save', 'clear-draft', 'action'])
  })

  it('does not let a window-close draft cleanup failure prevent closing', async () => {
    const events: string[] = []
    const { base } = ports({
      pending: { context: 'window-close', action: () => { events.push('action') } },
      clearSessionDraftForRecord: async () => {
        events.push('clear-draft')
        throw new Error('draft unavailable')
      },
    })

    await expect(resolveDocumentExit('discard', base)).resolves.toBeUndefined()
    await Promise.resolve()
    expect(events).toEqual(['clear-draft', 'action'])
  })

  it('completes browser Save As so the pending action runs once', async () => {
    const { base, events } = ports({ isNativeDesktop: () => false })
    await resolveDocumentExit('save-as-file', base)
    expect(events).toEqual(['clear-pending', 'install-completion', 'export', 'complete-save', 'action'])
  })

  it('completes browser Save As even when the download has no path', async () => {
    const { base, events } = ports({
      isNativeDesktop: () => false,
      exportFile: async () => {
        events.push('export')
        return null
      },
    })
    await resolveDocumentExit('save-as-file', base)
    expect(events).toEqual(['clear-pending', 'install-completion', 'export', 'complete-save', 'action'])
  })

  it('keeps the prompt cleared and propagates a native Save failure', async () => {
    const { base, events, getCurrent } = ports({
      saveDiskFile: async () => {
        events.push('save-disk')
        throw new Error('disk unavailable')
      },
    })
    await expect(resolveDocumentExit('save-file', base)).rejects.toThrow('disk unavailable')
    expect(events).toEqual(['clear-pending', 'install-completion', 'save-disk'])
    expect(getCurrent()).toBeNull()
  })

  it('keeps the prompt cleared and propagates a Save As export failure', async () => {
    const { base, events, getCurrent } = ports({
      isNativeDesktop: () => false,
      exportFile: async () => {
        events.push('export')
        throw new Error('export unavailable')
      },
    })
    await expect(resolveDocumentExit('save-as-file', base)).rejects.toThrow('export unavailable')
    expect(events).toEqual(['clear-pending', 'install-completion', 'export'])
    expect(getCurrent()).toBeNull()
  })

  it('propagates discard cleanup failures before refresh or action', async () => {
    const { base, events, getCurrent } = ports({
      clearSessionDraftForRecord: async () => {
        events.push('clear-draft')
        throw new Error('draft unavailable')
      },
    })
    await expect(resolveDocumentExit('discard', base)).rejects.toThrow('draft unavailable')
    expect(events).toEqual(['clear-pending', 'clear-draft'])
    expect(getCurrent()).toBeNull()
  })

  it('restores the prompt and propagates a Save to Database startup failure', async () => {
    const { base, events, pending, getCurrent } = ports({
      saveToDatabase: () => {
        events.push('save-to-database')
        throw new Error('database unavailable')
      },
    })
    await expect(resolveDocumentExit('save-to-database', base)).rejects.toThrow('database unavailable')
    expect(events).toEqual([
      'clear-pending',
      'restore-pending',
      'install-completion',
      'save-to-database',
    ])
    expect(getCurrent()).toBe(pending)
  })
})
