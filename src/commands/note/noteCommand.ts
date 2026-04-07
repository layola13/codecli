import { randomUUID } from 'crypto'
import { stat } from 'fs/promises'
import { dirname, resolve } from 'path'
import React, { type ReactNode } from 'react'
import {
  COMMAND_ARGS_TAG,
  COMMAND_MESSAGE_TAG,
  COMMAND_NAME_TAG,
  LOCAL_COMMAND_STDERR_TAG,
  LOCAL_COMMAND_STDOUT_TAG,
} from '../../constants/xml.js'
import { Select } from '../../components/CustomSelect/select.js'
import { Dialog } from '../../components/design-system/Dialog.js'
import { Box, Text } from '../../ink.js'
import { analyzeNoteBookWithAgent } from '../../note/agentAnalysis.js'
import { buildNoteSkeleton } from '../../note/build.js'
import type { ToolUseContext } from '../../Tool.js'
import type {
  LocalCommandCall,
  LocalJSXCommandCall,
  LocalJSXCommandContext,
  LocalJSXCommandOnDone,
} from '../../types/command.js'
import { getCwd } from '../../utils/cwd.js'
import { errorMessage } from '../../utils/errors.js'
import { escapeXml } from '../../utils/xml.js'
import { parseNoteArgs, type NoteInputFormat } from './args.js'

const USAGE = [
  'Usage: /note [path] [--format txt|pdf|md] [--output DIR]',
  '',
  'Examples:',
  '  /note',
  '  /note demo/word2vec/按书名章节拆分 --format txt',
  '  /note book.pdf --format pdf',
  '  /note notes.md --format md --output .note_index',
].join('\n')

const NOTE_FORMAT_OPTIONS: Array<{
  label: string
  value: NoteInputFormat
  description: string
}> = [
  { label: 'txt', value: 'txt', description: 'Use plain text chapter files' },
  { label: 'pdf', value: 'pdf', description: 'Use PDF source files' },
  { label: 'md', value: 'md', description: 'Use Markdown source files' },
]

function createCommandInputMessage(content: string) {
  return {
    type: 'system' as const,
    subtype: 'local_command' as const,
    content,
    level: 'info' as const,
    timestamp: new Date().toISOString(),
    uuid: randomUUID(),
    isMeta: false,
  }
}

function formatCommandInputTags(commandName: string, args: string): string {
  return `<${COMMAND_NAME_TAG}>/${commandName}</${COMMAND_NAME_TAG}>
            <${COMMAND_MESSAGE_TAG}>${commandName}</${COMMAND_MESSAGE_TAG}>
            <${COMMAND_ARGS_TAG}>${args}</${COMMAND_ARGS_TAG}>`
}

function wrapLocalCommandOutput(
  content: string,
  tag: string = LOCAL_COMMAND_STDOUT_TAG,
): string {
  return `<${tag}>${escapeXml(content)}</${tag}>`
}

function hasAgentAnalysisContext(
  context: Parameters<LocalCommandCall>[1],
): boolean {
  const toolContext = context as Partial<ToolUseContext>
  const options = toolContext.options as Partial<ToolUseContext['options']> | undefined
  return Boolean(
    options?.tools &&
      typeof options.mainLoopModel === 'string' &&
      Array.isArray(options.mcpClients),
  )
}

function formatResult(args: {
  result: Awaited<ReturnType<typeof buildNoteSkeleton>>
  agentEnabled: boolean
}): string {
  const { result, agentEnabled } = args

  return [
    'Note skeleton build complete.',
    `Engine: ${result.engine}`,
    `Format: ${result.format}`,
    `Input kind: ${result.sourceKind}`,
    `Root: ${result.rootPath}`,
    `Output: ${result.outputDir}`,
    `Books: ${result.bookCount}`,
    `Source files: ${result.sourceFileCount}`,
    `Chapters: ${result.chapterCount}`,
    `Roles: ${result.roleCount}`,
    `Relations: ${result.relationCount}`,
    `Events: ${result.eventCount}`,
    `Places: ${result.placeCount}`,
    `Factions: ${result.factionCount}`,
    `Abilities: ${result.abilityCount}`,
    `Timelines: ${result.timelineCount}`,
    '',
    'Generated:',
    `- ${result.outputDir}/manifest.py`,
    `- ${result.outputDir}/book.py`,
    `- ${result.outputDir}/books/`,
    `- ${result.outputDir}/indexes/`,
    `- ${result.outputDir}/graph/`,
    '',
    result.engine === 'agent'
      ? 'Note: internal Claude Code agent analysis was used to fill graph refs.'
      : agentEnabled
        ? 'Note: internal agent analysis returned no usable graph; scaffold fallback was used.'
        : 'Note: this is the scaffold phase. Agent-driven deep graph extraction is the next layer.',
  ].join('\n')
}

type NoteRunInput = {
  rootPath: string
  outputDir?: string
  format: NoteInputFormat
}

async function runNoteBuild(
  context: LocalJSXCommandContext,
  args: string,
  input: NoteRunInput,
): Promise<void> {
  const cwd = getCwd()
  const rootPath = resolve(cwd, input.rootPath)

  let rootStat
  try {
    rootStat = await stat(rootPath)
  } catch (error) {
    throw new Error(`Cannot access note input: ${errorMessage(error)}`)
  }

  if (!rootStat.isDirectory() && !rootStat.isFile()) {
    throw new Error(`Unsupported note input: ${rootPath}`)
  }

  const outputDir = input.outputDir
    ? resolve(cwd, input.outputDir)
    : resolve(rootStat.isDirectory() ? rootPath : dirname(rootPath), '.note_index')
  const agentEnabled = hasAgentAnalysisContext(context)

  const progressMessage = createCommandInputMessage(
    wrapLocalCommandOutput(
      agentEnabled
        ? 'Building note skeleton: starting agent analysis…'
        : 'Building note skeleton: starting…',
    ),
  )
  context.setMessages(prev => [
    ...prev,
    createCommandInputMessage(formatCommandInputTags('note', args)),
    progressMessage,
  ])

  const updateProgress = (
    content: string,
    tag: string = LOCAL_COMMAND_STDOUT_TAG,
  ): void => {
    context.setMessages(prev =>
      prev.map(message =>
        message.uuid === progressMessage.uuid
          ? {
              ...message,
              content: wrapLocalCommandOutput(content, tag),
            }
          : message,
      ),
    )
  }

  const appendOutput = (content: string): void => {
    context.setMessages(prev => [
      ...prev,
      createCommandInputMessage(wrapLocalCommandOutput(content)),
    ])
  }

  try {
    const result = await buildNoteSkeleton({
      rootPath,
      outputDir,
      format: input.format,
      analyzeBook: agentEnabled
        ? async analysisInput =>
            analyzeNoteBookWithAgent({
              context: context as ToolUseContext,
              input: analysisInput,
            })
        : undefined,
      onProgress(message) {
        updateProgress(`Building note skeleton: ${message}`)
      },
    })

    appendOutput(
      formatResult({
        result,
        agentEnabled,
      }),
    )
  } catch (error) {
    updateProgress(
      `Note skeleton build failed: ${errorMessage(error)}`,
      LOCAL_COMMAND_STDERR_TAG,
    )
  }
}

function NoteFormatPicker(args: {
  onDone: LocalJSXCommandOnDone
  context: LocalJSXCommandContext
  rawArgs: string
  rootPath: string
  outputDir?: string
}): ReactNode {
  const { onDone, context, rawArgs, rootPath, outputDir } = args

  const handleSelect = (format: NoteInputFormat): void => {
    void runNoteBuild(context, rawArgs, {
      rootPath,
      outputDir,
      format,
    }).finally(() => {
      onDone(undefined, { display: 'skip' })
    })
  }

  const handleCancel = (): void => {
    onDone('Note build cancelled', { display: 'system' })
  }

  return React.createElement(
    Dialog,
    {
      title: 'Choose note format',
      subtitle: 'Select the source format for the novel files.',
      onCancel: handleCancel,
      color: 'info',
    },
    React.createElement(
      Box,
      { flexDirection: 'column', gap: 1 },
      React.createElement(Text, { dimColor: true }, 'Default: txt'),
      React.createElement(Select, {
        options: NOTE_FORMAT_OPTIONS,
        defaultValue: 'txt',
        defaultFocusValue: 'txt',
        onChange: handleSelect,
      }),
    ),
  )
}

function renderNoteFormatPicker(args: {
  onDone: LocalJSXCommandOnDone
  context: LocalJSXCommandContext
  rawArgs: string
  rootPath: string
  outputDir?: string
}): ReactNode {
  return React.createElement(NoteFormatPicker, args)
}

export const call: LocalJSXCommandCall = async (onDone, context, args) => {
  const parsed = parseNoteArgs(args)
  if (parsed.kind === 'help') {
    onDone(USAGE)
    return null
  }

  if (parsed.kind === 'error') {
    onDone(`${parsed.message}\n\n${USAGE}`)
    return null
  }

  if (parsed.format) {
    void runNoteBuild(context, args, {
      rootPath: parsed.rootPath,
      outputDir: parsed.outputDir,
      format: parsed.format,
    }).finally(() => {
      onDone(undefined, { display: 'skip' })
    })
    return null
  }

  if (context.options.isNonInteractiveSession) {
    void runNoteBuild(context, args, {
      rootPath: parsed.rootPath,
      outputDir: parsed.outputDir,
      format: 'txt',
    }).finally(() => {
      onDone(undefined, { display: 'skip' })
    })
    return null
  }

  return renderNoteFormatPicker({
    onDone,
    context,
    rawArgs: args,
    rootPath: parsed.rootPath,
    outputDir: parsed.outputDir,
  })
}

export const nonInteractiveCall: LocalCommandCall = async (args, context) => {
  const parsed = parseNoteArgs(args)
  if (parsed.kind === 'help') {
    return {
      type: 'text',
      value: USAGE,
    }
  }

  if (parsed.kind === 'error') {
    return {
      type: 'text',
      value: `${parsed.message}\n\n${USAGE}`,
    }
  }

  await runNoteBuild(context, args, {
    rootPath: parsed.rootPath,
    outputDir: parsed.outputDir,
    format: parsed.format ?? 'txt',
  })

  return {
    type: 'skip',
  }
}
