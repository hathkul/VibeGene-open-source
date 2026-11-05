import { themeFixturePalette } from '../../test-support/themeFixturePalette'
// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import type { SequenceFeature } from '../../domain/types'
import {
  CleavageSiteFeatureDialog,
  FeatureMergeTemplateDialog,
  FeatureSegmentTargetDialog,
} from './DocumentDialogs'

const feature = (id: string, name = id): SequenceFeature => ({
  id,
  name,
  type: 'misc_feature',
  color: themeFixturePalette.gray, // theme-color-allow: test fixture biological feature data
  locations: [{ start: 0, end: 10, strand: 'forward' }],
})

describe('feature selection dialogs', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })

  function renderDialog(dialog: ReactNode) {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root.render(dialog))
  }

  it('resets segment selection to the first feature when its source list changes', () => {
    const first = [feature('a'), feature('b')]
    renderDialog(
      <FeatureSegmentTargetDialog
        range={{ start: 0, end: 3 }}
        features={first}
        mode="assign"
        onCancel={() => undefined}
        onSelect={() => undefined}
      />,
    )
    act(() => {
      const select = host.querySelector('select') as HTMLSelectElement
      select.value = 'b'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    act(() => root.render(
      <FeatureSegmentTargetDialog
        range={{ start: 0, end: 3 }}
        features={[feature('c'), feature('b')]}
        mode="assign"
        onCancel={() => undefined}
        onSelect={() => undefined}
      />,
    ))
    expect((host.querySelector('select') as HTMLSelectElement).value).toBe('c')
  })

  it('resets merge-template selection when its source list changes', () => {
    const first = [feature('a'), feature('b')]
    renderDialog(
      <FeatureMergeTemplateDialog features={first} onCancel={() => undefined} onSelect={() => undefined} />,
    )
    act(() => {
      const select = host.querySelector('select') as HTMLSelectElement
      select.value = 'b'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    act(() => root.render(
      <FeatureMergeTemplateDialog
        features={[feature('c'), feature('b')]}
        onCancel={() => undefined}
        onSelect={() => undefined}
      />,
    ))
    expect((host.querySelector('select') as HTMLSelectElement).value).toBe('c')
  })

  it('resets cleavage-site selection when its source list changes', () => {
    const first = [feature('a'), feature('b')]
    renderDialog(
      <CleavageSiteFeatureDialog
        position={2}
        mode="add"
        features={first}
        onCancel={() => undefined}
        onSelect={() => undefined}
      />,
    )
    act(() => {
      const select = host.querySelector('select') as HTMLSelectElement
      select.value = 'b'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    act(() => root.render(
      <CleavageSiteFeatureDialog
        position={2}
        mode="add"
        features={[feature('c'), feature('b')]}
        onCancel={() => undefined}
        onSelect={() => undefined}
      />,
    ))
    expect((host.querySelector('select') as HTMLSelectElement).value).toBe('c')
  })
})
