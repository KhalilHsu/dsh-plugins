import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ChatConversationViewNode } from '@deepseek-ai/dsh-client-runtime/client'
import {
  activeQueryIndex, clampPreviewTop, queryPreviewFromData,
} from './query-model.ts'

const PACKAGE_ID = '@khalilhsu/dsh-ui-query-navigator'
const QUERY_SELECTOR = '[data-chat-flow-kind="user"][data-chat-flow-key]'

const stylesheet = `
.dsh-query-nav {
  position: fixed;
  z-index: 32;
  width: 32px;
  pointer-events: none;
}
.dsh-query-nav__rail {
  display: flex;
  max-height: var(--dsh-query-nav-max-height);
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
  pointer-events: auto;
}
.dsh-query-nav__rail::-webkit-scrollbar { display: none; }
.dsh-query-nav__marker {
  display: grid;
  width: 30px;
  min-height: 12px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  place-items: center start;
}
.dsh-query-nav__line {
  display: block;
  width: 10px;
  height: 2px;
  border-radius: 999px;
  background: var(--dsw-alias-label-tertiary, #a1a1aa);
  opacity: .58;
  transition: width 120ms ease, height 120ms ease, opacity 120ms ease, background-color 120ms ease;
}
.dsh-query-nav__marker:hover .dsh-query-nav__line,
.dsh-query-nav__marker:focus-visible .dsh-query-nav__line {
  width: 18px;
  opacity: .92;
}
.dsh-query-nav__marker:focus-visible { outline: none; }
.dsh-query-nav__marker:focus-visible .dsh-query-nav__line {
  box-shadow: 0 0 0 2px var(--dsw-alias-bg-base, #fff), 0 0 0 4px var(--dsw-alias-brand-primary, #4f7cff);
}
.dsh-query-nav__marker[data-active="true"] .dsh-query-nav__line {
  width: 23px;
  height: 3px;
  background: var(--dsw-alias-label-primary, #18181b);
  opacity: 1;
}
.dsh-query-nav__preview {
  position: fixed;
  z-index: 33;
  width: min(360px, calc(100vw - 92px));
  box-sizing: border-box;
  padding: 14px 16px;
  border: 1px solid var(--dsw-alias-border-l2, #e4e4e7);
  border-radius: 16px;
  background: var(--dsw-alias-bg-layer-1, #fff);
  color: var(--dsw-alias-label-primary, #18181b);
  box-shadow: 0 12px 34px rgba(0, 0, 0, .12);
  pointer-events: none;
}
.dsh-query-nav__preview-meta {
  margin-bottom: 6px;
  color: var(--dsw-alias-label-tertiary, #71717a);
  font-size: 12px;
  line-height: 18px;
}
.dsh-query-nav__preview-text {
  display: -webkit-box;
  overflow: hidden;
  font-size: 14px;
  line-height: 22px;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}
@media (prefers-reduced-motion: reduce) {
  .dsh-query-nav__line { transition: none; }
}
`

interface QueryItem {
  readonly key: string
  readonly preview: string
  readonly turn: number | null
}

interface Geometry {
  readonly left: number
  readonly top: number
  readonly maxHeight: number
  readonly visible: boolean
}

type QueryNavigatorProps = PropsRuntime<'conversation.input.dock'>

function isUserNode(node: ChatConversationViewNode | undefined): node is ChatConversationViewNode {
  return node?.kind === 'user' && node.visibility === 'visible'
}

function queryTurn(node: ChatConversationViewNode): number | null {
  if (node.location.kind === 'turn' || node.location.kind === 'step') return node.location.turn.turn
  return null
}

function findQueryRow(key: string): HTMLElement | null {
  for (const row of document.querySelectorAll<HTMLElement>(QUERY_SELECTOR)) {
    if (row.dataset.chatFlowKey === key) return row
  }
  return null
}

function sameGeometry(a: Geometry, b: Geometry): boolean {
  return a.left === b.left && a.top === b.top && a.maxHeight === b.maxHeight && a.visible === b.visible
}

/** Codex-style left rail for navigating ordinary user queries in the loaded transcript. */
export function QueryNavigator({ session }: QueryNavigatorProps) {
  const queries = useMemo<QueryItem[]>(() => {
    const result: QueryItem[] = []
    for (const key of session.chat.order) {
      const node = session.chat.nodes.get(key)
      if (!isUserNode(node)) continue
      result.push({ key: node.key, preview: queryPreviewFromData(node.data), turn: queryTurn(node) })
    }
    return result
  }, [session.chat.nodes, session.chat.order])

  const [active, setActive] = useState(0)
  const [hovered, setHovered] = useState<number | null>(null)
  const [previewTop, setPreviewTop] = useState(12)
  const [geometry, setGeometry] = useState<Geometry>({ left: 0, top: 0, maxHeight: 240, visible: false })
  const railRef = useRef<HTMLDivElement>(null)
  const markerRefs = useRef(new Map<number, HTMLButtonElement>())
  const querySignature = queries.map(query => query.key).join('\u0000')

  useLayoutEffect(() => {
    const scrollPort = document.querySelector<HTMLElement>('[data-conversation-scroll]')
    const chatFlow = scrollPort?.querySelector<HTMLElement>('[data-chat-flow]') ?? null
    if (scrollPort === null) return

    let frame = 0
    const update = (): void => {
      frame = 0
      const rect = scrollPort.getBoundingClientRect()
      const maxHeight = Math.max(144, Math.min(340, rect.height - 132))
      const nextGeometry: Geometry = {
        left: Math.round(rect.left + 18),
        top: Math.round(rect.top + Math.max(72, (rect.height - maxHeight) / 2)),
        maxHeight,
        visible: queries.length >= 2 && scrollPort.scrollHeight > scrollPort.clientHeight + 4,
      }
      setGeometry(current => sameGeometry(current, nextGeometry) ? current : nextGeometry)

      const offsets = queries.map(query => findQueryRow(query.key)?.getBoundingClientRect().top ?? null)
      const readingLine = rect.top + Math.min(180, rect.height * .3)
      setActive(current => {
        const next = activeQueryIndex(offsets, readingLine)
        return current === next ? current : next
      })
    }
    const schedule = (): void => {
      if (frame !== 0) return
      frame = window.requestAnimationFrame(update)
    }

    update()
    scrollPort.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule, { passive: true })
    const resizeObserver = new ResizeObserver(schedule)
    resizeObserver.observe(scrollPort)
    if (chatFlow !== null) resizeObserver.observe(chatFlow)

    return () => {
      if (frame !== 0) window.cancelAnimationFrame(frame)
      scrollPort.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      resizeObserver.disconnect()
    }
  }, [querySignature, queries])

  useEffect(() => {
    const rail = railRef.current
    const marker = markerRefs.current.get(active)
    if (rail === null || marker === undefined) return
    const markerTop = marker.offsetTop
    const markerBottom = markerTop + marker.offsetHeight
    if (markerTop < rail.scrollTop) rail.scrollTop = markerTop
    else if (markerBottom > rail.scrollTop + rail.clientHeight) rail.scrollTop = markerBottom - rail.clientHeight
  }, [active])

  if (typeof document === 'undefined') return null

  const scrollToQuery = (index: number): void => {
    const query = queries[index]
    const row = query === undefined ? null : findQueryRow(query.key)
    const scrollPort = row?.closest<HTMLElement>('[data-conversation-scroll]') ?? null
    if (row === null || scrollPort === null) return
    const rowRect = row.getBoundingClientRect()
    const scrollRect = scrollPort.getBoundingClientRect()
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    scrollPort.scrollTo({
      top: scrollPort.scrollTop + rowRect.top - scrollRect.top - 28,
      behavior: reducedMotion ? 'auto' : 'smooth',
    })
    setActive(index)
  }

  const showPreview = (index: number, marker: HTMLButtonElement): void => {
    setHovered(index)
    setPreviewTop(clampPreviewTop(marker.getBoundingClientRect().top, window.innerHeight))
  }

  const hoveredQuery = hovered === null ? undefined : queries[hovered]
  return createPortal(
    <>
      <style data-plugin={PACKAGE_ID}>{stylesheet}</style>
      {geometry.visible && (
        <nav
          className="dsh-query-nav"
          aria-label="Query 导航"
          style={{
            left: geometry.left,
            top: geometry.top,
            '--dsh-query-nav-max-height': `${geometry.maxHeight}px`,
          } as CSSProperties}
        >
          <div ref={railRef} className="dsh-query-nav__rail">
            {queries.map((query, index) => (
              <button
                key={query.key}
                ref={(element) => {
                  if (element === null) markerRefs.current.delete(index)
                  else markerRefs.current.set(index, element)
                }}
                type="button"
                className="dsh-query-nav__marker"
                data-active={index === active}
                aria-current={index === active ? 'step' : undefined}
                aria-label={`跳转到第 ${index + 1} 个 Query：${query.preview}`}
                onClick={() => { scrollToQuery(index) }}
                onPointerEnter={event => { showPreview(index, event.currentTarget) }}
                onPointerLeave={() => { setHovered(null) }}
                onFocus={event => { showPreview(index, event.currentTarget) }}
                onBlur={() => { setHovered(null) }}
              >
                <span className="dsh-query-nav__line" aria-hidden />
              </button>
            ))}
          </div>
        </nav>
      )}
      {geometry.visible && hoveredQuery !== undefined && (
        <div
          className="dsh-query-nav__preview"
          role="tooltip"
          style={{ left: geometry.left + 38, top: previewTop }}
        >
          <div className="dsh-query-nav__preview-meta">
            第 {(hovered ?? 0) + 1} 个 Query{hoveredQuery.turn === null ? '' : ` · Turn ${hoveredQuery.turn}`}
          </div>
          <div className="dsh-query-nav__preview-text">{hoveredQuery.preview}</div>
        </div>
      )}
    </>,
    document.body,
  )
}
