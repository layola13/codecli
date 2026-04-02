import { promises as fs } from 'fs'
import { join } from 'path'
import { getSessionId } from '../../bootstrap/state.js'
import { logForDebugging } from '../../utils/debug.js'
import { errorMessage } from '../../utils/errors.js'
import { ContextCompressorEngine } from './engine.js'
import { getCompressionProjectRoot, getContextOutputDir } from './paths.js'
import { persistConversationSummaryMarkdown } from './summary.js'
import { makeId } from './utils.js'

const SESSION_STATE_FILENAME = 'session_state.py'
const MAX_PROMPT_SESSION_STATE_CHARS = 12_000

type MessageContentBlock = {
  type?: string
  text?: string
}

type CompressibleMessage = {
  type?: string
  isMeta?: boolean
  toolUseResult?: unknown
  isApiErrorMessage?: boolean
  message?: {
    content?: string | readonly MessageContentBlock[]
    stop_reason?: string | null
  }
}

type CompressionTurn = {
  role: 'user' | 'assistant'
  content: string
  turn: number
  signature: string
}

function getPromptSessionStatePath(
  projectRoot: string = getCompressionProjectRoot(),
): string {
  return join(getContextOutputDir(projectRoot), SESSION_STATE_FILENAME)
}

function getContentText(
  content: string | readonly MessageContentBlock[] | undefined,
): string | null {
  if (typeof content === 'string') {
    return content.trim() || null
  }

  if (!Array.isArray(content)) {
    return null
  }

  const text = content
    .filter(
      (block): block is MessageContentBlock & { type: 'text'; text: string } =>
        block?.type === 'text' && typeof block.text === 'string',
    )
    .map(block => block.text)
    .join('\n')
    .trim()

  return text || null
}

function isHumanTurn(message: CompressibleMessage): boolean {
  return (
    message.type === 'user' &&
    message.isMeta !== true &&
    message.toolUseResult === undefined
  )
}

function isAssistantTurn(message: CompressibleMessage): boolean {
  return (
    message.type === 'assistant' &&
    message.isApiErrorMessage !== true &&
    message.message?.stop_reason !== null
  )
}

function makeTurnSignature(
  role: CompressionTurn['role'],
  content: string,
  turn: number,
): string {
  return makeId('turn', `${role}:${content}`, turn)
}

function toCompressionTurns(
  messages: readonly CompressibleMessage[],
): CompressionTurn[] {
  const turns: CompressionTurn[] = []

  for (const message of messages) {
    const role = isHumanTurn(message)
      ? 'user'
      : isAssistantTurn(message)
        ? 'assistant'
        : null

    if (!role) continue

    const content = getContentText(message.message?.content)
    if (!content) continue

    const turn = turns.length + 1
    turns.push({
      role,
      content,
      turn,
      signature: makeTurnSignature(role, content, turn),
    })
  }

  return turns
}

export async function persistCompressedSessionState(
  messages: readonly CompressibleMessage[],
): Promise<void> {
  try {
    const turns = toCompressionTurns(messages)
    if (turns.length === 0) return

    await persistConversationSummaryMarkdown(messages)

    const engine = new ContextCompressorEngine({
      autoSave: false,
      outputDir: getContextOutputDir(),
      sessionId: getSessionId(),
    })

    const existing = await engine.loadExistingState()
    const processedTurns = existing?.totalTurns ?? 0
    const canAppendIncrementally =
      processedTurns > 0 &&
      processedTurns <= turns.length &&
      existing?.lastTurnSignature !== undefined &&
      turns[processedTurns - 1]?.signature === existing.lastTurnSignature

    if (!canAppendIncrementally) {
      engine.reset()
    }

    const pendingTurns = canAppendIncrementally
      ? turns.slice(processedTurns)
      : turns

    if (pendingTurns.length === 0) {
      return
    }

    engine.ingestBatch(
      pendingTurns.map(({ role, content, turn }) => ({ role, content, turn })),
    )
    await engine.save()
  } catch (error) {
    logForDebugging(
      `[context-compression] persist failed: ${errorMessage(error)}`,
      { level: 'error' },
    )
  }
}

export async function readCompressedSessionStateForPrompt(): Promise<string | null> {
  try {
    const content = (await fs.readFile(getPromptSessionStatePath(), 'utf8')).trim()
    if (!content) return null

    if (content.length <= MAX_PROMPT_SESSION_STATE_CHARS) {
      return content
    }

    return `${content.slice(0, MAX_PROMPT_SESSION_STATE_CHARS).trimEnd()}\n# ... truncated for prompt injection`
  } catch {
    return null
  }
}
