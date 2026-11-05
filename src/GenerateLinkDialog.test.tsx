// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GenerateLinkDialog, OpenSequenceUrlDialog, RemoteSequenceOpenErrorDialog } from './GenerateLinkDialog'

let container: HTMLDivElement
let root: Root

function enterUrl(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

describe('GenerateLinkDialog', () => {
  it('generates and copies a VibeGene launch link', async () => {
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    await act(async () => root.render(createElement(GenerateLinkDialog, { onClose: vi.fn() })))

    const sourceInput = container.querySelector<HTMLInputElement>('input[type="url"]')!
    await act(async () => {
      enterUrl(sourceInput, 'https://files.example.org/test.dna?raw=1&token=two words')
    })

    const output = container.querySelector<HTMLTextAreaElement>('textarea[readonly]')!
    expect(new URL(output.value).origin).toBe(window.location.origin)
    expect(new URL(output.value).searchParams.get('url'))
      .toBe('https://files.example.org/test.dna?raw=1&token=two%20words')

    const copyButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Copy link')!
    await act(async () => copyButton.click())
    expect(writeText).toHaveBeenCalledWith(output.value)
    expect(container.textContent).toContain('Copied to clipboard.')
  })

  it('rejects non-HTTP sequence links', async () => {
    await act(async () => root.render(createElement(GenerateLinkDialog, { onClose: vi.fn() })))
    const sourceInput = container.querySelector<HTMLInputElement>('input[type="url"]')!
    await act(async () => {
      enterUrl(sourceInput, 'file:///tmp/private.dna')
    })

    expect(container.querySelector('[role="alert"]')?.textContent).toContain('http:// or https://')
    expect(container.querySelector<HTMLButtonElement>('button.primary')?.disabled).toBe(true)
  })

  it('makes remote-open failures explicit when pDemo is used as fallback', async () => {
    await act(async () => root.render(createElement(RemoteSequenceOpenErrorDialog, {
      message: 'The remote file server returned HTTP 404.',
      onClose: vi.fn(),
    })))

    expect(container.querySelector('.remote-sequence-error-backdrop [role="alertdialog"]')).not.toBeNull()
    expect(container.textContent).toContain('Could not open linked sequence')
    expect(container.textContent).toContain('loaded the pDemo example instead')
    expect(container.textContent).toContain('HTTP 404')
  })
})

describe('OpenSequenceUrlDialog', () => {
  it('validates and submits a public sequence URL', async () => {
    const onOpen = vi.fn()
    await act(async () => root.render(createElement(OpenSequenceUrlDialog, {
      onCancel: vi.fn(),
      onOpen,
    })))

    const sourceInput = container.querySelector<HTMLInputElement>('input[type="url"]')!
    await act(async () => {
      enterUrl(sourceInput, '  https://files.example.org/My Map.dna?raw=1  ')
    })

    const openButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Open')!
    expect(openButton.disabled).toBe(false)
    await act(async () => openButton.click())
    expect(onOpen).toHaveBeenCalledWith('https://files.example.org/My%20Map.dna?raw=1')
  })

  it('does not submit an unsupported URL scheme', async () => {
    const onOpen = vi.fn()
    await act(async () => root.render(createElement(OpenSequenceUrlDialog, {
      onCancel: vi.fn(),
      onOpen,
    })))

    const sourceInput = container.querySelector<HTMLInputElement>('input[type="url"]')!
    await act(async () => enterUrl(sourceInput, 'file:///tmp/private.dna'))

    expect(container.querySelector('[role="alert"]')?.textContent).toContain('http:// or https://')
    expect(Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Open')?.disabled).toBe(true)
    expect(onOpen).not.toHaveBeenCalled()
  })
})
