// @vitest-environment jsdom
import { createRef, type RefObject } from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceFileInput, type WorkspaceFileInputProps } from './WorkspaceFileInput'

function setInputFiles(input: HTMLInputElement, files: File[]) {
  Object.defineProperty(input, 'files', { value: files, configurable: true })
}

function changeInput(input: HTMLInputElement) {
  act(() => {
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

type DistributiveOmit<T, K extends PropertyKey> = T extends T ? Omit<T, K> : never

describe('WorkspaceFileInput', () => {
  let root: Root | null = null
  let host: HTMLElement | null = null

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
    root = null
    host = null
  })

  function render(
    props: DistributiveOmit<WorkspaceFileInputProps, 'inputRef'>,
    inputRef: RefObject<HTMLInputElement | null> = createRef<HTMLInputElement>(),
  ) {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root!.render(<WorkspaceFileInput inputRef={inputRef} {...props} />))
    return { dom: host, input: host.querySelector('input')!, inputRef }
  }

  it('renders a hidden single-file input without the multiple attribute', () => {
    const onFile = vi.fn()
    const { input } = render({ accept: '.txt,text/plain', onFile })
    expect(input.type).toBe('file')
    expect(input.hidden).toBe(true)
    expect(input.accept).toBe('.txt,text/plain')
    expect(input.hasAttribute('multiple')).toBe(false)
  })

  it('renders the multiple attribute only in multiple mode', () => {
    const onFiles = vi.fn()
    const { input } = render({ accept: '.ab1', multiple: true, onFiles })
    expect(input.hasAttribute('multiple')).toBe(true)
  })

  it('hands the single selected file to onFile and resets the input value', () => {
    const onFile = vi.fn()
    const { input } = render({ accept: '.txt', onFile })
    const file = new File(['atgc'], 'primers.txt', { type: 'text/plain' })
    setInputFiles(input, [file])
    changeInput(input)
    expect(onFile).toHaveBeenCalledTimes(1)
    expect(onFile).toHaveBeenCalledWith(file)
    expect(input.value).toBe('')
  })

  it('does not invoke onFile when the change carries no file', () => {
    const onFile = vi.fn()
    const { input } = render({ accept: '.txt', onFile })
    setInputFiles(input, [])
    changeInput(input)
    expect(onFile).not.toHaveBeenCalled()
    expect(input.value).toBe('')
  })

  it('hands every selected file to onFiles in multiple mode and resets the input value', () => {
    const onFiles = vi.fn()
    const { input } = render({ accept: '.ab1', multiple: true, onFiles })
    const first = new File(['a'], 'a.ab1')
    const second = new File(['b'], 'b.ab1')
    setInputFiles(input, [first, second])
    changeInput(input)
    expect(onFiles).toHaveBeenCalledTimes(1)
    expect(onFiles).toHaveBeenCalledWith([first, second])
    expect(input.value).toBe('')
  })

  it('does not invoke onFiles for an empty selection in multiple mode', () => {
    const onFiles = vi.fn()
    const { input } = render({ accept: '.ab1', multiple: true, onFiles })
    setInputFiles(input, [])
    changeInput(input)
    expect(onFiles).not.toHaveBeenCalled()
  })

  it('supports re-selecting the same file after a reset', () => {
    const onFile = vi.fn()
    const { input } = render({ accept: '.txt', onFile })
    const file = new File(['atgc'], 'primers.txt', { type: 'text/plain' })
    setInputFiles(input, [file])
    changeInput(input)
    setInputFiles(input, [file])
    changeInput(input)
    expect(onFile).toHaveBeenCalledTimes(2)
  })

  it('exposes the input element through inputRef', () => {
    const onFile = vi.fn()
    const { input, inputRef } = render({ accept: '.txt', onFile })
    expect(inputRef.current).toBe(input)
  })
})
