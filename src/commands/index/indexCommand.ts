import { stat } from 'fs/promises'
import { join, resolve } from 'path'
import { buildCodeIndex } from '../../indexing/build.js'
import type { LocalCommandCall } from '../../types/command.js'
import { getCwd } from '../../utils/cwd.js'
import { errorMessage } from '../../utils/errors.js'
import { parseIndexArgs } from './args.js'

const USAGE = [
  'Usage: /index [path] [--output DIR] [--max-file-bytes N]',
  '',
  'Examples:',
  '  /index',
  '  /index src',
  '  /index . --output .code_index',
  '  /index --max-file-bytes 1048576',
].join('\n')

function formatResult(args: {
  outputDir: string
  rootDir: string
  manifest: Awaited<ReturnType<typeof buildCodeIndex>>['manifest']
  skillPaths: Awaited<ReturnType<typeof buildCodeIndex>>['skillPaths']
}): string {
  const languageSummary = Object.entries(args.manifest.languages)
    .map(([language, count]) => `${language}: ${count}`)
    .join(' | ')

  return [
    'Code index build complete.',
    `Root: ${args.rootDir}`,
    `Output: ${args.outputDir}`,
    `Modules: ${args.manifest.moduleCount}`,
    `Classes: ${args.manifest.classCount}`,
    `Functions: ${args.manifest.functionCount}`,
    `Methods: ${args.manifest.methodCount}`,
    `Edges: ${args.manifest.edgeCount}`,
    `Truncated files: ${args.manifest.truncatedCount}`,
    `Languages: ${languageSummary || 'none'}`,
    '',
    'Generated:',
    `- ${join(args.outputDir, '__index__.py')}  (entry points, top dirs, hot symbols)`,
    `- ${join(args.outputDir, 'index', 'summary.md')}`,
    `- ${join(args.outputDir, 'index', 'manifest.json')}`,
    `- ${join(args.outputDir, 'skeleton')}`,
    `- ${args.skillPaths.claude}`,
    `- ${args.skillPaths.codex}`,
    `- ${args.skillPaths.opencode}`,
  ].join('\n')
}

export const call: LocalCommandCall = async args => {
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

  try {
    const result = await buildCodeIndex({
      rootDir,
      outputDir,
      maxFileBytes: parsed.maxFileBytes,
    })

    return {
      type: 'text',
      value: formatResult({
        manifest: result.manifest,
        outputDir: result.outputDir,
        rootDir: result.rootDir,
        skillPaths: result.skillPaths,
      }),
    }
  } catch (error) {
    return {
      type: 'text',
      value: `Code index build failed: ${errorMessage(error)}`,
    }
  }
}
