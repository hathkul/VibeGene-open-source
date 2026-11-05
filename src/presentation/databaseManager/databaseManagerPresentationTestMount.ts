import { act, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach } from 'vitest'

export function setInputValue(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

export function mount(ui: ReactElement) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(ui)
  })
  return {
    container,
    unmount: () => {
      act(() => {
        root.unmount()
      })
      container.remove()
    },
  }
}

export function registerDatabaseManagerPresentationTestCleanup() {
  afterEach(() => {
    document.body.innerHTML = ''
  })
}
