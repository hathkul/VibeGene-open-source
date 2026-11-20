// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import type { SequenceRecord } from '../../domain/types'
import { ProteinTranslationOrigin } from './ProteinTranslationOrigin'
import { proteinTranslationOriginNames } from './proteinShared'

it('retains different constructs even when their names match', () => {
  const record = { protein: { translationDerivation: { sources: [
    { projectName: 'Same name', projectId: 'a' }, { projectName: 'Same name', projectId: 'b' },
    { projectName: 'Same name', projectId: 'a' },
  ] } } } as SequenceRecord
  expect(proteinTranslationOriginNames(record)).toEqual(['Same name', 'Same name'])
})

it('summarizes distinct sources and opens a dismissible list without changing provenance', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const names = ['First construct', 'Second construct', 'Third construct', 'First construct']
  const record = { protein: { translationDerivation: { sources: names.map((projectName) => ({ projectName, projectId: projectName, sequenceDigest: 'digest' })) } } } as SequenceRecord
  const onOpenSource = vi.fn()
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () => root.render(<ProteinTranslationOrigin record={record} onOpenSource={onOpenSource} />))
  const trigger = host.querySelector('button')!
  expect(trigger.textContent).toBe('Translated from First construct and 2 more…')
  await act(async () => trigger.click())
  expect([...document.querySelectorAll('.protein-origin-dialog li')].map((element) => element.textContent))
    .toEqual(['First construct', 'Second construct', 'Third construct'])
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  expect(document.querySelector('.protein-origin-dialog')).toBeNull()
  expect(document.activeElement).toBe(trigger)
  expect(record.protein?.translationDerivation?.sources).toHaveLength(4)
  await act(async () => trigger.click())
  const second = document.querySelectorAll<HTMLButtonElement>('.protein-origin-source')[1]!
  await act(async () => second.click())
  expect(onOpenSource).toHaveBeenCalledWith(expect.objectContaining({ projectName: 'Second construct', projectId: 'Second construct' }))
  expect(document.querySelector('.protein-origin-dialog')).toBeNull()
  await act(async () => root.unmount())
  host.remove()
})

it('opens a list for a single source and marks unavailable sources', async () => {
  const record = { protein: { translationDerivation: { sources: [{ projectName: 'Only source' }] } } } as SequenceRecord
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () => root.render(<ProteinTranslationOrigin record={record} />))
  expect(host.textContent).toBe('Translated from Only source')
  await act(async () => host.querySelector<HTMLButtonElement>('button')!.click())
  expect(document.querySelector<HTMLButtonElement>('.protein-origin-source')?.disabled).toBe(true)
  expect(document.querySelector('.protein-origin-dialog')?.textContent).toContain('source unavailable')
  await act(async () => root.unmount())
  host.remove()
})
