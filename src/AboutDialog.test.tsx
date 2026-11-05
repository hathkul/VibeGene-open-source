// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { AboutDialog } from './AboutDialog'

it('shows the version without an author credit', () => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  act(() => root.render(<AboutDialog onDismiss={vi.fn()} />))
  expect(host.querySelector('.about-version')).not.toBeNull()
  expect(host.textContent).not.toContain('by Example Author')
  act(() => root.unmount())
  host.remove()
})
