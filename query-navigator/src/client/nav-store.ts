/**
 * Query-navigator preference store: whether the right-side query nav rail is active.
 * Module-level state with localStorage persistence and subscriber notifications.
 */

const STORAGE_KEY = 'dsh.queryNav'

let enabled = true
try {
  enabled = (localStorage.getItem(STORAGE_KEY) ?? 'on') === 'on'
} catch {
  // localStorage unavailable (SSR/private mode): keep the default.
}

const listeners = new Set<() => void>()

/** Current navigation rail preference. */
export function isNavEnabled(): boolean {
  return enabled
}

/** Set and persist the navigation rail preference, notifying subscribers. */
export function setNavEnabled(value: boolean): void {
  if (enabled === value) return
  enabled = value
  try {
    localStorage.setItem(STORAGE_KEY, value ? 'on' : 'off')
  } catch {
    // non-fatal: the in-memory preference still applies for this page.
  }
  for (const fn of listeners) fn()
}

/** Subscribe to navigation rail preference changes; returns the disposer. */
export function subscribeNav(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}
