import { isTauriRuntime } from './tauriRuntime'

async function readViaTauri(): Promise<string> {
  const { readText } = await import('@tauri-apps/plugin-clipboard-manager')
  return readText()
}

async function writeViaTauri(text: string): Promise<void> {
  const { writeText } = await import('@tauri-apps/plugin-clipboard-manager')
  await writeText(text)
}

function writeViaExecCommand(text: string): boolean {
  const element = document.createElement('textarea')
  element.value = text
  element.setAttribute('readonly', 'true')
  element.style.position = 'fixed'
  element.style.left = '-9999px'
  document.body.appendChild(element)
  element.select()
  const copied = document.execCommand('copy')
  document.body.removeChild(element)
  return copied
}

/** Read plain text from the OS clipboard (Tauri desktop or browser API). */
export async function readClipboardText(): Promise<string> {
  if (isTauriRuntime()) {
    return readViaTauri()
  }
  return navigator.clipboard.readText()
}

/** Write plain text to the OS clipboard (Tauri desktop or browser API). */
export async function writeClipboardText(text: string): Promise<void> {
  if (isTauriRuntime()) {
    try {
      await writeViaTauri(text)
      return
    } catch {
      if (writeViaExecCommand(text)) return
      throw new Error('clipboard write failed')
    }
  }
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    if (writeViaExecCommand(text)) return
    throw new Error('clipboard write failed')
  }
}

/** Set clipboard text synchronously during a copy event (WebKit fallback). */
export function setCopyEventText(event: ClipboardEvent, text: string): void {
  event.clipboardData?.setData('text/plain', text)
}
