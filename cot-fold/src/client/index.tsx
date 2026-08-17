/**
 * dsh-client-ui-cot-fold — browser half. UI-only plugin.
 *
 * The assistant's reasoning (chain of thought) renders in the chat as a
 * "Think" disclosure row. Expanding a long CoT currently paints an unbounded
 * wall of text. This plugin, without touching any capability:
 *
 *  1. caps the expanded reasoning body at a max height with an internal
 *     scroll (the "最大高度" ask),
 *  2. adds an explicit "收起" chip on bodies long enough to scroll, which
 *     collapses the whole Think row back to its summary (the "支持收起" ask),
 *  3. exposes a per-session header toggle to switch the fold on/off
 *     (persisted in localStorage; default on).
 *
 * Nothing here mutates session data, tool behavior, or the model route — it
 * only injects a stylesheet and a DOM enhancement keyed on the stable
 * `data-variant="think"` disclosure structure.
 */

import { useEffect, useState } from 'react'
// Type-only: pulls the ui-conversation SlotMap merge (header actions).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: slot prop vocabulary (erased at build).
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: the browser plugin context (erased at build).
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'

const PACKAGE_ID = '@deepseek-ai/dsh-client-ui-cot-fold'
const STORAGE_KEY = 'dsh.cotFold'
const FOLD_ATTR = 'data-cot-fold'
const CHIP_CLASS = 'cot-fold-chip'
const TOGGLE_CLASS = 'cot-fold-toggle'

/** Default cap height for an expanded reasoning body, in px. */
const DEFAULT_MAX_HEIGHT = 288

/* ── injected stylesheet (self-owned class names; no CSS modules needed) ── */

const stylesheet = `
/* Cap the expanded Think body: max height + internal scroll. */
html[${FOLD_ATTR}="on"] [data-variant="think"] {
  position: relative;
}
html[${FOLD_ATTR}="on"] [data-variant="think"] > [data-open="true"] > div:not([data-disclosure-row]) {
  max-height: var(--cot-fold-max-height, ${DEFAULT_MAX_HEIGHT}px);
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
}
html[${FOLD_ATTR}="on"] [data-variant="think"] > [data-open="true"] > div:not([data-disclosure-row])::-webkit-scrollbar {
  width: 6px;
}
html[${FOLD_ATTR}="on"] [data-variant="think"] > [data-open="true"] > div:not([data-disclosure-row])::-webkit-scrollbar-thumb {
  background: var(--dsw-alias-line-strong, rgba(128,128,128,.35));
  border-radius: 3px;
}

/* The explicit collapse chip shown on scrollable bodies. */
.${CHIP_CLASS} {
  position: absolute;
  right: 10px;
  bottom: 6px;
  z-index: 2;
  padding: 2px 10px;
  font-size: 12px;
  line-height: 20px;
  border-radius: 999px;
  cursor: pointer;
  border: 1px solid var(--dsw-alias-line-strong, rgba(128,128,128,.4));
  background: color-mix(in srgb, var(--dsw-alias-bg-base, #fff) 88%, transparent);
  color: var(--dsw-alias-label-secondary, inherit);
  box-shadow: 0 1px 4px rgba(0, 0, 0, .18);
  opacity: .92;
  transition: opacity .12s ease;
}
.${CHIP_CLASS}:hover {
  opacity: 1;
}

/* The session-header toggle button. */
.${TOGGLE_CLASS} {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  font-size: 12px;
  line-height: 20px;
  border-radius: 6px;
  cursor: pointer;
  border: 1px solid var(--dsw-alias-line-strong, rgba(128,128,128,.35));
  background: transparent;
  color: var(--dsw-alias-label-secondary, inherit);
}
.${TOGGLE_CLASS}[data-cot-fold-state="on"] {
  border-color: var(--dsw-alias-primary-default, currentColor);
  color: var(--dsw-alias-primary-default, inherit);
}
`

/* ── locale dictionaries ── */

const zh = {
  toggleOn: '思考折叠',
  toggleOff: '思考展开',
  ariaToggle: '切换思考过程折叠显示',
  chipCollapse: '收起',
}

const en = {
  toggleOn: 'Thinking: folded',
  toggleOff: 'Thinking: shown',
  ariaToggle: 'Toggle chain-of-thought folding',
  chipCollapse: 'Collapse',
}

type Locale = typeof zh

/* ── collapse-chip DOM enhancement ── */

/**
 * For every Think disclosure row, decide whether its body overflows the cap
 * and, if so, keep a floating "收起" chip that collapses the row (clicks the
 * disclosure row element, which drives the row's own React state).
 */
function installFoldBehavior(): () => void {
  const root = document.documentElement
  const bodyObserver = new MutationObserver(refreshAll)
  const chipText = (): string => {
    const dict: Locale = (navigator.language ?? '').toLowerCase().startsWith('zh') ? zh : en
    return dict.chipCollapse
  }

  const refresh = (thinkRoot: HTMLElement): void => {
    if (root.getAttribute(FOLD_ATTR) !== 'on') {
      thinkRoot.querySelector(`.${CHIP_CLASS}`)?.remove()
      return
    }
    const row = thinkRoot.querySelector('[data-disclosure-row]')
    const body = thinkRoot.querySelector(':scope > [data-open="true"] > div:not([data-disclosure-row])')
    if (!(row instanceof HTMLElement) || !(body instanceof HTMLElement)) return
    const scrollable = body.scrollHeight > body.clientHeight + 1
    const existing = thinkRoot.querySelector(`.${CHIP_CLASS}`)
    if (!scrollable) {
      existing?.remove()
      return
    }
    if (existing !== null) return
    const chip = document.createElement('button')
    chip.type = 'button'
    chip.className = CHIP_CLASS
    chip.textContent = chipText()
    chip.setAttribute('aria-label', chipText())
    chip.addEventListener('click', (event) => {
      event.stopPropagation()
      // Collapse the whole Think row through its own disclosure toggle.
      row.click()
    })
    thinkRoot.appendChild(chip)
  }

  function refreshAll(): void {
    const roots = document.querySelectorAll('[data-variant="think"]')
    for (const el of roots) {
      if (el instanceof HTMLElement) refresh(el)
    }
  }

  bodyObserver.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  })
  // Streaming reasoning grows the body without re-mounting the row; keep the
  // chip decision current while a body is open.
  const resizeObservers = new Set<ResizeObserver>()
  const ensureResize = (body: HTMLElement, row: HTMLElement): void => {
    const existing = resizeObservers
    for (const ro of existing) ro.disconnect()
    existing.clear()
    const ro = new ResizeObserver(() => refresh(row))
    ro.observe(body)
    existing.add(ro)
  }
  const resizeTicker = window.setInterval(() => {
    const open = document.querySelectorAll('[data-variant="think"] > [data-open="true"] > div:not([data-disclosure-row])')
    for (const el of open) {
      if (!(el instanceof HTMLElement)) continue
      const row = el.closest('[data-variant="think"]')
      if (row instanceof HTMLElement) {
        ensureResize(el, row)
        refresh(row)
      }
    }
  }, 800)

  refreshAll()
  return () => {
    bodyObserver.disconnect()
    window.clearInterval(resizeTicker)
    for (const ro of resizeObservers) ro.disconnect()
    resizeObservers.clear()
  }
}

/* ── header toggle component ── */

/** Minimal composed props: runtime kit (unused) + the registered locale seat. */
interface CotFoldToggleProps {
  t: (key: keyof Locale) => string
}

function CotFoldToggle({ t }: CotFoldToggleProps) {
  const [on, setOn] = useState<boolean>(() => (localStorage.getItem(STORAGE_KEY) ?? 'on') === 'on')

  useEffect(() => {
    document.documentElement.setAttribute(FOLD_ATTR, on ? 'on' : 'off')
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off')
  }, [on])

  return (
    <button
      type="button"
      className={TOGGLE_CLASS}
      data-cot-fold-state={on ? 'on' : 'off'}
      aria-label={t('ariaToggle')}
      title={t(on ? 'toggleOn' : 'toggleOff')}
      onClick={() => setOn(value => !value)}
    >
      {t(on ? 'toggleOn' : 'toggleOff')}
    </button>
  )
}

/* ── plugin entry ── */

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale']

/**
 * Mount the fold UI. The header toggle lives in the conversation scope, where
 * session-scoped slots are dispatched.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  // Apply the persisted preference before anything renders, so the cap is
  // active from the first paint.
  const initial = (localStorage.getItem(STORAGE_KEY) ?? 'on') === 'on'
  document.documentElement.setAttribute(FOLD_ATTR, initial ? 'on' : 'off')

  // One stylesheet for the whole app.
  const style = document.createElement('style')
  style.dataset.plugin = PACKAGE_ID
  style.textContent = stylesheet
  document.head.appendChild(style)

  ctx.effect(() => ctx.locale.register('cotFold', { zh, en }), 'cot-fold: locale dictionaries')
  ctx.effect(() => installFoldBehavior(), 'cot-fold: think-body fold behavior')

  ctx.inject(['slots', 'conversation'], (scope: ClientContext) => {
    scope.effect(() => {
      const stop = scope.slots.register({
        name: 'conversation.session.header.actions',
        id: 'cot-fold',
        order: 10,
        locale: 'cotFold',
      }, CotFoldToggle as never)
      return stop
    }, 'cot-fold: session header toggle')
  })
}
