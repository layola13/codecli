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
import { createUserMessage, extractTextContent } from '../utils/messages.js'
import type { QuerySource } from '../constants/querySource.js'
import { parseVerdict, type Verdict } from './parseVerdict.js'
import { saveJudgeLog } from './judgeLogger.js'

export interface AutoJudgeResult {
  verdict: Verdict
  /** Path to the saved log file */
  logFilePath: string
  /** Concise issue summary for the main thread — NOT the full report */
  conciseIssues: string
}

/**
 * Extract the first user message content as the original task description.
 */
function extractOriginalTask(messages: Message[]): string {
  for (const m of messages) {
    if (m.type === 'user' && !m.isMeta) {
      return extractTextContent(m.content, '\n')
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
 * Extract a concise issue summary from the judge report for FAIL/PARTIAL verdicts.
 * Takes the first few check items that failed, limited to ~300 chars for the main thread.
 */
function extractConciseIssues(report: string): string {
  // Find the first FAIL check and extract its description
  const failMatch = report.match(/### Check:[^\n]*\n[\s\S]*?Result: FAIL[^\n]*\n?([\s\S]*?)(?=### Check:|VERDICT:|$)/i)
  if (failMatch) {
    const section = failMatch[1].trim()
    // Limit to first 400 chars to avoid flooding the main context
    return section.length > 400 ? section.slice(0, 400) + '\n...(see judge log for full details)' : section
  }
  // Fallback: first 300 chars of the report
  return report.length > 300 ? report.slice(0, 300) + '\n...(see judge log for full details)' : report
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
  const { fullMessages, assistantMessages, toolUseContext, canUseTool, querySource, turnNumber } = params

  const conversationMessages = [...fullMessages, ...assistantMessages]

  // Build a comprehensive verification prompt with full context.
  // The judge is an independent agent — it receives the entire conversation,
  // not just the last turn.
  const originalTask = extractOriginalTask(conversationMessages)
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

  // Give the judge its own abortController so it isn't cancelled when the
  // main thread is aborted. The judge should complete its verification
  // independently.
  const judgeAbortController = new AbortController()

  const agentMessages: Message[] = []

  for await (const message of runAgent({
    agentDefinition: VERIFICATION_AGENT,
    promptMessages: [createUserMessage({ content: verificationPrompt })],
    toolUseContext,
    canUseTool,
    isAsync: false,
    querySource,
    availableTools: toolUseContext.options.tools,
    override: { abortController: judgeAbortController },
  })) {
    agentMessages.push(message)
    yield message
  }

  // Extract the final assistant message text and parse verdict.
  const lastAssistant = agentMessages.findLast(m => m.type === 'assistant')
  const report = lastAssistant
    ? extractTextContent(lastAssistant.message.content, '\n')
    : ''

  // If the judge didn't output a valid VERDICT line (e.g. network error,
  // prompt truncated), default to PASS to avoid false-positive retry loops.
  const verdict = parseVerdict(report) ?? 'PASS'

  // Save full report to .claude/logs/judge/
  const logFilePath = await saveJudgeLog({
    verdict,
    report,
    turnNumber,
  })

  // Return concise result for the main thread.
  const conciseIssues = verdict === 'PASS'
    ? ''
    : extractConciseIssues(report)

  return { verdict, logFilePath, conciseIssues }
}

/**
 * Create a minimal user message that tells the main model the task
 * is not yet complete, with a brief reason — no full report context.
 */
export function createVerdictFeedbackMessage(conciseIssues: string): Message {
  return createUserMessage({
    content:
      `The verification check did not pass. Key issue:\n\n` +
      conciseIssues +
      `\n\nPlease address this and continue. The full verification report has been saved to the project's .claude/logs/judge/ directory for reference.`,
  })
}
