const QUERY_PREVIEW_LIMIT = 80

export interface QueryIndexEntry {
  readonly turn: number
  readonly seq: number
  readonly preview: string
}

export interface QueryIndexProjection {
  readonly items: readonly QueryIndexEntry[]
}

interface QueryIndexState extends QueryIndexProjection {
  readonly currentTurn: number | null
}

interface SessionEventLike {
  readonly type: string
  readonly seq: number
  readonly data: unknown
}

/**
 * DSH session-projection unit contract (structural, so this standalone
 * package stays free of the host-side domain package). The registry reads
 * `stateSchema` (persisted-state validation), `wire.viewSchema` + `wire.view`
 * (client-facing payload), `init`, `apply`, and `stateVersion` at runtime; a
 * unit WITHOUT `wire` is host-only and is excluded from the client-visible
 * snapshot, so every client-visible unit here must declare `wire`.
 */
interface ProjectionDefinitionLike {
  readonly key: 'queryIndex'
  readonly stateSchema: { parse(value: unknown): QueryIndexState }
  readonly stateVersion: number
  init(): QueryIndexState
  apply(state: QueryIndexState, event: SessionEventLike): QueryIndexState
  wire: {
    readonly viewSchema: { parse(value: unknown): QueryIndexProjection }
    view(state: QueryIndexState): QueryIndexProjection
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null
}

function isValidEntry(item: unknown): item is QueryIndexEntry {
  const raw = record(item)
  return raw !== null
    && Number.isSafeInteger(raw.turn) && (raw.turn as number) >= 1
    && Number.isSafeInteger(raw.seq) && (raw.seq as number) >= 0
    && typeof raw.preview === 'string'
}

/** Collapse whitespace and cap one Host-projected Query preview. */
export function compactQueryPreview(data: unknown): string {
  const content = record(data)?.content
  if (!Array.isArray(content)) return '未命名 Query'

  const text: string[] = []
  let imageCount = 0
  for (const rawBlock of content) {
    const block = record(rawBlock)
    if (block?.type === 'text' && typeof block.text === 'string') text.push(block.text)
    if (block?.type === 'image') imageCount += 1
  }

  const normalized = text.join(' ').replace(/\s+/g, ' ').trim()
  const characters = Array.from(normalized)
  const excerpt = characters.length > QUERY_PREVIEW_LIMIT
    ? `${characters.slice(0, QUERY_PREVIEW_LIMIT).join('')}…`
    : normalized
  const imageLabel = imageCount === 0 ? '' : `${imageCount} 张图片`
  return [excerpt, imageLabel].filter(Boolean).join(' · ') || '未命名 Query'
}

/** Validate the persisted internal state before it seeds a fold. */
function parseState(value: unknown): QueryIndexState {
  const raw = record(value)
  if (raw === null) throw new Error('queryIndex state requires an object')
  const items = raw.items
  if (!Array.isArray(items)) throw new Error('queryIndex state requires an items array')
  for (const item of items) {
    if (!isValidEntry(item)) throw new Error('queryIndex state contains an invalid item')
  }
  const currentTurn = raw.currentTurn
  if (currentTurn !== null && (!Number.isSafeInteger(currentTurn) || (currentTurn as number) < 1)) {
    throw new Error('queryIndex state has an invalid currentTurn')
  }
  return { currentTurn: currentTurn as number | null, items }
}

/** Validate the client-facing payload before it leaves the host. */
function parseView(value: unknown): QueryIndexProjection {
  const raw = record(value)
  const items = raw?.items
  if (!Array.isArray(items)) throw new Error('queryIndex projection requires an items array')
  for (const item of items) {
    if (!isValidEntry(item)) throw new Error('queryIndex projection contains an invalid item')
  }
  return value as QueryIndexProjection
}

/** Host projection: first human message in each Turn, never assistant/tool content. */
export const queryIndexProjectionDefinition: ProjectionDefinitionLike = {
  key: 'queryIndex',
  stateSchema: { parse: parseState },
  stateVersion: 1,
  init: () => ({ currentTurn: null, items: [] }),
  apply: (state, event) => {
    const data = record(event.data)
    if (event.type === 'turn/start') {
      const turn = data?.turn
      return Number.isSafeInteger(turn) && (turn as number) > 0
        ? { ...state, currentTurn: turn as number }
        : state
    }
    if (event.type === 'turn/end') {
      return state.currentTurn === null ? state : { ...state, currentTurn: null }
    }
    if (event.type !== 'user/message' || state.currentTurn === null) return state

    const source = record(data?.source)
    if (source?.kind !== 'user' || state.items.some(item => item.turn === state.currentTurn)) return state
    return {
      currentTurn: state.currentTurn,
      items: [...state.items, {
        turn: state.currentTurn,
        seq: event.seq,
        preview: compactQueryPreview(event.data),
      }],
    }
  },
  wire: {
    viewSchema: { parse: parseView },
    view: state => ({ items: state.items }),
  },
}
