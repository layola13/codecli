import type { Message } from '../../types/message.js'

type ContextCollapseHealth = {
  totalSpawns: number
  totalErrors: number
  lastError: string | null
  emptySpawnWarningEmitted: boolean
  totalEmptySpawns: number
}

type ContextCollapseStats = {
  collapsedSpans: number
  collapsedMessages: number
  stagedSpans: number
  health: ContextCollapseHealth
}

const EMPTY_STATS: ContextCollapseStats = {
  collapsedSpans: 0,
  collapsedMessages: 0,
  stagedSpans: 0,
  health: {
    totalSpawns: 0,
    totalErrors: 0,
    lastError: null,
    emptySpawnWarningEmitted: false,
    totalEmptySpawns: 0,
  },
}

export function initContextCollapse(): void {}

export function isContextCollapseEnabled(): boolean {
  return false
}

export function getStats(): ContextCollapseStats {
  return {
    ...EMPTY_STATS,
    health: { ...EMPTY_STATS.health },
  }
}

export async function applyCollapsesIfNeeded(
  messages: Message[],
  _toolUseContext?: unknown,
  _querySource?: unknown,
): Promise<{ messages: Message[] }> {
  return { messages }
}

export function recoverFromOverflow(
  messages: Message[],
  _querySource?: unknown,
): { committed: number; messages: Message[] } {
  return {
    committed: 0,
    messages,
  }
}

export function resetContextCollapse(): void {}
