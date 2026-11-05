import { createElement, type ReactNode } from 'react'
import { isFormattedFeatureNote } from './featureNotesDisplay'
import { sanitizedFeatureNoteFragment } from './featureNoteMarkup'

/** Render only simple formatting and safe links, never imported event handlers or styles. */
export function FeatureNoteContent({ value }: { value: string }) {
  if (typeof document === 'undefined' || !isFormattedFeatureNote(value)) {
    return <>{value.split(/(\S{40,})/g).map((piece, index) => (
      piece.length >= 40 && !/\s/.test(piece) ? <span className="feature-note-long-token" key={index}>{piece}</span> : piece
    ))}</>
  }
  const fragment = sanitizedFeatureNoteFragment(value)
  const renderNode = (node: Node, key: string): ReactNode => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent
    if (node.nodeType !== Node.ELEMENT_NODE) return null
    const element = node as Element
    const tag = element.tagName.toLowerCase()
    const children = Array.from(element.childNodes, (child, index) => renderNode(child, `${key}-${index}`))
    if (tag === 'a') {
      const href = element.getAttribute('href') ?? ''
      return <a key={key} href={href} target="_blank" rel="noopener noreferrer">{children}</a>
    }
    return createElement(tag, { key }, ...(tag === 'br' ? [] : children))
  }
  return <>{Array.from(fragment.childNodes, (node, index) => renderNode(node, String(index)))}</>
}
