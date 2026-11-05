// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { TelegramGroupDialog } from './TelegramGroupDialog'
import { openExternalUrl } from './desktop/openExternalUrl'

vi.mock('./desktop/openExternalUrl', () => ({ openExternalUrl: vi.fn(async () => true) }))

it('opens the displayed invite link and closes on Escape', async () => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const onDismiss = vi.fn()
  act(() => root.render(<TelegramGroupDialog onDismiss={onDismiss} />))
  const link = host.querySelector<HTMLAnchorElement>('a')!
  expect(link.href).toBe('https://t.me/+f7I7mZQptuQyOGQy')
  expect(link.textContent).toBe(link.href)
  await act(async () => link.click())
  expect(openExternalUrl).toHaveBeenCalledWith(link.href)
  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
  expect(onDismiss).toHaveBeenCalledOnce()
  act(() => root.unmount())
  host.remove()
})
