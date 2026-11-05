function numberAttribute(element: HTMLElement, name: string) {
  const value = Number(element.dataset[name])
  return Number.isFinite(value) ? value : 0
}

export function dialogDragPosition(dialog: HTMLElement) {
  return { x: numberAttribute(dialog, 'dialogDragX'), y: numberAttribute(dialog, 'dialogDragY') }
}

export function setDialogDragPosition(dialog: HTMLElement, x: number, y: number) {
  dialog.dataset.dialogDragX = String(x)
  dialog.dataset.dialogDragY = String(y)
  dialog.style.setProperty('--dialog-drag-x', `${x}px`)
  dialog.style.setProperty('--dialog-drag-y', `${y}px`)
  // Inline transform survives hybrid CSS that zeros the `translate` property.
  dialog.style.transform = `translate(${x}px, ${y}px)`
  dialog.classList.add('is-dialog-draggable')
}
