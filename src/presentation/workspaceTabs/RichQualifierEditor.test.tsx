// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { RichQualifierEditor } from './RichQualifierEditor'

let host: HTMLDivElement
let root: ReturnType<typeof createRoot>
afterEach(() => { act(() => root?.unmount()); host?.remove(); vi.restoreAllMocks() })

it('applies formatting to the selection and reports formatted content', () => {
  const change = vi.fn()
  const command = vi.fn((name: string) => {
    if (name === 'bold') {
      const range = window.getSelection()!.getRangeAt(0)
      range.surroundContents(document.createElement('b'))
    }
    return true
  })
  Object.defineProperty(document, 'execCommand', { configurable: true, value: command })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  act(() => root.render(<RichQualifierEditor value="selected text" qualifier="note" disabled={false} onChange={change} />))
  const field = host.querySelector<HTMLElement>('[role="textbox"]')!
  act(() => { field.focus() })
  const range = document.createRange(); range.setStart(field.firstChild!, 0); range.setEnd(field.firstChild!, 8)
  window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range)
  act(() => { field.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })) })
  const button = host.querySelector<HTMLButtonElement>('button[aria-label="Bold"]')!
  act(() => { button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); button.click() })
  expect(command).toHaveBeenCalledWith('bold', false, undefined)
  expect(change).toHaveBeenLastCalledWith('<html><body><b>selected</b> text</body></html>')
})

it('rejects unsafe links and retains supported formatting while editing', () => {
  const change = vi.fn()
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  act(() => root.render(<RichQualifierEditor value={'<html><body><i>safe</i><script>bad()</script><a href="javascript:alert(1)">link</a></body></html>'} qualifier="note" disabled={false} onChange={change} />))
  const field = host.querySelector<HTMLElement>('[role="textbox"]')!
  expect(field.innerHTML).toBe('<i>safe</i>link')
  act(() => { field.focus() })
  act(() => { field.dispatchEvent(new Event('input', { bubbles: true })) })
  expect(change).toHaveBeenCalledWith('<html><body><i>safe</i>link</body></html>')
  act(() => { host.querySelector<HTMLButtonElement>('[aria-label="Insert link"]')!.click() })
  const linkInput = host.querySelector<HTMLInputElement>('.feature-rich-link input')!
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => { setter.call(linkInput, 'javascript:alert(1)'); linkInput.dispatchEvent(new Event('input', { bubbles: true })) })
  act(() => { [...host.querySelectorAll('button')].find(button => button.textContent === 'Apply')!.click() })
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Enter an https')
})


it('edits repeated qualifier values independently and adds or removes values', () => {
  const change = vi.fn()
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  const first = '<html><body><b>first</b></body></html>'
  const second = '<html><body><i>second</i></body></html>'
  act(() => root.render(<RichQualifierEditor value={`${first}\n${second}`} qualifier="note" disabled={false} onChange={change} />))
  const fields = host.querySelectorAll<HTMLElement>('[role="textbox"]')
  expect(fields).toHaveLength(2)
  expect(fields[0]!.querySelector('b')?.textContent).toBe('first')
  expect(fields[1]!.querySelector('i')?.textContent).toBe('second')
  expect(host.querySelector('[aria-label="Bold"]')).toBeNull()
  act(() => fields[1]!.focus())
  expect(host.querySelector('[aria-label="Bold"]')).not.toBeNull()
  act(() => { fields[1]!.innerHTML = '<i>changed</i>'; fields[1]!.dispatchEvent(new Event('input', { bubbles: true })) })
  expect(change).toHaveBeenLastCalledWith(`${first}\n<html><body><i>changed</i></body></html>`)
  act(() => host.querySelector<HTMLButtonElement>('[aria-label="Remove note value 1"]')!.click())
  expect(change).toHaveBeenLastCalledWith('<html><body><i>changed</i></body></html>')
  act(() => host.querySelector<HTMLButtonElement>('.feature-rich-add')!.click())
  expect(host.querySelectorAll('[role="textbox"]')).toHaveLength(2)
})


it('inserts a grid symbol at the saved selection and closes the picker', () => {
  const change = vi.fn()
  const command = vi.fn((name: string, _showUI: boolean, symbol: string) => {
    if (name === 'insertText') {
      const range = window.getSelection()!.getRangeAt(0)
      range.deleteContents()
      range.insertNode(document.createTextNode(symbol))
    }
    return true
  })
  Object.defineProperty(document, 'execCommand', { configurable: true, value: command })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  act(() => root.render(<RichQualifierEditor value="ab" qualifier="note" disabled={false} onChange={change} />))
  const field = host.querySelector<HTMLElement>('[role="textbox"]')!
  act(() => field.focus())
  const range = document.createRange(); range.setStart(field.firstChild!, 1); range.collapse(true)
  window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range)
  act(() => field.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })))
  act(() => host.querySelector<HTMLButtonElement>('[aria-label="Insert symbol"]')!.click())
  expect(host.querySelector('[aria-label="Choose a symbol"]')).not.toBeNull()
  act(() => host.querySelector<HTMLButtonElement>('[aria-label="Insert β"]')!.click())
  expect(command).toHaveBeenCalledWith('insertText', false, 'β')
  expect(change).toHaveBeenLastCalledWith('aβb')
  expect(host.querySelector('[aria-label="Choose a symbol"]')).toBeNull()
})
