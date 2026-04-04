import { VERIFICATION_AGENT } from '../tools/AgentTool/built-in/verificationAgent.js'
import { runAgent } from '../tools/AgentTool/runAgent.js'
import type { CanUseToolFn } from '../tools/AgentTool/types.js'
import type { ToolUseContext } from '../Tool.js'
import type {
  AssistantMessage,
  Message,
  StreamEvent,
  TombstoneMessage,
  ToolUseSummaryMessage,
} from '../types/message.js'
import {
  createUserMessage,
  createSystemMessage,
  extractTextContent,
  getContentText,
} from '../utils/messages.js'
import type { QuerySource } from '../constants/querySource.js'
import { type Verdict } from './parseVerdict.js'
import { saveJudgeLog } from './judgeLogger.js'
import { logForDebugging } from '../utils/debug.js'
import { AUTO_JUDGE_QUERY_SOURCE } from './judgeQuerySource.js'
import { resolveAutoJudgeOutcome } from './resolveAutoJudgeOutcome.js'
import { appendJudgeTrace } from './judgeTraceLogger.js'

export interface AutoJudgeResult {
  verdict: Verdict
  /** Path to the saved log file */
  logFilePath: string
  /** Concise issue summary for the main thread — NOT the full report */
  conciseIssues: string
}

function buildVerificationDescription(task: string): string {
  const trimmed = task.trim().replace(/\s+/g, ' ')
  if (!trimmed) return 'Verify task'
  return `Verify ${trimmed}`.slice(0, 120)
}

/**
 * Extract the first user message content as the original task description.
 */
function extractOriginalTask(messages: Message[]): string {
  for (const m of messages) {
    if (m.type === 'user' && !m.isMeta) {
      const content = getContentText(m.message.content)
      if (content) {
        return content
      }
    }
  }
  return '(original task not found)'
}

/**
 * Build a structured conversation summary for the judge.
 * Includes each turn's assistant response preview and tool calls.
 */
function extractConversationSummary(messages: Message[]): string {
  const turns: string[] = []
  let turnNum = 0

  for (const m of messages) {
    if (m.type === 'assistant') {
      turnNum++
      const text = extractTextContent(m.message.content, '\n')
      const content = m.message.content
      const toolUses = Array.isArray(content)
        ? (content as unknown[])
            .filter((b: { type: string }) => b.type === 'tool_use')
            .map((b: { name: string; input?: unknown }) =>
              `${b.name}(${JSON.stringify(b.input ?? '').slice(0, 80)})`,
            )
        : []

      turns.push(
        `### Turn ${turnNum}\n` +
        `Response: ${text.slice(0, 600)}${text.length > 600 ? '...' : ''}\n` +
        `Tools called: ${toolUses.join(', ') || 'none'}`,
      )
    }
  }

  return turns.length > 0 ? turns.join('\n\n') : '(no assistant turns yet)'
}

/**
 * Extract file changes from tool_use blocks in the conversation.
 */
function extractFileChanges(messages: Message[]): string[] {
  const changes: string[] = []
  const fileTools = new Set(['str_replace_editor', 'file_edit', 'write', 'notebook_edit'])

  for (const m of messages) {
    if (m.type === 'assistant') {
      const content = m.message.content
      if (content == null || !Array.isArray(content)) continue
      for (const block of content as unknown[]) {
        if (
          (block as { type: string }).type === 'tool_use' &&
          fileTools.has((block as { name: string }).name)
        ) {
          const input = (block as { input?: { path?: string } }).input
          if (input?.path) {
            changes.push(`${(block as { name: string }).name}: ${input.path}`)
          }
        }
      }
    }
  }

  return [...new Set(changes)]
}

/**
 * Run the verification agent against the current conversation state.
 * Yields progress messages and returns the parsed verdict + log path + concise issues.
 */
export async function* runAutoJudge(params: {
  /** Full current conversation history before verdict feedback injection */
  fullMessages: Message[]
  assistantMessages: AssistantMessage[]
  toolUseContext: ToolUseContext
  canUseTool: CanUseToolFn
  querySource: QuerySource
  turnNumber: number
}): AsyncGenerator<
  StreamEvent | Message | TombstoneMessage | ToolUseSummaryMessage,
  AutoJudgeResult
> {
  const {
    fullMessages,
    assistantMessages,
    toolUseContext,
    canUseTool,
    querySource,
    turnNumber,
  } = params

  try {
    await appendJudgeTrace({
      stage: 'judge_run_started',
      turnNumber,
      querySource,
      agentId: toolUseContext.agentId,
      assistantMessageCount: assistantMessages.length,
      appJudgeModeOptIn: toolUseContext.getAppState().judgeModeOptIn,
      details: {
        judgeQuerySource: AUTO_JUDGE_QUERY_SOURCE,
        fullMessageCount: fullMessages.length,
      },
    })

    const conversationMessages = [...fullMessages, ...assistantMessages]

    // Build a comprehensive verification prompt with full context.
    // The judge is an independent agent — it receives the entire conversation,
    // not just the last turn.
    const originalTask = extractOriginalTask(conversationMessages)
    const verificationDescription = buildVerificationDescription(originalTask)
    const conversationSummary = extractConversationSummary(conversationMessages)
    const fileChanges = extractFileChanges(conversationMessages)

    const lastAssistantText = assistantMessages
      .filter(m => m.type === 'assistant')
      .map(m => extractTextContent(m.message.content, '\n'))
      .join('\n\n')

    const fileChangesSection = fileChanges.length > 0
      ? `=== Files Changed ===\n${fileChanges.join('\n')}\n\n`
      : ''

    const verificationPrompt =
      `You are verifying whether the following task has been correctly completed.\n\n` +
      `=== Original Task ===\n${originalTask}\n\n` +
      `${fileChangesSection}` +
      `=== Conversation Summary ===\n${conversationSummary}\n\n` +
      `=== Assistant's Most Recent Response ===\n${lastAssistantText}\n\n` +
      `=== Instructions ===\n` +
      `Based on the original task, the conversation history, and the assistant's recent response, ` +
      `verify whether the work is actually correct and complete. ` +
      `Pay attention to whether issues from previous judge rounds have been properly fixed. ` +
      `Run the appropriate verification commands independently — do not trust the assistant's claims.\n\n` +
      `Report your findings and end with VERDICT: PASS, VERDICT: FAIL, or VERDICT: PARTIAL.`

    await appendJudgeTrace({
      stage: 'judge_prompt_built',
      turnNumber,
      querySource,
      agentId: toolUseContext.agentId,
      details: {
        fileChangeCount: fileChanges.length,
        promptLength: verificationPrompt.length,
        description: verificationDescription,
      },
    })

    yield createSystemMessage(
      `verification(${verificationDescription})`,
      'suggestion',
    )

    const agentMessages: Message[] = []

    for await (const message of runAgent({
      agentDefinition: VERIFICATION_AGENT,
      promptMessages: [createUserMessage({ content: verificationPrompt })],
      toolUseContext,
      canUseTool,
      // Run in verification-agent mode so the user still sees the verifier
      // launch/completion flow. We selectively suppress noisy progress events
      // below instead of disabling the verifier's public startup entirely.
      isAsync: true,
      // The verifier must run as its own query source so main-thread-only gates
      // treat it as an independent judge, not as another repl_main_thread turn.
      querySource: AUTO_JUDGE_QUERY_SOURCE,
      availableTools: toolUseContext.options.tools,
      description: verificationDescription,
    })) {
      agentMessages.push(message)
      if (message.type !== 'progress') {
        yield message
      }
    }

    // Extract the final assistant message text and parse verdict.
    const lastAssistant = agentMessages.findLast(m => m.type === 'assistant')
    const report = lastAssistant
      ? extractTextContent(lastAssistant.message.content, '\n')
      : ''

    logForDebugging(`[autoJudge] lastAssistant=${!!lastAssistant}, report.length=${report.length}`)
    logForDebugging(`[autoJudge] report preview: ${report.slice(0, 200)}`)

    await appendJudgeTrace({
      stage: 'judge_report_collected',
      turnNumber,
      querySource,
      agentId: toolUseContext.agentId,
      details: {
        judgeMessageCount: agentMessages.length,
        hasFinalAssistant: !!lastAssistant,
        reportLength: report.length,
      },
    })

    const {
      verdict,
      conciseIssues,
    } = resolveAutoJudgeOutcome(report)

    await appendJudgeTrace({
      stage: 'judge_verdict_resolved',
      turnNumber,
      querySource,
      agentId: toolUseContext.agentId,
      verdict,
      details: {
        conciseIssuesLength: conciseIssues.length,
      },
    })

    logForDebugging(`[autoJudge] verdict=${verdict}, saving log...`)

    // Save full report to .claude/logs/judge/
    const logFilePath = await saveJudgeLog({
      verdict,
      report,
      turnNumber,
    })

    await appendJudgeTrace({
      stage: 'judge_log_saved',
      turnNumber,
      querySource,
      agentId: toolUseContext.agentId,
      verdict,
      logFilePath,
    })

    logForDebugging(`[autoJudge] log saved to: ${logFilePath}`)

    return { verdict, logFilePath, conciseIssues }
  } catch (error) {
    await appendJudgeTrace({
      stage: 'judge_run_failed',
      turnNumber,
      querySource,
      agentId: toolUseContext.agentId,
      reason: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

/**
 * Create a minimal user message that tells the main model the task
 * is not yet complete, with a brief reason — no full report context.
 */
export function createVerdictFeedbackMessage(conciseIssues: string): Message {
  return createUserMessage({
    content:
      `The verification gate is not satisfied yet. Key issue:\n\n` +
      conciseIssues +
      `\n\nPlease address this and continue. Do not mark the task complete until the judge returns VERDICT: PASS. The full verification report has been saved to the project's .claude/logs/judge/ directory for reference.`,
  })
}
