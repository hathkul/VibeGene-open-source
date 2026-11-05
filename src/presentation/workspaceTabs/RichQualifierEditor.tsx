import { useLayoutEffect, useRef, useState, type ClipboardEvent, type ReactNode } from 'react'
import { Link2 } from 'lucide-react'
import { featureQualifierValues } from '../../domain/featureQualifiers'
import { isFormattedFeatureNote } from './featureNotesDisplay'
import { safeFeatureNoteLink, sanitizedFeatureNoteFragment } from './featureNoteMarkup'

const formatting = [
  { command: 'bold', label: 'Bold', text: 'B' },
  { command: 'italic', label: 'Italic', text: 'I' },
  { command: 'underline', label: 'Underline', text: 'U' },
  { command: 'superscript', label: 'Superscript', text: 'xⁿ' },
  { command: 'subscript', label: 'Subscript', text: 'xₙ' },
] as const

const symbols = Array.from('αβγδεζηθικλμνξοπρσςτυφχψωΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ←→°±®©™')

export function RichQualifierEditor({ value, onChange, disabled, qualifier, selector }: {
  value: string
  onChange: (value: string) => void
  disabled: boolean
  qualifier: string
  selector?: ReactNode
}) {
  const editorRefs = useRef<Array<HTMLDivElement | null>>([])
  const selectedRange = useRef<Range | null>(null)
  const lastEmitted = useRef<string | null>(null)
  const [values, setValues] = useState(() => featureQualifierValues(value).length ? featureQualifierValues(value) : [''])
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [linkOpen, setLinkOpen] = useState(false)
  const [symbolsOpen, setSymbolsOpen] = useState(false)
  const [link, setLink] = useState('')
  const [linkError, setLinkError] = useState(false)
  const [activeCommands, setActiveCommands] = useState<string[]>([])
  function activeEditor() {
    return activeIndex === null ? null : editorRefs.current[activeIndex]
  }

  useLayoutEffect(() => {
    if (value === lastEmitted.current) return
    const next = featureQualifierValues(value)
    setValues(next.length ? next : [''])
    lastEmitted.current = value
  }, [value, qualifier])

  function updateValues(next: string[]) {
    setValues(next)
    const joined = next.join('\n')
    lastEmitted.current = joined
    onChange(joined)
  }

  function rememberSelection() {
    const selection = window.getSelection()
    const editor = activeEditor()
    if (editor && selection?.rangeCount && editor.contains(selection.getRangeAt(0).commonAncestorContainer)) {
      selectedRange.current = selection.getRangeAt(0).cloneRange()
      if (typeof document.queryCommandState === 'function') {
        setActiveCommands(formatting.filter(item => document.queryCommandState(item.command)).map(item => item.command))
      }
    }
  }

  function restoreSelection() {
    const editor = activeEditor()
    if (!editor) return
    editor.focus()
    if (!selectedRange.current || !editor.contains(selectedRange.current.commonAncestorContainer)) return
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(selectedRange.current)
  }

  function emit() {
    const editor = activeEditor()
    if (!editor) return
    const sanitized = document.createElement('div')
    sanitized.appendChild(sanitizedFeatureNoteFragment(editor.innerHTML))
    const hasFormatting = Boolean(sanitized.querySelector('b,strong,i,em,u,s,sup,sub,a'))
    const next = hasFormatting || (editor.innerText ?? editor.textContent ?? '').includes('\n')
      ? `<html><body>${sanitized.innerHTML.replace(/\n/g, '&#10;')}</body></html>`
      : (editor.innerText ?? editor.textContent ?? '')
    if (activeIndex !== null) updateValues(values.map((value, index) => index === activeIndex ? next : value))
    rememberSelection()
  }

  function apply(command: string, argument?: string) {
    restoreSelection()
    document.execCommand(command, false, argument)
    emit()
  }

  function pastePlainText(event: ClipboardEvent<HTMLDivElement>) {
    event.preventDefault()
    apply('insertText', event.clipboardData.getData('text/plain'))
  }

  function applyLink() {
    const href = link.trim()
    if (!safeFeatureNoteLink(href)) { setLinkError(true); return }
    apply('createLink', href)
    setLinkOpen(false)
    setLink('')
    setLinkError(false)
  }

  return <div className="feature-rich-editor" onBlur={event => {
    const next = event.relatedTarget as HTMLElement | null
    if (!next?.closest('.feature-rich-field, .feature-rich-toolbar, .feature-rich-link')) {
      setActiveIndex(null)
      setLinkOpen(false)
      setSymbolsOpen(false)
    }
  }}>
    <div className="feature-rich-header">
    {selector}
    {activeIndex !== null && <div className="feature-rich-toolbar" role="toolbar" aria-label="Text formatting">
      {formatting.map(item => <button key={item.command} type="button" disabled={disabled} title={item.label} aria-label={item.label} aria-pressed={activeCommands.includes(item.command)}
        className={`feature-rich-format feature-rich-format--${item.command}`}
        onMouseDown={event => { event.preventDefault(); rememberSelection() }} onClick={() => apply(item.command)}>{item.text}</button>)}
      <div className="feature-symbol-picker" onKeyDown={event => {
        if (event.key === 'Escape' && symbolsOpen) { event.preventDefault(); event.stopPropagation(); setSymbolsOpen(false); restoreSelection() }
      }}>
        <button type="button" aria-label="Insert symbol" title="Insert symbol" aria-haspopup="dialog" aria-expanded={symbolsOpen} disabled={disabled}
          onMouseDown={event => { event.preventDefault(); rememberSelection() }} onClick={() => setSymbolsOpen(open => !open)}>αβ ▾</button>
        {symbolsOpen && <div className="feature-symbol-popover" role="dialog" aria-label="Choose a symbol">
          <div className="feature-symbol-grid">
            {symbols.map(symbol => <button key={symbol} type="button" aria-label={`Insert ${symbol}`}
              onMouseDown={event => event.preventDefault()} onClick={() => { apply('insertText', symbol); setSymbolsOpen(false) }}>{symbol}</button>)}
          </div>
          <button type="button" className="feature-symbol-cancel" onMouseDown={event => event.preventDefault()}
            onClick={() => { setSymbolsOpen(false); restoreSelection() }}>Cancel</button>
        </div>}
      </div>
      <button type="button" disabled={disabled} title="Insert link" aria-label="Insert link"
        onMouseDown={event => { event.preventDefault(); rememberSelection() }} onClick={() => { setLinkOpen(!linkOpen); setLinkError(false) }}><Link2 size={15} aria-hidden="true" /></button>
    </div>}
    </div>
    {linkOpen && activeIndex !== null && <div className="feature-rich-link">
      <label>Link URL <input value={link} onChange={event => { setLink(event.target.value); setLinkError(false) }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); applyLink() } }} placeholder="https://example.org" /></label>
      <button type="button" onClick={applyLink}>Apply</button>
      <button type="button" onClick={() => setLinkOpen(false)}>Cancel</button>
      {linkError && <span role="alert">Enter an https, http, or mailto link.</span>}
    </div>}
    <div className="feature-rich-values">
      {values.map((item, index) => <div className="feature-rich-value-row" key={index}>
        <QualifierValue value={item} qualifier={qualifier} index={index} disabled={disabled}
          register={element => { editorRefs.current[index] = element }}
          onFocus={() => {
            if (activeIndex !== index) { selectedRange.current = null; setLinkOpen(false); setSymbolsOpen(false) }
            setActiveIndex(index)
          }}
          onInput={emit} onPaste={pastePlainText} onSelection={rememberSelection} />
        {values.length > 1 && <button type="button" disabled={disabled} aria-label={`Remove ${qualifier} value ${index + 1}`}
          onClick={() => { updateValues(values.filter((_, position) => position !== index)); setActiveIndex(null) }}>−</button>}
      </div>)}
      <button type="button" disabled={disabled} className="feature-rich-add" onClick={() => {
        updateValues([...values, ''])
        setActiveIndex(null)
        requestAnimationFrame(() => editorRefs.current[values.length]?.focus())
      }}>+ Add value</button>
    </div>
  </div>
}

function QualifierValue({ value, qualifier, index, disabled, register, onFocus, onInput, onPaste, onSelection }: {
  value: string
  qualifier: string
  index: number
  disabled: boolean
  register: (element: HTMLDivElement | null) => void
  onFocus: () => void
  onInput: () => void
  onPaste: (event: ClipboardEvent<HTMLDivElement>) => void
  onSelection: () => void
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const lastValue = useRef<string | null>(null)
  useLayoutEffect(() => {
    const editor = ref.current
    if (!editor || value === lastValue.current || document.activeElement === editor) return
    if (isFormattedFeatureNote(value)) editor.replaceChildren(sanitizedFeatureNoteFragment(value))
    else editor.textContent = value
    lastValue.current = value
  }, [value])
  return <div ref={element => { ref.current = element; register(element) }} className="feature-rich-field" role="textbox"
    aria-label={index === 0 ? `${qualifier} value` : `${qualifier} value ${index + 1}`} aria-multiline="true" aria-disabled={disabled}
    contentEditable={!disabled} suppressContentEditableWarning onFocus={onFocus}
    onInput={() => { lastValue.current = value; onInput() }} onPaste={onPaste} onMouseUp={onSelection} onKeyUp={onSelection}
    onClick={event => { if ((event.target as HTMLElement).closest('a')) event.preventDefault() }} />
}
