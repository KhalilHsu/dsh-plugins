import type { Context } from '@deepseek-ai/cordis'
import { QueryNavigator } from './QueryNavigator.tsx'

export const inject = ['slots'] as const

/** Register the navigator into a declared conversation slot, independent of activation order. */
export function apply(ctx: Context): void {
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'query-navigator',
    order: -100,
  }, QueryNavigator))
}
