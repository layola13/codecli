import { createHash } from 'crypto'
import { createReadStream } from 'fs'
import {
  copyFile,
  mkdir,
  open,
  readdir,
  readFile,
  stat,
  writeFile,
} from 'fs/promises'
import { structuredPatch, type StructuredPatchHunk } from 'diff'
import { createInterface } from 'readline'
import { basename, dirname, extname, join, relative, resolve } from 'path'
import { getClaudeConfigHomeDir } from '../utils/envUtils.js'
import {
  getProjectDir,
  validateUuid,
} from '../utils/sessionStoragePortable.js'
import {
  getCodexSessionsDir,
  getProjectConversationFileHistoryDir,
  getProjectConversationTranscriptsDir,
  matchesProjectConversationRoot,
} from '../utils/projectConversationContext.js'
import { EXIT_PLAN_MODE_V2_TOOL_NAME } from '../tools/ExitPlanModeTool/constants.js'
import type {
  MemoryIndexBuildProgress,
  MemoryIndexProgressCallback,
} from './progress.js'
import {
  type MemoryIndexSkillPaths,
  writeMemoryIndexSkills,
} from './skillWriter.js'
import {
  buildMemoryObjects,
  countMemoryObjectsByKind,
  type MemoryObject,
} from './memoryObjects.js'
import {
  normalizeMemoryGraphAnalysis,
  renderMemoryGraphDot,
  type MemoryGraphAnalysis,
  type MemoryGraphAgentDraft,
  type MemoryGraphAnalysisInput,
  type MemoryGraphFileFact,
  type MemoryGraphMemoryFact,
  type MemoryGraphPlanFact,
  type MemoryGraphSegmentFact,
  type MemoryGraphSessionFact,
} from './memoryGraph.js'

const ARTIFACT_VERSION = 3
const DOT_EVENT_LIMIT = 160
const DIFF_CONTEXT_LINES = 3
const MEMORY_GRAPH_SEGMENT_LIMIT = 72
const SESSION_DOT_OVERVIEW_LIMIT = 24
const SESSION_DOT_FILE_LIMIT = 2
const MEMORY_SOURCE_INPUTS_DESCRIPTION =
  'project-local raw transcript JSONL under transcripts_dir + project-local file-history snapshots + matching Codex session logs under ~/.codex/sessions for this project cwd'
const MEMORY_SOURCE_OF_TRUTH_DESCRIPTION =
  'index/events.jsonl -> user_prompt.fullText/rawContent | plan.content | code_edit.files[].diffText/lineRanges (code, lineRanges when available) | code_edit.files[].beforeContent/afterContent (non-code text)'

type FileContentKind = 'code' | 'non_code_text' | 'binary_or_unknown'

const CODE_FILE_EXTENSIONS = new Set([
  '.c',
  '.cc',
  '.cpp',
  '.cs',
  '.css',
  '.go',
  '.h',
  '.hpp',
  '.java',
  '.js',
  '.jsonc',
  '.jsx',
  '.kt',
  '.kts',
  '.less',
  '.lua',
  '.m',
  '.mm',
  '.php',
  '.pl',
  '.py',
  '.rb',
  '.rs',
  '.sass',
  '.scala',
  '.scss',
  '.sh',
  '.sql',
  '.swift',
  '.ts',
  '.tsx',
  '.vue',
  '.xml',
  '.yaml',
  '.yml',
  '.zig',
])

const NON_CODE_TEXT_EXTENSIONS = new Set([
  '',
  '.cfg',
  '.conf',
  '.csv',
  '.env',
  '.gitignore',
  '.ini',
  '.json',
  '.lock',
  '.md',
  '.properties',
  '.rst',
  '.svg',
  '.text',
  '.toml',
  '.txt',
  '.tsv',
])

const NON_CODE_TEXT_BASENAMES = new Set([
  '.editorconfig',
  '.gitignore',
  '.npmrc',
  '.prettierignore',
  '.prettierrc',
  'dockerfile',
  'license',
  'license.md',
  'makefile',
  'readme',
  'readme.md',
])

type TranscriptSourceKind =
  | 'project_context'
  | 'codex_session'
  | 'legacy_claude_project'

type CodexSessionMeta = {
  sessionId: string
  isSidechain: boolean
  agentId?: string
}

type TranscriptStats = {
  path: string
  relativePath: string
  mtimeMs: number
  size: number
  sourceKind: TranscriptSourceKind
  codexMeta?: CodexSessionMeta
}

type BackupRef = {
  backupFileName: string | null
  version: number
  backupTime: string
}

type SnapshotRecord = {
  messageId: string
  timestamp: string
  trackedFileBackups: Record<string, BackupRef>
}

type PromptEvent = {
  eventId: string
  kind: 'user_prompt'
  sessionId: string
  transcriptPath: string
  transcriptRelativePath: string
  messageId: string
  timestamp: string
  isSidechain: boolean
  agentId?: string
  fullText: string
  normalizedText: string
  text: string
  rawContent: unknown
}

type PlanEvent = {
  eventId: string
  kind: 'plan'
  sessionId: string
  transcriptPath: string
  transcriptRelativePath: string
  messageId?: string
  timestamp: string
  isSidechain: boolean
  agentId?: string
  source: 'exit_plan_tool' | 'user_plan' | 'plan_attachment' | 'codex_plan'
  content: string
  contentHash: string
  planFilePath?: string
  promptEventId?: string
  promptMessageId?: string
}

type FileChangeStatus = 'added' | 'modified' | 'deleted'

type FileChange = {
  absolutePath: string
  relativePath: string
  status: FileChangeStatus
  additions: number
  deletions: number
  lineRanges: string[]
  contentKind: FileContentKind
  diffText: string
  beforeContent?: string | null
  afterContent?: string | null
}

type CodeEditEvent = {
  eventId: string
  kind: 'code_edit'
  sessionId: string
  transcriptPath: string
  transcriptRelativePath: string
  timestamp: string
  isSidechain: boolean
  agentId?: string
  fromSnapshotMessageId?: string
  toSnapshotMessageId?: string
  promptEventId?: string
  promptMessageId?: string
  files: FileChange[]
}

type TranscriptIR = {
  transcriptPath: string
  transcriptRelativePath: string
  sessionId: string
  isSidechain: boolean
  agentId?: string
  prompts: PromptEvent[]
  plans: PlanEvent[]
  snapshots: SnapshotRecord[]
  codeEdits: CodeEditEvent[]
  firstTimestamp?: string
  lastTimestamp?: string
}

type TranscriptSummary = {
  transcriptId: string
  transcriptPath: string
  relativePath: string
  sessionId: string
  isSidechain: boolean
  agentId?: string
  firstTimestamp?: string
  lastTimestamp?: string
  promptCount: number
  planCount: number
  codeEditCount: number
}

type SessionSummary = {
  sessionId: string
  transcriptCount: number
  transcriptRelativePaths: string[]
  promptCount: number
  planCount: number
  codeEditCount: number
  firstTimestamp?: string
  lastTimestamp?: string
  latestPromptPreview?: string
  latestPlanPreview?: string
  topFiles: Array<{
    path: string
    touches: number
  }>
  agentIds: string[]
}

type FileStat = {
  absolutePath: string
  relativePath: string
  touchCount: number
  lastEditedAt: string
  lastEditEventId: string
}

type MemoryEdge = {
  edgeId: string
  kind: 'contains' | 'planned' | 'led_to' | 'touches_file'
  source: string
  target: string
}

export type MemoryIndexManifest = {
  artifactVersion: number
  rootDir: string
  outputDir: string
  transcriptsDir: string
  fileHistoryDir: string
  codexSessionsDir: string
  legacyClaudeProjectDir?: string
  legacyHydratedTranscriptCount?: number
  legacyHydratedBackupCount?: number
  createdAt: string
  transcriptCount: number
  sessionCount: number
  userPromptCount: number
  planCount: number
  codeEditCount: number
  memoryObjectCount: number
  fileCount: number
  edgeCount: number
  maxTranscripts?: number
}

export type MemoryIndexTimings = {
  discoverMs: number
  extractMs: number
  diffMs: number
  analyzeMs: number
  writeMs: number
  skillsMs: number
  totalMs: number
}

export type BuildMemoryIndexResult = {
  engine: 'transcript'
  rootDir: string
  outputDir: string
  transcriptsDir: string
  fileHistoryDir: string
  codexSessionsDir: string
  graphSource: MemoryGraphAnalysis['source']
  manifest: MemoryIndexManifest
  timings: MemoryIndexTimings
  skillPaths: MemoryIndexSkillPaths
  transcriptCount: number
  sessionCount: number
}

type LegacyHydrationStats = {
  copiedTranscriptCount: number
  copiedBackupCount: number
  legacyProjectDir: string
}

export type BuildMemoryIndexOptions = {
  rootDir: string
  outputDir?: string
  transcriptsDir?: string
  fileHistoryDir?: string
  codexSessionsDir?: string
  includeCodexSessions?: boolean
  includeLegacyClaude?: boolean
  maxTranscripts?: number
  onProgress?: MemoryIndexProgressCallback
  analyzeGraph?: (
    input: MemoryGraphAnalysisInput,
  ) => Promise<MemoryGraphAgentDraft | null | undefined>
}

type JsonObject = Record<string, unknown>

function hashContent(value: string): string {
  return createHash('sha1').update(value).digest('hex')
}

function toPosixPath(value: string): string {
  return value.replaceAll('\\', '/')
}

function makeTranscriptId(relativePath: string): string {
  return `transcript:${relativePath}`
}

function makePromptId(sessionId: string, messageId: string): string {
  return `prompt:${sessionId}:${messageId}`
}

function makePlanId(
  sessionId: string,
  messageId: string | undefined,
  contentHash: string,
  index: number,
): string {
  const anchor = messageId ?? `anonymous-${index}`
  return `plan:${sessionId}:${anchor}:${contentHash.slice(0, 12)}`
}

function makeEditId(
  sessionId: string,
  fromSnapshotMessageId: string,
  toSnapshotMessageId: string,
): string {
  return `edit:${sessionId}:${fromSnapshotMessageId}:${toSnapshotMessageId}`
}

function makePatchEditId(
  sessionId: string,
  contentHash: string,
  index: number,
): string {
  return `edit:${sessionId}:patch-${index}:${contentHash.slice(0, 12)}`
}

function makeFileId(relativePath: string): string {
  return `file:${relativePath}`
}

function makeSyntheticMessageId(
  prefix: string,
  content: string,
  index: number,
): string {
  return `${prefix}-${hashContent(`${prefix}:${content}:${index}`).slice(0, 12)}`
}

function isProbablyTextContent(value: string | null | undefined): boolean {
  if (value === null || value === undefined) {
    return true
  }
  return !value.includes('\u0000')
}

function classifyFileContentKind(args: {
  relativePath: string
  beforeContent?: string | null
  afterContent?: string | null
}): FileContentKind {
  const normalizedPath = toPosixPath(args.relativePath)
  const extension = extname(normalizedPath).toLowerCase()
  const fileName = basename(normalizedPath).toLowerCase()

  if (
    !isProbablyTextContent(args.beforeContent) ||
    !isProbablyTextContent(args.afterContent)
  ) {
    return 'binary_or_unknown'
  }
  if (CODE_FILE_EXTENSIONS.has(extension)) {
    return 'code'
  }
  if (
    NON_CODE_TEXT_EXTENSIONS.has(extension) ||
    NON_CODE_TEXT_BASENAMES.has(fileName)
  ) {
    return 'non_code_text'
  }
  return 'non_code_text'
}

function renderStructuredDiffText(args: {
  relativePath: string
  status: FileChangeStatus
  hunks: StructuredPatchHunk[]
}): string {
  const lines = [`*** ${args.status.toUpperCase()} ${args.relativePath}`]
  for (const hunk of args.hunks) {
    lines.push(
      `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
    )
    lines.push(...hunk.lines)
  }
  return `${lines.join('\n').trimEnd()}\n`
}

function buildStoredFileChange(args: {
  absolutePath: string
  relativePath: string
  status: FileChangeStatus
  additions: number
  deletions: number
  lineRanges: string[]
  diffText: string
  beforeContent?: string | null
  afterContent?: string | null
}): FileChange {
  const contentKind = classifyFileContentKind({
    relativePath: args.relativePath,
    beforeContent: args.beforeContent,
    afterContent: args.afterContent,
  })

  return {
    absolutePath: args.absolutePath,
    relativePath: args.relativePath,
    status: args.status,
    additions: args.additions,
    deletions: args.deletions,
    lineRanges: args.lineRanges,
    contentKind,
    diffText: args.diffText,
    beforeContent:
      contentKind === 'non_code_text' ? (args.beforeContent ?? null) : undefined,
    afterContent:
      contentKind === 'non_code_text' ? (args.afterContent ?? null) : undefined,
  }
}

async function reportProgress(
  onProgress: MemoryIndexProgressCallback | undefined,
  progress: MemoryIndexBuildProgress,
): Promise<void> {
  await onProgress?.(progress)
}

async function ensureOutputDirectories(outputDir: string): Promise<void> {
  await mkdir(outputDir, { recursive: true })
  await mkdir(join(outputDir, 'index'), { recursive: true })
}

async function copyFileIfNeeded(
  sourcePath: string,
  targetPath: string,
): Promise<boolean> {
  let sourceStat
  try {
    sourceStat = await stat(sourcePath)
  } catch {
    return false
  }

  try {
    const targetStat = await stat(targetPath)
    if (
      targetStat.size === sourceStat.size &&
      targetStat.mtimeMs >= sourceStat.mtimeMs
    ) {
      return false
    }
  } catch {
    // Target missing or unreadable: fall through to copy.
  }

  await mkdir(dirname(targetPath), { recursive: true })
  await copyFile(sourcePath, targetPath)
  return true
}

function extractSessionIdFromTranscriptRelativePath(
  relativePath: string,
): string | null {
  const posixPath = toPosixPath(relativePath)
  const parts = posixPath.split('/')
  const topLevel = parts[0]
  if (topLevel && validateUuid(topLevel)) {
    return topLevel
  }

  const baseName = basename(posixPath, '.jsonl')
  return validateUuid(baseName) ?? null
}

async function syncDirectoryFiles(args: {
  sourceDir: string
  targetDir: string
}): Promise<number> {
  let copiedCount = 0

  async function walk(currentSourceDir: string): Promise<void> {
    let entries
    try {
      entries = await readdir(currentSourceDir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const sourcePath = join(currentSourceDir, entry.name)
      const relativePath = relative(args.sourceDir, sourcePath)
      const targetPath = join(args.targetDir, relativePath)

      if (entry.isDirectory()) {
        await walk(sourcePath)
        continue
      }
      if (!entry.isFile()) {
        continue
      }
      if (await copyFileIfNeeded(sourcePath, targetPath)) {
        copiedCount += 1
      }
    }
  }

  await walk(args.sourceDir)
  return copiedCount
}

async function hydrateProjectConversationContextFromLegacyClaude(args: {
  rootDir: string
  transcriptsDir: string
  fileHistoryDir: string
  onProgress?: MemoryIndexProgressCallback
}): Promise<LegacyHydrationStats> {
  const legacyProjectDir = getProjectDir(args.rootDir)
  const legacyTranscriptFiles = await walkJsonlFiles({
    rootDir: legacyProjectDir,
    sourceKind: 'legacy_claude_project',
  })

  if (legacyTranscriptFiles.length === 0) {
    return {
      copiedTranscriptCount: 0,
      copiedBackupCount: 0,
      legacyProjectDir,
    }
  }

  await mkdir(args.transcriptsDir, { recursive: true })
  await mkdir(args.fileHistoryDir, { recursive: true })

  let copiedTranscriptCount = 0
  const sessionIds = new Set<string>()

  for (let index = 0; index < legacyTranscriptFiles.length; index++) {
    const transcript = legacyTranscriptFiles[index]
    if (!transcript) {
      continue
    }

    await reportProgress(args.onProgress, {
      phase: 'discover',
      message: `Hydrating legacy Claude transcripts ${index + 1}/${legacyTranscriptFiles.length}`,
      completed: index + 1,
      total: legacyTranscriptFiles.length,
    })

    const relativePath = toPosixPath(relative(legacyProjectDir, transcript.path))
    const targetPath = join(args.transcriptsDir, relativePath)
    if (await copyFileIfNeeded(transcript.path, targetPath)) {
      copiedTranscriptCount += 1
    }
    const sessionId = extractSessionIdFromTranscriptRelativePath(relativePath)
    if (sessionId) {
      sessionIds.add(sessionId)
    }
  }

  let copiedBackupCount = 0
  const legacyFileHistoryDir = join(getClaudeConfigHomeDir(), 'file-history')
  const sessionIdList = [...sessionIds]
  for (let index = 0; index < sessionIdList.length; index++) {
    const sessionId = sessionIdList[index]
    if (!sessionId) {
      continue
    }

    await reportProgress(args.onProgress, {
      phase: 'discover',
      message: `Hydrating legacy Claude file-history ${index + 1}/${sessionIdList.length}`,
      completed: index + 1,
      total: sessionIdList.length,
    })

    copiedBackupCount += await syncDirectoryFiles({
      sourceDir: join(legacyFileHistoryDir, sessionId),
      targetDir: join(args.fileHistoryDir, sessionId),
    })
  }

  return {
    copiedTranscriptCount,
    copiedBackupCount,
    legacyProjectDir,
  }
}

async function walkJsonlFiles(args: {
  rootDir: string
  sourceKind: TranscriptSourceKind
  relativePathPrefix?: string
}): Promise<TranscriptStats[]> {
  const discovered: TranscriptStats[] = []

  async function walk(currentDir: string): Promise<void> {
    let entries
    try {
      entries = await readdir(currentDir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath)
        continue
      }
      if (!entry.isFile() || !entry.name.endsWith('.jsonl')) {
        continue
      }
      try {
        const fileStat = await stat(fullPath)
        const relativePath = toPosixPath(relative(args.rootDir, fullPath))
        discovered.push({
          path: fullPath,
          relativePath: args.relativePathPrefix
            ? `${args.relativePathPrefix}/${relativePath}`
            : relativePath,
          mtimeMs: fileStat.mtimeMs,
          size: fileStat.size,
          sourceKind: args.sourceKind,
        })
      } catch {
        continue
      }
    }
  }

  await walk(args.rootDir)
  return discovered
}

async function readFirstJsonlLine(filePath: string): Promise<string | null> {
  let handle
  try {
    handle = await open(filePath, 'r')
    const buffer = Buffer.alloc(256 * 1024)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    if (bytesRead <= 0) {
      return null
    }
    const head = buffer.toString('utf8', 0, bytesRead)
    const newlineIndex = head.indexOf('\n')
    return (newlineIndex >= 0 ? head.slice(0, newlineIndex) : head).trim() || null
  } catch {
    return null
  } finally {
    await handle?.close().catch(() => {})
  }
}

function parseCodexSessionMeta(line: string | null): {
  cwd: string
  meta: CodexSessionMeta
} | null {
  if (!line) {
    return null
  }

  let entry: JsonObject
  try {
    entry = JSON.parse(line) as JsonObject
  } catch {
    return null
  }

  if (entry.type !== 'session_meta') {
    return null
  }
  const payload =
    entry.payload && typeof entry.payload === 'object'
      ? (entry.payload as JsonObject)
      : null
  if (!payload || typeof payload.cwd !== 'string') {
    return null
  }

  const rawSessionId =
    typeof payload.id === 'string' ? payload.id : basename(payload.cwd)
  const sessionId = validateUuid(rawSessionId) ?? rawSessionId
  const source =
    payload.source && typeof payload.source === 'object'
      ? (payload.source as JsonObject)
      : null
  const isSidechain = Boolean(source?.subagent)

  return {
    cwd: payload.cwd,
    meta: {
      sessionId,
      isSidechain,
      agentId:
        typeof payload.agent_nickname === 'string'
          ? payload.agent_nickname
          : undefined,
    },
  }
}

async function discoverCodexSessionFiles(args: {
  rootDir: string
  codexSessionsDir: string
}): Promise<TranscriptStats[]> {
  const candidates = await walkJsonlFiles({
    rootDir: args.codexSessionsDir,
    sourceKind: 'codex_session',
    relativePathPrefix: 'codex',
  })
  const discovered: TranscriptStats[] = []

  for (const candidate of candidates) {
    const sessionMeta = parseCodexSessionMeta(
      await readFirstJsonlLine(candidate.path),
    )
    if (
      !sessionMeta ||
      !matchesProjectConversationRoot(args.rootDir, sessionMeta.cwd)
    ) {
      continue
    }
    discovered.push({
      ...candidate,
      codexMeta: sessionMeta.meta,
    })
  }

  return discovered
}

async function discoverTranscriptFiles(args: {
  rootDir: string
  transcriptsDir: string
  codexSessionsDir: string
  includeCodexSessions?: boolean
  maxTranscripts?: number
}): Promise<TranscriptStats[]> {
  const discovered = await walkJsonlFiles({
    rootDir: args.transcriptsDir,
    sourceKind: 'project_context',
  })
  if (args.includeCodexSessions !== false) {
    discovered.push(
      ...(await discoverCodexSessionFiles({
        rootDir: args.rootDir,
        codexSessionsDir: args.codexSessionsDir,
      })),
    )
  }

  const sorted = discovered.sort((left, right) => left.mtimeMs - right.mtimeMs)
  if (
    args.maxTranscripts !== undefined &&
    args.maxTranscripts > 0 &&
    sorted.length > args.maxTranscripts
  ) {
    return sorted.slice(-args.maxTranscripts)
  }
  return sorted
}

function extractTag(text: string, tagName: string): string | null {
  const openTag = `<${tagName}>`
  const closeTag = `</${tagName}>`
  const start = text.indexOf(openTag)
  if (start === -1) {
    return null
  }
  const end = text.indexOf(closeTag, start + openTag.length)
  if (end === -1) {
    return null
  }
  return text.slice(start + openTag.length, end)
}

function simplifyUserText(text: string): string {
  const commandName = extractTag(text, 'command-name')
  if (commandName) {
    const commandArgs = extractTag(text, 'command-args')?.trim()
    return `/${commandName.replace(/^\//, '')}${commandArgs ? ` ${commandArgs}` : ''}`
  }

  const bashInput = extractTag(text, 'bash-input')
  if (bashInput) {
    return `! ${bashInput}`
  }

  return text
}

function extractPromptText(content: unknown): {
  fullText: string
  normalizedText: string
  rawContent: unknown
} | null {
  if (typeof content === 'string') {
    const fullText = content.trim()
    const normalizedText = simplifyUserText(content).trim()
    if (!fullText && !normalizedText) {
      return null
    }
    return {
      fullText,
      normalizedText: normalizedText || fullText,
      rawContent: content,
    }
  }

  if (!Array.isArray(content)) {
    return null
  }

  const fullParts: string[] = []
  const normalizedParts: string[] = []
  for (const block of content) {
    if (
      block &&
      typeof block === 'object' &&
      (block as { type?: string }).type === 'text' &&
      typeof (block as { text?: string }).text === 'string'
    ) {
      const rawText = (block as { text: string }).text
      const fullText = rawText.trim()
      const normalizedText = simplifyUserText(rawText).trim()
      if (fullText) {
        fullParts.push(fullText)
      }
      if (normalizedText) {
        normalizedParts.push(normalizedText)
      }
    }
  }

  if (fullParts.length === 0 && normalizedParts.length === 0) {
    return null
  }

  return {
    fullText: fullParts.join('\n\n'),
    normalizedText: normalizedParts.join('\n\n') || fullParts.join('\n\n'),
    rawContent: content,
  }
}

function getPromptPreview(prompt: Pick<PromptEvent, 'normalizedText' | 'fullText'>): string {
  return prompt.normalizedText || prompt.fullText
}

function isTranscriptMessage(entry: JsonObject): boolean {
  return (
    typeof entry.type === 'string' &&
    typeof entry.uuid === 'string' &&
    Object.prototype.hasOwnProperty.call(entry, 'parentUuid')
  )
}

function getMessageContent(entry: JsonObject): unknown {
  const message = entry.message
  if (!message || typeof message !== 'object') {
    return undefined
  }
  return (message as JsonObject).content
}

function maybeGetTimestamp(entry: JsonObject): string | undefined {
  return typeof entry.timestamp === 'string' ? entry.timestamp : undefined
}

function applyTranscriptTimestamp(
  transcriptIr: TranscriptIR,
  timestamp: string | undefined,
): void {
  if (!timestamp) {
    return
  }
  if (!transcriptIr.firstTimestamp || timestamp < transcriptIr.firstTimestamp) {
    transcriptIr.firstTimestamp = timestamp
  }
  if (!transcriptIr.lastTimestamp || timestamp > transcriptIr.lastTimestamp) {
    transcriptIr.lastTimestamp = timestamp
  }
}

function parsePatchFileChanges(args: {
  rootDir: string
  patchText: string
}): FileChange[] {
  const files: FileChange[] = []
  let current: {
    absolutePath: string
    relativePath: string
    status: FileChangeStatus
    additions: number
    deletions: number
    lineRanges: string[]
    patchLines: string[]
    addedContentLines: string[]
  } | null = null

  const pushCurrent = () => {
    if (!current) {
      return
    }
    files.push(
      buildStoredFileChange({
        absolutePath: current.absolutePath,
        relativePath: current.relativePath,
        status: current.status,
        additions: current.additions,
        deletions: current.deletions,
        lineRanges: current.lineRanges,
        diffText: `${current.patchLines.join('\n').trimEnd()}\n`,
        afterContent:
          current.status === 'added' &&
          current.addedContentLines.length > 0 &&
          classifyFileContentKind({
            relativePath: current.relativePath,
            afterContent: current.addedContentLines.join('\n'),
          }) === 'non_code_text'
            ? `${current.addedContentLines.join('\n')}${
                current.patchLines.at(-1) === '' ? '\n' : ''
              }`
            : undefined,
      }),
    )
    current = null
  }

  const startFile = (rawPath: string, status: FileChangeStatus) => {
    pushCurrent()
    const absolutePath = rawPath.startsWith('/')
      ? rawPath
      : resolve(args.rootDir, rawPath)
    current = {
      absolutePath,
      relativePath: getRelativeFilePath(args.rootDir, absolutePath),
      status,
      additions: 0,
      deletions: 0,
      lineRanges: [],
      patchLines: [
        `${status === 'modified'
          ? '*** Update File: '
          : status === 'added'
            ? '*** Add File: '
            : '*** Delete File: '}${rawPath.trim()}`,
      ],
      addedContentLines: [],
    }
  }

  for (const line of args.patchText.split(/\r?\n/)) {
    if (line.startsWith('*** Update File: ')) {
      startFile(line.slice('*** Update File: '.length).trim(), 'modified')
      continue
    }
    if (line.startsWith('*** Add File: ')) {
      startFile(line.slice('*** Add File: '.length).trim(), 'added')
      continue
    }
    if (line.startsWith('*** Delete File: ')) {
      startFile(line.slice('*** Delete File: '.length).trim(), 'deleted')
      continue
    }
    if (line.startsWith('*** Move to: ') && current) {
      const movedPath = line.slice('*** Move to: '.length).trim()
      current.absolutePath = movedPath.startsWith('/')
        ? movedPath
        : resolve(args.rootDir, movedPath)
      current.relativePath = getRelativeFilePath(args.rootDir, current.absolutePath)
      current.patchLines.push(line)
      continue
    }
    if (!current) {
      continue
    }
    current.patchLines.push(line)
    if (line.startsWith('+') && !line.startsWith('+++')) {
      current.additions++
      if (current.status === 'added') {
        current.addedContentLines.push(line.slice(1))
      }
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      current.deletions++
    } else if (line.startsWith('@@')) {
      const match = line.match(
        /^@@\s*-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s*@@/,
      )
      if (!match) {
        continue
      }
      const oldStart = Number.parseInt(match[1]!, 10)
      const oldLines = Number.parseInt(match[2] ?? '1', 10)
      const newStart = Number.parseInt(match[3]!, 10)
      const newLines = Number.parseInt(match[4] ?? '1', 10)
      current.lineRanges.push(
        newLines > 0
          ? formatLineRange(newStart, newLines)
          : formatLineRange(oldStart, oldLines),
      )
    }
  }

  pushCurrent()
  return files
}

async function extractProjectContextTranscriptIR(args: {
  transcript: TranscriptStats
}): Promise<TranscriptIR> {
  const transcriptPath = args.transcript.path
  const transcriptRelativePath = args.transcript.relativePath
  const fallbackSessionId =
    validateUuid(basename(transcriptPath, '.jsonl')) ?? basename(transcriptPath, '.jsonl')

  const transcriptIr: TranscriptIR = {
    transcriptPath,
    transcriptRelativePath,
    sessionId: fallbackSessionId,
    isSidechain: transcriptRelativePath.includes('/subagents/'),
    prompts: [],
    plans: [],
    snapshots: [],
    codeEdits: [],
  }

  let lastPrompt: PromptEvent | undefined
  const seenPlanKeys = new Set<string>()
  const snapshotIndexByMessageId = new Map<string, number>()

  const stream = createReadStream(transcriptPath, { encoding: 'utf8' })
  const lines = createInterface({
    input: stream,
    crlfDelay: Infinity,
  })

  let planIndex = 0

  try {
    for await (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) {
        continue
      }

      let entry: JsonObject
      try {
        entry = JSON.parse(trimmed) as JsonObject
      } catch {
        continue
      }

      const timestamp = maybeGetTimestamp(entry)
      applyTranscriptTimestamp(transcriptIr, timestamp)

      if (entry.type === 'file-history-snapshot') {
        const snapshot = entry.snapshot
        if (!snapshot || typeof snapshot !== 'object') {
          continue
        }
        const messageId =
          typeof (snapshot as JsonObject).messageId === 'string'
            ? (snapshot as JsonObject).messageId
            : undefined
        const snapshotTimestamp =
          typeof (snapshot as JsonObject).timestamp === 'string'
            ? (snapshot as JsonObject).timestamp
            : timestamp
        const trackedFileBackups =
          (snapshot as JsonObject).trackedFileBackups &&
          typeof (snapshot as JsonObject).trackedFileBackups === 'object'
            ? ((snapshot as JsonObject).trackedFileBackups as Record<string, BackupRef>)
            : {}

        if (!messageId || !snapshotTimestamp) {
          continue
        }

        const isSnapshotUpdate = entry.isSnapshotUpdate === true
        const nextSnapshot: SnapshotRecord = {
          messageId,
          timestamp: snapshotTimestamp,
          trackedFileBackups,
        }
        const existingIndex = isSnapshotUpdate
          ? snapshotIndexByMessageId.get(messageId)
          : undefined

        if (existingIndex === undefined) {
          snapshotIndexByMessageId.set(messageId, transcriptIr.snapshots.length)
          transcriptIr.snapshots.push(nextSnapshot)
        } else {
          transcriptIr.snapshots[existingIndex] = nextSnapshot
        }
        continue
      }

      if (!isTranscriptMessage(entry)) {
        continue
      }

      if (
        typeof entry.sessionId === 'string' &&
        validateUuid(entry.sessionId) !== null
      ) {
        transcriptIr.sessionId = entry.sessionId
      }
      if (entry.isSidechain === true) {
        transcriptIr.isSidechain = true
      }
      if (typeof entry.agentId === 'string') {
        transcriptIr.agentId = entry.agentId
      }

      if (entry.type === 'user' && entry.isMeta !== true) {
        const prompt = extractPromptText(getMessageContent(entry))
        if (prompt && timestamp && typeof entry.uuid === 'string') {
          const promptEvent: PromptEvent = {
            eventId: makePromptId(transcriptIr.sessionId, entry.uuid),
            kind: 'user_prompt',
            sessionId: transcriptIr.sessionId,
            transcriptPath,
            transcriptRelativePath,
            messageId: entry.uuid,
            timestamp,
            isSidechain: transcriptIr.isSidechain,
            agentId: transcriptIr.agentId,
            fullText: prompt.fullText,
            normalizedText: prompt.normalizedText,
            text: prompt.fullText,
            rawContent: prompt.rawContent,
          }
          transcriptIr.prompts.push(promptEvent)
          lastPrompt = promptEvent
        }

        if (typeof entry.planContent === 'string' && entry.planContent.trim()) {
          const content = entry.planContent.trim()
          const contentHash = hashContent(content)
          const planKey = [
            transcriptIr.sessionId,
            entry.uuid,
            'user_plan',
            contentHash,
          ].join(':')
          if (!seenPlanKeys.has(planKey) && timestamp) {
            seenPlanKeys.add(planKey)
            transcriptIr.plans.push({
              eventId: makePlanId(
                transcriptIr.sessionId,
                entry.uuid,
                contentHash,
                planIndex++,
              ),
              kind: 'plan',
              sessionId: transcriptIr.sessionId,
              transcriptPath,
              transcriptRelativePath,
              messageId: entry.uuid,
              timestamp,
              isSidechain: transcriptIr.isSidechain,
              agentId: transcriptIr.agentId,
              source: 'user_plan',
              content,
              contentHash,
              promptEventId: lastPrompt?.eventId,
              promptMessageId: lastPrompt?.messageId,
            })
          }
        }
        continue
      }

      if (entry.type === 'assistant') {
        const content = getMessageContent(entry)
        if (!Array.isArray(content) || !timestamp) {
          continue
        }
        for (const block of content) {
          if (
            !block ||
            typeof block !== 'object' ||
            (block as { type?: string }).type !== 'tool_use' ||
            (block as { name?: string }).name !== EXIT_PLAN_MODE_V2_TOOL_NAME
          ) {
            continue
          }
          const input = (block as { input?: JsonObject }).input
          if (!input || typeof input.plan !== 'string' || !input.plan.trim()) {
            continue
          }
          const contentText = input.plan.trim()
          const contentHash = hashContent(contentText)
          const planKey = [
            transcriptIr.sessionId,
            entry.uuid,
            'exit_plan_tool',
            contentHash,
          ].join(':')
          if (seenPlanKeys.has(planKey)) {
            continue
          }
          seenPlanKeys.add(planKey)
          transcriptIr.plans.push({
            eventId: makePlanId(
              transcriptIr.sessionId,
              typeof entry.uuid === 'string' ? entry.uuid : undefined,
              contentHash,
              planIndex++,
            ),
            kind: 'plan',
            sessionId: transcriptIr.sessionId,
            transcriptPath,
            transcriptRelativePath,
            messageId: typeof entry.uuid === 'string' ? entry.uuid : undefined,
            timestamp,
            isSidechain: transcriptIr.isSidechain,
            agentId: transcriptIr.agentId,
            source: 'exit_plan_tool',
            content: contentText,
            contentHash,
            planFilePath:
              typeof input.planFilePath === 'string'
                ? input.planFilePath
                : undefined,
            promptEventId: lastPrompt?.eventId,
            promptMessageId: lastPrompt?.messageId,
          })
        }
        continue
      }

      if (
        entry.type === 'attachment' &&
        entry.attachment &&
        typeof entry.attachment === 'object'
      ) {
        const attachment = entry.attachment as JsonObject
        if (
          attachment.type === 'plan_file_reference' &&
          typeof attachment.planContent === 'string' &&
          attachment.planContent.trim() &&
          timestamp
        ) {
          const content = attachment.planContent.trim()
          const contentHash = hashContent(content)
          const planKey = [
            transcriptIr.sessionId,
            typeof entry.uuid === 'string' ? entry.uuid : 'attachment',
            'plan_attachment',
            contentHash,
          ].join(':')
          if (seenPlanKeys.has(planKey)) {
            continue
          }
          seenPlanKeys.add(planKey)
          transcriptIr.plans.push({
            eventId: makePlanId(
              transcriptIr.sessionId,
              typeof entry.uuid === 'string' ? entry.uuid : undefined,
              contentHash,
              planIndex++,
            ),
            kind: 'plan',
            sessionId: transcriptIr.sessionId,
            transcriptPath,
            transcriptRelativePath,
            messageId: typeof entry.uuid === 'string' ? entry.uuid : undefined,
            timestamp,
            isSidechain: transcriptIr.isSidechain,
            agentId: transcriptIr.agentId,
            source: 'plan_attachment',
            content,
            contentHash,
            planFilePath:
              typeof attachment.planFilePath === 'string'
                ? attachment.planFilePath
                : undefined,
            promptEventId: lastPrompt?.eventId,
            promptMessageId: lastPrompt?.messageId,
          })
        }
      }
    }
  } finally {
    lines.close()
    stream.close()
  }

  return transcriptIr
}

async function extractCodexTranscriptIR(args: {
  transcript: TranscriptStats
  rootDir: string
}): Promise<TranscriptIR> {
  const transcriptPath = args.transcript.path
  const transcriptRelativePath = args.transcript.relativePath
  const fallbackSessionId =
    args.transcript.codexMeta?.sessionId ??
    validateUuid(basename(transcriptPath, '.jsonl')) ??
    basename(transcriptPath, '.jsonl')

  const transcriptIr: TranscriptIR = {
    transcriptPath,
    transcriptRelativePath,
    sessionId: fallbackSessionId,
    isSidechain: args.transcript.codexMeta?.isSidechain ?? false,
    agentId: args.transcript.codexMeta?.agentId,
    prompts: [],
    plans: [],
    snapshots: [],
    codeEdits: [],
  }

  let lastPrompt: PromptEvent | undefined
  const seenPlanKeys = new Set<string>()
  let planIndex = 0
  let patchIndex = 0
  let promptIndex = 0

  const stream = createReadStream(transcriptPath, { encoding: 'utf8' })
  const lines = createInterface({
    input: stream,
    crlfDelay: Infinity,
  })

  try {
    for await (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) {
        continue
      }

      let entry: JsonObject
      try {
        entry = JSON.parse(trimmed) as JsonObject
      } catch {
        continue
      }

      const timestamp = maybeGetTimestamp(entry)
      applyTranscriptTimestamp(transcriptIr, timestamp)

      if (entry.type === 'session_meta') {
        const payload =
          entry.payload && typeof entry.payload === 'object'
            ? (entry.payload as JsonObject)
            : null
        if (!payload) {
          continue
        }
        if (
          typeof payload.id === 'string' &&
          validateUuid(payload.id) !== null
        ) {
          transcriptIr.sessionId = payload.id
        }
        if (typeof payload.agent_nickname === 'string') {
          transcriptIr.agentId = payload.agent_nickname
        }
        const source =
          payload.source && typeof payload.source === 'object'
            ? (payload.source as JsonObject)
            : null
        if (source?.subagent) {
          transcriptIr.isSidechain = true
        }
        continue
      }

      if (entry.type === 'event_msg') {
        const payload =
          entry.payload && typeof entry.payload === 'object'
            ? (entry.payload as JsonObject)
            : null
        if (!payload) {
          continue
        }

        if (
          payload.type === 'user_message' &&
          typeof payload.message === 'string' &&
          payload.message.trim() &&
          timestamp
        ) {
          const fullText = payload.message.trim()
          const messageId =
            typeof payload.turn_id === 'string'
              ? payload.turn_id
              : makeSyntheticMessageId('codex-user', fullText, promptIndex)
          const promptEvent: PromptEvent = {
            eventId: makePromptId(transcriptIr.sessionId, messageId),
            kind: 'user_prompt',
            sessionId: transcriptIr.sessionId,
            transcriptPath,
            transcriptRelativePath,
            messageId,
            timestamp,
            isSidechain: transcriptIr.isSidechain,
            agentId: transcriptIr.agentId,
            fullText,
            normalizedText: fullText,
            text: fullText,
            rawContent: payload.message,
          }
          transcriptIr.prompts.push(promptEvent)
          lastPrompt = promptEvent
          promptIndex++
          continue
        }

        if (
          payload.type === 'item_completed' &&
          timestamp &&
          payload.item &&
          typeof payload.item === 'object'
        ) {
          const item = payload.item as JsonObject
          if (item.type === 'Plan' && typeof item.text === 'string' && item.text.trim()) {
            const content = item.text.trim()
            const contentHash = hashContent(content)
            const messageId =
              typeof item.id === 'string'
                ? item.id
                : makeSyntheticMessageId('codex-plan', content, planIndex)
            const planKey = [
              transcriptIr.sessionId,
              messageId,
              'codex_plan',
              contentHash,
            ].join(':')
            if (seenPlanKeys.has(planKey)) {
              continue
            }
            seenPlanKeys.add(planKey)
            transcriptIr.plans.push({
              eventId: makePlanId(
                transcriptIr.sessionId,
                messageId,
                contentHash,
                planIndex++,
              ),
              kind: 'plan',
              sessionId: transcriptIr.sessionId,
              transcriptPath,
              transcriptRelativePath,
              messageId,
              timestamp,
              isSidechain: transcriptIr.isSidechain,
              agentId: transcriptIr.agentId,
              source: 'codex_plan',
              content,
              contentHash,
              promptEventId: lastPrompt?.eventId,
              promptMessageId: lastPrompt?.messageId,
            })
          }
        }
        continue
      }

      if (entry.type !== 'response_item') {
        continue
      }

      const payload =
        entry.payload && typeof entry.payload === 'object'
          ? (entry.payload as JsonObject)
          : null
      if (
        !payload ||
        payload.type !== 'custom_tool_call' ||
        payload.name !== 'apply_patch' ||
        typeof payload.input !== 'string' ||
        !timestamp
      ) {
        continue
      }

      const files = parsePatchFileChanges({
        rootDir: args.rootDir,
        patchText: payload.input,
      })
      if (files.length === 0) {
        continue
      }
      const contentHash = hashContent(payload.input)
      transcriptIr.codeEdits.push({
        eventId: makePatchEditId(transcriptIr.sessionId, contentHash, patchIndex++),
        kind: 'code_edit',
        sessionId: transcriptIr.sessionId,
        transcriptPath,
        transcriptRelativePath,
        timestamp,
        isSidechain: transcriptIr.isSidechain,
        agentId: transcriptIr.agentId,
        promptEventId: lastPrompt?.eventId,
        promptMessageId: lastPrompt?.messageId,
        files,
      })
    }
  } finally {
    lines.close()
    stream.close()
  }

  return transcriptIr
}

async function extractTranscriptIR(args: {
  transcript: TranscriptStats
  rootDir: string
}): Promise<TranscriptIR> {
  if (args.transcript.sourceKind === 'codex_session') {
    return extractCodexTranscriptIR(args)
  }
  return extractProjectContextTranscriptIR({
    transcript: args.transcript,
  })
}

function countPatchLines(hunks: StructuredPatchHunk[]): {
  additions: number
  deletions: number
} {
  let additions = 0
  let deletions = 0
  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        additions++
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        deletions++
      }
    }
  }
  return { additions, deletions }
}

function formatLineRange(startLine: number, lineCount: number): string {
  const safeStart = Math.max(1, startLine)
  const safeEnd = Math.max(safeStart, safeStart + Math.max(1, lineCount) - 1)
  return `L${safeStart}::L${safeEnd}`
}

function buildCompactLineRanges(hunks: StructuredPatchHunk[]): string[] {
  const ranges: string[] = []

  for (const hunk of hunks) {
    if (hunk.newLines > 0) {
      ranges.push(formatLineRange(hunk.newStart, hunk.newLines))
      continue
    }
    if (hunk.oldLines > 0) {
      ranges.push(formatLineRange(hunk.oldStart, hunk.oldLines))
    }
  }

  return [...new Set(ranges)]
}

function getRelativeFilePath(rootDir: string, filePath: string): string {
  const normalizedRoot = resolve(rootDir)
  const normalizedPath = resolve(filePath)
  if (
    normalizedPath === normalizedRoot ||
    normalizedPath.startsWith(`${normalizedRoot}/`)
  ) {
    return toPosixPath(relative(normalizedRoot, normalizedPath))
  }
  return toPosixPath(normalizedPath)
}

async function readBackupContent(
  fileHistoryDir: string,
  sessionId: string,
  backupFileName: string | null | undefined,
): Promise<string | null> {
  if (backupFileName === undefined || backupFileName === null) {
    return null
  }
  const backupPath = join(fileHistoryDir, sessionId, backupFileName)
  try {
    return await readFile(backupPath, 'utf8')
  } catch {
    return null
  }
}

function buildStructuredPatch(args: {
  filePath: string
  oldContent: string
  newContent: string
}): StructuredPatchHunk[] {
  const result = structuredPatch(
    args.filePath,
    args.filePath,
    args.oldContent,
    args.newContent,
    undefined,
    undefined,
    {
      context: DIFF_CONTEXT_LINES,
    },
  )
  return result?.hunks ?? []
}

async function buildCodeEditEvents(args: {
  rootDir: string
  fileHistoryDir: string
  transcript: TranscriptIR
}): Promise<CodeEditEvent[]> {
  const promptByMessageId = new Map(
    args.transcript.prompts.map(prompt => [prompt.messageId, prompt]),
  )
  const events: CodeEditEvent[] = [...args.transcript.codeEdits]

  for (let index = 1; index < args.transcript.snapshots.length; index++) {
    const previousSnapshot = args.transcript.snapshots[index - 1]
    const currentSnapshot = args.transcript.snapshots[index]
    if (!previousSnapshot || !currentSnapshot) {
      continue
    }

    const trackedPaths = new Set<string>([
      ...Object.keys(previousSnapshot.trackedFileBackups),
      ...Object.keys(currentSnapshot.trackedFileBackups),
    ])

    const files: FileChange[] = []

    for (const trackedPath of trackedPaths) {
      const previousBackup = previousSnapshot.trackedFileBackups[trackedPath]
      const currentBackup = currentSnapshot.trackedFileBackups[trackedPath]

      if (
        previousBackup?.backupFileName === currentBackup?.backupFileName &&
        previousBackup?.version === currentBackup?.version
      ) {
        continue
      }

      const absolutePath = trackedPath.startsWith('/')
        ? trackedPath
        : resolve(args.rootDir, trackedPath)

      const previousContent = await readBackupContent(
        args.fileHistoryDir,
        args.transcript.sessionId,
        previousBackup?.backupFileName,
      )
      const currentContent = await readBackupContent(
        args.fileHistoryDir,
        args.transcript.sessionId,
        currentBackup?.backupFileName,
      )

      if (previousContent === null && currentContent === null) {
        continue
      }

      const status: FileChangeStatus =
        previousContent === null
          ? 'added'
          : currentContent === null
            ? 'deleted'
            : 'modified'

      const hunks = buildStructuredPatch({
        filePath: absolutePath,
        oldContent: previousContent ?? '',
        newContent: currentContent ?? '',
      })
      const { additions, deletions } = countPatchLines(hunks)
      const lineRanges = buildCompactLineRanges(hunks)

      files.push(
        buildStoredFileChange({
          absolutePath,
          relativePath: getRelativeFilePath(args.rootDir, absolutePath),
          status,
          additions,
          deletions,
          lineRanges,
          diffText: renderStructuredDiffText({
            relativePath: getRelativeFilePath(args.rootDir, absolutePath),
            status,
            hunks,
          }),
          beforeContent: previousContent,
          afterContent: currentContent,
        }),
      )
    }

    if (files.length === 0) {
      continue
    }

    const prompt = promptByMessageId.get(previousSnapshot.messageId)
    events.push({
      eventId: makeEditId(
        args.transcript.sessionId,
        previousSnapshot.messageId,
        currentSnapshot.messageId,
      ),
      kind: 'code_edit',
      sessionId: args.transcript.sessionId,
      transcriptPath: args.transcript.transcriptPath,
      transcriptRelativePath: args.transcript.transcriptRelativePath,
      timestamp: currentSnapshot.timestamp,
      isSidechain: args.transcript.isSidechain,
      agentId: args.transcript.agentId,
      fromSnapshotMessageId: previousSnapshot.messageId,
      toSnapshotMessageId: currentSnapshot.messageId,
      promptEventId: prompt?.eventId,
      promptMessageId: prompt?.messageId,
      files,
    })
  }

  return events
}

function truncatePreview(value: string, maxChars: number = 160): string {
  const flattened = value.replace(/\s+/g, ' ').trim()
  if (flattened.length <= maxChars) {
    return flattened
  }
  return `${flattened.slice(0, maxChars - 1)}…`
}

function isWithinProjectRoot(rootDir: string, targetPath: string): boolean {
  const normalizedRoot = resolve(rootDir)
  const normalizedTarget = resolve(
    targetPath.startsWith('/') ? targetPath : join(normalizedRoot, targetPath),
  )
  return (
    normalizedTarget === normalizedRoot ||
    normalizedTarget.startsWith(`${normalizedRoot}/`)
  )
}

function toPythonSymbol(value: string, prefix: string): string {
  const ascii = value
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  const fallback = `${prefix}_${hashContent(value).slice(0, 10)}`
  const body = ascii ? `${prefix}_${ascii}` : fallback
  const cleaned = body.replace(/_+/g, '_').replace(/^(\d)/, '_$1')
  return cleaned.length <= 48 ? cleaned : `${prefix}_${hashContent(value).slice(0, 10)}`
}

function sortByTimestamp<T extends { timestamp?: string }>(items: T[]): T[] {
  return [...items].sort((left, right) =>
    (left.timestamp ?? '').localeCompare(right.timestamp ?? ''),
  )
}

function dedupeByKey<T>(items: T[], getKey: (item: T) => string): T[] {
  const seen = new Set<string>()
  const result: T[] = []
  for (const item of items) {
    const key = getKey(item)
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    result.push(item)
  }
  return result
}

function buildFileStats(codeEdits: CodeEditEvent[]): FileStat[] {
  const byPath = new Map<string, FileStat>()

  for (const edit of codeEdits) {
    for (const file of edit.files) {
      const existing = byPath.get(file.absolutePath)
      if (existing) {
        existing.touchCount += 1
        if (edit.timestamp >= existing.lastEditedAt) {
          existing.lastEditedAt = edit.timestamp
          existing.lastEditEventId = edit.eventId
        }
        continue
      }
      byPath.set(file.absolutePath, {
        absolutePath: file.absolutePath,
        relativePath: file.relativePath,
        touchCount: 1,
        lastEditedAt: edit.timestamp,
        lastEditEventId: edit.eventId,
      })
    }
  }

  return [...byPath.values()].sort((left, right) => {
    if (right.touchCount !== left.touchCount) {
      return right.touchCount - left.touchCount
    }
    return right.lastEditedAt.localeCompare(left.lastEditedAt)
  })
}

function buildTranscriptSummaries(args: {
  transcripts: TranscriptIR[]
  codeEditCounts: Map<string, number>
}): TranscriptSummary[] {
  return args.transcripts.map(transcript => ({
    transcriptId: makeTranscriptId(transcript.transcriptRelativePath),
    transcriptPath: transcript.transcriptPath,
    relativePath: transcript.transcriptRelativePath,
    sessionId: transcript.sessionId,
    isSidechain: transcript.isSidechain,
    agentId: transcript.agentId,
    firstTimestamp: transcript.firstTimestamp,
    lastTimestamp: transcript.lastTimestamp,
    promptCount: transcript.prompts.length,
    planCount: transcript.plans.length,
    codeEditCount: args.codeEditCounts.get(transcript.transcriptPath) ?? 0,
  }))
}

function buildSessionSummaries(args: {
  transcripts: TranscriptSummary[]
  prompts: PromptEvent[]
  plans: PlanEvent[]
  codeEdits: CodeEditEvent[]
}): SessionSummary[] {
  const bySession = new Map<
    string,
    {
      sessionId: string
      transcriptRelativePaths: Set<string>
      promptCount: number
      planCount: number
      codeEditCount: number
      firstTimestamp?: string
      lastTimestamp?: string
      latestPromptPreview?: string
      latestPromptTimestamp?: string
      latestPlanPreview?: string
      latestPlanTimestamp?: string
      fileTouches: Map<string, number>
      agentIds: Set<string>
    }
  >()

  const ensureSession = (sessionId: string) => {
    let existing = bySession.get(sessionId)
    if (existing) {
      return existing
    }
    existing = {
      sessionId,
      transcriptRelativePaths: new Set<string>(),
      promptCount: 0,
      planCount: 0,
      codeEditCount: 0,
      fileTouches: new Map<string, number>(),
      agentIds: new Set<string>(),
    }
    bySession.set(sessionId, existing)
    return existing
  }

  const updateTimestampBounds = (
    target: {
      firstTimestamp?: string
      lastTimestamp?: string
    },
    timestamp: string | undefined,
  ) => {
    if (!timestamp) {
      return
    }
    if (!target.firstTimestamp || timestamp < target.firstTimestamp) {
      target.firstTimestamp = timestamp
    }
    if (!target.lastTimestamp || timestamp > target.lastTimestamp) {
      target.lastTimestamp = timestamp
    }
  }

  for (const transcript of args.transcripts) {
    const session = ensureSession(transcript.sessionId)
    session.transcriptRelativePaths.add(transcript.relativePath)
    if (transcript.agentId) {
      session.agentIds.add(transcript.agentId)
    }
    updateTimestampBounds(session, transcript.firstTimestamp)
    updateTimestampBounds(session, transcript.lastTimestamp)
  }

  for (const prompt of args.prompts) {
    const session = ensureSession(prompt.sessionId)
    session.promptCount += 1
    session.transcriptRelativePaths.add(prompt.transcriptRelativePath)
    if (prompt.agentId) {
      session.agentIds.add(prompt.agentId)
    }
    updateTimestampBounds(session, prompt.timestamp)
    if (
      !session.latestPromptTimestamp ||
      prompt.timestamp >= session.latestPromptTimestamp
    ) {
      session.latestPromptTimestamp = prompt.timestamp
      session.latestPromptPreview = truncatePreview(getPromptPreview(prompt), 160)
    }
  }

  for (const plan of args.plans) {
    const session = ensureSession(plan.sessionId)
    session.planCount += 1
    session.transcriptRelativePaths.add(plan.transcriptRelativePath)
    if (plan.agentId) {
      session.agentIds.add(plan.agentId)
    }
    updateTimestampBounds(session, plan.timestamp)
    if (!session.latestPlanTimestamp || plan.timestamp >= session.latestPlanTimestamp) {
      session.latestPlanTimestamp = plan.timestamp
      session.latestPlanPreview = truncatePreview(plan.content, 160)
    }
  }

  for (const edit of args.codeEdits) {
    const session = ensureSession(edit.sessionId)
    session.codeEditCount += 1
    session.transcriptRelativePaths.add(edit.transcriptRelativePath)
    if (edit.agentId) {
      session.agentIds.add(edit.agentId)
    }
    updateTimestampBounds(session, edit.timestamp)
    for (const file of edit.files) {
      session.fileTouches.set(
        file.relativePath,
        (session.fileTouches.get(file.relativePath) ?? 0) + 1,
      )
    }
  }

  return [...bySession.values()]
    .map(session => ({
      sessionId: session.sessionId,
      transcriptCount: session.transcriptRelativePaths.size,
      transcriptRelativePaths: [...session.transcriptRelativePaths].sort((left, right) =>
        left.localeCompare(right),
      ),
      promptCount: session.promptCount,
      planCount: session.planCount,
      codeEditCount: session.codeEditCount,
      firstTimestamp: session.firstTimestamp,
      lastTimestamp: session.lastTimestamp,
      latestPromptPreview: session.latestPromptPreview,
      latestPlanPreview: session.latestPlanPreview,
      topFiles: [...session.fileTouches.entries()]
        .sort((left, right) => {
          if (right[1] !== left[1]) {
            return right[1] - left[1]
          }
          return left[0].localeCompare(right[0])
        })
        .slice(0, 5)
        .map(([path, touches]) => ({
          path,
          touches,
        })),
      agentIds: [...session.agentIds].sort((left, right) => left.localeCompare(right)),
    }))
    .sort((left, right) =>
      (right.lastTimestamp ?? '').localeCompare(left.lastTimestamp ?? ''),
    )
}

function buildEdges(args: {
  transcripts: TranscriptSummary[]
  prompts: PromptEvent[]
  plans: PlanEvent[]
  codeEdits: CodeEditEvent[]
}): MemoryEdge[] {
  const edges: MemoryEdge[] = []
  const pushEdge = (kind: MemoryEdge['kind'], source: string, target: string) => {
    edges.push({
      edgeId: `edge-${String(edges.length + 1).padStart(6, '0')}`,
      kind,
      source,
      target,
    })
  }

  const transcriptIds = new Map(
    args.transcripts.map(transcript => [
      transcript.relativePath,
      transcript.transcriptId,
    ]),
  )

  for (const prompt of args.prompts) {
    const transcriptId = transcriptIds.get(prompt.transcriptRelativePath)
    if (transcriptId) {
      pushEdge('contains', transcriptId, prompt.eventId)
    }
  }

  for (const plan of args.plans) {
    const transcriptId = transcriptIds.get(plan.transcriptRelativePath)
    if (transcriptId) {
      pushEdge('contains', transcriptId, plan.eventId)
    }
    if (plan.promptEventId) {
      pushEdge('planned', plan.promptEventId, plan.eventId)
    }
  }

  for (const edit of args.codeEdits) {
    const transcriptId = transcriptIds.get(edit.transcriptRelativePath)
    if (transcriptId) {
      pushEdge('contains', transcriptId, edit.eventId)
    }
    if (edit.promptEventId) {
      pushEdge('led_to', edit.promptEventId, edit.eventId)
    }
    for (const file of edit.files) {
      pushEdge('touches_file', edit.eventId, makeFileId(file.relativePath))
    }
  }

  return edges
}

function summarizeLineRanges(lineRanges: string[]): string {
  return [...new Set(lineRanges.filter(Boolean))]
    .slice(0, 3)
    .join(', ')
}

function isLowSignalMemoryPrompt(value: string | undefined): boolean {
  if (!value) {
    return true
  }
  return (
    value.length < 4 ||
    /^\[(request interrupted|interrupted)/iu.test(value) ||
    /task-notification>|<task-notification>|<tool-use-id>|<output-file>/iu.test(
      value,
    ) ||
    /^(是|对|好|继续|hello)[，。!！?？\s]*$/u.test(value)
  )
}

function makeMemorySegmentId(kind: string, anchor: string): string {
  return `${kind}_${hashContent(`${kind}:${anchor}`).slice(0, 12)}`
}

function findMentionedFilePaths(
  text: string,
  candidatePaths: string[],
  limit: number = 8,
): string[] {
  const haystack = text.toLowerCase()
  return candidatePaths
    .filter(path => haystack.includes(path.toLowerCase()))
    .slice(0, limit)
}

function summarizeStoredLineRanges(file: Pick<FileChange, 'lineRanges' | 'contentKind'>): string {
  const summarized = summarizeLineRanges(file.lineRanges)
  if (summarized) {
    return summarized
  }
  return file.contentKind === 'non_code_text' ? 'full_text' : 'diff_only'
}

function buildMemoryGraphSegments(args: {
  selectedSessionIds: Set<string>
  selectedFilePaths: string[]
  prompts: PromptEvent[]
  plans: PlanEvent[]
  codeEdits: CodeEditEvent[]
  memoryObjects: MemoryObject[]
}): MemoryGraphSegmentFact[] {
  const memoryIdsBySourceEventId = new Map<string, string[]>()
  for (const memoryObject of args.memoryObjects) {
    for (const eventId of memoryObject.sourceEventIds) {
      const existing = memoryIdsBySourceEventId.get(eventId) ?? []
      memoryIdsBySourceEventId.set(
        eventId,
        dedupeByKey([...existing, memoryObject.objectId], value => value),
      )
    }
  }

  const plansByPromptEventId = new Map<string, string[]>()
  const plansByPromptMessageId = new Map<string, string[]>()
  for (const plan of args.plans) {
    if (plan.promptEventId) {
      const existing = plansByPromptEventId.get(plan.promptEventId) ?? []
      plansByPromptEventId.set(
        plan.promptEventId,
        dedupeByKey([...existing, plan.eventId], value => value),
      )
    }
    if (plan.promptMessageId) {
      const existing = plansByPromptMessageId.get(plan.promptMessageId) ?? []
      plansByPromptMessageId.set(
        plan.promptMessageId,
        dedupeByKey([...existing, plan.eventId], value => value),
      )
    }
  }

  const promptSegments = sortByTimestamp(
    args.prompts.filter(prompt => args.selectedSessionIds.has(prompt.sessionId)),
  )
    .filter(prompt => {
      const preview = getPromptPreview(prompt)
      return (
        !isLowSignalMemoryPrompt(preview) ||
        (plansByPromptEventId.get(prompt.eventId)?.length ?? 0) > 0 ||
        (plansByPromptMessageId.get(prompt.messageId)?.length ?? 0) > 0 ||
        (memoryIdsBySourceEventId.get(prompt.eventId)?.length ?? 0) > 0
      )
    })
    .slice(-24)
    .map(
      (prompt): MemoryGraphSegmentFact => {
        const preview = truncatePreview(getPromptPreview(prompt), 180)
        const filePaths = findMentionedFilePaths(
          `${prompt.normalizedText}\n${prompt.fullText}`,
          args.selectedFilePaths,
        )
        const planIds = dedupeByKey(
          [
            ...(plansByPromptEventId.get(prompt.eventId) ?? []),
            ...(plansByPromptMessageId.get(prompt.messageId) ?? []),
          ],
          value => value,
        ).slice(0, 6)
        return {
          segmentId: makeMemorySegmentId(
            'prompt',
            `${prompt.eventId}:${prompt.timestamp}`,
          ),
          kind: 'prompt',
          sessionId: prompt.sessionId,
          timestamp: prompt.timestamp,
          title: preview,
          summary: preview,
          sourceEventIds: [prompt.eventId],
          filePaths,
          planIds,
          memoryObjectIds: (memoryIdsBySourceEventId.get(prompt.eventId) ?? []).slice(
            0,
            6,
          ),
          recentRanges: [],
        }
      },
    )

  const planSegments = sortByTimestamp(
    args.plans.filter(plan => args.selectedSessionIds.has(plan.sessionId)),
  )
    .slice(-24)
    .map(
      (plan): MemoryGraphSegmentFact => ({
        segmentId: makeMemorySegmentId('plan', `${plan.eventId}:${plan.timestamp}`),
        kind: 'plan',
        sessionId: plan.sessionId,
        timestamp: plan.timestamp,
        title: truncatePreview(plan.content, 140),
        summary: truncatePreview(plan.content, 220),
        sourceEventIds: [plan.eventId],
        filePaths: findMentionedFilePaths(plan.content, args.selectedFilePaths),
        planIds: [plan.eventId],
        memoryObjectIds: (memoryIdsBySourceEventId.get(plan.eventId) ?? []).slice(0, 6),
        recentRanges: [],
      }),
    )

  const editSegments = sortByTimestamp(
    args.codeEdits.filter(edit => args.selectedSessionIds.has(edit.sessionId)),
  )
    .slice(-24)
    .map((edit): MemoryGraphSegmentFact => {
      const planIds = dedupeByKey(
        [
          ...(edit.promptEventId ? (plansByPromptEventId.get(edit.promptEventId) ?? []) : []),
          ...(edit.promptMessageId
            ? (plansByPromptMessageId.get(edit.promptMessageId) ?? [])
            : []),
        ],
        value => value,
      ).slice(0, 6)
      const filePaths = dedupeByKey(
        edit.files.map(file => file.relativePath),
        value => value,
      ).slice(0, 8)
      const summary = truncatePreview(
        edit.files
          .map(
            file =>
              `${file.relativePath} (${file.status}${(() => {
                const ranges = summarizeStoredLineRanges(file)
                return ranges ? ` ${ranges}` : ''
              })()})`,
          )
          .join(', '),
        220,
      )
      return {
        segmentId: makeMemorySegmentId('edit', `${edit.eventId}:${edit.timestamp}`),
        kind: edit.files.every(file => file.contentKind === 'non_code_text')
          ? 'non_code_text_edit'
          : 'code_edit',
        sessionId: edit.sessionId,
        timestamp: edit.timestamp,
        title: truncatePreview(
          filePaths.length === 1
            ? `${edit.files[0]!.contentKind === 'non_code_text' ? 'Text' : 'Code'} edit ${filePaths[0]}`
            : `${filePaths.length} file edit`,
          140,
        ),
        summary,
        sourceEventIds: [
          edit.eventId,
          ...(edit.promptEventId ? [edit.promptEventId] : []),
        ],
        filePaths,
        planIds,
        memoryObjectIds: edit.promptEventId
          ? (memoryIdsBySourceEventId.get(edit.promptEventId) ?? []).slice(0, 6)
          : [],
        recentRanges: edit.files.slice(0, 8).map(file => ({
          path: file.relativePath,
          status: file.status,
          lineRanges: summarizeStoredLineRanges(file),
        })),
      }
    })

  return sortByTimestamp(
    dedupeByKey(
      [...promptSegments, ...planSegments, ...editSegments],
      segment => segment.segmentId,
    ),
  ).slice(-MEMORY_GRAPH_SEGMENT_LIMIT)
}

function buildMemoryGraphAnalysisInput(args: {
  manifest: MemoryIndexManifest
  sessions: SessionSummary[]
  prompts: PromptEvent[]
  plans: PlanEvent[]
  codeEdits: CodeEditEvent[]
  memoryObjects: MemoryObject[]
  files: FileStat[]
}): MemoryGraphAnalysisInput {
  const promptsBySession = new Map<string, string[]>()
  const plansBySession = new Map<string, string[]>()
  const memoryObjectsBySession = new Map<string, MemoryObject[]>()
  const editsBySession = new Map<
    string,
    Array<{
      path: string
      status: string
      lineRanges: string
      timestamp: string
    }>
  >()
  const filePlanIds = new Map<string, Set<string>>()
  const fileMemoryIds = new Map<string, Set<string>>()
  const fileSessionIds = new Map<string, Set<string>>()
  const fileRecentRanges = new Map<
    string,
    Array<{
      sessionId: string
      status: string
      lineRanges: string
    }>
  >()

  for (const prompt of sortByTimestamp(args.prompts)) {
    const preview = truncatePreview(getPromptPreview(prompt), 160)
    const existing = promptsBySession.get(prompt.sessionId) ?? []
    promptsBySession.set(
      prompt.sessionId,
      dedupeByKey([...existing, preview], value => value).slice(-6),
    )
  }

  for (const plan of sortByTimestamp(args.plans)) {
    const existing = plansBySession.get(plan.sessionId) ?? []
    plansBySession.set(
      plan.sessionId,
      dedupeByKey(
        [...existing, plan.eventId],
        value => value,
      ).slice(-6),
    )
  }

  for (const memoryObject of args.memoryObjects) {
    for (const sessionId of memoryObject.sessionIds) {
      const existing = memoryObjectsBySession.get(sessionId) ?? []
      memoryObjectsBySession.set(sessionId, [...existing, memoryObject])
    }
  }

  for (const edit of sortByTimestamp(args.codeEdits)) {
    for (const file of edit.files) {
      const lineRanges = summarizeLineRanges(file.lineRanges)
      const sessionEdits = editsBySession.get(edit.sessionId) ?? []
      sessionEdits.push({
        path: file.relativePath,
        status: file.status,
        lineRanges,
        timestamp: edit.timestamp,
      })
      editsBySession.set(edit.sessionId, sessionEdits)

      const sessionIds = fileSessionIds.get(file.relativePath) ?? new Set<string>()
      sessionIds.add(edit.sessionId)
      fileSessionIds.set(file.relativePath, sessionIds)

      const recentRanges = fileRecentRanges.get(file.relativePath) ?? []
      recentRanges.push({
        sessionId: edit.sessionId,
        status: file.status,
        lineRanges,
      })
      fileRecentRanges.set(file.relativePath, recentRanges)

      if (edit.promptEventId) {
        const relatedPlanIds = plansBySession.get(edit.sessionId) ?? []
        const planIds = filePlanIds.get(file.relativePath) ?? new Set<string>()
        for (const planId of relatedPlanIds) {
          planIds.add(planId)
        }
        filePlanIds.set(file.relativePath, planIds)
      }
    }
  }

  for (const memoryObject of args.memoryObjects) {
    for (const sessionId of memoryObject.sessionIds) {
      const session = args.sessions.find(candidate => candidate.sessionId === sessionId)
      for (const file of session?.topFiles ?? []) {
        const ids = fileMemoryIds.get(file.path) ?? new Set<string>()
        ids.add(memoryObject.objectId)
        fileMemoryIds.set(file.path, ids)
      }
    }
  }

  const sessionChronology = [...args.sessions].sort((left, right) =>
    (left.lastTimestamp ?? '').localeCompare(right.lastTimestamp ?? ''),
  )
  const sessionNeighbors = new Map<
    string,
    {
      previousSessionId: string | null
      nextSessionId: string | null
    }
  >()
  for (let index = 0; index < sessionChronology.length; index++) {
    const session = sessionChronology[index]
    if (!session) {
      continue
    }
    sessionNeighbors.set(session.sessionId, {
      previousSessionId: sessionChronology[index - 1]?.sessionId ?? null,
      nextSessionId: sessionChronology[index + 1]?.sessionId ?? null,
    })
  }

  const selectedSessions = args.sessions
    .filter(
      session =>
        session.planCount > 0 ||
        session.codeEditCount > 0 ||
        (memoryObjectsBySession.get(session.sessionId)?.length ?? 0) > 0 ||
        (session.promptCount > 2 &&
          !isLowSignalMemoryPrompt(
            (promptsBySession.get(session.sessionId) ?? [])
              .slice()
              .reverse()
              .find(prompt => !isLowSignalMemoryPrompt(prompt)),
          )),
    )
    .slice(0, 18)

  const selectedSessionIds = new Set(
    selectedSessions.map(session => session.sessionId),
  )

  const selectedPlans: MemoryGraphPlanFact[] = dedupeByKey(
    args.plans
      .filter(plan => selectedSessionIds.has(plan.sessionId))
      .slice()
      .reverse()
      .map(plan => ({
        eventId: plan.eventId,
        sessionId: plan.sessionId,
        timestamp: plan.timestamp,
        source: plan.source,
        preview: truncatePreview(plan.content, 180),
        transcriptRelativePath: plan.transcriptRelativePath,
        planFilePath: plan.planFilePath,
      })),
    plan => plan.eventId,
  ).slice(0, 24)

  const selectedFilePaths = dedupeByKey(
    [
      ...selectedSessions.flatMap(session =>
        session.topFiles.map(file => file.path),
      ),
      ...selectedSessions.flatMap(session =>
        (editsBySession.get(session.sessionId) ?? []).map(edit => edit.path),
      ),
      ...args.files.slice(0, 12).map(file => file.relativePath),
    ],
    value => value,
  )

  const selectedFiles: MemoryGraphFileFact[] = args.files
    .filter(file => selectedFilePaths.includes(file.relativePath))
    .slice(0, 28)
    .map(
      (file): MemoryGraphFileFact => ({
        path: file.relativePath,
        touchCount: file.touchCount,
        lastEditedAt: file.lastEditedAt,
        lastEditEventId: file.lastEditEventId,
        sessionIds: [...(fileSessionIds.get(file.relativePath) ?? new Set<string>())]
          .filter(sessionId => selectedSessionIds.has(sessionId))
          .slice(0, 8),
        planIds: [...(filePlanIds.get(file.relativePath) ?? new Set<string>())].slice(
          0,
          8,
        ),
        memoryObjectIds: [...(fileMemoryIds.get(file.relativePath) ?? new Set<string>())]
          .slice(0, 8),
        recentRanges: dedupeByKey(
          (fileRecentRanges.get(file.relativePath) ?? [])
            .slice()
            .reverse(),
          range =>
            `${range.sessionId}|${range.status}|${range.lineRanges || '-'}`,
        ).slice(0, 5),
      }),
    )

  const selectedMemoryObjects: MemoryGraphMemoryFact[] = dedupeByKey(
    args.memoryObjects
      .filter(memoryObject =>
        memoryObject.sessionIds.some(sessionId => selectedSessionIds.has(sessionId)),
      )
      .map(
        (memoryObject): MemoryGraphMemoryFact => ({
          objectId: memoryObject.objectId,
          kind: memoryObject.kind,
          status: memoryObject.status,
          lastSeenAt: memoryObject.lastSeenAt,
          statement: memoryObject.statement,
          sessionIds: memoryObject.sessionIds.filter(sessionId =>
            selectedSessionIds.has(sessionId),
          ),
        }),
      ),
    memoryObject => memoryObject.objectId,
  ).slice(0, 24)

  const selectedSessionsFacts: MemoryGraphSessionFact[] = selectedSessions.map(
    (session): MemoryGraphSessionFact => {
      const promptPreviews = (promptsBySession.get(session.sessionId) ?? [])
        .slice()
        .reverse()
      const focusPrompt = promptPreviews.find(
        prompt => !isLowSignalMemoryPrompt(prompt),
      )
      const recentEdits = dedupeByKey(
        (editsBySession.get(session.sessionId) ?? [])
          .slice()
          .reverse(),
        edit => `${edit.path}|${edit.status}|${edit.lineRanges || '-'}`,
      ).slice(0, 6)

      return {
        sessionId: session.sessionId,
        firstTimestamp: session.firstTimestamp,
        lastTimestamp: session.lastTimestamp,
        promptCount: session.promptCount,
        planCount: session.planCount,
        codeEditCount: session.codeEditCount,
        latestPromptPreview: session.latestPromptPreview,
        latestPlanPreview: session.latestPlanPreview,
        focusPrompt,
        topFiles: session.topFiles.slice(0, 6),
        agentIds: session.agentIds,
        promptPreviews: promptPreviews.slice(0, 4),
        planIds: (plansBySession.get(session.sessionId) ?? []).slice(-4),
        memoryObjectIds: (memoryObjectsBySession.get(session.sessionId) ?? [])
          .slice(0, 6)
          .map(memoryObject => memoryObject.objectId),
        recentEdits,
        previousSessionId:
          sessionNeighbors.get(session.sessionId)?.previousSessionId ?? null,
        nextSessionId:
          sessionNeighbors.get(session.sessionId)?.nextSessionId ?? null,
      }
    },
  )

  const selectedSegments = buildMemoryGraphSegments({
    selectedSessionIds,
    selectedFilePaths,
    prompts: args.prompts,
    plans: args.plans,
    codeEdits: args.codeEdits,
    memoryObjects: args.memoryObjects.filter(memoryObject =>
      memoryObject.sessionIds.some(sessionId => selectedSessionIds.has(sessionId)),
    ),
  })

  return {
    rootDir: args.manifest.rootDir,
    generatedAt: args.manifest.createdAt,
    sessions: selectedSessionsFacts,
    files: selectedFiles,
    plans: selectedPlans,
    memoryObjects: selectedMemoryObjects,
    segments: selectedSegments,
  }
}

function renderDotGraph(args: {
  transcripts: TranscriptSummary[]
  prompts: PromptEvent[]
  plans: PlanEvent[]
  codeEdits: CodeEditEvent[]
  files: FileStat[]
  edges: MemoryEdge[]
}): string {
  const recentPrompts = sortByTimestamp(args.prompts).slice(-60)
  const recentPlans = sortByTimestamp(args.plans).slice(-40)
  const recentEdits = sortByTimestamp(args.codeEdits).slice(-60)

  const transcriptIds = new Set<string>()
  const promptIds = new Set(recentPrompts.map(prompt => prompt.eventId))
  const planIds = new Set(recentPlans.map(plan => plan.eventId))
  const editIds = new Set(recentEdits.map(edit => edit.eventId))
  const fileIds = new Set<string>()

  for (const prompt of recentPrompts) {
    transcriptIds.add(makeTranscriptId(prompt.transcriptRelativePath))
  }
  for (const plan of recentPlans) {
    transcriptIds.add(makeTranscriptId(plan.transcriptRelativePath))
  }
  for (const edit of recentEdits) {
    transcriptIds.add(makeTranscriptId(edit.transcriptRelativePath))
    for (const file of edit.files) {
      fileIds.add(makeFileId(file.relativePath))
    }
  }

  for (const file of args.files.slice(0, 25)) {
    fileIds.add(makeFileId(file.relativePath))
  }

  const lines = ['digraph memory_index {', '  rankdir=LR;', '  node [shape=box];']

  for (const transcript of args.transcripts) {
    if (!transcriptIds.has(transcript.transcriptId)) {
      continue
    }
    lines.push(
      `  ${JSON.stringify(transcript.transcriptId)} [shape=folder,label=${JSON.stringify(`transcript\\n${transcript.relativePath}`)}];`,
    )
  }

  for (const prompt of recentPrompts) {
    lines.push(
      `  ${JSON.stringify(prompt.eventId)} [shape=note,label=${JSON.stringify(`prompt\\n${truncatePreview(getPromptPreview(prompt), 72)}`)}];`,
    )
  }

  for (const plan of recentPlans) {
    lines.push(
      `  ${JSON.stringify(plan.eventId)} [shape=component,label=${JSON.stringify(`plan\\n${truncatePreview(plan.content, 72)}`)}];`,
    )
  }

  for (const edit of recentEdits) {
    const editedFiles = edit.files
      .slice(0, 3)
      .map(file => file.relativePath)
      .join('\\n')
    lines.push(
      `  ${JSON.stringify(edit.eventId)} [shape=box3d,label=${JSON.stringify(`edit\\n${editedFiles || 'files'}`)}];`,
    )
  }

  for (const file of args.files) {
    const fileId = makeFileId(file.relativePath)
    if (!fileIds.has(fileId)) {
      continue
    }
    lines.push(
      `  ${JSON.stringify(fileId)} [shape=ellipse,label=${JSON.stringify(`file\\n${file.relativePath}`)}];`,
    )
  }

  let renderedEdges = 0
  for (const edge of args.edges) {
    const sourceIncluded =
      transcriptIds.has(edge.source) ||
      promptIds.has(edge.source) ||
      planIds.has(edge.source) ||
      editIds.has(edge.source) ||
      fileIds.has(edge.source)
    const targetIncluded =
      transcriptIds.has(edge.target) ||
      promptIds.has(edge.target) ||
      planIds.has(edge.target) ||
      editIds.has(edge.target) ||
      fileIds.has(edge.target)
    if (!sourceIncluded || !targetIncluded) {
      continue
    }
    if (renderedEdges >= DOT_EVENT_LIMIT * 3) {
      break
    }
    lines.push(
      `  ${JSON.stringify(edge.source)} -> ${JSON.stringify(edge.target)} [label=${JSON.stringify(edge.kind)}];`,
    )
    renderedEdges++
  }

  lines.push('}')
  return lines.join('\n') + '\n'
}

function renderSessionsDot(args: {
  sessions: SessionSummary[]
}): string {
  const overviewSessions = args.sessions.slice(0, SESSION_DOT_OVERVIEW_LIMIT)
  const fileIds = new Set<string>()
  const fileLabels = new Map<string, string>()

  for (const session of overviewSessions) {
    for (const file of session.topFiles.slice(0, SESSION_DOT_FILE_LIMIT)) {
      const fileId = makeFileId(file.path)
      fileIds.add(fileId)
      fileLabels.set(fileId, file.path)
    }
  }

  const lines = ['digraph memory_sessions {', '  rankdir=LR;', '  node [shape=box];']

  for (const session of overviewSessions) {
    const shortSessionId = session.sessionId.slice(0, 8)
    const labelParts = [
      `session\\n${shortSessionId}`,
      `${session.lastTimestamp ?? 'unknown time'}`,
      `transcripts:${session.transcriptCount} prompts:${session.promptCount} plans:${session.planCount} edits:${session.codeEditCount}`,
    ]
    if (session.latestPromptPreview) {
      labelParts.push(`prompt: ${truncatePreview(session.latestPromptPreview, 72)}`)
    }
    if (session.latestPlanPreview) {
      labelParts.push(`plan: ${truncatePreview(session.latestPlanPreview, 72)}`)
    }
    lines.push(
      `  ${JSON.stringify(`session:${session.sessionId}`)} [shape=folder,label=${JSON.stringify(labelParts.join('\\n'))}];`,
    )
  }

  for (const [fileId, filePath] of fileLabels.entries()) {
    lines.push(
      `  ${JSON.stringify(fileId)} [shape=ellipse,label=${JSON.stringify(`file\\n${filePath}`)}];`,
    )
  }

  const chronologicalSessions = [...overviewSessions].sort((left, right) =>
    (left.lastTimestamp ?? '').localeCompare(right.lastTimestamp ?? ''),
  )
  for (let index = 1; index < chronologicalSessions.length; index++) {
    const previous = chronologicalSessions[index - 1]
    const current = chronologicalSessions[index]
    if (!previous || !current) {
      continue
    }
    lines.push(
      `  ${JSON.stringify(`session:${previous.sessionId}`)} -> ${JSON.stringify(`session:${current.sessionId}`)} [label="next_session",color="gray60"];`,
    )
  }

  for (const session of overviewSessions) {
    for (const file of session.topFiles.slice(0, SESSION_DOT_FILE_LIMIT)) {
      lines.push(
        `  ${JSON.stringify(`session:${session.sessionId}`)} -> ${JSON.stringify(makeFileId(file.path))} [label=${JSON.stringify(`touches ${file.touches}`)}];`,
      )
    }
  }

  lines.push('}')
  return lines.join('\n') + '\n'
}

function renderSummary(args: {
  manifest: MemoryIndexManifest
  sessions: SessionSummary[]
  transcripts: TranscriptSummary[]
  prompts: PromptEvent[]
  plans: PlanEvent[]
  codeEdits: CodeEditEvent[]
  memoryObjects: MemoryObject[]
  files: FileStat[]
}): string {
  const recentPrompts = sortByTimestamp(args.prompts).slice(-10).reverse()
  const recentPlans = sortByTimestamp(args.plans).slice(-5).reverse()
  const recentEdits = sortByTimestamp(args.codeEdits).slice(-10).reverse()
  const memoryObjectCounts = countMemoryObjectsByKind(args.memoryObjects)
  const compareDurableMemoryObjects = (
    left: MemoryObject,
    right: MemoryObject,
  ): number =>
    right.sessionIds.length - left.sessionIds.length ||
    right.evidence.length - left.evidence.length ||
    right.confidence - left.confidence ||
    right.lastSeenAt.localeCompare(left.lastSeenAt)
  const activePreferences = args.memoryObjects.filter(
    object => object.kind === 'user_preference' && object.status === 'active',
  )
  activePreferences.sort(compareDurableMemoryObjects)
  const activeConstraints = args.memoryObjects.filter(
    object => object.kind === 'stable_constraint' && object.status === 'active',
  )
  activeConstraints.sort(compareDurableMemoryObjects)
  const recentRationales = args.memoryObjects.filter(
    object => object.kind === 'decision_rationale',
  )
  const supersededDecisions = args.memoryObjects.filter(
    object => object.kind === 'superseded_decision',
  )

  const lines = [
    '# Memory Index Summary',
    '',
    `- root: ${args.manifest.rootDir}`,
    `- output: ${args.manifest.outputDir}`,
    `- transcripts_dir: ${args.manifest.transcriptsDir}`,
    `- file_history_dir: ${args.manifest.fileHistoryDir}`,
    `- codex_sessions_dir: ${args.manifest.codexSessionsDir}`,
    `- source_inputs: ${MEMORY_SOURCE_INPUTS_DESCRIPTION}`,
    `- transcripts: ${args.manifest.transcriptCount}`,
    `- sessions: ${args.manifest.sessionCount}`,
    `- user_prompts: ${args.manifest.userPromptCount}`,
    `- plans: ${args.manifest.planCount}`,
    `- code_edits: ${args.manifest.codeEditCount}`,
    `- memory_objects: ${args.manifest.memoryObjectCount}`,
    `- files_touched: ${args.manifest.fileCount}`,
    `- relations: ${args.manifest.edgeCount}`,
    `- max_transcripts: ${args.manifest.maxTranscripts ?? 'none'}`,
    `- project_memory_graph_py: ${join(args.manifest.outputDir, 'project_memory_graph.py')}`,
    `- skeleton_index_py: ${join(args.manifest.outputDir, 'skeleton', '__index__.py')}`,
    `- dot_manifest_json: ${join(args.manifest.outputDir, 'index', 'dot', 'manifest.json')}`,
    `- source_of_truth: ${MEMORY_SOURCE_OF_TRUTH_DESCRIPTION}`,
    `- derived_semantic_layer: index/memory_objects.jsonl -> user_preference: ${memoryObjectCounts.user_preference} | stable_constraint: ${memoryObjectCounts.stable_constraint} | decision_rationale: ${memoryObjectCounts.decision_rationale} | superseded_decision: ${memoryObjectCounts.superseded_decision}`,
    '- compact_summaries_not_source_of_truth: .claude/context/session_state.py | .claude/context/session_history.py | .claude/context/session_metrics.py',
    '',
    '## Recent Prompts',
    ...(
      recentPrompts.length > 0
        ? recentPrompts.map(
            prompt =>
              `- ${prompt.timestamp} | ${prompt.transcriptRelativePath} | ${truncatePreview(getPromptPreview(prompt), 200)}`,
          )
        : ['- none']
    ),
    '',
    '## Recent Plans',
    ...(
      recentPlans.length > 0
        ? recentPlans.map(
            plan =>
              `- ${plan.timestamp} | ${plan.source} | ${truncatePreview(plan.content, 200)}`,
          )
        : ['- none']
    ),
    '',
    '## Active Preferences',
    ...(
      activePreferences.length > 0
        ? activePreferences
            .slice(0, 8)
            .map(
              object =>
                `- ${truncatePreview(object.statement, 180)} | sessions: ${object.sessionIds.length} | evidence: ${object.evidence.length} | confidence: ${object.confidence.toFixed(2)} | last_seen: ${object.lastSeenAt}`,
            )
        : ['- none']
    ),
    '',
    '## Active Constraints',
    ...(
      activeConstraints.length > 0
        ? activeConstraints
            .slice(0, 8)
            .map(
              object =>
                `- ${truncatePreview(object.statement, 180)} | sessions: ${object.sessionIds.length} | evidence: ${object.evidence.length} | confidence: ${object.confidence.toFixed(2)} | last_seen: ${object.lastSeenAt}`,
            )
        : ['- none']
    ),
    '',
    '## Decision Rationales',
    ...(
      recentRationales.length > 0
        ? recentRationales
            .slice(0, 8)
            .map(
              object =>
                `- ${truncatePreview(object.statement, 180)} | last_seen: ${object.lastSeenAt}`,
            )
        : ['- none']
    ),
    '',
    '## Superseded Decisions',
    ...(
      supersededDecisions.length > 0
        ? supersededDecisions
            .slice(0, 8)
            .map(object => {
              const change =
                object.supersededStatement && object.replacementStatement
                  ? `${object.supersededStatement} -> ${object.replacementStatement}`
                  : object.statement
              return `- ${truncatePreview(change, 180)} | last_seen: ${object.lastSeenAt}`
            })
        : ['- none']
    ),
    '',
    '## Most Edited Files',
    ...(
      args.files.length > 0
        ? args.files
            .slice(0, 20)
            .map(file => `- ${file.relativePath} | touches: ${file.touchCount}`)
        : ['- none']
    ),
    '',
    '## Recent Code Edits',
    ...(
      recentEdits.length > 0
        ? recentEdits.map(edit => {
            const files = edit.files
              .map(file => {
                const ranges = file.lineRanges.join(', ')
                const kind =
                  file.contentKind === 'non_code_text'
                    ? ' text'
                    : file.contentKind === 'binary_or_unknown'
                      ? ' binary'
                      : ''
                return `${file.relativePath} (${file.status}${kind}${ranges ? ` ${ranges}` : ''})`
              })
              .join(', ')
            return `- ${edit.timestamp} | ${files}`
          })
        : ['- none']
    ),
    '',
    '## Recent Transcripts',
    ...(
      [...args.transcripts]
        .sort((left, right) =>
          (right.lastTimestamp ?? '').localeCompare(left.lastTimestamp ?? ''),
        )
        .slice(0, 20)
        .map(
          transcript =>
            `- ${transcript.relativePath} | prompts: ${transcript.promptCount} | plans: ${transcript.planCount} | edits: ${transcript.codeEditCount}`,
        )
    ),
    '',
    '## Recent Sessions',
    ...(
      args.sessions
        .slice(0, 20)
        .map(
          session =>
            `- ${session.lastTimestamp ?? 'unknown'} | ${session.sessionId} | prompts: ${session.promptCount} | plans: ${session.planCount} | edits: ${session.codeEditCount}${session.latestPromptPreview ? ` | ${truncatePreview(session.latestPromptPreview, 140)}` : ''}`,
        )
    ),
    '',
  ]

  return lines.join('\n') + '\n'
}

function toPythonLiteral(value: unknown): string {
  if (value === null || value === undefined) {
    return 'None'
  }
  if (typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'None'
  }
  if (typeof value === 'boolean') {
    return value ? 'True' : 'False'
  }
  if (Array.isArray(value)) {
    return `[${value.map(item => toPythonLiteral(item)).join(', ')}]`
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).map(
      ([key, item]) => `${JSON.stringify(key)}: ${toPythonLiteral(item)}`,
    )
    return `{${entries.join(', ')}}`
  }
  return JSON.stringify(String(value))
}

function toPrettyPythonLiteral(value: unknown, indent: number = 0): string {
  const currentIndent = ' '.repeat(indent)
  const nestedIndent = ' '.repeat(indent + 4)

  if (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return toPythonLiteral(value)
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[]'
    }
    const lines = value.map(
      item => `${nestedIndent}${toPrettyPythonLiteral(item, indent + 4)},`,
    )
    return `[\n${lines.join('\n')}\n${currentIndent}]`
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0) {
      return '{}'
    }
    const lines = entries.map(
      ([key, item]) =>
        `${nestedIndent}${JSON.stringify(key)}: ${toPrettyPythonLiteral(item, indent + 4)},`,
    )
    return `{\n${lines.join('\n')}\n${currentIndent}}`
  }

  return toPythonLiteral(String(value))
}

function renderIndexModule(args: {
  manifest: MemoryIndexManifest
  sessions: SessionSummary[]
  transcripts: TranscriptSummary[]
  prompts: PromptEvent[]
  plans: PlanEvent[]
  codeEdits: CodeEditEvent[]
  memoryObjects: MemoryObject[]
  files: FileStat[]
}): string {
  const recentTranscripts = [...args.transcripts]
    .sort((left, right) =>
      (right.lastTimestamp ?? '').localeCompare(left.lastTimestamp ?? ''),
    )
    .slice(0, 20)
    .map(transcript => ({
      relative_path: transcript.relativePath,
      session_id: transcript.sessionId,
      is_sidechain: transcript.isSidechain,
      agent_id: transcript.agentId ?? null,
      prompt_count: transcript.promptCount,
      plan_count: transcript.planCount,
      code_edit_count: transcript.codeEditCount,
      last_timestamp: transcript.lastTimestamp ?? null,
    }))

  const recentSessions = args.sessions.slice(0, 20).map(session => ({
    session_id: session.sessionId,
    transcript_count: session.transcriptCount,
    prompt_count: session.promptCount,
    plan_count: session.planCount,
    code_edit_count: session.codeEditCount,
    first_timestamp: session.firstTimestamp ?? null,
    last_timestamp: session.lastTimestamp ?? null,
    latest_prompt_preview: session.latestPromptPreview ?? null,
    latest_plan_preview: session.latestPlanPreview ?? null,
    top_files: session.topFiles,
  }))

  const recentPrompts = sortByTimestamp(args.prompts)
    .slice(-20)
    .reverse()
    .map(prompt => ({
      event_id: prompt.eventId,
      timestamp: prompt.timestamp,
      transcript: prompt.transcriptRelativePath,
      text: truncatePreview(getPromptPreview(prompt), 220),
      full_text: prompt.fullText,
      normalized_text: prompt.normalizedText,
    }))

  const recentPlans = sortByTimestamp(args.plans)
    .slice(-12)
    .reverse()
    .map(plan => ({
      event_id: plan.eventId,
      timestamp: plan.timestamp,
      source: plan.source,
      transcript: plan.transcriptRelativePath,
      preview: truncatePreview(plan.content, 220),
    }))

  const recentCodeEdits = sortByTimestamp(args.codeEdits)
    .slice(-20)
    .reverse()
    .map(edit => ({
      event_id: edit.eventId,
      timestamp: edit.timestamp,
      transcript: edit.transcriptRelativePath,
      files: edit.files.map(file => ({
        path: file.relativePath,
        status: file.status,
        content_kind: file.contentKind,
        additions: file.additions,
        deletions: file.deletions,
        line_ranges: file.lineRanges,
        diff_text: file.diffText,
        before_content:
          file.contentKind === 'non_code_text' ? (file.beforeContent ?? null) : null,
        after_content:
          file.contentKind === 'non_code_text' ? (file.afterContent ?? null) : null,
      })),
    }))

  const hotFiles = args.files.slice(0, 30).map(file => ({
    path: file.relativePath,
    touch_count: file.touchCount,
    last_edited_at: file.lastEditedAt,
    last_edit_event_id: file.lastEditEventId,
  }))
  const memoryObjectCounts = countMemoryObjectsByKind(args.memoryObjects)
  const compareDurableMemoryObjects = (
    left: MemoryObject,
    right: MemoryObject,
  ): number =>
    right.sessionIds.length - left.sessionIds.length ||
    right.evidence.length - left.evidence.length ||
    right.confidence - left.confidence ||
    right.lastSeenAt.localeCompare(left.lastSeenAt)
  const summarizeMemoryObject = (object: MemoryObject) => ({
    object_id: object.objectId,
    kind: object.kind,
    status: object.status,
    statement: object.statement,
    confidence: object.confidence,
    first_seen_at: object.firstSeenAt,
    last_seen_at: object.lastSeenAt,
    session_count: object.sessionIds.length,
    evidence_count: object.evidence.length,
    superseded_by: object.supersededBy ?? null,
    superseded_statement: object.supersededStatement ?? null,
    replacement_statement: object.replacementStatement ?? null,
    tags: object.tags,
    source_event_ids: object.sourceEventIds,
  })
  const recentMemoryObjects = args.memoryObjects
    .slice(0, 24)
    .map(summarizeMemoryObject)
  const activeUserPreferences = args.memoryObjects
    .filter(object => object.kind === 'user_preference' && object.status === 'active')
    .sort(compareDurableMemoryObjects)
    .slice(0, 12)
    .map(summarizeMemoryObject)
  const activeStableConstraints = args.memoryObjects
    .filter(
      object => object.kind === 'stable_constraint' && object.status === 'active',
    )
    .sort(compareDurableMemoryObjects)
    .slice(0, 12)
    .map(summarizeMemoryObject)
  const recentDecisionRationales = args.memoryObjects
    .filter(object => object.kind === 'decision_rationale')
    .slice(0, 12)
    .map(summarizeMemoryObject)
  const recentSupersededDecisions = args.memoryObjects
    .filter(object => object.kind === 'superseded_decision')
    .slice(0, 12)
    .map(summarizeMemoryObject)

  const eventCounts = {
    transcripts: args.manifest.transcriptCount,
    sessions: args.manifest.sessionCount,
    user_prompts: args.manifest.userPromptCount,
    plans: args.manifest.planCount,
    code_edits: args.manifest.codeEditCount,
    memory_objects: args.manifest.memoryObjectCount,
    files_touched: args.manifest.fileCount,
    relations: args.manifest.edgeCount,
  }

  return [
    '# __index__.py  (auto-generated memory navigation bus)',
    'from __future__ import annotations',
    '',
    `MEMORY_SOURCE_OF_TRUTH = ${toPythonLiteral({
      events_jsonl: MEMORY_SOURCE_OF_TRUTH_DESCRIPTION,
      source_inputs: MEMORY_SOURCE_INPUTS_DESCRIPTION,
      transcripts_dir: args.manifest.transcriptsDir,
      file_history_dir: args.manifest.fileHistoryDir,
      codex_sessions_dir: args.manifest.codexSessionsDir,
      project_memory_graph_py:
        'project-level relation map for sessions, plans, edits, durable memory objects, and touched files; concise navigation layer, not source of truth',
      skeleton_index_py:
        'segment/topic Python skeleton index for targeted recall; open only the modules you need',
      dot_manifest_json:
        'sharded DOT manifest for overview graphs plus session/topic shards; prefer shards over loading giant DOT files',
      memory_objects_jsonl:
        'derived semantic layer for user preferences, stable constraints, decision rationales, and superseded decisions; verify exact wording against events.jsonl when needed',
      compact_summaries_not_source_of_truth: [
        '.claude/context/session_state.py',
        '.claude/context/session_history.py',
        '.claude/context/session_metrics.py',
      ],
      summary:
        'summary and recent_* lists are previews only; use events.jsonl for durable memory',
    })}`,
    `EVENT_COUNTS = ${toPythonLiteral(eventCounts)}`,
    `MEMORY_OBJECT_COUNTS = ${toPythonLiteral(memoryObjectCounts)}`,
    `RECENT_SESSIONS = ${toPythonLiteral(recentSessions)}`,
    `RECENT_TRANSCRIPTS = ${toPythonLiteral(recentTranscripts)}`,
    `RECENT_USER_PROMPTS = ${toPythonLiteral(recentPrompts)}`,
    `RECENT_PLANS = ${toPythonLiteral(recentPlans)}`,
    `RECENT_CODE_EDITS = ${toPythonLiteral(recentCodeEdits)}`,
    `RECENT_MEMORY_OBJECTS = ${toPythonLiteral(recentMemoryObjects)}`,
    `ACTIVE_USER_PREFERENCES = ${toPythonLiteral(activeUserPreferences)}`,
    `ACTIVE_STABLE_CONSTRAINTS = ${toPythonLiteral(activeStableConstraints)}`,
    `RECENT_DECISION_RATIONALES = ${toPythonLiteral(recentDecisionRationales)}`,
    `RECENT_SUPERSEDED_DECISIONS = ${toPythonLiteral(recentSupersededDecisions)}`,
    `HOT_FILES = ${toPythonLiteral(hotFiles)}`,
    '',
    'def recent_sessions(n: int = 10):',
    '    return RECENT_SESSIONS[:n]',
    '',
    'def recent_prompts(n: int = 10):',
    '    return RECENT_USER_PROMPTS[:n]',
    '',
    'def recent_plans(n: int = 10):',
    '    return RECENT_PLANS[:n]',
    '',
    'def recent_code_edits(n: int = 10):',
    '    return RECENT_CODE_EDITS[:n]',
    '',
    'def memory_objects(kind: str = "", n: int = 10):',
    '    if kind == "user_preference":',
    '        return ACTIVE_USER_PREFERENCES[:n]',
    '    if kind == "stable_constraint":',
    '        return ACTIVE_STABLE_CONSTRAINTS[:n]',
    '    if kind == "decision_rationale":',
    '        return RECENT_DECISION_RATIONALES[:n]',
    '    if kind == "superseded_decision":',
    '        return RECENT_SUPERSEDED_DECISIONS[:n]',
    '    return RECENT_MEMORY_OBJECTS[:n]',
    '',
    'def hot_files(n: int = 10):',
    '    return HOT_FILES[:n]',
    '',
  ].join('\n')
}

function renderProjectMemoryGraphModule(args: {
  manifest: MemoryIndexManifest
  plans: PlanEvent[]
  memoryObjects: MemoryObject[]
  graphAnalysis: MemoryGraphAnalysis
}): string {
  const compareDurableMemoryObjects = (
    left: MemoryObject,
    right: MemoryObject,
  ): number =>
    right.sessionIds.length - left.sessionIds.length ||
    right.evidence.length - left.evidence.length ||
    right.confidence - left.confidence ||
    right.lastSeenAt.localeCompare(left.lastSeenAt)

  const referencedPlanIds = new Set<string>(
    [
      ...args.graphAnalysis.topics.flatMap(topic => topic.planIds),
      ...args.graphAnalysis.sessions.flatMap(session => session.planIds),
      ...args.graphAnalysis.files.flatMap(file => file.planIds),
    ].filter(Boolean),
  )
  const referencedMemoryIds = new Set<string>(
    [
      ...args.graphAnalysis.topics.flatMap(topic => topic.memoryObjectIds),
      ...args.graphAnalysis.sessions.flatMap(session => session.memoryObjectIds),
      ...args.graphAnalysis.files.flatMap(file => file.memoryObjectIds),
    ].filter(Boolean),
  )

  const selectedConstraints = args.memoryObjects
    .filter(
      object =>
        object.kind === 'stable_constraint' &&
        object.status === 'active' &&
        (referencedMemoryIds.has(object.objectId) || referencedMemoryIds.size === 0),
    )
    .sort(compareDurableMemoryObjects)
    .slice(0, 16)
  const selectedPreferences = args.memoryObjects
    .filter(
      object =>
        object.kind === 'user_preference' &&
        object.status === 'active' &&
        (referencedMemoryIds.has(object.objectId) || referencedMemoryIds.size === 0),
    )
    .sort(compareDurableMemoryObjects)
    .slice(0, 16)
  const selectedRationales = args.memoryObjects
    .filter(
      object =>
        object.kind === 'decision_rationale' &&
        (referencedMemoryIds.has(object.objectId) || referencedMemoryIds.size === 0),
    )
    .sort(compareDurableMemoryObjects)
    .slice(0, 16)
  const selectedSuperseded = args.memoryObjects
    .filter(
      object =>
        object.kind === 'superseded_decision' &&
        (referencedMemoryIds.has(object.objectId) || referencedMemoryIds.size === 0),
    )
    .sort(compareDurableMemoryObjects)
    .slice(0, 10)

  const memorySymbolById = new Map<string, string>()
  for (const object of [
    ...selectedConstraints,
    ...selectedPreferences,
    ...selectedRationales,
    ...selectedSuperseded,
  ]) {
    const prefix =
      object.kind === 'stable_constraint'
        ? 'constraint'
        : object.kind === 'user_preference'
          ? 'preference'
          : object.kind === 'decision_rationale'
            ? 'decision'
            : 'superseded'
    memorySymbolById.set(
      object.objectId,
      `${prefix}_${object.objectId.split(':').at(-1)}`,
    )
  }

  const selectedPlans = dedupeByKey(
    [
      ...args.plans
        .filter(plan => referencedPlanIds.has(plan.eventId))
        .slice()
        .reverse(),
      ...args.plans.slice().reverse(),
    ],
    plan => plan.eventId,
  ).slice(0, Math.max(12, referencedPlanIds.size))
  const planSymbolById = new Map(
    selectedPlans.map((plan, index) => [
      plan.eventId,
      `plan_${String(index + 1).padStart(2, '0')}_${hashContent(plan.eventId).slice(0, 6)}`,
    ]),
  )

  const topicSymbolById = new Map(
    args.graphAnalysis.topics.map(topic => [
      topic.topicId,
      toPythonSymbol(topic.title, 'topic'),
    ]),
  )
  const sessionSymbolById = new Map(
    args.graphAnalysis.sessions.map(session => [
      session.sessionId,
      `session_${session.sessionId.slice(0, 8)}`,
    ]),
  )
  const fileSymbolByPath = new Map(
    args.graphAnalysis.files.map(file => [file.path, toPythonSymbol(file.path, 'file')]),
  )

  const memoryRef = (objectId: string): string => {
    const object = args.memoryObjects.find(candidate => candidate.objectId === objectId)
    const symbol = memorySymbolById.get(objectId)
    if (!object || !symbol) {
      return objectId
    }
    const className =
      object.kind === 'stable_constraint'
        ? 'Constraints'
        : object.kind === 'user_preference'
          ? 'Preferences'
          : 'Decisions'
    return `${className}.${symbol}`
  }

  const selectedPlanPreview = (plan: PlanEvent): string =>
    truncatePreview(
      plan.content
        .replace(/^#+\s*/gm, '')
        .replace(/\s+/g, ' ')
        .trim(),
      180,
    )
  const resolveGraphNodeRef = (nodeId: string): string => {
    if (nodeId.startsWith('topic:')) {
      const topicId = nodeId.slice('topic:'.length)
      return topicSymbolById.get(topicId) ?? topicId
    }
    if (nodeId.startsWith('session:')) {
      const sessionId = nodeId.slice('session:'.length)
      return sessionSymbolById.get(sessionId) ?? sessionId
    }
    if (nodeId.startsWith('file:')) {
      const filePath = nodeId.slice('file:'.length)
      return fileSymbolByPath.get(filePath) ?? filePath
    }
    if (nodeId.startsWith('plan:')) {
      const planId = nodeId.slice('plan:'.length)
      return planSymbolById.get(planId) ?? planId
    }
    if (nodeId.startsWith('memory:')) {
      return memoryRef(nodeId.slice('memory:'.length))
    }
    return nodeId
  }
  const formatRecentRanges = (
    ranges: Array<{
      sessionId: string
      status: string
      lineRanges: string
    }>,
  ): string =>
    truncatePreview(
      ranges
        .map(range => {
          const sessionLabel =
            sessionSymbolById.get(range.sessionId) ?? range.sessionId
          const statusLabel = range.status ? ` ${range.status}` : ''
          return `${sessionLabel}${statusLabel} ${range.lineRanges}`.trim()
        })
        .join(' | '),
      220,
    )

  const lines = [
    '# project_memory_graph.py  (auto-generated project memory skeleton)',
    'from __future__ import annotations',
    '',
    '# Read order: Topics -> Sessions -> Files -> Constraints -> Preferences -> Decisions -> Plans',
    '# Durable source of truth: .memory_index/index/events.jsonl',
    '# Semantic layer: .memory_index/index/memory_objects.jsonl',
    '# Graph view: .memory_index/index/memory_graph.dot',
    '',
    `PROJECT_MEMORY_META = ${toPrettyPythonLiteral({
      artifact_version: args.manifest.artifactVersion,
      graph_source: args.graphAnalysis.source,
      graph_topics: args.graphAnalysis.topics.length,
      graph_sessions: args.graphAnalysis.sessions.length,
      graph_files: args.graphAnalysis.files.length,
      graph_segments: args.graphAnalysis.segments.length,
      graph_edges: args.graphAnalysis.edges.length,
      root_dir: args.manifest.rootDir,
      output_dir: args.manifest.outputDir,
      transcripts_dir: args.manifest.transcriptsDir,
      file_history_dir: args.manifest.fileHistoryDir,
      codex_sessions_dir: args.manifest.codexSessionsDir,
      source_of_truth: 'index/events.jsonl',
      graph_json: 'index/memory_graph.json',
      graph_dot: 'index/memory_graph.dot',
      skeleton_index: 'skeleton/__index__.py',
      dot_manifest: 'index/dot/manifest.json',
      counts: {
        sessions: args.manifest.sessionCount,
        transcripts: args.manifest.transcriptCount,
        prompts: args.manifest.userPromptCount,
        plans: args.manifest.planCount,
        code_edits: args.manifest.codeEditCount,
        memory_objects: args.manifest.memoryObjectCount,
        files_touched: args.manifest.fileCount,
      },
    })}`,
    '',
    'def topic_ref(name: str) -> None: ...',
    'def session_ref(name: str) -> None: ...',
    'def file_ref(name: str) -> None: ...',
    'def segment_ref(name: str) -> None: ...',
    'def plan_ref(name: str) -> None: ...',
    'def memory_ref(name: str) -> None: ...',
    'def rel(kind: str, target: str, reason: str = "") -> None: ...',
    '',
    'class Constraints:',
  ]

  if (selectedConstraints.length === 0) {
    lines.push('    ...')
  } else {
    for (const object of selectedConstraints) {
      const symbol =
        memorySymbolById.get(object.objectId) ??
        `constraint_${hashContent(object.objectId).slice(0, 10)}`
      lines.push(
        `    # @memory ${object.objectId} | last_seen ${object.lastSeenAt} | sessions ${object.sessionIds.length}`,
      )
      lines.push(`    ${symbol} = ${JSON.stringify(object.statement)}`)
      lines.push('')
    }
    if (lines.at(-1) === '') {
      lines.pop()
    }
  }

  lines.push('', 'class Preferences:')
  if (selectedPreferences.length === 0) {
    lines.push('    ...')
  } else {
    for (const object of selectedPreferences) {
      const symbol =
        memorySymbolById.get(object.objectId) ??
        `preference_${hashContent(object.objectId).slice(0, 10)}`
      lines.push(
        `    # @memory ${object.objectId} | last_seen ${object.lastSeenAt} | sessions ${object.sessionIds.length}`,
      )
      lines.push(`    ${symbol} = ${JSON.stringify(object.statement)}`)
      lines.push('')
    }
    if (lines.at(-1) === '') {
      lines.pop()
    }
  }

  lines.push('', 'class Decisions:')
  if (selectedRationales.length === 0 && selectedSuperseded.length === 0) {
    lines.push('    ...')
  } else {
    for (const object of selectedRationales) {
      const symbol =
        memorySymbolById.get(object.objectId) ??
        `decision_${hashContent(object.objectId).slice(0, 10)}`
      lines.push(
        `    # @memory ${object.objectId} | rationale | last_seen ${object.lastSeenAt}`,
      )
      lines.push(`    ${symbol} = ${JSON.stringify(object.statement)}`)
      lines.push('')
    }
    for (const object of selectedSuperseded) {
      const symbol =
        memorySymbolById.get(object.objectId) ??
        `superseded_${hashContent(object.objectId).slice(0, 10)}`
      const change =
        object.supersededStatement && object.replacementStatement
          ? `${object.supersededStatement} -> ${object.replacementStatement}`
          : object.statement
      lines.push(
        `    # @memory ${object.objectId} | superseded | last_seen ${object.lastSeenAt}`,
      )
      lines.push(`    ${symbol} = ${JSON.stringify(change)}`)
      lines.push('')
    }
    if (lines.at(-1) === '') {
      lines.pop()
    }
  }

  lines.push('', 'class Plans:', '    ...', '')
  for (const plan of selectedPlans) {
    const symbol =
      planSymbolById.get(plan.eventId) ??
      `plan_${hashContent(plan.eventId).slice(0, 10)}`
    lines.push(
      `# @plan ${plan.eventId} | ${plan.timestamp} | ${plan.source} | session ${plan.sessionId}`,
    )
    lines.push(`def ${symbol}() -> None:`)
    lines.push(`    """${selectedPlanPreview(plan)}"""`)
    lines.push(`    # transcript: ${plan.transcriptRelativePath}`)
    if (plan.planFilePath) {
      lines.push(`    # plan_file: ${plan.planFilePath}`)
    }
    lines.push('    ...')
    lines.push('')
  }

  lines.push('class Topics:', '    ...', '')
  for (const topic of args.graphAnalysis.topics) {
    const symbol =
      topicSymbolById.get(topic.topicId) ??
      toPythonSymbol(topic.title, 'topic')
    lines.push(
      `# @topic ${topic.topicId} | status ${topic.status} | sessions ${topic.sessionIds.length} | files ${topic.filePaths.length}`,
    )
    lines.push(`def ${symbol}() -> None:`)
    lines.push(`    """${topic.summary}"""`)
    lines.push(`    # title: ${topic.title}`)
    for (const sessionId of topic.sessionIds) {
      lines.push(
        `    session_ref(${JSON.stringify(sessionSymbolById.get(sessionId) ?? sessionId)})`,
      )
    }
    for (const filePath of topic.filePaths) {
      lines.push(
        `    file_ref(${JSON.stringify(fileSymbolByPath.get(filePath) ?? filePath)})`,
      )
    }
    for (const planId of topic.planIds) {
      lines.push(
        `    plan_ref(${JSON.stringify(planSymbolById.get(planId) ?? planId)})`,
      )
    }
    for (const memoryObjectId of topic.memoryObjectIds) {
      lines.push(`    memory_ref(${JSON.stringify(memoryRef(memoryObjectId))})`)
    }
    for (const relatedTopic of topic.relatedTopics) {
      lines.push(
        `    rel("related_topic", ${JSON.stringify(
          topicSymbolById.get(relatedTopic.topicId) ?? relatedTopic.topicId,
        )}, ${JSON.stringify(relatedTopic.reason)})`,
      )
    }
    for (const edge of args.graphAnalysis.edges.filter(
      edge => edge.source === `topic:${topic.topicId}`,
    )) {
      lines.push(
        `    rel(${JSON.stringify(edge.kind)}, ${JSON.stringify(resolveGraphNodeRef(edge.target))}, ${JSON.stringify(edge.reason)})`,
      )
    }
    lines.push('    ...')
    lines.push('')
  }

  lines.push('class Sessions:', '    ...', '')
  for (const session of args.graphAnalysis.sessions) {
    const symbol =
      sessionSymbolById.get(session.sessionId) ??
      `session_${session.sessionId.slice(0, 8)}`
    lines.push(
      `# @session ${session.sessionId} | topics ${session.topicIds.length} | files ${session.filePaths.length}`,
    )
    lines.push(`def ${symbol}() -> None:`)
    lines.push(`    """${session.title}"""`)
    lines.push(`    # summary: ${session.summary}`)
    for (const topicId of session.topicIds) {
      lines.push(
        `    topic_ref(${JSON.stringify(topicSymbolById.get(topicId) ?? topicId)})`,
      )
    }
    for (const filePath of session.filePaths) {
      lines.push(
        `    file_ref(${JSON.stringify(fileSymbolByPath.get(filePath) ?? filePath)})`,
      )
    }
    for (const planId of session.planIds) {
      lines.push(
        `    plan_ref(${JSON.stringify(planSymbolById.get(planId) ?? planId)})`,
      )
    }
    for (const memoryObjectId of session.memoryObjectIds) {
      lines.push(`    memory_ref(${JSON.stringify(memoryRef(memoryObjectId))})`)
    }
    for (const relatedSession of session.relatedSessions) {
      lines.push(
        `    rel("related_session", ${JSON.stringify(
          sessionSymbolById.get(relatedSession.sessionId) ?? relatedSession.sessionId,
        )}, ${JSON.stringify(relatedSession.reason)})`,
      )
    }
    for (const edge of args.graphAnalysis.edges.filter(
      edge => edge.source === `session:${session.sessionId}`,
    )) {
      lines.push(
        `    rel(${JSON.stringify(edge.kind)}, ${JSON.stringify(resolveGraphNodeRef(edge.target))}, ${JSON.stringify(edge.reason)})`,
      )
    }
    lines.push('    ...')
    lines.push('')
  }

  lines.push('class Files:', '    ...', '')
  for (const file of args.graphAnalysis.files) {
    const symbol =
      fileSymbolByPath.get(file.path) ?? toPythonSymbol(file.path, 'file')
    lines.push(
      `# @file ${file.path} | topics ${file.topicIds.length} | sessions ${file.sessionIds.length}`,
    )
    lines.push(`def ${symbol}() -> None:`)
    lines.push(`    """${file.role}"""`)
    if (file.recentRanges.length > 0) {
      lines.push(
        `    # recent_ranges: ${formatRecentRanges(file.recentRanges)}`,
      )
    }
    for (const topicId of file.topicIds) {
      lines.push(
        `    topic_ref(${JSON.stringify(topicSymbolById.get(topicId) ?? topicId)})`,
      )
    }
    for (const sessionId of file.sessionIds) {
      lines.push(
        `    session_ref(${JSON.stringify(sessionSymbolById.get(sessionId) ?? sessionId)})`,
      )
    }
    for (const planId of file.planIds) {
      lines.push(
        `    plan_ref(${JSON.stringify(planSymbolById.get(planId) ?? planId)})`,
      )
    }
    for (const memoryObjectId of file.memoryObjectIds) {
      lines.push(`    memory_ref(${JSON.stringify(memoryRef(memoryObjectId))})`)
    }
    for (const edge of args.graphAnalysis.edges.filter(
      edge => edge.source === `file:${file.path}`,
    )) {
      lines.push(
        `    rel(${JSON.stringify(edge.kind)}, ${JSON.stringify(resolveGraphNodeRef(edge.target))}, ${JSON.stringify(edge.reason)})`,
      )
    }
    lines.push('    ...')
    lines.push('')
  }

  lines.push(
    'def active_constraints() -> list[str]:',
    `    return [${selectedConstraints
      .map(object => JSON.stringify(object.statement))
      .join(', ')}]`,
    '',
    'def active_preferences() -> list[str]:',
    `    return [${selectedPreferences
      .map(object => JSON.stringify(object.statement))
      .join(', ')}]`,
    '',
  )

  return lines.join('\n')
}

function toArtifactFileStem(value: string, prefix: string): string {
  const symbol = toPythonSymbol(value, prefix)
  const normalized = symbol.startsWith(`${prefix}_`)
    ? symbol.slice(prefix.length + 1)
    : symbol
  const core = normalized || hashContent(value).slice(0, 8)
  return `${prefix}_${core.slice(0, 24)}_${hashContent(value).slice(0, 8)}`
}

function renderMemorySkeletonPackageInit(): string {
  return ['from __future__ import annotations', ''].join('\n')
}

function renderMemorySkeletonRefsModule(): string {
  return [
    'from __future__ import annotations',
    '',
    'def topic_ref(name: str) -> None: ...',
    'def session_ref(name: str) -> None: ...',
    'def file_ref(name: str) -> None: ...',
    'def segment_ref(name: str) -> None: ...',
    'def plan_ref(name: str) -> None: ...',
    'def memory_ref(name: str) -> None: ...',
    'def rel(kind: str, target: str, reason: str = "") -> None: ...',
    '',
  ].join('\n')
}

function renderMemorySkeletonIndexModule(args: {
  graphAnalysis: MemoryGraphAnalysis
  topicModulePaths: Map<string, string>
  segmentModulePaths: Map<string, string>
}): string {
  return [
    'from __future__ import annotations',
    '',
    `SKELETON_META = ${toPrettyPythonLiteral({
      topics: args.graphAnalysis.topics.length,
      sessions: args.graphAnalysis.sessions.length,
      files: args.graphAnalysis.files.length,
      segments: args.graphAnalysis.segments.length,
      dot_manifest: '../index/dot/manifest.json',
      source_of_truth: '../index/events.jsonl',
    })}`,
    `TOPIC_MODULES = ${toPrettyPythonLiteral(
      Object.fromEntries(
        args.graphAnalysis.topics.map(topic => [
          topic.topicId,
          args.topicModulePaths.get(topic.topicId) ?? '',
        ]),
      ),
    )}`,
    `SEGMENT_MODULES = ${toPrettyPythonLiteral(
      Object.fromEntries(
        args.graphAnalysis.segments.map(segment => [
          segment.segmentId,
          args.segmentModulePaths.get(segment.segmentId) ?? '',
        ]),
      ),
    )}`,
    '',
    'def topic_module(topic_id: str) -> str:',
    '    return TOPIC_MODULES.get(topic_id, "")',
    '',
    'def segment_module(segment_id: str) -> str:',
    '    return SEGMENT_MODULES.get(segment_id, "")',
    '',
  ].join('\n')
}

function renderTopicSkeletonModule(args: {
  topic: MemoryGraphAnalysis['topics'][number]
  analysis: MemoryGraphAnalysis
}): string {
  const segments = args.analysis.segments
    .filter(segment => segment.topicIds.includes(args.topic.topicId))
    .slice(0, 12)
  const functionName = toPythonSymbol(args.topic.title, 'topic')
  const lines = [
    'from __future__ import annotations',
    '',
    'from ..refs import file_ref, memory_ref, plan_ref, rel, segment_ref, session_ref, topic_ref',
    '',
    `TOPIC = ${toPrettyPythonLiteral({
      topic_id: args.topic.topicId,
      title: args.topic.title,
      summary: args.topic.summary,
      status: args.topic.status,
      segments: segments.map(segment => segment.segmentId),
    })}`,
    '',
    `# @topic ${args.topic.topicId}`,
    `def ${functionName}() -> None:`,
    `    """${args.topic.summary}"""`,
  ]

  for (const sessionId of args.topic.sessionIds) {
    lines.push(`    session_ref(${JSON.stringify(sessionId)})`)
  }
  for (const segment of segments) {
    lines.push(`    segment_ref(${JSON.stringify(segment.segmentId)})`)
  }
  for (const filePath of args.topic.filePaths) {
    lines.push(`    file_ref(${JSON.stringify(filePath)})`)
  }
  for (const planId of args.topic.planIds) {
    lines.push(`    plan_ref(${JSON.stringify(planId)})`)
  }
  for (const memoryObjectId of args.topic.memoryObjectIds) {
    lines.push(`    memory_ref(${JSON.stringify(memoryObjectId)})`)
  }
  for (const relatedTopic of args.topic.relatedTopics) {
    lines.push(
      `    topic_ref(${JSON.stringify(relatedTopic.topicId)})`,
      `    rel("related_topic", ${JSON.stringify(`topic:${relatedTopic.topicId}`)}, ${JSON.stringify(relatedTopic.reason)})`,
    )
  }
  lines.push('    ...', '')
  return lines.join('\n')
}

function renderSegmentSkeletonModule(args: {
  segment: MemoryGraphAnalysis['segments'][number]
}): string {
  const functionName = toPythonSymbol(
    `${args.segment.kind}_${args.segment.title}`,
    'segment',
  )
  const lines = [
    'from __future__ import annotations',
    '',
    'from ..refs import file_ref, memory_ref, plan_ref, rel, segment_ref, session_ref, topic_ref',
    '',
    `SEGMENT = ${toPrettyPythonLiteral({
      segment_id: args.segment.segmentId,
      kind: args.segment.kind,
      session_id: args.segment.sessionId,
      title: args.segment.title,
      summary: args.segment.summary,
      source_event_ids: args.segment.sourceEventIds,
    })}`,
    '',
    `# @segment ${args.segment.segmentId}`,
    `def ${functionName}() -> None:`,
    `    """${args.segment.summary}"""`,
    `    session_ref(${JSON.stringify(args.segment.sessionId)})`,
  ]

  if (args.segment.recentRanges.length > 0) {
    lines.push(
      `    # recent_ranges: ${truncatePreview(
        args.segment.recentRanges
          .map(
            range =>
              `${range.path} ${range.status}${range.lineRanges ? ` ${range.lineRanges}` : ''}`,
          )
          .join(' | '),
        220,
      )}`,
    )
  }
  for (const topicId of args.segment.topicIds) {
    lines.push(`    topic_ref(${JSON.stringify(topicId)})`)
  }
  for (const filePath of args.segment.filePaths) {
    lines.push(`    file_ref(${JSON.stringify(filePath)})`)
  }
  for (const planId of args.segment.planIds) {
    lines.push(`    plan_ref(${JSON.stringify(planId)})`)
  }
  for (const memoryObjectId of args.segment.memoryObjectIds) {
    lines.push(`    memory_ref(${JSON.stringify(memoryObjectId)})`)
  }
  for (const relatedSegment of args.segment.relatedSegments) {
    lines.push(
      `    segment_ref(${JSON.stringify(relatedSegment.segmentId)})`,
      `    rel("related_segment", ${JSON.stringify(`segment:${relatedSegment.segmentId}`)}, ${JSON.stringify(relatedSegment.reason)})`,
    )
  }
  lines.push('    ...', '')
  return lines.join('\n')
}

async function writeMemorySkeletonArtifacts(args: {
  outputDir: string
  graphAnalysis: MemoryGraphAnalysis
}): Promise<void> {
  const skeletonDir = join(args.outputDir, 'skeleton')
  const topicsDir = join(skeletonDir, 'topics')
  const segmentsDir = join(skeletonDir, 'segments')
  await mkdir(topicsDir, { recursive: true })
  await mkdir(segmentsDir, { recursive: true })

  const topicModulePaths = new Map<string, string>()
  const segmentModulePaths = new Map<string, string>()

  for (const topic of args.graphAnalysis.topics) {
    const relativeModulePath = toPosixPath(
      join('topics', `${toArtifactFileStem(topic.topicId, 'topic')}.py`),
    )
    topicModulePaths.set(topic.topicId, relativeModulePath)
    await writeFile(
      join(skeletonDir, relativeModulePath),
      renderTopicSkeletonModule({
        topic,
        analysis: args.graphAnalysis,
      }),
      'utf8',
    )
  }

  for (const segment of args.graphAnalysis.segments) {
    const relativeModulePath = toPosixPath(
      join('segments', `${toArtifactFileStem(segment.segmentId, 'segment')}.py`),
    )
    segmentModulePaths.set(segment.segmentId, relativeModulePath)
    await writeFile(
      join(skeletonDir, relativeModulePath),
      renderSegmentSkeletonModule({
        segment,
      }),
      'utf8',
    )
  }

  await writeFile(join(skeletonDir, '__init__.py'), renderMemorySkeletonPackageInit(), 'utf8')
  await writeFile(join(topicsDir, '__init__.py'), renderMemorySkeletonPackageInit(), 'utf8')
  await writeFile(join(segmentsDir, '__init__.py'), renderMemorySkeletonPackageInit(), 'utf8')
  await writeFile(join(skeletonDir, 'refs.py'), renderMemorySkeletonRefsModule(), 'utf8')
  await writeFile(
    join(skeletonDir, '__index__.py'),
    renderMemorySkeletonIndexModule({
      graphAnalysis: args.graphAnalysis,
      topicModulePaths,
      segmentModulePaths,
    }),
    'utf8',
  )
}

type MemoryDotNode = {
  id: string
  label: string
  shape: string
  fillColor: string
}

function dotArtifactId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]/g, '_')
}

function dotArtifactLabel(value: string): string {
  return value.replace(/"/g, '\\"')
}

function renderFocusedMemoryDot(args: {
  name: string
  nodes: MemoryDotNode[]
  edges: MemoryGraphAnalysis['edges']
}): string {
  const lines = [
    `digraph ${args.name} {`,
    '  rankdir=LR;',
    '  graph [fontname="Helvetica"];',
    '  node [fontname="Helvetica", style="filled,rounded"];',
    '  edge [fontname="Helvetica"];',
    '',
  ]

  for (const node of args.nodes) {
    lines.push(
      `  ${dotArtifactId(node.id)} [shape=${node.shape}, fillcolor="${node.fillColor}", label="${dotArtifactLabel(node.label)}"];`,
    )
  }
  lines.push('')
  for (const edge of args.edges) {
    lines.push(
      `  ${dotArtifactId(edge.source)} -> ${dotArtifactId(edge.target)} [label="${dotArtifactLabel(edge.kind)}"];`,
    )
  }
  lines.push('}')
  return `${lines.join('\n')}\n`
}

function renderTopicShardDot(args: {
  analysis: MemoryGraphAnalysis
  topicId: string
  planPreviewById: Map<string, string>
  memoryStatementById: Map<string, string>
}): string {
  const topic = args.analysis.topics.find(candidate => candidate.topicId === args.topicId)
  if (!topic) {
    return renderFocusedMemoryDot({
      name: 'memory_topic_empty',
      nodes: [],
      edges: [],
    })
  }

  const segments = args.analysis.segments.filter(segment =>
    segment.topicIds.includes(topic.topicId),
  )
  const sessions = args.analysis.sessions.filter(
    session =>
      session.topicIds.includes(topic.topicId) ||
      topic.sessionIds.includes(session.sessionId),
  )
  const nodeIds = new Set<string>([
    `topic:${topic.topicId}`,
    ...topic.relatedTopics.map(related => `topic:${related.topicId}`),
    ...sessions.map(session => `session:${session.sessionId}`),
    ...segments.map(segment => `segment:${segment.segmentId}`),
    ...dedupeByKey(
      [
        ...topic.filePaths,
        ...segments.flatMap(segment => segment.filePaths),
      ],
      value => value,
    ).map(path => `file:${path}`),
    ...dedupeByKey(
      [
        ...topic.planIds,
        ...segments.flatMap(segment => segment.planIds),
      ],
      value => value,
    ).map(planId => `plan:${planId}`),
    ...dedupeByKey(
      [
        ...topic.memoryObjectIds,
        ...segments.flatMap(segment => segment.memoryObjectIds),
      ],
      value => value,
    ).map(memoryId => `memory:${memoryId}`),
  ])

  const nodes: MemoryDotNode[] = [
    {
      id: `topic:${topic.topicId}`,
      label: topic.title,
      shape: 'ellipse',
      fillColor: '#f3f0d7',
    },
    ...topic.relatedTopics.map(related => ({
      id: `topic:${related.topicId}`,
      label:
        args.analysis.topics.find(candidate => candidate.topicId === related.topicId)
          ?.title ?? related.topicId,
      shape: 'ellipse',
      fillColor: '#f9f6e5',
    })),
    ...sessions.map(session => ({
      id: `session:${session.sessionId}`,
      label: session.title,
      shape: 'box',
      fillColor: '#d9eef7',
    })),
    ...segments.map(segment => ({
      id: `segment:${segment.segmentId}`,
      label: `${segment.kind}\n${truncatePreview(segment.title, 72)}`,
      shape: 'note',
      fillColor: '#f9e0c7',
    })),
    ...dedupeByKey(
      [
        ...topic.filePaths,
        ...segments.flatMap(segment => segment.filePaths),
      ].map(path => ({
        id: `file:${path}`,
        label: path,
        shape: 'box',
        fillColor: '#ececec',
      })),
      node => node.id,
    ),
    ...dedupeByKey(
      [
        ...topic.planIds,
        ...segments.flatMap(segment => segment.planIds),
      ].map(planId => ({
        id: `plan:${planId}`,
        label: args.planPreviewById.get(planId) ?? planId,
        shape: 'component',
        fillColor: '#d8f0d0',
      })),
      node => node.id,
    ),
    ...dedupeByKey(
      [
        ...topic.memoryObjectIds,
        ...segments.flatMap(segment => segment.memoryObjectIds),
      ].map(memoryId => ({
        id: `memory:${memoryId}`,
        label: args.memoryStatementById.get(memoryId) ?? memoryId,
        shape: 'hexagon',
        fillColor: '#f3d7e8',
      })),
      node => node.id,
    ),
  ]

  return renderFocusedMemoryDot({
    name: 'memory_topic_shard',
    nodes: dedupeByKey(nodes, node => node.id),
    edges: args.analysis.edges.filter(
      edge => nodeIds.has(edge.source) && nodeIds.has(edge.target),
    ),
  })
}

function renderSessionShardDot(args: {
  analysis: MemoryGraphAnalysis
  sessionId: string
  sessionSummary?: SessionSummary
  planPreviewById: Map<string, string>
  memoryStatementById: Map<string, string>
}): string {
  const session = args.analysis.sessions.find(
    candidate => candidate.sessionId === args.sessionId,
  )
  if (!session) {
    if (!args.sessionSummary) {
      return renderFocusedMemoryDot({
        name: 'memory_session_empty',
        nodes: [],
        edges: [],
      })
    }
    const nodes: MemoryDotNode[] = [
      {
        id: `session:${args.sessionSummary.sessionId}`,
        label:
          args.sessionSummary.latestPromptPreview ??
          args.sessionSummary.latestPlanPreview ??
          args.sessionSummary.sessionId,
        shape: 'box',
        fillColor: '#d9eef7',
      },
      ...args.sessionSummary.topFiles.slice(0, SESSION_DOT_FILE_LIMIT).map(file => {
        nodeIds.add(`file:${file.path}`)
        return {
          id: `file:${file.path}`,
          label: file.path,
        shape: 'box',
        fillColor: '#ececec',
        }
      }),
    ]
    return renderFocusedMemoryDot({
      name: 'memory_session_shard',
      nodes,
      edges: args.sessionSummary.topFiles.slice(0, SESSION_DOT_FILE_LIMIT).map(file => ({
        source: `session:${args.sessionSummary!.sessionId}`,
        target: `file:${file.path}`,
        kind: 'touches',
        reason: `touches ${file.touches}`,
      })),
    })
  }

  const segments = args.analysis.segments.filter(
    segment => segment.sessionId === session.sessionId,
  )
  const nodeIds = new Set<string>([
    `session:${session.sessionId}`,
    ...session.relatedSessions.map(related => `session:${related.sessionId}`),
    ...session.topicIds.map(topicId => `topic:${topicId}`),
    ...segments.map(segment => `segment:${segment.segmentId}`),
    ...dedupeByKey(
      [
        ...session.filePaths,
        ...segments.flatMap(segment => segment.filePaths),
      ],
      value => value,
    ).map(path => `file:${path}`),
    ...dedupeByKey(
      [
        ...session.planIds,
        ...segments.flatMap(segment => segment.planIds),
      ],
      value => value,
    ).map(planId => `plan:${planId}`),
    ...dedupeByKey(
      [
        ...session.memoryObjectIds,
        ...segments.flatMap(segment => segment.memoryObjectIds),
      ],
      value => value,
    ).map(memoryId => `memory:${memoryId}`),
  ])

  const nodes: MemoryDotNode[] = [
    {
      id: `session:${session.sessionId}`,
      label: session.title,
      shape: 'box',
      fillColor: '#d9eef7',
    },
    ...session.relatedSessions.map(related => ({
      id: `session:${related.sessionId}`,
      label:
        args.analysis.sessions.find(candidate => candidate.sessionId === related.sessionId)
          ?.title ?? related.sessionId,
      shape: 'box',
      fillColor: '#e8f5fa',
    })),
    ...session.topicIds.map(topicId => ({
      id: `topic:${topicId}`,
      label:
        args.analysis.topics.find(candidate => candidate.topicId === topicId)?.title ??
        topicId,
      shape: 'ellipse',
      fillColor: '#f3f0d7',
    })),
    ...segments.map(segment => ({
      id: `segment:${segment.segmentId}`,
      label: `${segment.kind}\n${truncatePreview(segment.title, 72)}`,
      shape: 'note',
      fillColor: '#f9e0c7',
    })),
    ...dedupeByKey(
      [
        ...session.filePaths,
        ...segments.flatMap(segment => segment.filePaths),
      ].map(path => ({
        id: `file:${path}`,
        label: path,
        shape: 'box',
        fillColor: '#ececec',
      })),
      node => node.id,
    ),
    ...dedupeByKey(
      [
        ...session.planIds,
        ...segments.flatMap(segment => segment.planIds),
      ].map(planId => ({
        id: `plan:${planId}`,
        label: args.planPreviewById.get(planId) ?? planId,
        shape: 'component',
        fillColor: '#d8f0d0',
      })),
      node => node.id,
    ),
    ...dedupeByKey(
      [
        ...session.memoryObjectIds,
        ...segments.flatMap(segment => segment.memoryObjectIds),
      ].map(memoryId => ({
        id: `memory:${memoryId}`,
        label: args.memoryStatementById.get(memoryId) ?? memoryId,
        shape: 'hexagon',
        fillColor: '#f3d7e8',
      })),
      node => node.id,
    ),
  ]

  return renderFocusedMemoryDot({
    name: 'memory_session_shard',
    nodes: dedupeByKey(nodes, node => node.id),
    edges: args.analysis.edges.filter(
      edge => nodeIds.has(edge.source) && nodeIds.has(edge.target),
    ),
  })
}

async function writeMemoryDotArtifacts(args: {
  outputDir: string
  graphAnalysis: MemoryGraphAnalysis
  sessions: SessionSummary[]
  plans: PlanEvent[]
  memoryObjects: MemoryObject[]
}): Promise<void> {
  const dotRootDir = join(args.outputDir, 'index', 'dot')
  const sessionsDir = join(dotRootDir, 'sessions')
  const topicsDir = join(dotRootDir, 'topics')
  await mkdir(sessionsDir, { recursive: true })
  await mkdir(topicsDir, { recursive: true })

  const planPreviewById = new Map(
    args.plans.map(plan => [plan.eventId, truncatePreview(plan.content, 96)]),
  )
  const memoryStatementById = new Map(
    args.memoryObjects.map(memoryObject => [
      memoryObject.objectId,
      truncatePreview(memoryObject.statement, 96),
    ]),
  )

  const manifest: {
    overview: Record<string, string>
    shards: {
      sessions: Array<{ sessionId: string; title: string; path: string }>
      topics: Array<{ topicId: string; title: string; path: string }>
    }
  } = {
    overview: {
      architecture: 'index/architecture.dot',
      sessions: 'index/sessions.dot',
      memory_graph: 'index/memory_graph.dot',
    },
    shards: {
      sessions: [],
      topics: [],
    },
  }

  for (const sessionSummary of args.sessions) {
    const graphSession = args.graphAnalysis.sessions.find(
      candidate => candidate.sessionId === sessionSummary.sessionId,
    )
    const relativePath = toPosixPath(
      join(
        'index',
        'dot',
        'sessions',
        `${toArtifactFileStem(sessionSummary.sessionId, 'session')}.dot`,
      ),
    )
    manifest.shards.sessions.push({
      sessionId: sessionSummary.sessionId,
      title:
        graphSession?.title ??
        sessionSummary.latestPromptPreview ??
        sessionSummary.latestPlanPreview ??
        sessionSummary.sessionId,
      path: relativePath,
    })
    await writeFile(
      join(args.outputDir, relativePath),
      renderSessionShardDot({
        analysis: args.graphAnalysis,
        sessionId: sessionSummary.sessionId,
        sessionSummary,
        planPreviewById,
        memoryStatementById,
      }),
      'utf8',
    )
  }

  for (const topic of args.graphAnalysis.topics) {
    const relativePath = toPosixPath(
      join('index', 'dot', 'topics', `${toArtifactFileStem(topic.topicId, 'topic')}.dot`),
    )
    manifest.shards.topics.push({
      topicId: topic.topicId,
      title: topic.title,
      path: relativePath,
    })
    await writeFile(
      join(args.outputDir, relativePath),
      renderTopicShardDot({
        analysis: args.graphAnalysis,
        topicId: topic.topicId,
        planPreviewById,
        memoryStatementById,
      }),
      'utf8',
    )
  }

  await writeFile(
    join(dotRootDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
    'utf8',
  )
}

async function writeJsonl(path: string, rows: unknown[]): Promise<void> {
  const content =
    rows.map(row => JSON.stringify(row)).join('\n') + (rows.length > 0 ? '\n' : '')
  await writeFile(path, content, 'utf8')
}

async function writeMemoryIndexFiles(args: {
  outputDir: string
  manifest: MemoryIndexManifest
  sessions: SessionSummary[]
  transcripts: TranscriptSummary[]
  prompts: PromptEvent[]
  plans: PlanEvent[]
  codeEdits: CodeEditEvent[]
  memoryObjects: MemoryObject[]
  files: FileStat[]
  edges: MemoryEdge[]
  graphAnalysis: MemoryGraphAnalysis
}): Promise<void> {
  const indexDir = join(args.outputDir, 'index')

  await writeFile(
    join(indexDir, 'manifest.json'),
    JSON.stringify(args.manifest, null, 2) + '\n',
    'utf8',
  )
  await writeFile(
    join(indexDir, 'summary.md'),
    renderSummary({
      manifest: args.manifest,
      sessions: args.sessions,
      transcripts: args.transcripts,
      prompts: args.prompts,
      plans: args.plans,
      codeEdits: args.codeEdits,
      memoryObjects: args.memoryObjects,
      files: args.files,
    }),
    'utf8',
  )
  await writeFile(
    join(indexDir, 'architecture.dot'),
    renderDotGraph({
      transcripts: args.transcripts,
      prompts: args.prompts,
      plans: args.plans,
      codeEdits: args.codeEdits,
      files: args.files,
      edges: args.edges,
    }),
    'utf8',
  )
  await writeFile(
    join(indexDir, 'sessions.dot'),
    renderSessionsDot({
      sessions: args.sessions,
    }),
    'utf8',
  )
  await writeFile(
    join(indexDir, 'memory_graph.dot'),
    renderMemoryGraphDot(args.graphAnalysis),
    'utf8',
  )
  await writeFile(
    join(indexDir, 'memory_graph.json'),
    JSON.stringify(args.graphAnalysis, null, 2) + '\n',
    'utf8',
  )
  await writeMemoryDotArtifacts({
    outputDir: args.outputDir,
    graphAnalysis: args.graphAnalysis,
    sessions: args.sessions,
    plans: args.plans,
    memoryObjects: args.memoryObjects,
  })
  await writeFile(
    join(args.outputDir, 'project_memory_graph.py'),
    renderProjectMemoryGraphModule({
      manifest: args.manifest,
      plans: args.plans,
      memoryObjects: args.memoryObjects,
      graphAnalysis: args.graphAnalysis,
    }),
    'utf8',
  )
  await writeFile(
    join(args.outputDir, '__index__.py'),
    renderIndexModule({
      manifest: args.manifest,
      sessions: args.sessions,
      transcripts: args.transcripts,
      prompts: args.prompts,
      plans: args.plans,
      codeEdits: args.codeEdits,
      memoryObjects: args.memoryObjects,
      files: args.files,
    }),
    'utf8',
  )
  await writeMemorySkeletonArtifacts({
    outputDir: args.outputDir,
    graphAnalysis: args.graphAnalysis,
  })

  await writeJsonl(join(indexDir, 'sessions.jsonl'), args.sessions)
  await writeJsonl(join(indexDir, 'transcripts.jsonl'), args.transcripts)
  await writeJsonl(
    join(indexDir, 'events.jsonl'),
    sortByTimestamp([...args.prompts, ...args.plans, ...args.codeEdits]),
  )
  await writeJsonl(join(indexDir, 'memory_objects.jsonl'), args.memoryObjects)
  await writeJsonl(join(indexDir, 'edges.jsonl'), args.edges)
  await writeJsonl(join(indexDir, 'files.jsonl'), args.files)
}

export async function buildMemoryIndex(
  options: BuildMemoryIndexOptions,
): Promise<BuildMemoryIndexResult> {
  const startedAt = Date.now()
  const rootDir = resolve(options.rootDir)
  const outputDir = options.outputDir
    ? resolve(options.outputDir)
    : resolve(rootDir, '.memory_index')
  const transcriptsDir = options.transcriptsDir
    ? resolve(options.transcriptsDir)
    : getProjectConversationTranscriptsDir(rootDir)
  const fileHistoryDir = options.fileHistoryDir
    ? resolve(options.fileHistoryDir)
    : getProjectConversationFileHistoryDir(rootDir)
  const codexSessionsDir = options.codexSessionsDir
    ? resolve(options.codexSessionsDir)
    : getCodexSessionsDir()

  await ensureOutputDirectories(outputDir)
  await mkdir(transcriptsDir, { recursive: true })
  await mkdir(fileHistoryDir, { recursive: true })

  const legacyHydration = options.includeLegacyClaude
    ? await hydrateProjectConversationContextFromLegacyClaude({
        rootDir,
        transcriptsDir,
        fileHistoryDir,
        onProgress: options.onProgress,
      })
    : {
        copiedTranscriptCount: 0,
        copiedBackupCount: 0,
        legacyProjectDir: getProjectDir(rootDir),
      }

  await reportProgress(options.onProgress, {
    phase: 'discover',
    message:
      options.includeLegacyClaude &&
      (legacyHydration.copiedTranscriptCount > 0 ||
        legacyHydration.copiedBackupCount > 0)
        ? `Scanning transcript files after optional legacy Claude hydration (${legacyHydration.copiedTranscriptCount} transcripts, ${legacyHydration.copiedBackupCount} backups copied)`
        : 'Scanning transcript files',
  })
  const discoverStartedAt = Date.now()
  const transcriptFiles = await discoverTranscriptFiles({
    rootDir,
    transcriptsDir,
    codexSessionsDir,
    includeCodexSessions: options.includeCodexSessions,
    maxTranscripts: options.maxTranscripts,
  })
  const discoverMs = Date.now() - discoverStartedAt

  const transcriptIrs: TranscriptIR[] = []
  const extractStartedAt = Date.now()
  for (let index = 0; index < transcriptFiles.length; index++) {
    const transcript = transcriptFiles[index]!
    await reportProgress(options.onProgress, {
      phase: 'extract',
      message: `Extracting memory from ${transcript.relativePath}`,
      completed: index,
      total: transcriptFiles.length,
    })
    transcriptIrs.push(
      await extractTranscriptIR({
        transcript,
        rootDir,
      }),
    )
  }
  await reportProgress(options.onProgress, {
    phase: 'extract',
    message:
      transcriptFiles.length === 0
        ? 'No transcripts found'
        : `Extracted ${transcriptFiles.length} transcript files`,
    completed: transcriptFiles.length,
    total: transcriptFiles.length,
  })
  const extractMs = Date.now() - extractStartedAt

  const diffStartedAt = Date.now()
  const codeEdits: CodeEditEvent[] = []
  const codeEditCounts = new Map<string, number>()
  for (let index = 0; index < transcriptIrs.length; index++) {
    const transcript = transcriptIrs[index]!
    await reportProgress(options.onProgress, {
      phase: 'diff',
      message: `Reconstructing code diffs from ${transcript.transcriptRelativePath}`,
      completed: index,
      total: transcriptIrs.length,
    })
    const edits = await buildCodeEditEvents({
      rootDir,
      fileHistoryDir,
      transcript,
    })
    codeEditCounts.set(transcript.transcriptPath, edits.length)
    codeEdits.push(...edits)
  }
  await reportProgress(options.onProgress, {
    phase: 'diff',
    message:
      transcriptIrs.length === 0
        ? 'No transcript diffs to reconstruct'
        : `Reconstructed ${codeEdits.length} code-edit events`,
    completed: transcriptIrs.length,
    total: transcriptIrs.length,
  })
  const diffMs = Date.now() - diffStartedAt

  const prompts = sortByTimestamp(transcriptIrs.flatMap(transcript => transcript.prompts))
  const plans = sortByTimestamp(transcriptIrs.flatMap(transcript => transcript.plans))
  const memoryObjects = buildMemoryObjects({
    prompts,
    plans,
  })
  const files = buildFileStats(codeEdits)
  const transcripts = buildTranscriptSummaries({
    transcripts: transcriptIrs,
    codeEditCounts,
  })
  const sessions = buildSessionSummaries({
    transcripts,
    prompts,
    plans,
    codeEdits,
  })
  const edges = buildEdges({
    transcripts,
    prompts,
    plans,
    codeEdits,
  })

  const manifest: MemoryIndexManifest = {
    artifactVersion: ARTIFACT_VERSION,
    rootDir,
    outputDir,
    transcriptsDir,
    fileHistoryDir,
    codexSessionsDir,
    legacyClaudeProjectDir: options.includeLegacyClaude
      ? legacyHydration.legacyProjectDir
      : undefined,
    legacyHydratedTranscriptCount: options.includeLegacyClaude
      ? legacyHydration.copiedTranscriptCount
      : undefined,
    legacyHydratedBackupCount: options.includeLegacyClaude
      ? legacyHydration.copiedBackupCount
      : undefined,
    createdAt: new Date().toISOString(),
    transcriptCount: transcripts.length,
    sessionCount: new Set(transcripts.map(transcript => transcript.sessionId)).size,
    userPromptCount: prompts.length,
    planCount: plans.length,
    codeEditCount: codeEdits.length,
    memoryObjectCount: memoryObjects.length,
    fileCount: files.length,
    edgeCount: edges.length,
    maxTranscripts: options.maxTranscripts,
  }

  const analyzeStartedAt = Date.now()
  const graphInput = buildMemoryGraphAnalysisInput({
    manifest,
    sessions,
    prompts,
    plans,
    codeEdits,
    memoryObjects,
    files,
  })
  await reportProgress(options.onProgress, {
    phase: 'analyze',
    message: options.analyzeGraph
      ? 'Analyzing memory graph relationships'
      : 'Building heuristic memory graph relationships',
  })
  let graphDraft: MemoryGraphAgentDraft | null | undefined
  try {
    graphDraft = await options.analyzeGraph?.(graphInput)
  } catch {
    graphDraft = null
  }
  const graphAnalysis = normalizeMemoryGraphAnalysis({
    input: graphInput,
    draft: graphDraft,
  })
  const analyzeMs = Date.now() - analyzeStartedAt
  await reportProgress(options.onProgress, {
    phase: 'analyze',
    message:
      graphAnalysis.source === 'agent'
        ? `Analyzed memory graph with internal agent (${graphAnalysis.topics.length} topics, ${graphAnalysis.edges.length} edges)`
        : `Built heuristic memory graph (${graphAnalysis.topics.length} topics, ${graphAnalysis.edges.length} edges)`,
  })

  const writeStartedAt = Date.now()
  await reportProgress(options.onProgress, {
    phase: 'write',
    message: 'Writing memory index artifacts',
  })
  await writeMemoryIndexFiles({
    outputDir,
    manifest,
    sessions,
    transcripts,
    prompts,
    plans,
    codeEdits,
    memoryObjects,
    files,
    edges,
    graphAnalysis,
  })
  const writeMs = Date.now() - writeStartedAt

  const skillsStartedAt = Date.now()
  await reportProgress(options.onProgress, {
    phase: 'skills',
    message: 'Refreshing memory-index skills',
  })
  const skillPaths = await writeMemoryIndexSkills({
    rootDir,
    outputDir,
  })
  const skillsMs = Date.now() - skillsStartedAt

  const totalMs = Date.now() - startedAt
  await reportProgress(options.onProgress, {
    phase: 'complete',
    message: `Memory index complete in ${totalMs}ms`,
  })

  return {
    engine: 'transcript',
    rootDir,
    outputDir,
    transcriptsDir,
    fileHistoryDir,
    codexSessionsDir,
    graphSource: graphAnalysis.source,
    manifest,
    timings: {
      discoverMs,
      extractMs,
      diffMs,
      analyzeMs,
      writeMs,
      skillsMs,
      totalMs,
    },
    skillPaths,
    transcriptCount: transcripts.length,
    sessionCount: manifest.sessionCount,
  }
}
