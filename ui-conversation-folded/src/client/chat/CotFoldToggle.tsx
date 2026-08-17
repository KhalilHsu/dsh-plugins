/**
 * CotFoldToggle — session-header switch for the turn-fold feature (UI-only).
 * Reads and writes the fold preference through the module-level store, so the
 * chat view re-renders its grouping live.
 */

import { useSyncExternalStore } from 'react'
import { isFoldEnabled, setFoldEnabled, subscribeFold } from './fold-store.ts'
import css from './ChatView.module.css'

/** Minimal composed props: the conversation locale seat. */
export interface CotFoldToggleProps {
  t: (key: string, params?: Record<string, string>) => string
}

export function CotFoldToggle({ t }: CotFoldToggleProps) {
  const enabled = useSyncExternalStore(subscribeFold, isFoldEnabled)
  return (
    <button
      type="button"
      className={css.cotFoldToggle}
      data-cot-fold-state={enabled ? 'on' : 'off'}
      aria-label={t('turnFold.ariaToggle')}
      title={t(enabled ? 'turnFold.toggleOn' : 'turnFold.toggleOff')}
      onClick={() => setFoldEnabled(!enabled)}
    >
      {t(enabled ? 'turnFold.toggleOn' : 'turnFold.toggleOff')}
    </button>
  )
}
