import { execFileSync } from 'child_process'
import { mkdir, readFile, rm, stat, writeFile } from 'fs/promises'
import { homedir } from 'os'
import { join, relative, resolve } from 'path'
import { call as compressStatusCall } from '../compress-status/compress-status.js'
import { call as compressCall } from '../compress/compress.js'
import { buildCodeIndex } from '../../indexing/build.js'
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

const AUTO_MEMORY_DISABLED_MESSAGE =
  'Pinned facts are unavailable because auto memory is disabled for this session.'
const PINNED_FACTS_FILENAME = 'PINNED.md'
const PINNED_FACTS_HEADER = '# Pinned Facts'
const PINNED_FACTS_EMPTY_HINT =
  '<!-- No pinned facts yet. Use /pin <text> to add one. -->'
const PINNED_FACTS_SKILL_NAME = 'pinned-facts'
const MAX_SANITIZED_LENGTH = 200

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isEnvTruthy(value: string | undefined): boolean {
  if (!value) return false
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase().trim())
}

function isEnvDefinedFalsy(value: string | undefined): boolean {
  if (!value) return false
  return ['0', 'false', 'no', 'off'].includes(value.toLowerCase().trim())
}

function isAutoMemoryEnabled(): boolean {
  const envVal = process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY
  if (isEnvTruthy(envVal)) {
    return false
  }
  if (isEnvDefinedFalsy(envVal)) {
    return true
  }
  if (isEnvTruthy(process.env.CLAUDE_CODE_SIMPLE)) {
    return false
  }
  if (
    isEnvTruthy(process.env.CLAUDE_CODE_REMOTE) &&
    !process.env.CLAUDE_CODE_REMOTE_MEMORY_DIR
  ) {
    return false
  }
  return true
}

function simpleHash(input: string): string {
  let hash = 5381
  for (const char of input) {
    hash = ((hash << 5) + hash + char.charCodeAt(0)) >>> 0
  }
  return hash.toString(36)
}

function sanitizePath(value: string): string {
  const sanitized = value.replace(/[^a-zA-Z0-9]/g, '-')
  if (sanitized.length <= MAX_SANITIZED_LENGTH) {
    return sanitized
  }
  return `${sanitized.slice(0, MAX_SANITIZED_LENGTH)}-${simpleHash(value)}`
}

function getProjectRoot(): string {
  try {
    const gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    if (gitRoot) {
      return gitRoot.normalize('NFC')
    }
  } catch {
    // Fall back to the current working directory outside git repos.
  }
  return process.cwd().normalize('NFC')
}

function getPinnedFactsPath(): string {
  const memoryBase =
    process.env.CLAUDE_CODE_REMOTE_MEMORY_DIR ??
    process.env.CLAUDE_CONFIG_DIR ??
    join(homedir(), '.claude')
  return join(
    memoryBase,
    'projects',
    sanitizePath(getProjectRoot()),
    'memory',
    PINNED_FACTS_FILENAME,
  )
}

function toPosixPath(value: string): string {
  return value.replaceAll('\\', '/')
}

function formatProjectPath(rootDir: string, targetPath: string): string {
  const relativePath = toPosixPath(relative(rootDir, targetPath))
  if (!relativePath) {
    return '.'
  }
  if (
    relativePath === '..' ||
    relativePath.startsWith('../') ||
    relativePath.startsWith('/')
  ) {
    return toPosixPath(targetPath)
  }
  return `./${relativePath}`
}

type PinnedFactSkillPaths = {
  claude: string
  codex: string
}

function getPinnedFactSkillPaths(rootDir = getProjectRoot()): PinnedFactSkillPaths {
  return {
    claude: join(
      rootDir,
      '.claude',
      'skills',
      PINNED_FACTS_SKILL_NAME,
      'SKILL.md',
    ),
    codex: join(
      rootDir,
      '.codex',
      'skills',
      PINNED_FACTS_SKILL_NAME,
      'SKILL.md',
    ),
  }
}

function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n?/g, '\n')
}

function normalizePinnedFact(text: string): string {
  return normalizeLineEndings(text).trim()
}

function normalizePinnedFactForCompare(text: string): string {
  return normalizePinnedFact(text).toLowerCase()
}

function dedupePinnedFacts(facts: readonly string[]): string[] {
  const seen = new Set<string>()
  const deduped: string[] = []

  for (const fact of facts) {
    const normalized = normalizePinnedFact(fact)
    if (!normalized) continue
    const compareKey = normalizePinnedFactForCompare(normalized)
    if (seen.has(compareKey)) continue
    seen.add(compareKey)
    deduped.push(normalized)
  }

  return deduped
}

function parsePinnedFactsContent(content: string): string[] {
  const facts: string[] = []

  for (const line of normalizeLineEndings(content).split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('- ') && !trimmed.startsWith('* ')) {
      continue
    }
    const fact = normalizePinnedFact(trimmed.slice(2))
    if (fact) {
      facts.push(fact)
    }
  }

  return dedupePinnedFacts(facts)
}

function renderPinnedFactsContent(facts: readonly string[]): string {
  const deduped = dedupePinnedFacts(facts)
  const lines = [
    PINNED_FACTS_HEADER,
    '',
    'Project-scoped facts explicitly pinned by the user.',
    'Treat these as high-priority stable references for this repository.',
    'Prefer them before re-discovering the same facts. If one appears stale or inaccessible, call that out and ask before replacing it.',
    'Ignore them only if the user explicitly says to ignore pinned facts or removes them with /unpin.',
    '',
    ...(deduped.length > 0
      ? deduped.map(fact => `- ${fact}`)
      : [PINNED_FACTS_EMPTY_HINT]),
  ]

  return `${lines.join('\n')}\n`
}

function renderPinnedFactsSkill(args: {
  description: string
  name: string
  facts: readonly string[]
  pinnedFactsPath: string
  rootDir: string
}): string {
  const memoryPath = formatProjectPath(args.rootDir, args.pinnedFactsPath)
  const deduped = dedupePinnedFacts(args.facts)

  return [
    '---',
    `name: ${args.name}`,
    `description: ${args.description}`,
    '---',
    '',
    '# Pinned Facts',
    '',
    '## Instructions',
    '- Treat these pinned facts as high-priority stable project references.',
    '- Prefer them before rerunning filesystem scans, registry lookups, or other rediscovery steps.',
    '- If a fact appears stale, inaccessible, or contradictory, say so before replacing it.',
    `- Source of truth: \`${memoryPath}\`. Update with \`/pin\` and \`/unpin\`.`,
    '',
    '## Facts',
    '',
    ...deduped.map(fact => `- ${fact}`),
    '',
  ].join('\n')
}

async function readPinnedFacts(): Promise<string[]> {
  if (!isAutoMemoryEnabled()) {
    return []
  }

  try {
    const content = await readFile(getPinnedFactsPath(), 'utf8')
    return parsePinnedFactsContent(content)
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error.code === 'ENOENT' || error.code === 'EISDIR')
    ) {
      return []
    }
    throw error
  }
}

async function writePinnedFacts(facts: readonly string[]): Promise<void> {
  const path = getPinnedFactsPath()
  await mkdir(resolve(path, '..'), { recursive: true })
  await writeFile(path, renderPinnedFactsContent(facts), 'utf8')
}

async function syncPinnedFactSkills(
  facts: readonly string[],
  path: string,
): Promise<PinnedFactSkillPaths> {
  const rootDir = getProjectRoot()
  const skillPaths = getPinnedFactSkillPaths(rootDir)

  if (facts.length === 0) {
    await rm(join(rootDir, '.claude', 'skills', PINNED_FACTS_SKILL_NAME), {
      recursive: true,
      force: true,
    })
    await rm(join(rootDir, '.codex', 'skills', PINNED_FACTS_SKILL_NAME), {
      recursive: true,
      force: true,
    })
    return skillPaths
  }

  await mkdir(join(rootDir, '.claude', 'skills', PINNED_FACTS_SKILL_NAME), {
    recursive: true,
  })
  await mkdir(join(rootDir, '.codex', 'skills', PINNED_FACTS_SKILL_NAME), {
    recursive: true,
  })

  await writeFile(
    skillPaths.claude,
    renderPinnedFactsSkill({
      name: PINNED_FACTS_SKILL_NAME,
      description:
        'Use these project-pinned facts before rediscovering paths, tools, or other stable repository-specific details.',
      facts,
      pinnedFactsPath: path,
      rootDir,
    }),
    'utf8',
  )

  await writeFile(
    skillPaths.codex,
    renderPinnedFactsSkill({
      name: PINNED_FACTS_SKILL_NAME,
      description:
        'Use these project-pinned facts before rediscovering paths, tools, or other stable repository-specific details.',
      facts,
      pinnedFactsPath: path,
      rootDir,
    }),
    'utf8',
  )

  return skillPaths
}

function formatPinnedFactsLocations(args: {
  path: string
  skillPaths: PinnedFactSkillPaths
}): string[] {
  return [
    `File: ${args.path}`,
    'Project skill files:',
    `- ${args.skillPaths.claude}`,
    `- ${args.skillPaths.codex}`,
  ]
}

function formatPinnedFactsList(
  facts: readonly string[],
  path: string,
  skillPaths: PinnedFactSkillPaths,
): string {
  if (facts.length === 0) {
    return [
      'No pinned facts saved for this project.',
      'Use "/pin <text>" to add one.',
      ...formatPinnedFactsLocations({
        path,
        skillPaths,
      }),
    ].join('\n')
  }

  return [
    `Pinned facts for this project (${facts.length}):`,
    ...facts.map((fact, index) => `${index + 1}. ${fact}`),
    '',
    'Use "/pin <text>" to add another or "/unpin <text>" to remove one.',
    ...formatPinnedFactsLocations({
      path,
      skillPaths,
    }),
  ].join('\n')
}

function countPinnedFactMatches(
  facts: readonly string[],
  rawQuery: string,
): {
  matches: string[]
  normalizedQuery: string
} {
  const normalizedQuery = normalizePinnedFact(rawQuery)
  const compareKey = normalizePinnedFactForCompare(normalizedQuery)
  const exactMatches = facts.filter(
    fact => normalizePinnedFactForCompare(fact) === compareKey,
  )

  return {
    matches:
      exactMatches.length > 0
        ? exactMatches
        : facts.filter(fact =>
            normalizePinnedFactForCompare(fact).includes(compareKey),
          ),
    normalizedQuery,
  }
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
    `Incremental: reused ${args.result.incremental.cacheHits} | parsed ${args.result.incremental.cacheMisses}`,
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

async function indexCall(args: string) {
  const parsed = parseIndexArgs(args)
  if (parsed.kind === 'help') {
    return {
      type: 'text' as const,
      value: USAGE,
    }
  }

  if (parsed.kind === 'error') {
    return {
      type: 'text' as const,
      value: `${parsed.message}\n\n${USAGE}`,
    }
  }

  const cwd = process.cwd()
  const rootDir = resolve(cwd, parsed.rootDir)
  const outputDir = parsed.outputDir
    ? resolve(cwd, parsed.outputDir)
    : resolve(rootDir, '.code_index')

  try {
    const fileStat = await stat(rootDir)
    if (!fileStat.isDirectory()) {
      return {
        type: 'text' as const,
        value: `Index root is not a directory: ${rootDir}`,
      }
    }
  } catch (error) {
    return {
      type: 'text' as const,
      value: `Cannot access index root: ${errorMessage(error)}`,
    }
  }

  try {
    const result = await buildCodeIndex({
      ignoredDirNames: parsed.ignoredDirNames,
      maxFiles: parsed.maxFiles,
      rootDir,
      outputDir,
      maxFileBytes: parsed.maxFileBytes,
      workers: parsed.workers,
    })

    return {
      type: 'text' as const,
      value: formatResult({ result }),
    }
  } catch (error) {
    return {
      type: 'text' as const,
      value: `Code index build failed: ${errorMessage(error)}`,
    }
  }
}

async function pinCall(args: string) {
  if (!isAutoMemoryEnabled()) {
    return {
      type: 'text' as const,
      value: AUTO_MEMORY_DISABLED_MESSAGE,
    }
  }

  const rawFact = args.trim()
  const path = getPinnedFactsPath()

  if (!rawFact) {
    const facts = await readPinnedFacts()
    const skillPaths = await syncPinnedFactSkills(facts, path)
    return {
      type: 'text' as const,
      value: formatPinnedFactsList(facts, path, skillPaths),
    }
  }

  const fact = normalizePinnedFact(rawFact)
  if (!fact) {
    return {
      type: 'text' as const,
      value: 'Pinned fact cannot be empty.',
    }
  }

  try {
    const facts = await readPinnedFacts()
    const exists = facts.find(
      current =>
        normalizePinnedFactForCompare(current) ===
        normalizePinnedFactForCompare(fact),
    )

    if (exists) {
      const skillPaths = await syncPinnedFactSkills(facts, path)
      return {
        type: 'text' as const,
        value: [
          'Pinned fact already exists for this project:',
          `- ${exists}`,
          '',
          ...formatPinnedFactsLocations({
            path,
            skillPaths,
          }),
        ].join('\n'),
      }
    }

    const nextFacts = [...facts, fact]
    await writePinnedFacts(nextFacts)
    const skillPaths = await syncPinnedFactSkills(nextFacts, path)
    return {
      type: 'text' as const,
      value: [
        'Pinned fact saved for this project:',
        `- ${fact}`,
        '',
        ...formatPinnedFactsLocations({
          path,
          skillPaths,
        }),
      ].join('\n'),
    }
  } catch (error) {
    return {
      type: 'text' as const,
      value: `Error updating pinned facts: ${errorMessage(error)}`,
    }
  }
}

async function unpinCall(args: string) {
  if (!isAutoMemoryEnabled()) {
    return {
      type: 'text' as const,
      value: AUTO_MEMORY_DISABLED_MESSAGE,
    }
  }

  const query = args.trim()
  if (!query) {
    return {
      type: 'text' as const,
      value: 'Usage: /unpin <text>',
    }
  }

  try {
    const facts = await readPinnedFacts()
    const path = getPinnedFactsPath()
    const { matches, normalizedQuery } = countPinnedFactMatches(facts, query)

    if (!normalizedQuery) {
      return {
        type: 'text' as const,
        value: 'Pinned fact match text cannot be empty.',
      }
    }

    if (matches.length === 0) {
      return {
        type: 'text' as const,
        value: `No pinned fact matched "${query}".\nFile: ${path}`,
      }
    }

    const removed = matches[0]
    let removedOnce = false
    const remainingFacts = facts.filter(fact => {
      if (removedOnce || fact !== removed) {
        return true
      }
      removedOnce = true
      return false
    })

    await writePinnedFacts(remainingFacts)
    const skillPaths = await syncPinnedFactSkills(remainingFacts, path)

    return {
      type: 'text' as const,
      value: [
        'Removed pinned fact:',
        `- ${removed}`,
        ...(matches.length > 1
          ? [
              '',
              `${matches.length} pinned facts matched "${query}"; removed the first exact or substring match.`,
            ]
          : []),
        '',
        `Remaining pinned facts: ${remainingFacts.length}`,
        ...(remainingFacts.length === 0
          ? ['Project pinned-facts skills removed.', '']
          : []),
        ...formatPinnedFactsLocations({
          path,
          skillPaths,
        }),
      ].join('\n'),
    }
  } catch (error) {
    return {
      type: 'text' as const,
      value: `Error updating pinned facts: ${errorMessage(error)}`,
    }
  }
}

export const indexBuiltinCommand = {
  type: 'local' as const,
  name: 'index',
  description:
    'Build a codebase structure index, file dependency DOT, and Python skeleton under .code_index',
  argumentHint:
    '[path] [--output DIR] [--max-file-bytes N] [--max-files N] [--ignore-dir NAME]',
  supportsNonInteractive: true,
  disableModelInvocation: true,
  load: async () => ({
    call: indexCall,
  }),
}

export const pinBuiltinCommand = {
  type: 'local' as const,
  name: 'pin',
  description: 'Add or inspect project-scoped pinned facts',
  argumentHint: '[text]',
  supportsNonInteractive: true,
  disableModelInvocation: true,
  load: async () => ({
    call: pinCall,
  }),
}

export const unpinBuiltinCommand = {
  type: 'local' as const,
  name: 'unpin',
  aliases: ['upin'],
  description: 'Remove a project-scoped pinned fact',
  argumentHint: '<text>',
  supportsNonInteractive: true,
  disableModelInvocation: true,
  load: async () => ({
    call: unpinCall,
  }),
}

export const compressBuiltinCommand = {
  type: 'local' as const,
  name: 'compress',
  description:
    'Compress conversation context into structured session state (.py + .json)',
  argumentHint: '',
  supportsNonInteractive: true,
  disableModelInvocation: true,
  load: async () => ({
    call: compressCall,
  }),
}

export const compressStatusBuiltinCommand = {
  type: 'local' as const,
  name: 'compress-status',
  description:
    'Show saved context compression stats from .claude/context/session_state.{py,json} and related history/metrics files',
  argumentHint: '',
  supportsNonInteractive: true,
  disableModelInvocation: true,
  load: async () => ({
    call: compressStatusCall,
  }),
}

export default [
  indexBuiltinCommand,
  pinBuiltinCommand,
  unpinBuiltinCommand,
  compressBuiltinCommand,
  compressStatusBuiltinCommand,
]
