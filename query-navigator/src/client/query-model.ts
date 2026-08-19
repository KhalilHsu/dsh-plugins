export interface QueryTextBlock {
  readonly type?: unknown
  readonly text?: unknown
}

/** Collapse transcript whitespace for a compact hover preview. */
export function normalizeQueryText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/** Convert one user-node data payload into a short, presentation-only label. */
export function queryPreviewFromData(data: unknown): string {
  if (typeof data !== 'object' || data === null) return '未命名 Query'
  const content = (data as { content?: unknown }).content
  if (!Array.isArray(content)) return '未命名 Query'

  const parts: string[] = []
  let imageCount = 0
  for (const rawBlock of content) {
    if (typeof rawBlock !== 'object' || rawBlock === null) continue
    const block = rawBlock as QueryTextBlock
    if (block.type === 'text' && typeof block.text === 'string') parts.push(block.text)
    if (block.type === 'image') imageCount += 1
  }

  const text = normalizeQueryText(parts.join(' '))
  const imageLabel = imageCount === 0 ? '' : `${imageCount} 张图片`
  const combined = [text, imageLabel].filter(Boolean).join(' · ')
  return combined === '' ? '未命名 Query' : combined
}

/** Pick the last query that has crossed the reading line. */
export function activeQueryIndex(offsets: readonly (number | null)[], readingLine: number): number {
  let active = 0
  for (let index = 0; index < offsets.length; index += 1) {
    const offset = offsets[index]
    if (offset !== null && offset <= readingLine) active = index
  }
  return active
}

/** Keep the hover card inside the viewport. */
export function clampPreviewTop(markerTop: number, viewportHeight: number): number {
  const cardHeight = 116
  return Math.max(12, Math.min(markerTop - 10, viewportHeight - cardHeight - 12))
}
