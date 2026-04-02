import { promises as fs } from 'fs'
import { join } from 'path'
import { getSessionId } from '../../bootstrap/state.js'
import { getCompressionProjectRoot } from './paths.js'
import { atomicWrite } from './utils.js'

type SummaryContentBlock = {
  type?: string
  text?: string
  name?: string
  input?: unknown
  content?: string | readonly SummaryContentBlock[]
  is_error?: boolean
}

type SummarizableMessage = {
  type?: string
  role?: string
  isMeta?: boolean
  message?: {
    role?: string
    content?: string | readonly SummaryContentBlock[]
  }
  content?: string | readonly SummaryContentBlock[]
}

const SUMMARY_DIRNAME = 'tmp'

function formatSummaryDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatTimestamp(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

function toJsonFence(value: unknown): string {
  return `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``
}

function renderContent(
  content: string | readonly SummaryContentBlock[] | undefined,
): string {
  if (typeof content === 'string') {
    return content.trim()
  }

  if (!Array.isArray(content) || content.length === 0) {
    return ''
  }

  return content
    .map(block => {
      if (block?.type === 'text' && typeof block.text === 'string') {
        return block.text.trim()
      }

      if (block?.type === 'tool_use') {
        return [
          `Tool use: ${block.name || 'unknown'}`,
          toJsonFence(block.input ?? {}),
        ].join('\n')
      }

      if (block?.type === 'tool_result') {
        const parts = [
          `Tool result${block.is_error ? ' (error)' : ''}:`,
        ]
        const inner = renderContent(block.content)
        if (inner) {
          parts.push(inner)
        } else {
          parts.push(toJsonFence(block))
        }
        return parts.join('\n')
      }

      if (typeof block?.text === 'string') {
        return block.text.trim()
      }

      return toJsonFence(block)
    })
    .filter(Boolean)
    .join('\n\n')
}

function getMessageRole(message: SummarizableMessage): string {
  return (
    message.message?.role ||
    message.role ||
    message.type ||
    'unknown'
  )
}

function buildSummaryMarkdown(
  messages: readonly SummarizableMessage[],
  date: Date,
  projectRoot: string,
): string {
  const header = [
    '# Conversation Summary',
    '',
    `Generated at: ${formatTimestamp(date)}`,
    `Project root: ${projectRoot}`,
    `Session ID: ${getSessionId()}`,
    `Message count: ${messages.length}`,
    '',
  ]

  const body = messages
    .map((message, index) => {
      const role = getMessageRole(message)
      const content = renderContent(message.message?.content ?? message.content)
      const metaLine = message.isMeta ? '_Meta message: true_\n\n' : ''
      return [
        `## ${index + 1}. ${role}`,
        '',
        metaLine + (content || '_No textual content_'),
        '',
      ].join('\n')
    })
    .join('\n')

  return `${header.join('\n')}${body}`.trimEnd() + '\n'
}

export function getConversationSummaryPath(
  projectRoot: string = getCompressionProjectRoot(),
  date: Date = new Date(),
): string {
  return join(projectRoot, SUMMARY_DIRNAME, `summary_${formatSummaryDate(date)}.md`)
}

export async function persistConversationSummaryMarkdown(
  messages: readonly SummarizableMessage[],
  options: {
    projectRoot?: string
    date?: Date
  } = {},
): Promise<string | null> {
  if (messages.length === 0) {
    return null
  }

  const projectRoot = options.projectRoot || getCompressionProjectRoot()
  const date = options.date || new Date()
  const outputPath = getConversationSummaryPath(projectRoot, date)
  const content = buildSummaryMarkdown(messages, date, projectRoot)

  await fs.mkdir(join(projectRoot, SUMMARY_DIRNAME), { recursive: true })
  await atomicWrite(outputPath, content)

  return outputPath
}
