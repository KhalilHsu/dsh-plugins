/**
 * Turn-fold preference store (UI-only): whether per-turn folding is active.
 * Module-level state with a tiny subscriber set, so ChatView can read it via
 * useSyncExternalStore and the header toggle can flip it from anywhere.
 */

const STORAGE_KEY = 'dsh.cotFold'

let enabled = true
try {
  enabled = (localStorage.getItem(STORAGE_KEY) ?? 'on') === 'on'
} catch {
  // localStorage unavailable (SSR/private mode): keep the default.
}

const listeners = new Set<() => void>()

/** Current fold preference. */
export function isFoldEnabled(): boolean {
  return enabled
}

/** Set and persist the fold preference, notifying subscribers. */
export function setFoldEnabled(value: boolean): void {
  if (enabled === value) return
  enabled = value
  try {
    localStorage.setItem(STORAGE_KEY, value ? 'on' : 'off')
  } catch {
    // non-fatal: the in-memory preference still applies for this page.
  }
  for (const fn of listeners) fn()
}

/** Subscribe to fold-preference changes; returns the disposer. */
export function subscribeFold(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}
