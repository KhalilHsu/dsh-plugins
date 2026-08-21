import type { Context } from '@deepseek-ai/cordis'
import { createElement } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-runtime/client'
import { QueryNavigator } from './QueryNavigator.tsx'
import { QueryNavToggle } from './QueryNavToggle.tsx'

export const inject = ['slots', 'sessions'] as const

type QueryNavigatorSlotProps = PropsRuntime<'conversation.input.dock'>

/** Register the navigator into a declared conversation slot, independent of activation order. */
export function apply(ctx: Context): void {
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'query-navigator',
    order: -100,
  }, function QueryNavigatorEntry(props: QueryNavigatorSlotProps) {
    const loadOlder = async (): Promise<void> => {
      const scoped = ctx.sessions.scope(props.sessionId)
      const conversation = scoped?.get('conversation')
      if (conversation === undefined) throw new Error('query-navigator: conversation service unavailable')
      await conversation.loadOlder()
    }
    return createElement(QueryNavigator, { ...props, loadOlder })
  }))

  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions',
    id: 'query-nav-toggle',
    order: 20,
  }, QueryNavToggle))
}
