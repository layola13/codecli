import { ContextCompressorEngine } from '../../context/compression/engine.js'
import { getContextOutputDir } from '../../context/compression/paths.js'
import { persistConversationSummaryMarkdown } from '../../context/compression/summary.js'
import { getSessionId } from '../../bootstrap/state.js'
import type { LocalCommandCall } from '../../types/command.js'
import { errorMessage } from '../../utils/errors.js'

const USAGE = [
  'Usage: /compress',
  '',
  'Compresses the current conversation context into structured session state.',
  'Outputs both a Python file (for AI consumption) and a JSON file (for program recovery).',
  '',
  'Generated files:',
  '  .claude/context/session_state.py  — structured Python state',
  '  .claude/context/session_history.py — compact timeline archive',
  '  .claude/context/session_metrics.py — compression diagnostics',
  '  .claude/context/session_state.json — full session state',
].join('\n')

type MessageContentBlock = {
  type?: string
  text?: string
}

function getMessageText(
  content: string | readonly MessageContentBlock[] | undefined,
): string | null {
  if (typeof content === 'string') {
    const trimmed = content.trim()
    return trimmed || null
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

export const call: LocalCommandCall = async (_args, context) => {
  try {
    const { messages } = context

    if (!messages || messages.length === 0) {
      return {
        type: 'text' as const,
        value: 'No messages in conversation to compress.',
      }
    }

    await persistConversationSummaryMarkdown(messages)

    const engine = new ContextCompressorEngine({
      outputDir: getContextOutputDir(),
      sessionId: getSessionId(),
    })

    // Ingest all messages
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]
      const role = msg.role === 'human' ? 'user' : 'assistant'
      const content = getMessageText(msg.content)
      if (!content) continue
      engine.ingest(role, content, i + 1)
    }

    // Save to disk
    await engine.save()

    const stats = engine.getStats()
    const compressionRatio =
      stats.compressedChars > 0
        ? (stats.rawCharsIngested / stats.compressedChars).toFixed(2)
        : '0.00'

    const output = [
      'Context compression complete.',
      '',
      `Turns processed: ${stats.totalTurns}`,
      `Raw chars ingested: ${stats.rawCharsIngested}`,
      `Compressed chars: ${stats.compressedChars}`,
      `Compression ratio: ${compressionRatio}x`,
      '',
      'Slot counts:',
      `  Decisions: ${stats.decisions}`,
      `  Constraints: ${stats.constraints}`,
      `  Tasks: ${stats.tasks}`,
      `  Facts: ${stats.facts}`,
      `  Anchors: ${stats.anchors}`,
      `  Errors: ${stats.errors}`,
      '',
      'Generated files:',
      `  ${engine.outputPythonPath}`,
      `  ${engine.outputHistoryPath}`,
      `  ${engine.outputMetricsPath}`,
      `  ${engine.outputJsonPath}`,
    ].join('\n')

    return {
      type: 'text' as const,
      value: output,
    }
  } catch (error) {
    return {
      type: 'text' as const,
      value: `Context compression failed: ${errorMessage(error)}`,
    }
  }
}
