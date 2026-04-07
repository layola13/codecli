import { mkdir, writeFile } from 'fs/promises'
import { join, relative } from 'path'

export type MemoryIndexSkillPaths = {
  claude: string
  codex: string
  opencode: string
}

export function resolveMemoryIndexSkillPaths(args: {
  rootDir: string
}): MemoryIndexSkillPaths {
  return {
    claude: join(args.rootDir, '.claude', 'skills', 'memory-index', 'SKILL.md'),
    codex: join(args.rootDir, '.codex', 'skills', 'memory-index', 'SKILL.md'),
    opencode: join(
      args.rootDir,
      '.opencode',
      'skills',
      'memory-index',
      'SKILL.md',
    ),
  }
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

function renderSkillMarkdown(args: {
  name: string
  description: string
  whenToUse: string
  rootDir: string
  outputDir: string
}): string {
  const outputPath = formatProjectPath(args.rootDir, args.outputDir)
  const summaryPath = `${outputPath}/index/summary.md`
  const architecturePath = `${outputPath}/index/architecture.dot`
  const sessionsDotPath = `${outputPath}/index/sessions.dot`
  const dotManifestPath = `${outputPath}/index/dot/manifest.json`
  const indexPath = `${outputPath}/__index__.py`
  const projectMemoryGraphPath = `${outputPath}/project_memory_graph.py`
  const skeletonIndexPath = `${outputPath}/skeleton/__index__.py`
  const eventsPath = `${outputPath}/index/events.jsonl`
  const memoryObjectsPath = `${outputPath}/index/memory_objects.jsonl`
  const sessionsPath = `${outputPath}/index/sessions.jsonl`
  const edgesPath = `${outputPath}/index/edges.jsonl`
  const transcriptsPath = `${outputPath}/index/transcripts.jsonl`

  return [
    '---',
    `name: ${JSON.stringify(args.name)}`,
    `description: ${JSON.stringify(args.description)}`,
    `when_to_use: ${JSON.stringify(args.whenToUse)}`,
    '---',
    '',
    '# Memory Index',
    '',
    '## Instructions',
    `- This is a blocking first step whenever \`${outputPath}/\` already exists and the task is about project history, prior user requests, previous plans, earlier code edits, or why code changed. Treat it as targeted recall, not an always-on prompt layer like \`/pin\`.`,
    `- Start with \`${summaryPath}\` for the high-level view of sessions, prompts, plans, and edits.`,
    `- Then read \`${projectMemoryGraphPath}\` for the project-level relation map: active constraints/preferences, full plan history, session-to-session links, file memory, and compact edit ranges.`,
    `- Then read \`${skeletonIndexPath}\` for the segment/topic Python skeleton map. Open only the specific modules under \`${outputPath}/skeleton/topics/\` or \`${outputPath}/skeleton/segments/\` that you actually need.`,
    `- Then read \`${indexPath}\` for recent sessions, prompts, plans, code edits, semantic memory objects, hot files, and the schema note telling you where the durable memory source lives.`,
    `- Use \`${sessionsPath}\` when you need full-history session summaries for old-memory lookup beyond the recent window.`,
    `- Use \`${dotManifestPath}\` to navigate sharded DOT files. \`${sessionsDotPath}\` is overview-only; detailed session/topic graphs live under \`${outputPath}/index/dot/\`.`,
    `- Use \`${architecturePath}\` when you want the recent high-signal event graph between transcripts, prompts, plans, edits, and touched files.`,
    '- This memory index is built from project-local raw transcript JSONL under `./.claude/projects/context/transcripts`, project-local file-history snapshots under `./.claude/projects/context/file-history`, and matching Codex session logs under `~/.codex/sessions`; it is not built from compressed context summary files.',
    `- Use \`${memoryObjectsPath}\` as the derived semantic layer for long-term user preferences, stable constraints, decision rationales, and superseded decisions. When exact wording matters, verify against \`${eventsPath}\`.`,
    `- Use \`${eventsPath}\` as the source of truth: \`user_prompt.fullText/rawContent\` for full user input, \`plan.content\` for full plan text, \`code_edit.files[].diffText/lineRanges\` for code edits, and \`code_edit.files[].beforeContent/afterContent\` for non-code text edits.`,
    `- Use \`${edgesPath}\` and \`${transcriptsPath}\` when you need exact relationships or need to jump back to the source transcript file.`,
    '- Do NOT treat `.claude/context/session_state.py`, `.claude/context/session_history.py`, `.claude/context/session_metrics.py`, or session-memory notes as source of truth. Those are lossy compact summaries.',
    '- Treat the memory index as a durable memory map. Summary files are previews; `events.jsonl` is the durable memory source. Only read the raw transcript or plan file when `events.jsonl` does not already preserve the exact detail you need.',
    '- Do not inject large memory-index artifacts wholesale into prompt context. Read only the minimal summary, skeleton shard, DOT shard, or JSONL rows needed for the current question.',
    '- If both `memory-index` and `code-index` exist, use `memory-index` for history/decision/change-tracking questions and `code-index` for repository structure and implementation navigation.',
    '- Only fall back to raw project-local transcript JSONL, matching `~/.codex/sessions` logs, or plan files when the memory index is stale, missing, or insufficient for the question at hand.',
    '- If the memory index is stale after new conversation turns or edits, rerun `/memory-index`.',
    '',
  ].join('\n')
}

export async function writeMemoryIndexSkills(args: {
  rootDir: string
  outputDir: string
}): Promise<MemoryIndexSkillPaths> {
  const paths = resolveMemoryIndexSkillPaths({
    rootDir: args.rootDir,
  })

  await mkdir(join(args.rootDir, '.claude', 'skills', 'memory-index'), {
    recursive: true,
  })
  await mkdir(join(args.rootDir, '.codex', 'skills', 'memory-index'), {
    recursive: true,
  })
  await mkdir(join(args.rootDir, '.opencode', 'skills', 'memory-index'), {
    recursive: true,
  })

  const description =
    `Use the generated memory index under ${formatProjectPath(args.rootDir, args.outputDir)} as a durable recall map for user prompts, plans, and code diffs.`
  const whenToUse =
    'Use this when the task depends on project history: previous user requests, earlier plans, prior code edits, why code changed, or what happened in earlier sessions. Prefer it before reading raw transcript files or plan files, but keep it as on-demand recall rather than an always-on layer.'

  await writeFile(
    paths.claude,
    renderSkillMarkdown({
      name: 'memory-index',
      description,
      whenToUse,
      rootDir: args.rootDir,
      outputDir: args.outputDir,
    }),
    'utf8',
  )
  await writeFile(
    paths.codex,
    renderSkillMarkdown({
      name: 'memory-index',
      description,
      whenToUse,
      rootDir: args.rootDir,
      outputDir: args.outputDir,
    }),
    'utf8',
  )
  await writeFile(
    paths.opencode,
    renderSkillMarkdown({
      name: 'memory-index',
      description,
      whenToUse,
      rootDir: args.rootDir,
      outputDir: args.outputDir,
    }),
    'utf8',
  )

  return paths
}
