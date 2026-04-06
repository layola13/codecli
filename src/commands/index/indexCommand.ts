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
import { buildCodeIndex } from '../../indexing/build.js'
import { formatStartupIndexProgress } from '../../indexing/startupIndex.js'
import type { LocalCommandCall } from '../../types/command.js'
import { getCwd } from '../../utils/cwd.js'
import { errorMessage } from '../../utils/errors.js'
import { escapeXml } from '../../utils/xml.js'
import { parseIndexArgs } from './args.js'

const USAGE = [
  'Usage: /index [path] [--output DIR] [--max-file-bytes N] [--max-files N] [--workers N] [--ignore-dir NAME]',
  '',
  'Examples:',
  '  /index',
  '  /index src',
  '  /index . --output .code_index',
  '  /index --max-file-bytes 1048576',
  '  /index . --workers 8',
  '  /index . --max-files 20000 --ignore-dir ThirdParty',
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

function formatResult(args: {
  result: Awaited<ReturnType<typeof buildCodeIndex>>
}): string {
  const { manifest, outputDir, rootDir, skillPaths, timings } = args.result
  const languageSummary = Object.entries(manifest.languages)
    .map(([language, count]) => `${language}: ${count}`)
    .join(' | ')

  return [
    'Code index build complete.',
    `Engine: ${args.result.engine}`,
    `Workers: ${args.result.parseWorkers}`,
    `Incremental: reused ${args.result.incremental.cacheHits} | parsed ${args.result.incremental.cacheMisses} | removed ${args.result.incremental.removedFiles}`,
    `Duration: ${formatDuration(timings.totalMs)}`,
    `Phases: discover ${formatDuration(timings.discoverMs)} | parse ${formatDuration(timings.parseMs)} | emit ${formatDuration(timings.emitSkeletonMs)} | edges ${formatDuration(timings.buildEdgesMs)} | write ${formatDuration(timings.writeIndexFilesMs)} | skills ${formatDuration(timings.writeSkillsMs)}`,
    `Root: ${rootDir}`,
    `Output: ${outputDir}`,
    `Modules: ${manifest.moduleCount}`,
    `Classes: ${manifest.classCount}`,
    `Functions: ${manifest.functionCount}`,
    `Methods: ${manifest.methodCount}`,
    `Edges: ${manifest.edgeCount}`,
    `File limit: ${manifest.fileLimit ?? 'none'}${manifest.fileLimitReached ? ' (reached)' : ''}`,
    `Truncated files: ${manifest.truncatedCount}`,
    `Languages: ${languageSummary || 'none'}`,
    '',
    'Generated:',
    `- ${join(outputDir, 'index', 'architecture.dot')}  (file-level dependency map)`,
    `- ${join(outputDir, '__index__.py')}  (entry points, top dirs, hot symbols)`,
    `- ${join(outputDir, 'index', 'summary.md')}`,
    `- ${join(outputDir, 'index', 'manifest.json')}`,
    `- ${join(outputDir, 'skeleton')}`,
    `- ${skillPaths.claude}`,
    `- ${skillPaths.codex}`,
    `- ${skillPaths.opencode}`,
  ].join('\n')
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) {
    return `${Math.round(durationMs)}ms`
  }

  const seconds = durationMs / 1000
  const precision = seconds >= 10 ? 1 : 2
  return `${seconds.toFixed(precision)}s (${Math.round(durationMs)}ms)`
}

function wrapLocalCommandOutput(
  content: string,
  tag: string = LOCAL_COMMAND_STDOUT_TAG,
): string {
  return `<${tag}>${escapeXml(content)}</${tag}>`
}

export const call: LocalCommandCall = async (args, context) => {
  const parsed = parseIndexArgs(args)
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
    : resolve(rootDir, '.code_index')

  try {
    const fileStat = await stat(rootDir)
    if (!fileStat.isDirectory()) {
      return {
        type: 'text',
        value: `Index root is not a directory: ${rootDir}`,
      }
    }
  } catch (error) {
    return {
      type: 'text',
      value: `Cannot access index root: ${errorMessage(error)}`,
    }
  }

  const progressMessage = createCommandInputMessage(
    wrapLocalCommandOutput('Indexing project: starting…'),
  )
  context.setMessages((prev) => [
    ...prev,
    createCommandInputMessage(formatCommandInputTags('index', args)),
    progressMessage,
  ])

  const updateProgress = (
    content: string,
    tag: string = LOCAL_COMMAND_STDOUT_TAG,
  ): void => {
    context.setMessages((prev) =>
      prev.map((message) =>
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
    context.setMessages((prev) => [
      ...prev,
      createCommandInputMessage(wrapLocalCommandOutput(content)),
    ])
  }

  try {
    const result = await buildCodeIndex({
      ignoredDirNames: parsed.ignoredDirNames,
      maxFiles: parsed.maxFiles,
      rootDir,
      outputDir,
      maxFileBytes: parsed.maxFileBytes,
      onProgress(progress) {
        updateProgress(formatStartupIndexProgress(progress))
      },
      workers: parsed.workers,
    })

    let skillRefreshWarning: string | null = null
    try {
      const { refreshCodeIndexSkillRuntime } = await import(
        './refreshCodeIndexSkillRuntime.js'
      )
      await refreshCodeIndexSkillRuntime()
    } catch (error) {
      skillRefreshWarning = `Code-index skill refresh skipped: ${errorMessage(error)}`
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
      `Code index build failed: ${errorMessage(error)}`,
      LOCAL_COMMAND_STDERR_TAG,
    )
    return {
      type: 'skip',
    }
  }
}
