// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ events: [] as string[] }))

vi.mock('../src/App.tsx', () => {
  const MockApp = Object.assign(() => null, {
    prepareBootstrap: vi.fn(async () => {
      state.events.push('prepare')
    }),
  })
  return { default: MockApp }
})

vi.mock('react-dom/client', () => ({
  createRoot: () => ({
    render: () => state.events.push('render'),
  }),
}))

vi.mock('../src/desktop/HybridWindowHost.tsx', () => ({
  HybridWindowHost: () => null,
}))
vi.mock('../src/desktop/hybridWindows.ts', () => ({ hybridWindowKindFromUrl: () => null }))

vi.mock('../src/registerServiceWorker.ts', () => ({ registerServiceWorker: vi.fn() }))
vi.mock('../src/preventOverscrollNavigation.ts', () => ({ installPreventOverscrollNavigation: vi.fn() }))
vi.mock('../src/domain/snapgeneLzma.ts', () => ({ initSnapGeneLzma: vi.fn() }))
vi.mock('../src/ui/DialogDragManager.tsx', () => ({ DialogDragManager: () => null }))

describe('main workspace bootstrap', () => {
  beforeEach(() => {
    vi.resetModules()
    state.events.length = 0
    document.body.innerHTML = '<div id="root"></div>'
  })

  it('resolves the database handoff before mounting the workspace', async () => {
    await import('../src/main.tsx')
    await vi.waitFor(() => expect(state.events).toEqual(['prepare', 'render']))
  })
})
