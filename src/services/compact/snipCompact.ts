import type { Message } from '../../types/message.js'

type SnipCompactResult = {
  messages: Message[]
  tokensFreed: number
  boundaryMessage?: Message
}

export function snipCompactIfNeeded(
  messages: Message[],
  _options?: unknown,
): SnipCompactResult {
  return {
    messages,
    tokensFreed: 0,
  }
}
