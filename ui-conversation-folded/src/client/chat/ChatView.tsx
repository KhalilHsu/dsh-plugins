// ChatView: the default conversation view — one stable keyed parent list over
// final business Nodes, plus paging, pending steering and bottom-follow.
// Each row dispatches through 'conversation.chat.node'; ui-tool owns the
// tool-call renderer and its recursive root/subcall composition.
//
// Scroll: when nested under `[data-conversation-scroll]` (active conversation
// column), that host is the scrollport and this view is flow content; when
// mounted alone (unit tests), `.scroll` owns overflow. Bottom-follow and
// prepend anchoring always target the resolved scrollport.
//
// Render economics: order changes only when rows enter, leave or move. Each
// ChatNodeSeat subscribes to one Node key, so Assistant deltas and Tool
// lifecycle updates replace only their own row without remounting it.

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { ConversationTimelineSnapshot, ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client'
import type { AssistantBlock } from '@deepseek-ai/dsh-client-runtime/client'
import { IconChevronDownOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ChatViewSlotProps } from '../contract/slots.ts'
import type { AssistantChatData, ToolChatData, TurnTailChatData } from '../contract/chat-nodes.ts'
import { PendingSteeringBubble } from './MessageItem.tsx'
import { ChatNodeSeat } from './ChatNodeSeat.tsx'
import { AssistantMarkdown } from './AssistantMarkdown.tsx'
import { formatRunDuration } from './message-chrome.ts'
import { TurnFold, type TurnUnit } from './TurnFold.tsx'
import { isFoldEnabled, subscribeFold } from './fold-store.ts'
import css from './ChatView.module.css'

const FOLLOW_THRESHOLD = 24

/** Kinds that belong inside a turn's fold (the round's assistant activity).
 *  The turn-tail stays OUTSIDE: it carries copy / like-dislike / timing and
 *  must never be hidden by the fold. */
const FOLD_KINDS = new Set(['assistant-step', 'tool-call'])

/** Ask-user-question rows stay OUTSIDE the fold, like the turn-tail: while a
 *  question is pending the "提问·等待回答" row must stay visible (a collapsed
 *  fold would unmount it), and the answered row is an interaction, not
 *  process. They therefore flush the fold as boundaries. */
function isAskQuestionRoot(root: ToolCallBlock | undefined): boolean {
  if (root === undefined) return false
  return 'kind' in root ? root.call?.name === 'ask_user_question' : root.name === 'ask_user_question'
}

/** Boundary timestamp for a flush: turn-tail / steering / user carry
 *  `data.time`; tool-call boundaries (ask rows) carry it on the root block. */
function boundaryTimeOf(boundaryNode: { kind: string; data: unknown } | undefined): number | undefined {
  if (boundaryNode === undefined) return undefined
  if (boundaryNode.kind === 'tool-call') return (boundaryNode.data as ToolChatData).root?.time
  return (boundaryNode.data as { time?: number } | undefined)?.time
}

/** One ordered render slot: a plain row, a foldable turn unit, or the turn's
 *  closing summary (text blocks only; its reasoning lives in the fold). */
type RenderSlot =
  | { type: 'plain'; key: string }
  | { type: 'fold'; unit: TurnUnit }
  | {
    type: 'summary'
    key: string
    /** The closing message's non-reasoning blocks (the result text). */
    blocks: readonly AssistantBlock[]
    /** Whether the closing message is still streaming. */
    streaming: boolean
  }

/** Active column host when present; otherwise the view-local scroller. */
function scrollerOf(from: HTMLElement): HTMLElement {
  return (from.closest('[data-conversation-scroll]')) ?? from
}

interface PagingAnchor {
  /** Stable node/call identity, independent of boundary-spanning group keys. */
  key: string
  /** Row top relative to the scrollport after the latest user scroll. */
  top: number
}

/** Find an already-rendered settled row without interpolating a selector. */
function anchorElement(list: HTMLElement, key: string): HTMLElement | null {
  for (const row of list.querySelectorAll<HTMLElement>('[data-chat-anchor-key]')) {
    if (row.dataset.chatAnchorKey === key) return row
  }
  return null
}

/** Row position in scrollport coordinates (viewport-independent). */
function flowTop(row: HTMLElement, scrollport: HTMLElement): number {
  return row.getBoundingClientRect().top - scrollport.getBoundingClientRect().top
}

/** Select a visible stable node/call identity, falling back only when layout
 * has not exposed a visible box yet. */
function pagingAnchor(list: HTMLElement, scrollport: HTMLElement): HTMLElement | null {
  const viewport = scrollport.getBoundingClientRect()
  const composer = scrollport.querySelector<HTMLElement>('[data-composer-seat]')
  const visibleBottom = composer?.getBoundingClientRect().top ?? viewport.bottom
  // Scroll events are hot: hit-test a few points through the stretched flow
  // rows before considering the full mounted set. The fallback keeps jsdom
  // and pre-layout states deterministic; a virtualizer naturally bounds it.
  if (typeof document.elementsFromPoint === 'function' && visibleBottom > viewport.top) {
    const content = list.getBoundingClientRect()
    const left = Math.max(viewport.left, content.left)
    const right = Math.min(viewport.right, content.right)
    const x = left + Math.max(0, right - left) / 2
    const height = visibleBottom - viewport.top
    const points = [1, Math.min(32, height / 3), height / 2, Math.max(1, height - 1)]
    for (const offset of points) {
      for (const element of document.elementsFromPoint(x, viewport.top + offset)) {
        const row = element instanceof HTMLElement
          ? element.closest<HTMLElement>('[data-chat-anchor-key]')
          : null
        if (row !== null && list.contains(row)) return row
      }
    }
  }
  const rows = [...list.querySelectorAll<HTMLElement>('[data-chat-anchor-key]')]
  const visibleRows = rows.filter((row) => {
    const rect = row.getBoundingClientRect()
    return rect.bottom > viewport.top && rect.top < visibleBottom
  })
  return visibleRows[0] ?? rows[0] ?? null
}

type ChatScrollPosition = NonNullable<ReturnType<ChatViewSlotProps['chatScroll']['read']>>

/** Capture a reflow-resistant reader position from the current rendered window. */
function scrollPosition(list: HTMLElement, scrollport: HTMLElement): ChatScrollPosition | null {
  const row = pagingAnchor(list, scrollport)
  const anchorKey = row?.dataset.chatAnchorKey
  if (row === null || anchorKey === undefined) return null
  return {
    anchorKey,
    anchorTop: flowTop(row, scrollport),
    scrollTop: scrollport.scrollTop,
  }
}

function runningTurnStartTime(timeline: ConversationTimelineSnapshot): number | null {
  let latest: number | null = null
  for (const turn of timeline.turns.values()) {
    if (turn.status === 'open' && turn.start !== undefined) latest = turn.start.time
  }
  return latest
}

/** Turn-level model activity label retained across first-token, tool, and streaming phases. */
function TurnStatus({ startTime, t }: {
  /** The running turn's logged `turn/start` time; null falls back to mount
   *  time when that boundary is outside the window. */
  startTime: number | null
  /** The owning view's locale seat. */
  t: ChatViewSlotProps['t']
}) {
  const [mountedAt] = useState(() => Date.now())
  // Anchored to turn/start so a mid-turn reload keeps the real
  // elapsed time and the final footer's Ran-for label matches this clock.
  const anchor = startTime ?? mountedAt
  const [elapsedMs, setElapsedMs] = useState(() => Math.max(0, Date.now() - anchor))
  useEffect(() => {
    const tick = (): void => {
      setElapsedMs(Math.max(0, Date.now() - anchor))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => { clearInterval(id) }
  }, [anchor])
  // Short turns keep the plain label; the clock only appears once the turn
  // has clearly been running for a while.
  const showClock = elapsedMs >= 15_000
  return (
    <div className={css.turnStatus} role="status" aria-live="polite">
      Deep diving...
      {showClock && (
        <span className={css.turnStatusClock} aria-hidden>
          {formatRunDuration(elapsedMs, t)}
        </span>
      )}
    </div>
  )
}

/**
 * The chat view slot entry: pure component over the composed props; each
 * ordered business Node crosses the keyed renderer seat.
 */
export function ChatView({
  useSession, useSessions, useStore, renderSlot, sessionId, openFile, loadOlder, loadImage, inspectCall, chatScroll, forkAt,
  fileMentions, t,
}: ChatViewSlotProps) {
  const order = useSession(s => s.chat.order)
  const nodeStore = useSession(s => s.chat.nodes)
  const timeline = useSession(s => s.chat.timeline)
  const inbox = useSession(s => s.queue)
  // Workspace root off the session list row: path summaries display relative to it.
  const cwd = useSessions(s => s.byId[sessionId]?.cwd)
  const running = useSession(s => s.running)
  const openState = useSession(s => s.openState)
  const openError = useSession(s => s.openError)
  const hasMore = useSession(s => s.hasMore)
  const loadingOlder = useSession(s => s.loadingOlder)
  const selectedCallId = useStore(s => s.selection?.callId)

  const pendingSteering = useMemo(
    () => inbox.filter(item => item.placement === 'steering'),
    [inbox],
  )

  // UI-only turn folding: the fold preference drives grouping, and the unit
  // segmentation mirrors the flow order so plain rows and fold units keep
  // their exact DOM positions (user message → fold → summary → user message …).
  //
  // The turn's FINAL assistant output (the closing summary) is pulled OUT of
  // the fold and rendered as its own plain row after the container, so only
  // the intermediate attempts (Think rows, tool calls, in-between narration,
  // the turn tail) stay bounded by the 288px scroller. A step qualifies as
  // the summary when it is the last assistant-step of the turn with no
  // tool-call after it; a pure-text turn then renders fully unfolded.
  const foldEnabled = useSyncExternalStore(subscribeFold, isFoldEnabled)
  const slots = useMemo<RenderSlot[]>(() => {
    const slots: RenderSlot[] = []
    let pending: TurnUnit | null = null
    // Time of the last flush boundary (steering / user / turn-tail); the next
    // fold's portion of the turn starts here, so steering-split folds show
    // their own durations instead of the whole turn's.
    let lastBoundaryTime: number | undefined
    const flush = (boundaryNode: { kind: string; data: unknown } | undefined): void => {
      if (pending === null) return
      // Authoritative closing: the turn-tail node carries the turn's LAST
      // content-bearing assistant message (same findLast(hasText) the tail
      // renderer uses). Match it back to the assistant-step node by turn+step.
      let summaryKey: string | undefined
      const closing = boundaryNode?.kind === 'turn-tail'
        ? (boundaryNode.data as TurnTailChatData).closing
        : undefined
      if (closing !== null && closing !== undefined) {
        for (const key of pending.foldKeys) {
          const node = nodeStore.get(key)
          if (node?.kind !== 'assistant-step') continue
          const data = node.data as AssistantChatData
          if (data.turn === closing.turn && data.step === closing.step) {
            summaryKey = key
            break
          }
        }
      }
      // A settled turn trusts ONLY the authoritative closing: when its summary
      // is paged out of the visible window the match above finds nothing, and
      // extracting the last visible step would wrongly surface mid-turn
      // narration. The heuristic applies only to the RUNNING turn (session
      // generating, no tail yet): its streaming summary is the last
      // assistant-step with no tool-call after it.
      if (summaryKey === undefined && boundaryNode === undefined && running) {
        let finalIdx = -1
        for (let i = pending.foldKeys.length - 1; i >= 0; i--) {
          if (nodeStore.get(pending.foldKeys[i])?.kind === 'assistant-step') {
            finalIdx = i
            break
          }
        }
        if (finalIdx >= 0) {
          let toolAfter = false
          for (let i = finalIdx + 1; i < pending.foldKeys.length; i++) {
            if (nodeStore.get(pending.foldKeys[i])?.kind === 'tool-call') {
              toolAfter = true
              break
            }
          }
          if (!toolAfter) summaryKey = pending.foldKeys[finalIdx]
        }
      }
      // Turn timing for the fold's summary row: live elapsed while running,
      // fixed elapsed once done. A fold split by a steering/user boundary
      // measures its OWN portion [fold start → boundary]; otherwise the
      // timeline's turn facts win, with node times as fallback.
      {
        let turnNum: number | undefined
        for (const key of pending.foldKeys) {
          const n = nodeStore.get(key)
          if (n?.kind === 'assistant-step') {
            turnNum = (n.data as AssistantChatData).turn
            break
          }
        }
        const turnMeta = turnNum === undefined ? undefined : timeline.turns.get(turnNum)
        const firstNode = pending.foldKeys[0] === undefined ? undefined : nodeStore.get(pending.foldKeys[0])
        const firstNodeTime = firstNode?.kind === 'assistant-step'
          ? (firstNode.data as AssistantChatData).time
          : undefined
        const startTime = pending.startTime ?? turnMeta?.start?.time ?? firstNodeTime
        pending.startTime = startTime
        const boundaryTime = boundaryTimeOf(boundaryNode)
        if (startTime !== undefined && boundaryTime !== undefined) {
          pending.runMs = Math.max(0, boundaryTime - startTime)
        } else if (turnMeta?.start !== undefined && turnMeta.end !== undefined) {
          pending.runMs = Math.max(0, turnMeta.end.time - turnMeta.start.time)
        }
      }
      if (summaryKey !== undefined) {
        // Split the closing message at block level: its reasoning stays in
        // the fold (process), its text renders outside as the summary
        // (result). The thinking still counts toward the fold's Think rows.
        const summaryNode = nodeStore.get(summaryKey)
        if (summaryNode?.kind === 'assistant-step') {
          const data = summaryNode.data as AssistantChatData
          const reasoning = data.blocks.filter(block => block.kind === 'reasoning')
          const text = data.blocks.filter(block => block.kind !== 'reasoning')
          if (reasoning.length > 0) {
            pending.summaryThinking = {
              blocks: reasoning,
              streaming: data.status === 'running',
            }
          }
          pending.summaryText = {
            blocks: text,
            streaming: data.status === 'running',
          }
        }
        pending.foldKeys = pending.foldKeys.filter(key => key !== summaryKey)
      }
      // Nothing left to fold (pure-text turn): render the residue as plain
      // rows instead of an empty container. A closing message that carries
      // reasoning still gets a fold (to host that thinking).
      const hasFoldContent = pending.foldKeys.some(key => {
        const kind = nodeStore.get(key)?.kind
        return kind === 'assistant-step' || kind === 'tool-call'
      }) || pending.summaryThinking !== undefined
      if (hasFoldContent) {
        slots.push({ type: 'fold', unit: pending })
      } else {
        for (const key of pending.foldKeys) slots.push({ type: 'plain', key })
      }
      if (pending.summaryText !== undefined) {
        slots.push({
          type: 'summary',
          key: summaryKey as string,
          blocks: pending.summaryText.blocks,
          streaming: pending.summaryText.streaming,
        })
      }
      pending = null
    }
    for (const nodeKey of order) {
      const node = nodeStore.get(nodeKey)
      const kind = node?.kind
      // Ask-user-question rows are boundaries (like the turn-tail): they flush
      // the fold and render as plain rows, so a pending question is never
      // buried (or unmounted) inside a collapsed fold.
      const isAskRow = kind === 'tool-call'
        && isAskQuestionRoot((node.data as ToolChatData).root)
      if (!isAskRow && kind !== undefined && FOLD_KINDS.has(kind)) {
        if (pending === null) {
          pending = {
            key: nodeKey, foldKeys: [], running: false, toolCount: 0, thinkCount: 0,
            // A fold split by an earlier steering/user/ask boundary starts its
            // own portion of the turn there.
            ...lastBoundaryTime === undefined ? {} : { startTime: lastBoundaryTime },
          }
        }
        pending.foldKeys.push(nodeKey)
        if (kind === 'tool-call') pending.toolCount += 1
        if (kind === 'assistant-step') {
          const data = nodeStore.get(nodeKey)?.data as AssistantChatData | undefined
          if (data !== undefined) {
            for (const block of data.blocks) {
              if (block.kind === 'reasoning') pending.thinkCount += 1
            }
          }
        }
      } else {
        // Every boundary (turn-tail, steering, user, ask row) flushes the
        // fold — it stays OUTSIDE the fold (turn-tail carries copy /
        // like-dislike / timing; steering/user are the reader's own words; an
        // ask row must stay visible while the question is pending). The
        // boundary node is passed so the fold can measure its own portion.
        const boundaryNode = nodeStore.get(nodeKey)
        flush(boundaryNode)
        lastBoundaryTime = boundaryTimeOf(boundaryNode)
        slots.push({ type: 'plain', key: nodeKey })
      }
    }
    flush(undefined)
    // The session-level running flag is the chat's own "generating" signal
    // (it drives the Deep diving indicator); the turn being generated is the
    // last fold unit, so that unit follows its own scroll while streaming.
    if (running) {
      for (let i = slots.length - 1; i >= 0; i--) {
        if (slots[i].type === 'fold') {
          slots[i].unit.running = true
          break
        }
      }
    }
    return slots
  }, [order, nodeStore, running, timeline])
  const runningTurnStart = useMemo(() => runningTurnStartTime(timeline), [timeline])

  const listRef = useRef<HTMLDivElement | null>(null)
  const columnRef = useRef<HTMLDivElement | null>(null)
  const atBottomRef = useRef(true)
  const [atBottom, setAtBottom] = useState(true)
  /** Last position delivered or written on the main thread. */
  const observedTopRef = useRef(0)
  /** Paging anchor: semantic row/position at click, updated by reader scrolls
   * while the request is pending and restored after the prepend lands. */
  const anchorRef = useRef<PagingAnchor | null>(null)
  const firstSeqRef = useRef<number | null>(null)
  const openedRef = useRef(false)
  const lastKeyRef = useRef<string | null>(null)
  const lastSteeringIdRef = useRef<string | null>(null)
  /** Flow tip signature — follow-scroll only when this moves, never on a
   *  scroll-driven at-bottom chrome re-render (which would snap inertial
   *  scrolls the rest of the way to the floor). */
  const followSigRef = useRef<string | null>(null)

  const firstKey = order[0]
  const firstSeq = firstKey === undefined ? null : nodeStore.get(firstKey)?.anchorSeq ?? null
  const lastKey = order.at(-1) ?? null
  const lastNode = lastKey === null ? undefined : nodeStore.get(lastKey)
  const lastSteeringId = pendingSteering[pendingSteering.length - 1]?.id ?? null
  const followSig = `${openState}:${firstSeq}:${lastKey}:${order.length}:${running ? 1 : 0}:${lastSteeringId ?? ''}`

  const toBottom = (el: HTMLElement): void => {
    anchorRef.current = null
    el.scrollTop = el.scrollHeight
    observedTopRef.current = el.scrollTop
    atBottomRef.current = true
    setAtBottom(true)
    chatScroll.save(null)
  }

  useLayoutEffect(() => {
    const local = listRef.current
    /* v8 ignore next -- ref-null guard: React attaches the ref before layout effects run. */
    if (local === null) return
    const el = scrollerOf(local)
    // Open completed: jump to the bottom once — unless a scroll position
    // survives from a previous mount (view-tab switch away and back), which
    // is restored instead of snapping the reader back to the floor.
    if (openState === 'open' && !openedRef.current) {
      openedRef.current = true
      const saved = chatScroll.read()
      if (saved === null) {
        toBottom(el)
      } else {
        el.scrollTop = saved.scrollTop
        const row = anchorElement(local, saved.anchorKey)
        if (row !== null) el.scrollTop += flowTop(row, el) - saved.anchorTop
        observedTopRef.current = el.scrollTop
        const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= FOLLOW_THRESHOLD + 1
        atBottomRef.current = isAtBottom
        setAtBottom(isAtBottom)
        const normalized = isAtBottom ? null : scrollPosition(local, el)
        if (isAtBottom) chatScroll.save(null)
        else if (normalized !== null) chatScroll.save(normalized)
      }
      firstSeqRef.current = firstSeq
      lastKeyRef.current = lastKey
      lastSteeringIdRef.current = lastSteeringId
      followSigRef.current = followSig
      return
    }
    // Prepend (head seq decreased): preserve the same settled row at the
    // position established by the reader's latest scroll. This excludes
    // unrelated tail/composer growth while the request was in flight.
    if (anchorRef.current !== null && firstSeq !== null && firstSeqRef.current !== null && firstSeq < firstSeqRef.current) {
      const anchor = anchorRef.current
      anchorRef.current = null
      const row = anchorElement(local, anchor.key)
      if (row !== null) el.scrollTop += flowTop(row, el) - anchor.top
      observedTopRef.current = el.scrollTop
      firstSeqRef.current = firstSeq
      /* v8 ignore next -- ?? arm: a prepend adds nodes, so the flow list here is never empty. */
      lastKeyRef.current = lastKey
      lastSteeringIdRef.current = lastSteeringId
      followSigRef.current = followSig
      return
    }
    firstSeqRef.current = firstSeq
    // Own words must be visible: a new trailing user node force-scrolls
    // (send lives in the composer, so arrival is detected here, not armed there).
    const appendedUser = lastKey !== lastKeyRef.current && lastNode?.kind === 'user'
    const appendedSteering = lastSteeringId !== null && lastSteeringId !== lastSteeringIdRef.current
    const tipMoved = followSigRef.current !== followSig
    lastKeyRef.current = lastKey
    lastSteeringIdRef.current = lastSteeringId
    followSigRef.current = followSig
    // Follow new flow content while pinned; do NOT re-pin on every render
    // merely because atBottomRef is true (scroll threshold → setState → snap).
    if (appendedUser || appendedSteering || (tipMoved && atBottomRef.current)) toBottom(el)
  })

  const onScrollRef = useRef(() => {})
  onScrollRef.current = () => {
    const local = listRef.current
    /* v8 ignore next -- ref-null guard: the handler only fires while mounted. */
    if (local === null) return
    const el = scrollerOf(local)
    // Only reader input may make raw scroll geometry change follow ownership:
    // a delivered position that deviates from the observed-top ledger (every
    // programmatic write records itself there synchronously). This covers
    // wheel, touch, scrollbar, and keyboard alike without naming devices.
    // Browser shrink-clamps land exactly on the floor min and delayed
    // programmatic deliveries land on the ledger itself, so both preserve
    // the current ownership state.
    const floor = Math.max(0, el.scrollHeight - el.clientHeight)
    const movedByReader = Math.abs(el.scrollTop - Math.min(observedTopRef.current, floor)) > 0.5
    const isAtBottom = movedByReader
      ? floor - el.scrollTop <= FOLLOW_THRESHOLD + 1
      : atBottomRef.current
    if (!movedByReader && isAtBottom) {
      toBottom(el)
      return
    }
    atBottomRef.current = isAtBottom
    setAtBottom(isAtBottom)
    const position = isAtBottom ? null : scrollPosition(local, el)
    if (isAtBottom) {
      anchorRef.current = null
    } else if (anchorRef.current !== null && position !== null) {
      anchorRef.current = { key: position.anchorKey, top: position.anchorTop }
    }
    // Continuous save (unmount happens after ref detach, so saving there is
    // too late); pinned-to-bottom clears so a remount keeps following.
    if (isAtBottom) chatScroll.save(null)
    else if (position !== null) chatScroll.save(position)
    observedTopRef.current = el.scrollTop
  }

  // Bind the scroll listener on the resolved scrollport once per mount;
  // reader-input attribution rides the observed-top ledger, not per-device
  // input listeners.
  useEffect(() => {
    const local = listRef.current
    /* v8 ignore next -- ref-null guard: effect runs after the list node commits. */
    if (local === null) return
    const el = scrollerOf(local)
    const onScroll = (): void => { onScrollRef.current() }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
    }
  }, [])

  // The ref starts null and is assigned every render, so the placeholder
  // initializer a function initial value would need never exists.
  const followRef = useRef<(() => void) | null>(null)
  followRef.current = () => {
    const local = listRef.current
    if (local !== null && atBottomRef.current) {
      const el = scrollerOf(local)
      el.scrollTop = el.scrollHeight
      observedTopRef.current = el.scrollTop
      chatScroll.save(null)
    }
  }
  // Streaming, tool disclosures, and other flow changes resize the column;
  // the sticky composer resizes outside it. This observer owns ChatView's
  // dynamic-height follow decisions and writes only while the reader is pinned.
  useEffect(() => {
    const column = columnRef.current
    const local = listRef.current
    if (column === null || local === null || typeof ResizeObserver === 'undefined') return
    const scrollport = scrollerOf(local)
    const composer = scrollport.querySelector<HTMLElement>('[data-composer-seat]')
    const observer = new ResizeObserver(() => { followRef.current?.() })
    observer.observe(column)
    if (composer !== null) observer.observe(composer)
    return () => { observer.disconnect() }
  }, [])

  // A failed/empty page leaves the head unchanged. Once the request leaves
  // its busy state there is no future prepend for the saved anchor to own.
  useEffect(() => {
    if (!loadingOlder) anchorRef.current = null
  }, [loadingOlder])

  const loadOlderAnchored = (): void => {
    const local = listRef.current
    /* v8 ignore next -- ref-null guard: the paging button renders inside the list tree. */
    if (local !== null) {
      const el = scrollerOf(local)
      const row = pagingAnchor(local, el)
      if (row !== null && row.dataset.chatAnchorKey !== undefined) {
        anchorRef.current = {
          key: row.dataset.chatAnchorKey,
          top: flowTop(row, el),
        }
      }
    }
    loadOlder()
  }

  return (
    <div className={css.root}>
      <div ref={listRef} className={css.scroll}>
        <div ref={columnRef} className={css.column} data-chat-flow="">
          {openState === 'loading' && <div className={css.hint}>{t('chat.loadingHistory')}</div>}
          {openState === 'error' && openError !== null && (
            <div className={css.openError}>
              {t('chat.loadError', { message: openError.message, code: openError.code })}
            </div>
          )}
          {hasMore && (
            <div className={css.older}>
              <button type="button" disabled={loadingOlder} onClick={loadOlderAnchored}>
                {loadingOlder ? t('loading') : t('chat.loadOlder')}
              </button>
            </div>
          )}
          {slots.map(slot => {
            if (slot.type === 'plain') {
              return (
                <ChatNodeSeat
                  key={slot.key}
                  nodeKey={slot.key}
                  useSession={useSession}
                  selectedCallId={selectedCallId}
                  cwd={cwd}
                  openFile={openFile}
                  inspectCall={inspectCall}
                  forkAt={forkAt}
                  loadImage={loadImage}
                  fileMentions={fileMentions}
                  renderSlot={renderSlot}
                  t={t}
                />
              )
            }
            if (slot.type === 'summary') {
              // Fold off: render the whole closing message through the
              // ordinary seat. Fold on: only the result blocks appear here,
              // framed as this node's row so scroll anchoring keeps working.
              // React key is namespaced: a pure-text turn's summary key equals
              // its fold's key, and sibling keys must stay unique.
              if (!foldEnabled) {
                return (
                  <ChatNodeSeat
                    key={'summary:' + slot.key}
                    nodeKey={slot.key}
                    useSession={useSession}
                    selectedCallId={selectedCallId}
                    cwd={cwd}
                    openFile={openFile}
                    inspectCall={inspectCall}
                    forkAt={forkAt}
                    loadImage={loadImage}
                    fileMentions={fileMentions}
                    renderSlot={renderSlot}
                    t={t}
                  />
                )
              }
              return (
                <div
                  key={'summary:' + slot.key}
                  className={css.flowItem}
                  data-chat-anchor-key={slot.key}
                  data-chat-flow-key={slot.key}
                  data-chat-flow-kind="assistant-step"
                >
                  <AssistantMarkdown blocks={slot.blocks} streaming={slot.streaming} loadImage={loadImage} t={t} />
                </div>
              )
            }
            const seats = slot.unit.foldKeys.map(nodeKey => (
              <ChatNodeSeat
                key={nodeKey}
                nodeKey={nodeKey}
                useSession={useSession}
                selectedCallId={selectedCallId}
                cwd={cwd}
                openFile={openFile}
                inspectCall={inspectCall}
                forkAt={forkAt}
                loadImage={loadImage}
                fileMentions={fileMentions}
                renderSlot={renderSlot}
                t={t}
              />
            ))
            if (!foldEnabled) return <Fragment key={'fold:' + slot.unit.key}>{seats}</Fragment>
            return (
              <TurnFold
                key={'fold:' + slot.unit.key}
                turnKey={slot.unit.key}
                running={slot.unit.running}
                toolCount={slot.unit.toolCount}
                thinkCount={slot.unit.thinkCount}
                startTime={slot.unit.startTime}
                runMs={slot.unit.runMs}
                finalStreaming={slot.unit.summaryText?.streaming === true}
                t={t}
              >
                {seats}
                {slot.unit.summaryThinking !== undefined && (
                  <AssistantMarkdown
                    blocks={slot.unit.summaryThinking.blocks}
                    streaming={slot.unit.summaryThinking.streaming}
                    t={t}
                  />
                )}
              </TurnFold>
            )
          })}
          {/* No pending placeholders: questions (ui-user-questions) and approvals
              (ApprovalPanel) both take over the composer, so a flow card would
              double-render the same wait. */}
          {/* Turn-level loading signal: rides the whole running turn (first-token
              wait, tool execution, streaming) so it never flickers per step. */}
          {running && <TurnStatus startTime={runningTurnStart} t={t} />}
          {pendingSteering.map(item => (
            <PendingSteeringBubble key={item.id} content={item.content} loadImage={loadImage} t={t} />
          ))}
        </div>
        {!atBottom && (
          <div className={css.toBottomSlot}>
            <button
              type="button"
              className={css.toBottom}
              aria-label={t('chat.toBottom')}
              onClick={() => {
                const local = listRef.current
                /* v8 ignore next -- ref-null guard: the button only renders alongside the mounted list. */
                if (local !== null) toBottom(scrollerOf(local))
              }}
            >
              <IconChevronDownOutline14 />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
