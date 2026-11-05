export const COLOR_SCHEME_STORAGE_KEY = 'vibegene.colorScheme'
export const COLOR_SCHEME_CHANNEL_NAME = 'vibegene.colorScheme'

export const COLOR_SCHEMES = ['beige', 'bright', 'dark'] as const
export type ColorScheme = (typeof COLOR_SCHEMES)[number]

const listeners = new Set<() => void>()
let currentScheme: ColorScheme = 'beige'
let initialized = false
let channel: BroadcastChannel | null = null

export function normalizeColorScheme(value: unknown): ColorScheme {
  return value === 'bright' || value === 'dark' || value === 'beige' ? value : 'beige'
}

/** Initialize from storage and apply before the first React render. Safe to call more than once. */
export function initializeColorScheme(): ColorScheme {
  if (initialized) return currentScheme
  initialized = true

  try {
    currentScheme = normalizeColorScheme(window.localStorage.getItem(COLOR_SCHEME_STORAGE_KEY))
  } catch {
    currentScheme = 'beige'
  }
  applyColorScheme(currentScheme)

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage)
  }
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      channel = new BroadcastChannel(COLOR_SCHEME_CHANNEL_NAME)
      channel.addEventListener('message', onBroadcastMessage)
    } catch {
      channel = null
    }
  }
  return currentScheme
}

export function getColorScheme(): ColorScheme {
  return currentScheme
}

export function setColorScheme(value: ColorScheme): void {
  initializeColorScheme()
  const scheme = normalizeColorScheme(value)
  currentScheme = scheme
  applyColorScheme(scheme)
  try {
    window.localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, scheme)
  } catch {
    // The current window still changes when storage is unavailable.
  }
  channel?.postMessage(scheme)
  listeners.forEach((listener) => listener())
}

export function subscribeColorScheme(listener: () => void): () => void {
  initializeColorScheme()
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function applyColorScheme(scheme: ColorScheme) {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.colorScheme = scheme
  }
}

function receiveScheme(value: unknown) {
  if (value !== 'beige' && value !== 'bright' && value !== 'dark') return
  if (value === currentScheme) return
  currentScheme = value
  applyColorScheme(value)
  listeners.forEach((listener) => listener())
}

function onStorage(event: StorageEvent) {
  if (event.key !== COLOR_SCHEME_STORAGE_KEY) return
  receiveScheme(event.newValue)
}

function onBroadcastMessage(event: MessageEvent<unknown>) {
  receiveScheme(event.data)
}
