import { randomUUID } from 'crypto'
import { stat } from 'fs/promises'
import { join, resolve } from 'path'
import {
  COMMAND_ARGS_TAG,
  COMMAND_MESSAGE_TAG,
  COMMAND_NAME_TAG,
  LOCAL_COMMAND_STDERR_TAG,
  LOCAL_COMMAND_STDOUT_TAG,
} from '../../constants/xml.js'
import type { ToolUseContext } from '../../Tool.js'
import { buildMemoryIndex } from '../../memoryIndex/build.js'
import type {
  MemoryIndexBuildProgress,
} from '../../memoryIndex/progress.js'
import type { LocalCommandCall } from '../../types/command.js'
import { getCwd } from '../../utils/cwd.js'
import { errorMessage } from '../../utils/errors.js'
import { escapeXml } from '../../utils/xml.js'
import { parseMemoryIndexArgs } from './args.js'

const USAGE = [
  'Usage: /memory-index [path] [--output DIR] [--max-transcripts N]',
  '',
  'Examples:',
  '  /memory-index',
  '  /memory-index .',
  '  /memory-index . --output .memory_index',
  '  /memory-index . --max-transcripts 200',
].join('\n')

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

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) {
    return `${Math.round(durationMs)}ms`
  }

  const seconds = durationMs / 1000
  const precision = seconds >= 10 ? 1 : 2
  return `${seconds.toFixed(precision)}s (${Math.round(durationMs)}ms)`
}

function formatProgress(progress: MemoryIndexBuildProgress): string {
  const ratio =
    progress.total && progress.total > 0 && progress.completed !== undefined
      ? ` (${Math.min(100, Math.round((progress.completed / progress.total) * 100))}%)`
      : ''
  return `Memory indexing project: ${progress.message}${ratio}`
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

function wrapLocalCommandOutput(
  content: string,
  tag: string = LOCAL_COMMAND_STDOUT_TAG,
): string {
  return `<${tag}>${escapeXml(content)}</${tag}>`
}

function formatResult(args: {
  result: Awaited<ReturnType<typeof buildMemoryIndex>>
}): string {
  const { result } = args
  const { manifest, timings, skillPaths } = result

  return [
    'Memory index build complete.',
    `Engine: ${result.engine}`,
    `Duration: ${formatDuration(timings.totalMs)}`,
    `Graph source: ${result.graphSource}`,
    `Phases: discover ${formatDuration(timings.discoverMs)} | extract ${formatDuration(timings.extractMs)} | diff ${formatDuration(timings.diffMs)} | analyze ${formatDuration(timings.analyzeMs)} | write ${formatDuration(timings.writeMs)} | skills ${formatDuration(timings.skillsMs)}`,
    `Root: ${result.rootDir}`,
    `Project transcript context: ${result.transcriptsDir}`,
    `Project file-history context: ${result.fileHistoryDir}`,
    `Codex sessions: ${result.codexSessionsDir}`,
    'Input source: ./.claude/projects/context/{transcripts,file-history} + matching ~/.codex/sessions for this project',
    `Output: ${result.outputDir}`,
    `Transcripts: ${manifest.transcriptCount}`,
    `Sessions: ${manifest.sessionCount}`,
    `User prompts: ${manifest.userPromptCount}`,
    `Plans: ${manifest.planCount}`,
    `Code edits: ${manifest.codeEditCount}`,
    `Memory objects: ${manifest.memoryObjectCount}`,
    `Files touched: ${manifest.fileCount}`,
    `Relations: ${manifest.edgeCount}`,
    `Max transcripts: ${manifest.maxTranscripts ?? 'none'}`,
    'Compressed summaries ignored as source of truth: .claude/context/session_state.py | .claude/context/session_history.py | .claude/context/session_metrics.py',
    '',
    'Generated:',
    `- ${join(result.outputDir, 'index', 'summary.md')}  (history overview)`,
    `- ${join(result.outputDir, 'project_memory_graph.py')}  (project-level relation map: constraints, preferences, plans, sessions, files, compact edit ranges)`,
    `- ${join(result.outputDir, 'skeleton', '__index__.py')}  (segment/topic Python skeleton index for targeted recall)`,
    `- ${join(result.outputDir, 'index', 'memory_graph.dot')}  (overview relation graph with topics/sessions/files/segments)`,
    `- ${join(result.outputDir, 'index', 'memory_graph.json')}  (normalized graph analysis used to generate the Python skeleton)`,
    `- ${join(result.outputDir, '__index__.py')}  (recent sessions, prompts, plans, code edits, hot files; previews only)`,
    `- ${join(result.outputDir, 'index', 'architecture.dot')}  (recent high-signal transcript/prompt/plan/edit/file graph)`,
    `- ${join(result.outputDir, 'index', 'sessions.dot')}  (overview session timeline; detailed shards live under index/dot/)`,
    `- ${join(result.outputDir, 'index', 'dot', 'manifest.json')}  (sharded DOT manifest for session/topic graphs)`,
    `- ${join(result.outputDir, 'index', 'events.jsonl')}  (source of truth: full user input, full plan text, code diffs/line ranges, and non-code before/after text when preserved)`,
    `- ${join(result.outputDir, 'index', 'memory_objects.jsonl')}  (derived semantic memory: user preferences, stable constraints, decision rationales, superseded decisions)`,
    `- ${join(result.outputDir, 'index', 'sessions.jsonl')}  (all session summaries for old-memory lookup)`,
    `- ${join(result.outputDir, 'index', 'edges.jsonl')}`,
    `- ${join(result.outputDir, 'index', 'transcripts.jsonl')}`,
    `- ${join(result.outputDir, 'index', 'manifest.json')}`,
    `- ${skillPaths.claude}`,
    `- ${skillPaths.codex}`,
    `- ${skillPaths.opencode}`,
  ].join('\n')
}

export const call: LocalCommandCall = async (args, context) => {
  const parsed = parseMemoryIndexArgs(args)
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

  const cwd = getCwd()
  const rootDir = resolve(cwd, parsed.rootDir)
  const outputDir = parsed.outputDir
    ? resolve(cwd, parsed.outputDir)
    : resolve(rootDir, '.memory_index')

  try {
    const fileStat = await stat(rootDir)
    if (!fileStat.isDirectory()) {
      return {
        type: 'text',
        value: `Memory-index root is not a directory: ${rootDir}`,
      }
    }
  } catch (error) {
    return {
      type: 'text',
      value: `Cannot access memory-index root: ${errorMessage(error)}`,
    }
  }

  const progressMessage = createCommandInputMessage(
    wrapLocalCommandOutput('Memory indexing project: starting…'),
  )
  context.setMessages(prev => [
    ...prev,
    createCommandInputMessage(formatCommandInputTags('memory-index', args)),
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
    const result = await buildMemoryIndex({
      rootDir,
      outputDir,
      maxTranscripts: parsed.maxTranscripts,
      analyzeGraph: hasAgentAnalysisContext(context)
        ? async input => {
            const { analyzeMemoryGraphWithAgent } = await import(
              '../../memoryIndex/agentGraphAnalysis.js'
            )
            return analyzeMemoryGraphWithAgent({
              context: context as ToolUseContext,
              input,
            })
          }
        : undefined,
      onProgress(progress) {
        updateProgress(formatProgress(progress))
      },
    })

    let skillRefreshWarning: string | null = null
    try {
      const { refreshMemoryIndexSkillRuntime } = await import(
        './refreshMemoryIndexSkillRuntime.js'
      )
      await refreshMemoryIndexSkillRuntime()
    } catch (error) {
      skillRefreshWarning = `Memory-index skill refresh skipped: ${errorMessage(error)}`
    }

    appendOutput(formatResult({ result }))
    if (skillRefreshWarning) {
      appendOutput(skillRefreshWarning)
    }

    return {
      type: 'skip',
    }
  } catch (error) {
    updateProgress(
      `Memory index build failed: ${errorMessage(error)}`,
      LOCAL_COMMAND_STDERR_TAG,
    )
    return {
      type: 'skip',
    }
  }
}
