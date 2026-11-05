const allowedTags = new Set(['b', 'strong', 'i', 'em', 'u', 's', 'sup', 'sub', 'br', 'p', 'div', 'span', 'a'])
const discardedTags = new Set(['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'img'])

export function safeFeatureNoteLink(href: string) {
  return /^(?:https?:\/\/|mailto:)/i.test(href.trim())
}

/** Copy only supported formatting into an inert fragment; never copy event handlers or CSS. */
export function sanitizedFeatureNoteFragment(value: string): DocumentFragment {
  const template = document.createElement('template')
  template.innerHTML = value
  const fragment = document.createDocumentFragment()
  const append = (node: Node, parent: Node) => {
    if (node.nodeType === Node.TEXT_NODE) { parent.appendChild(document.createTextNode(node.textContent ?? '')); return }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const element = node as Element
    const tag = element.tagName.toLowerCase()
    if (discardedTags.has(tag)) return
    let target = parent
    if (allowedTags.has(tag)) {
      const href = tag === 'a' ? element.getAttribute('href')?.trim() ?? '' : ''
      if (tag !== 'a' || safeFeatureNoteLink(href)) {
        const safe = document.createElement(tag)
        if (tag === 'a') safe.setAttribute('href', href)
        parent.appendChild(safe)
        target = safe
      }
    }
    Array.from(element.childNodes).forEach(child => append(child, target))
  }
  Array.from(template.content.childNodes).forEach(node => append(node, fragment))
  return fragment
}
