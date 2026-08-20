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

interface ProjectionDefinitionLike {
  readonly key: 'queryIndex'
  readonly schema: { parse(value: unknown): QueryIndexProjection }
  readonly stateVersion: number
  init(): QueryIndexState
  apply(state: QueryIndexState, event: SessionEventLike): QueryIndexState
  view(state: QueryIndexState): QueryIndexProjection
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null
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

function parseProjection(value: unknown): QueryIndexProjection {
  const items = record(value)?.items
  if (!Array.isArray(items)) throw new Error('queryIndex projection requires an items array')
  for (const rawItem of items) {
    const item = record(rawItem)
    if (item === null
      || !Number.isSafeInteger(item.turn) || (item.turn as number) < 1
      || !Number.isSafeInteger(item.seq) || (item.seq as number) < 0
      || typeof item.preview !== 'string') {
      throw new Error('queryIndex projection contains an invalid item')
    }
  }
  return value as QueryIndexProjection
}

/** Host projection: first human message in each Turn, never assistant/tool content. */
export const queryIndexProjectionDefinition: ProjectionDefinitionLike = {
  key: 'queryIndex',
  schema: { parse: parseProjection },
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
  view: state => ({ items: state.items }),
}
