/**
 * TurnFold — wraps one round's assistant activity (CoT + tool calls) in a
 * bounded scroller with a clickable header row. UI-only.
 *
 * Header row: "耗时 XX · N 个工具调用 · M 次思考" + a chevron, separated from
 * the body by a full-width divider. The whole row is the expand/collapse
 * affordance (hover color change, Enter/Space).
 *
 * Height policy (per phase):
 *  - while the turn is generating: expanded by default, capped at
 *    `--cot-fold-max-height` (288px) with an internal scroller, a bottom
 *    fade telling the reader more is coming, and auto-scroll to the newest
 *    content (paused when the reader scrolls up);
 *  - when the turn's closing message starts streaming outside (final stage),
 *    the fold collapses by itself after a short grace period, leaving the
 *    summary row + the outer result text in focus;
 *  - once the turn is done: collapsed by default, and expanding shows the
 *    FULL content (no height cap) — nothing new will arrive.
 *
 * All child interactions (per-tool expand/collapse, details, inspect) are
 * untouched: children render as ordinary ChatNodeSeats inside the scroller.
 */

import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import type { AssistantBlock } from '@deepseek-ai/dsh-client-runtime/client'
import { IconChevronRightOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ChatViewSlotProps } from '../contract/slots.ts'
import { formatRunDuration } from './message-chrome.ts'
import css from './ChatView.module.css'

export interface TurnFoldProps {
  /** Stable identity of this turn (first node key inside the fold). */
  turnKey: string
  /** Whether the turn is still generating (drives height cap / fade / auto-scroll). */
  running: boolean
  /** Tool-call count for the summary row. */
  toolCount: number
  /** Reasoning (Think) block count for the summary row. */
  thinkCount: number
  /** Turn start time (ms epoch); drives the live elapsed while running. */
  startTime?: number | undefined
  /** Completed turn elapsed (ms); shown instead of a live clock once done. */
  runMs?: number | undefined
  /** Whether the closing message is streaming outside the fold (final stage). */
  finalStreaming: boolean
  /** The chat view's locale seat. */
  t: ChatViewSlotProps['t']
  /** The turn's foldable content. */
  children: ReactNode
}

/** One turn's foldable assistant-side items. */
export interface TurnUnit {
  /** Stable key for the fold instance (first assistant-side node key). */
  key: string
  /** Node keys rendered inside the fold. */
  foldKeys: string[]
  /** Whether any assistant step in the unit is still running. */
  running: boolean
  /** Count of tool-call nodes in the unit. */
  toolCount: number
  /** Count of Think (reasoning) rows inside the unit's assistant steps. */
  thinkCount: number
  /** Turn start time (ms epoch) for the live elapsed clock. */
  startTime?: number | undefined
  /** Completed turn elapsed (ms). */
  runMs?: number | undefined
  /**
   * The turn's final assistant message, split at block level: its reasoning
   * blocks render INSIDE the fold (they are process, not result), while the
   * text blocks render outside as the summary. Absent when the turn has no
   * closing message.
   */
  summaryThinking?: {
    /** The closing message's reasoning blocks. */
    blocks: readonly AssistantBlock[]
    /** Whether the closing message is still streaming. */
    streaming: boolean
  }
  /** The closing message's result blocks (text / images), rendered outside. */
  summaryText?: {
    blocks: readonly AssistantBlock[]
    streaming: boolean
  }
}

/** Grace period before an auto-collapse triggered by the final message. */
const FINAL_COLLAPSE_GRACE_MS = 1500

export function TurnFold({
  turnKey, running, toolCount, thinkCount, startTime, runMs, finalStreaming, t, children,
}: TurnFoldProps) {
  // Historical / completed turns start collapsed; a fresh generating turn
  // starts expanded so the user watches the process.
  const [collapsed, setCollapsed] = useState<boolean>(() => !running)
  const [now, setNow] = useState<number>(() => Date.now())
  const prevFinalRef = useRef<boolean>(false)
  const finalStartRef = useRef<number | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const pinnedRef = useRef(true)

  // Phase-driven collapse: (1) when the closing message has been streaming
  // outside for the grace period the fold collapses by itself; (2) when the
  // turn completes, collapse unless the user already expanded it (the effect
  // only fires on the running→false transition, so a manual expand afterwards
  // persists). Never auto re-expand: no flicker while narrations and tools
  // alternate.
  useEffect(() => {
    if (finalStreaming) {
      if (!prevFinalRef.current) finalStartRef.current = Date.now()
      if (finalStartRef.current !== null && Date.now() - finalStartRef.current >= FINAL_COLLAPSE_GRACE_MS) {
        setCollapsed(true)
      }
    } else {
      finalStartRef.current = null
    }
    prevFinalRef.current = finalStreaming
    if (!running) setCollapsed(true)
  }, [finalStreaming, running])

  // Live elapsed while the turn runs; freezes on completion (runMs wins).
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => { window.clearInterval(id) }
  }, [running])

  const elapsedMs = runMs ?? (running && startTime !== undefined ? now - startTime : undefined)
  const durationLabel = elapsedMs === undefined ? undefined : formatRunDuration(elapsedMs, t)
  const info = [
    durationLabel === undefined ? undefined : t('turnFold.duration', { duration: durationLabel }),
    t('turnFold.tools', { tools: String(toolCount) }),
    t('turnFold.thinks', { thinks: String(thinkCount) }),
  ].filter((part): part is string => part !== undefined).join(' · ')

  const expanded = !collapsed
  const toggle = (): void => setCollapsed(value => !value)
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    toggle()
  }

  // While the turn is running and the reader is pinned to the bottom, follow
  // the newest content (streaming tokens, new tool rows). A ResizeObserver
  // catches every height change, including in-place tool disclosures; it also
  // tracks whether the frame overflows (drives the top fade).
  const [scrollable, setScrollable] = useState<boolean>(false)
  useEffect(() => {
    const el = scrollRef.current
    if (el === null || collapsed || !running || typeof ResizeObserver === 'undefined') return
    const follow = (): void => {
      if (pinnedRef.current) el.scrollTop = el.scrollHeight
      setScrollable(el.scrollHeight > el.clientHeight + 1)
    }
    const observer = new ResizeObserver(follow)
    observer.observe(el)
    follow()
    return () => { observer.disconnect() }
  }, [running, collapsed, turnKey])

  const onScroll = (): void => {
    const el = scrollRef.current
    if (el === null) return
    pinnedRef.current = el.scrollTop >= el.scrollHeight - el.clientHeight - 8
    setScrollable(el.scrollHeight > el.clientHeight + 1)
  }

  return (
    <div className={css.turnFold} data-turn-key={turnKey} data-turn-running={running || undefined} data-turn-collapsed={collapsed || undefined}>
      <div
        className={css.turnFoldBar}
        data-turn-fold-state={expanded ? 'expanded' : 'collapsed'}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={t('turnFold.ariaToggle')}
        onClick={toggle}
        onKeyDown={onKeyDown}
      >
        <span className={css.turnFoldInfo}>{info}</span>
        <IconChevronRightOutline14 className={css.turnFoldChevron} />
      </div>
      <div className={css.turnFoldDivider} aria-hidden />
      {expanded && (
        <div className={css.turnFoldScrollWrap}>
          <div ref={scrollRef} className={css.turnFoldScroll} data-turn-scroll onScroll={onScroll}>
            {children}
          </div>
          {running && scrollable && <div className={css.turnFoldFade} aria-hidden />}
          {running && scrollable && <div className={css.turnFoldFadeTop} aria-hidden />}
        </div>
      )}
    </div>
  )
}
