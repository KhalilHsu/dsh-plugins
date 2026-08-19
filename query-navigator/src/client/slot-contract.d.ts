import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'

/**
 * Out-of-tree type mirror of the existing conversation input-dock currency.
 * The runtime declaration remains owned by ui-conversation; this file only
 * lets this standalone package compile without importing another UI plugin.
 */
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'conversation.input.dock': {
      kind: 'list'
      scope: 'session'
      owner: {
        readonly session: ConversationSnapshot
        readonly input: unknown
      }
    }
  }
}
