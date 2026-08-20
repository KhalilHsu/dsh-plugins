import type { Context } from '@deepseek-ai/cordis'
import { queryIndexProjectionDefinition } from './query-index.ts'

interface QueryIndexProjectionRegistry {
  register(definition: typeof queryIndexProjectionDefinition): () => void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    sessionProjections: QueryIndexProjectionRegistry
  }
}

export const name = 'ui-query-navigator'
export const inject = ['sessionProjections'] as const

/** Register the lightweight whole-session Query index for the browser half. */
export function apply(ctx: Context): void {
  ctx.sessionProjections.register(queryIndexProjectionDefinition)
}
