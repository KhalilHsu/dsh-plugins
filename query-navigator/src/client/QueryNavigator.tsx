import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ChatConversationViewNode, ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import {
  activeQueryIndex, buildTurnMarkers, clampPreviewTop, queryPreviewFromData,
} from './query-model.ts'
import type { LoadedQuery, TurnMarker } from './query-model.ts'
import type { QueryIndexProjection } from '../query-index.ts'

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
.dsh-query-nav__marker[data-loaded="false"] .dsh-query-nav__line {
  width: 7px;
  opacity: .28;
}
.dsh-query-nav__marker[data-loading="true"] .dsh-query-nav__line {
  width: 18px;
  background: var(--dsw-alias-brand-primary, #4f7cff);
  opacity: 1;
  animation: dsh-query-nav-pulse 900ms ease-in-out infinite alternate;
}
@keyframes dsh-query-nav-pulse {
  from { transform: scaleX(.55); transform-origin: left; }
  to { transform: scaleX(1); transform-origin: left; }
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
.dsh-query-nav__preview-hint {
  margin-top: 8px;
  color: var(--dsw-alias-label-tertiary, #71717a);
  font-size: 12px;
  line-height: 18px;
}
@media (prefers-reduced-motion: reduce) {
  .dsh-query-nav__line { transition: none; }
}
`

interface Geometry {
  readonly left: number
  readonly top: number
  readonly maxHeight: number
  readonly visible: boolean
}

type QueryNavigatorProps = PropsRuntime<'conversation.input.dock'> & {
  readonly loadOlder: () => Promise<void>
}

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

function loadedQueries(snapshot: ConversationSnapshot): LoadedQuery[] {
  const result: LoadedQuery[] = []
  for (const key of snapshot.chat.order) {
    const node = snapshot.chat.nodes.get(key)
    if (!isUserNode(node)) continue
    result.push({ key: node.key, preview: queryPreviewFromData(node.data), turn: queryTurn(node) })
  }
  return result
}

function loadedQueryForTurn(snapshot: ConversationSnapshot, turn: number): LoadedQuery | undefined {
  return loadedQueries(snapshot).find(query => query.turn === turn)
}

function nextPaint(): Promise<void> {
  return new Promise(resolve => { window.requestAnimationFrame(() => { resolve() }) })
}

/** Codex-style full-turn rail with on-demand paging for unloaded queries. */
export function QueryNavigator({ session, useProjection, loadOlder }: QueryNavigatorProps) {
  // sessionStats is a built-in DSH projection, but this standalone package
  // deliberately does not link the host-side domain package just for its type augmentation.
  const projectedStats = (useProjection as unknown as (
    key: string,
  ) => { readonly turns?: number } | undefined)('sessionStats')
  const projectedIndex = (useProjection as unknown as (
    key: string,
  ) => QueryIndexProjection | undefined)('queryIndex')
  const loaded = useMemo(() => loadedQueries(session), [session.chat.nodes, session.chat.order])
  const markers = useMemo(
    () => buildTurnMarkers(projectedStats?.turns ?? 0, loaded, projectedIndex?.items ?? []),
    [loaded, projectedIndex?.items, projectedStats?.turns],
  )

  const [active, setActive] = useState(0)
  const [hovered, setHovered] = useState<number | null>(null)
  const [loadingTurn, setLoadingTurn] = useState<number | null>(null)
  const [loadFailure, setLoadFailure] = useState<number | null>(null)
  const [previewTop, setPreviewTop] = useState(12)
  const [geometry, setGeometry] = useState<Geometry>({ left: 0, top: 0, maxHeight: 240, visible: false })
  const railRef = useRef<HTMLDivElement>(null)
  const markerRefs = useRef(new Map<number, HTMLButtonElement>())
  const sessionRef = useRef(session)
  const requestRef = useRef(0)
  sessionRef.current = session
  const markerSignature = markers.map(marker => `${marker.turn}:${marker.key ?? ''}`).join('\u0000')

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
        visible: markers.length >= 2 && (session.hasMore || scrollPort.scrollHeight > scrollPort.clientHeight + 4),
      }
      setGeometry(current => sameGeometry(current, nextGeometry) ? current : nextGeometry)

      const offsets = markers.map(marker => marker.key === null
        ? null
        : findQueryRow(marker.key)?.getBoundingClientRect().top ?? null)
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
  }, [markerSignature, markers, session.hasMore])

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

  const scrollToLoadedQuery = (marker: TurnMarker): boolean => {
    const row = marker.key === null ? null : findQueryRow(marker.key)
    const scrollPort = row?.closest<HTMLElement>('[data-conversation-scroll]') ?? null
    if (row === null || scrollPort === null) return false
    const rowRect = row.getBoundingClientRect()
    const scrollRect = scrollPort.getBoundingClientRect()
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    scrollPort.scrollTo({
      top: scrollPort.scrollTop + rowRect.top - scrollRect.top - 28,
      behavior: reducedMotion ? 'auto' : 'smooth',
    })
    setActive(Math.max(0, marker.turn - 1))
    return true
  }

  const navigateToTurn = async (marker: TurnMarker): Promise<void> => {
    const request = requestRef.current + 1
    requestRef.current = request
    setLoadFailure(null)
    if (scrollToLoadedQuery(marker)) return

    setLoadingTurn(marker.turn)
    let previousHead = sessionRef.current.chat.order[0] ?? null
    try {
      while (requestRef.current === request && sessionRef.current.hasMore) {
        await loadOlder()
        await nextPaint()
        if (requestRef.current !== request) return

        const current = sessionRef.current
        const query = loadedQueryForTurn(current, marker.turn)
        if (query !== undefined) {
          await nextPaint()
          scrollToLoadedQuery({ turn: marker.turn, key: query.key, preview: query.preview })
          return
        }

        const nextHead = current.chat.order[0] ?? null
        if (nextHead === previousHead && !current.loadingOlder) break
        previousHead = nextHead
      }
      if (requestRef.current === request) setLoadFailure(marker.turn)
    } finally {
      if (requestRef.current === request) setLoadingTurn(null)
    }
  }

  const showPreview = (index: number, marker: HTMLButtonElement): void => {
    setHovered(index)
    setPreviewTop(clampPreviewTop(marker.getBoundingClientRect().top, window.innerHeight))
  }

  const hoveredMarker = hovered === null ? undefined : markers[hovered]
  const hoveredLoading = hoveredMarker?.turn === loadingTurn
  const hoveredFailed = hoveredMarker?.turn === loadFailure
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
            {markers.map((marker, index) => (
              <button
                key={marker.turn}
                ref={(element) => {
                  if (element === null) markerRefs.current.delete(index)
                  else markerRefs.current.set(index, element)
                }}
                type="button"
                className="dsh-query-nav__marker"
                data-active={index === active}
                data-loaded={marker.key !== null}
                data-loading={marker.turn === loadingTurn}
                aria-current={index === active ? 'step' : undefined}
                aria-label={marker.preview === null
                  ? `定位 Turn ${marker.turn}，需要加载更早历史`
                  : marker.key === null
                    ? `加载并定位 Turn ${marker.turn}：${marker.preview}`
                    : `跳转到 Turn ${marker.turn}：${marker.preview}`}
                aria-busy={marker.turn === loadingTurn || undefined}
                onClick={() => { void navigateToTurn(marker) }}
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
      {geometry.visible && hoveredMarker !== undefined && (
        <div
          className="dsh-query-nav__preview"
          role="tooltip"
          style={{ left: geometry.left + 38, top: previewTop }}
        >
          <div className="dsh-query-nav__preview-meta">
            Turn {hoveredMarker.turn}{hoveredMarker.key === null ? ' · 尚未加载' : ' · 已加载'}
          </div>
          <div className="dsh-query-nav__preview-text">
            {hoveredLoading
              ? '正在按需加载更早历史…'
              : hoveredFailed
                ? '未能定位这个 Turn，请稍后重试'
                : hoveredMarker.preview ?? '点击后加载到这个 Turn，并定位对应 Query'}
          </div>
          {hoveredMarker.key === null && !hoveredLoading && (
            <div className="dsh-query-nav__preview-hint">尚未加载 · 点击加载完整内容并定位</div>
          )}
        </div>
      )}
    </>,
    document.body,
  )
}
