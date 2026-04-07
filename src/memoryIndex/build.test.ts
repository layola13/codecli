import { describe, expect, it } from 'bun:test'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  getProjectConversationFileHistoryDir,
  getProjectConversationTranscriptsDir,
} from '../utils/projectConversationContext.js'
import { getProjectDir } from '../utils/sessionStoragePortable.js'
import { buildMemoryIndex } from './build.js'

describe('memoryIndex build', () => {
  it('writes prompt, plan, and code-edit events from transcripts and backups', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'claude-memory-index-root-'))
    const codexHome = await mkdtemp(join(tmpdir(), 'claude-memory-index-codex-'))
    const claudeHome = await mkdtemp(join(tmpdir(), 'claude-memory-index-claude-'))
    const previousCodexHome = process.env.CODEX_HOME
    const previousClaudeHome = process.env.CLAUDE_CONFIG_DIR
    process.env.CODEX_HOME = codexHome
    process.env.CLAUDE_CONFIG_DIR = claudeHome

    try {
      await mkdir(join(rootDir, 'src'), { recursive: true })
      await mkdir(join(rootDir, 'docs'), { recursive: true })
      await writeFile(join(rootDir, 'src', 'app.ts'), 'export const value = 2;\n')
      await writeFile(
        join(rootDir, 'docs', 'guide.md'),
        '# Guide\nUse fetch instead of Axios.\n',
      )

      const sessionId = '11111111-1111-1111-1111-111111111111'
      const promptOneUuid = '22222222-2222-2222-2222-222222222222'
      const promptTwoUuid = '33333333-3333-3333-3333-333333333333'
      const assistantUuid = '44444444-4444-4444-4444-444444444444'

      const transcriptDir = getProjectConversationTranscriptsDir(rootDir)
      await mkdir(transcriptDir, { recursive: true })
      const transcriptPath = join(transcriptDir, `${sessionId}.jsonl`)

      const backupDir = join(
        getProjectConversationFileHistoryDir(rootDir),
        sessionId,
      )
      await mkdir(backupDir, { recursive: true })
      await writeFile(
        join(backupDir, 'app-v1'),
        'export const value = 1;\n',
        'utf8',
      )
      await writeFile(
        join(backupDir, 'app-v2'),
        'export const value = 2;\n',
        'utf8',
      )
      await writeFile(
        join(backupDir, 'guide-v1'),
        '# Guide\nUse Axios for now.\n',
        'utf8',
      )
      await writeFile(
        join(backupDir, 'guide-v2'),
        '# Guide\nUse fetch instead of Axios.\n',
        'utf8',
      )

      const lines = [
        JSON.stringify({
          type: 'file-history-snapshot',
          messageId: promptOneUuid,
          snapshot: {
            messageId: promptOneUuid,
            trackedFileBackups: {
              'src/app.ts': {
                backupFileName: 'app-v1',
                version: 1,
                backupTime: '2026-04-06T00:00:00.000Z',
              },
              'docs/guide.md': {
                backupFileName: 'guide-v1',
                version: 1,
                backupTime: '2026-04-06T00:00:00.000Z',
              },
            },
            timestamp: '2026-04-06T00:00:00.000Z',
          },
          isSnapshotUpdate: false,
        }),
        JSON.stringify({
          parentUuid: null,
          isSidechain: false,
          type: 'user',
          message: {
            role: 'user',
            content:
              '不要用 Axios，改用 fetch。优先保持 src/app.ts 简单，因为这样更稳定。把 src/app.ts 的 value 提升到 2。',
          },
          isMeta: false,
          uuid: promptOneUuid,
          timestamp: '2026-04-06T00:00:01.000Z',
          userType: 'external',
          cwd: rootDir,
          sessionId,
          version: '2.1.88+test',
        }),
        JSON.stringify({
          parentUuid: promptOneUuid,
          isSidechain: false,
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: 'toolu_1',
                name: 'ExitPlanMode',
                input: {
                  plan: '1. Edit src/app.ts\n2. Raise value to 2',
                  planFilePath: join(rootDir, 'plan.md'),
                },
              },
            ],
          },
          uuid: assistantUuid,
          timestamp: '2026-04-06T00:00:02.000Z',
          userType: 'external',
          cwd: rootDir,
          sessionId,
          version: '2.1.88+test',
        }),
        JSON.stringify({
          type: 'file-history-snapshot',
          messageId: promptTwoUuid,
          snapshot: {
            messageId: promptTwoUuid,
            trackedFileBackups: {
              'src/app.ts': {
                backupFileName: 'app-v2',
                version: 2,
                backupTime: '2026-04-06T00:00:03.000Z',
              },
              'docs/guide.md': {
                backupFileName: 'guide-v2',
                version: 2,
                backupTime: '2026-04-06T00:00:03.000Z',
              },
            },
            timestamp: '2026-04-06T00:00:03.000Z',
          },
          isSnapshotUpdate: false,
        }),
        JSON.stringify({
          parentUuid: assistantUuid,
          isSidechain: false,
          type: 'user',
          message: {
            role: 'user',
            content: '这个约束必须长期有效，不要回退到 Axios。done',
          },
          isMeta: false,
          uuid: promptTwoUuid,
          timestamp: '2026-04-06T00:00:04.000Z',
          userType: 'external',
          cwd: rootDir,
          sessionId,
          version: '2.1.88+test',
        }),
      ]

      await writeFile(transcriptPath, `${lines.join('\n')}\n`, 'utf8')

      const result = await buildMemoryIndex({
        rootDir,
      })

      expect(result.manifest.transcriptCount).toBe(1)
      expect(result.manifest.userPromptCount).toBe(2)
      expect(result.manifest.planCount).toBe(1)
      expect(result.manifest.codeEditCount).toBe(1)
      expect(result.manifest.memoryObjectCount).toBeGreaterThan(0)

      const eventsPath = join(rootDir, '.memory_index', 'index', 'events.jsonl')
      const events = (await readFile(eventsPath, 'utf8'))
        .trim()
        .split('\n')
        .map(line => JSON.parse(line) as Record<string, unknown>)
      const sessionsPath = join(
        rootDir,
        '.memory_index',
        'index',
        'sessions.jsonl',
      )
      const sessions = (await readFile(sessionsPath, 'utf8'))
        .trim()
        .split('\n')
        .map(line => JSON.parse(line) as Record<string, unknown>)

      expect(
        events.some(
          event =>
            event.kind === 'user_prompt' &&
            String(event.fullText).includes('改用 fetch'),
        ),
      ).toBe(true)
      expect(
        events.some(
          event =>
            event.kind === 'user_prompt' &&
            String(event.normalizedText).includes('src/app.ts'),
        ),
      ).toBe(true)
      expect(
        events.some(
          event =>
            event.kind === 'plan' &&
            String(event.content).includes('Edit src/app.ts'),
        ),
      ).toBe(true)

      const codeEdit = events.find(event => event.kind === 'code_edit')
      expect(codeEdit).toBeDefined()
      const codeEditFiles = codeEdit?.files as Array<Record<string, unknown>>
      const appChange = codeEditFiles.find(
        file => file.relativePath === 'src/app.ts',
      )
      const guideChange = codeEditFiles.find(
        file => file.relativePath === 'docs/guide.md',
      )
      expect(appChange).toBeDefined()
      expect(appChange?.contentKind).toBe('code')
      expect((appChange?.lineRanges as Array<unknown>)[0]).toBe('L1::L1')
      expect(String(appChange?.diffText)).toContain('+export const value = 2;')
      expect(appChange?.beforeContent).toBeUndefined()
      expect(appChange?.afterContent).toBeUndefined()
      expect(guideChange).toBeDefined()
      expect(guideChange?.contentKind).toBe('non_code_text')
      expect(String(guideChange?.beforeContent)).toContain('Use Axios for now.')
      expect(String(guideChange?.afterContent)).toContain(
        'Use fetch instead of Axios.',
      )
      expect(String(guideChange?.diffText)).toContain('+Use fetch instead of Axios.')
      expect(sessions[0]?.promptCount).toBe(2)
      expect(String(sessions[0]?.latestPromptPreview)).toContain('done')
      const memoryObjectsPath = join(
        rootDir,
        '.memory_index',
        'index',
        'memory_objects.jsonl',
      )
      const memoryObjects = (await readFile(memoryObjectsPath, 'utf8'))
        .trim()
        .split('\n')
        .map(line => JSON.parse(line) as Record<string, unknown>)
      expect(
        memoryObjects.some(
          object => object.kind === 'user_preference',
        ),
      ).toBe(true)
      expect(
        memoryObjects.some(
          object => object.kind === 'stable_constraint',
        ),
      ).toBe(true)
      expect(
        memoryObjects.some(
          object => object.kind === 'decision_rationale',
        ),
      ).toBe(true)
      expect(
        memoryObjects.some(
          object =>
            object.kind === 'superseded_decision' &&
            String(object.replacementStatement).includes('fetch'),
        ),
      ).toBe(true)

      const skillText = await readFile(
        join(rootDir, '.codex', 'skills', 'memory-index', 'SKILL.md'),
        'utf8',
      )
      expect(skillText).toContain('name: "memory-index"')
      expect(skillText).toContain('project_memory_graph.py')
      expect(skillText).toContain('skeleton/__index__.py')
      expect(skillText).toContain('index/dot/manifest.json')
      expect(skillText).toContain(
        'Do NOT treat `.claude/context/session_state.py`',
      )
      expect(skillText).toContain('memory_objects.jsonl')
      const summaryText = await readFile(
        join(rootDir, '.memory_index', 'index', 'summary.md'),
        'utf8',
      )
      expect(summaryText).toContain(
        'source_inputs: project-local raw transcript JSONL under transcripts_dir + project-local file-history snapshots + matching Codex session logs under ~/.codex/sessions for this project cwd',
      )
      expect(summaryText).toContain('skeleton_index_py')
      expect(summaryText).toContain('dot_manifest_json')
      expect(summaryText).toContain(
        'compact_summaries_not_source_of_truth',
      )
      expect(summaryText).toContain('derived_semantic_layer')
      expect(summaryText).toContain('## Active Preferences')
      const indexText = await readFile(
        join(rootDir, '.memory_index', '__index__.py'),
        'utf8',
      )
      expect(indexText).toContain('compact_summaries_not_source_of_truth')
      expect(indexText).toContain('RECENT_MEMORY_OBJECTS')
      expect(indexText).toContain('diff_text')
      expect(indexText).toContain('before_content')
      const projectMemoryGraphText = await readFile(
        join(rootDir, '.memory_index', 'project_memory_graph.py'),
        'utf8',
      )
      expect(projectMemoryGraphText).toContain('PROJECT_MEMORY_META')
      expect(projectMemoryGraphText).not.toContain('PROJECT_MEMORY_OVERVIEW')
      expect(projectMemoryGraphText).toContain('class Constraints:')
      expect(projectMemoryGraphText).toContain('class Preferences:')
      expect(projectMemoryGraphText).toContain('class Plans:')
      expect(projectMemoryGraphText).toContain('class Topics:')
      expect(projectMemoryGraphText).toContain('class Sessions:')
      expect(projectMemoryGraphText).toContain('class Files:')
      expect(projectMemoryGraphText).toContain('graph_segments')
      expect(projectMemoryGraphText).toContain('skeleton/__index__.py')
      expect(projectMemoryGraphText).toContain('index/dot/manifest.json')
      expect(projectMemoryGraphText).toContain('Edit src/app.ts')
      expect(projectMemoryGraphText).toContain('Graph view: .memory_index/index/memory_graph.dot')
      expect(projectMemoryGraphText).toContain('session_ref(')
      expect(projectMemoryGraphText).toContain('file_ref(')
      expect(projectMemoryGraphText).toContain('# recent_ranges:')
      expect(projectMemoryGraphText).toContain('src/app.ts')
      expect(projectMemoryGraphText).toContain('L1::L1')
      const skeletonIndexText = await readFile(
        join(rootDir, '.memory_index', 'skeleton', '__index__.py'),
        'utf8',
      )
      expect(skeletonIndexText).toContain('SEGMENT_MODULES')
      expect(skeletonIndexText).toContain('TOPIC_MODULES')
      const segmentModules = await readdir(
        join(rootDir, '.memory_index', 'skeleton', 'segments'),
      )
      expect(segmentModules.some(name => name.endsWith('.py') && name !== '__init__.py')).toBe(
        true,
      )
      const topicModules = await readdir(
        join(rootDir, '.memory_index', 'skeleton', 'topics'),
      )
      expect(topicModules.some(name => name.endsWith('.py') && name !== '__init__.py')).toBe(
        true,
      )
      const memoryGraphDot = await readFile(
        join(rootDir, '.memory_index', 'index', 'memory_graph.dot'),
        'utf8',
      )
      expect(memoryGraphDot).toContain('digraph memory_graph')
      expect(memoryGraphDot).toContain('src/app.ts')
      expect(memoryGraphDot).toContain('segment_')
      const memoryGraphJson = JSON.parse(
        await readFile(
          join(rootDir, '.memory_index', 'index', 'memory_graph.json'),
          'utf8',
        ),
      ) as Record<string, unknown>
      expect(memoryGraphJson.source).toBe('heuristic')
      expect(Array.isArray(memoryGraphJson.topics)).toBe(true)
      expect(Array.isArray(memoryGraphJson.segments)).toBe(true)
      const dotManifest = JSON.parse(
        await readFile(
          join(rootDir, '.memory_index', 'index', 'dot', 'manifest.json'),
          'utf8',
        ),
      ) as {
        overview: Record<string, string>
        shards: {
          sessions: Array<{ path: string }>
          topics: Array<{ path: string }>
        }
      }
      expect(dotManifest.overview.sessions).toBe('index/sessions.dot')
      expect(dotManifest.shards.sessions.length).toBeGreaterThan(0)
      expect(dotManifest.shards.topics.length).toBeGreaterThan(0)
      const sessionShardDot = await readFile(
        join(rootDir, '.memory_index', dotManifest.shards.sessions[0]!.path),
        'utf8',
      )
      expect(sessionShardDot).toContain('digraph memory_session_shard')
      const topicShardDot = await readFile(
        join(rootDir, '.memory_index', dotManifest.shards.topics[0]!.path),
        'utf8',
      )
      expect(topicShardDot).toContain('digraph memory_topic_shard')
      const sessionsDot = await readFile(
        join(rootDir, '.memory_index', 'index', 'sessions.dot'),
        'utf8',
      )
      expect(sessionsDot).toContain('session:')
      expect(sessionsDot).toContain('touches 1')
    } finally {
      if (previousCodexHome === undefined) {
        delete process.env.CODEX_HOME
      } else {
        process.env.CODEX_HOME = previousCodexHome
      }
      if (previousClaudeHome === undefined) {
        delete process.env.CLAUDE_CONFIG_DIR
      } else {
        process.env.CLAUDE_CONFIG_DIR = previousClaudeHome
      }
      await rm(rootDir, { recursive: true, force: true })
      await rm(codexHome, { recursive: true, force: true })
      await rm(claudeHome, { recursive: true, force: true })
    }
  })

  it('filters sidechain research prompts out of semantic memory output', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'claude-memory-index-root-'))
    const codexHome = await mkdtemp(join(tmpdir(), 'claude-memory-index-codex-'))
    const claudeHome = await mkdtemp(join(tmpdir(), 'claude-memory-index-claude-'))
    const previousCodexHome = process.env.CODEX_HOME
    const previousClaudeHome = process.env.CLAUDE_CONFIG_DIR
    process.env.CODEX_HOME = codexHome
    process.env.CLAUDE_CONFIG_DIR = claudeHome

    try {
      const sessionId = '55555555-5555-5555-5555-555555555555'
      const mainPromptUuid = '66666666-6666-6666-6666-666666666666'
      const sidechainPromptUuid = '77777777-7777-7777-7777-777777777777'
      const transcriptDir = getProjectConversationTranscriptsDir(rootDir)
      await mkdir(join(transcriptDir, sessionId, 'subagents'), {
        recursive: true,
      })

      await writeFile(
        join(transcriptDir, `${sessionId}.jsonl`),
        `${JSON.stringify({
          parentUuid: null,
          isSidechain: false,
          type: 'user',
          message: {
            role: 'user',
            content: '默认先读 dot，再读 summary。',
          },
          isMeta: false,
          uuid: mainPromptUuid,
          timestamp: '2026-04-06T01:00:00.000Z',
          userType: 'external',
          cwd: rootDir,
          sessionId,
          version: '2.1.88+test',
        })}\n`,
        'utf8',
      )

      await writeFile(
        join(transcriptDir, sessionId, 'subagents', 'agent-memory.jsonl'),
        `${JSON.stringify({
          parentUuid: null,
          isSidechain: true,
          type: 'user',
          message: {
            role: 'user',
            content:
              'Deeply analyze the memory-index system. This is research only, do not write code. Focus on current tests.',
          },
          isMeta: false,
          uuid: sidechainPromptUuid,
          timestamp: '2026-04-06T01:00:10.000Z',
          userType: 'external',
          cwd: rootDir,
          sessionId,
          version: '2.1.88+test',
        })}\n`,
        'utf8',
      )

      const result = await buildMemoryIndex({
        rootDir,
      })

      expect(result.manifest.transcriptCount).toBe(2)
      const memoryObjectsPath = join(
        rootDir,
        '.memory_index',
        'index',
        'memory_objects.jsonl',
      )
      const memoryObjects = (await readFile(memoryObjectsPath, 'utf8'))
        .trim()
        .split('\n')
        .map(line => JSON.parse(line) as Record<string, unknown>)

      expect(
        memoryObjects.some(
          object =>
            String(object.statement).includes('默认先读 dot') &&
            object.kind === 'user_preference',
        ),
      ).toBe(true)
      expect(
        memoryObjects.some(object =>
          String(object.statement).includes('Deeply analyze'),
        ),
      ).toBe(false)

      const summaryText = await readFile(
        join(rootDir, '.memory_index', 'index', 'summary.md'),
        'utf8',
      )
      expect(summaryText).toContain('## Active Preferences')
      expect(summaryText).not.toContain('Deeply analyze | sessions')
    } finally {
      if (previousCodexHome === undefined) {
        delete process.env.CODEX_HOME
      } else {
        process.env.CODEX_HOME = previousCodexHome
      }
      if (previousClaudeHome === undefined) {
        delete process.env.CLAUDE_CONFIG_DIR
      } else {
        process.env.CLAUDE_CONFIG_DIR = previousClaudeHome
      }
      await rm(rootDir, { recursive: true, force: true })
      await rm(codexHome, { recursive: true, force: true })
      await rm(claudeHome, { recursive: true, force: true })
    }
  })

  it('uses agent-supplied graph analysis when analyzeGraph returns a graph draft', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'claude-memory-index-root-'))
    const codexHome = await mkdtemp(join(tmpdir(), 'claude-memory-index-codex-'))
    const claudeHome = await mkdtemp(join(tmpdir(), 'claude-memory-index-claude-'))
    const previousCodexHome = process.env.CODEX_HOME
    const previousClaudeHome = process.env.CLAUDE_CONFIG_DIR
    process.env.CODEX_HOME = codexHome
    process.env.CLAUDE_CONFIG_DIR = claudeHome

    try {
      await mkdir(join(rootDir, 'src'), { recursive: true })
      await writeFile(join(rootDir, 'src', 'agent.ts'), 'export const value = 2;\n')

      const sessionId = 'abababab-abab-abab-abab-abababababab'
      const promptOneUuid = 'cdcdcdcd-cdcd-cdcd-cdcd-cdcdcdcdcdcd'
      const promptTwoUuid = 'efefefef-efef-efef-efef-efefefefefef'
      const assistantUuid = '01010101-0101-0101-0101-010101010101'

      const transcriptDir = getProjectConversationTranscriptsDir(rootDir)
      await mkdir(transcriptDir, { recursive: true })
      const transcriptPath = join(transcriptDir, `${sessionId}.jsonl`)

      const backupDir = join(
        getProjectConversationFileHistoryDir(rootDir),
        sessionId,
      )
      await mkdir(backupDir, { recursive: true })
      await writeFile(
        join(backupDir, 'agent-v1'),
        'export const value = 1;\n',
        'utf8',
      )
      await writeFile(
        join(backupDir, 'agent-v2'),
        'export const value = 2;\n',
        'utf8',
      )

      const lines = [
        JSON.stringify({
          type: 'file-history-snapshot',
          messageId: promptOneUuid,
          snapshot: {
            messageId: promptOneUuid,
            trackedFileBackups: {
              'src/agent.ts': {
                backupFileName: 'agent-v1',
                version: 1,
                backupTime: '2026-04-06T05:00:00.000Z',
              },
            },
            timestamp: '2026-04-06T05:00:00.000Z',
          },
          isSnapshotUpdate: false,
        }),
        JSON.stringify({
          parentUuid: null,
          isSidechain: false,
          type: 'user',
          message: {
            role: 'user',
            content: '长期记忆要优先保留 plan，并修改 src/agent.ts。',
          },
          isMeta: false,
          uuid: promptOneUuid,
          timestamp: '2026-04-06T05:00:01.000Z',
          userType: 'external',
          cwd: rootDir,
          sessionId,
          version: '2.1.88+test',
        }),
        JSON.stringify({
          parentUuid: promptOneUuid,
          isSidechain: false,
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: 'toolu_agent',
                name: 'ExitPlanMode',
                input: {
                  plan: '1. Preserve plan history\n2. Update src/agent.ts',
                },
              },
            ],
          },
          uuid: assistantUuid,
          timestamp: '2026-04-06T05:00:02.000Z',
          userType: 'external',
          cwd: rootDir,
          sessionId,
          version: '2.1.88+test',
        }),
        JSON.stringify({
          type: 'file-history-snapshot',
          messageId: promptTwoUuid,
          snapshot: {
            messageId: promptTwoUuid,
            trackedFileBackups: {
              'src/agent.ts': {
                backupFileName: 'agent-v2',
                version: 2,
                backupTime: '2026-04-06T05:00:03.000Z',
              },
            },
            timestamp: '2026-04-06T05:00:03.000Z',
          },
          isSnapshotUpdate: false,
        }),
        JSON.stringify({
          parentUuid: assistantUuid,
          isSidechain: false,
          type: 'user',
          message: {
            role: 'user',
            content: '继续保持这个约束，别丢 plan。',
          },
          isMeta: false,
          uuid: promptTwoUuid,
          timestamp: '2026-04-06T05:00:04.000Z',
          userType: 'external',
          cwd: rootDir,
          sessionId,
          version: '2.1.88+test',
        }),
      ]

      await writeFile(transcriptPath, `${lines.join('\n')}\n`, 'utf8')

      const result = await buildMemoryIndex({
        rootDir,
        analyzeGraph: async input => ({
          topics: [
            {
              title: 'Agent memory graph',
              summary: 'Agent-selected durable topic',
              status: 'active',
              session_ids: [input.sessions[0]?.sessionId ?? ''],
              file_paths: [input.files[0]?.path ?? ''],
              plan_ids: [input.plans[0]?.eventId ?? ''],
              memory_object_ids: [input.memoryObjects[0]?.objectId ?? ''],
            },
          ],
          sessions: [
            {
              session_id: input.sessions[0]?.sessionId,
              title: 'Agent session lens',
              summary: 'Agent-focused session summary',
              topic_titles: ['Agent memory graph'],
              file_paths: [input.files[0]?.path ?? ''],
              plan_ids: [input.plans[0]?.eventId ?? ''],
              memory_object_ids: [input.memoryObjects[0]?.objectId ?? ''],
            },
          ],
          files: [
            {
              path: input.files[0]?.path,
              role: 'Agent file role',
              topic_titles: ['Agent memory graph'],
              session_ids: [input.sessions[0]?.sessionId ?? ''],
              plan_ids: [input.plans[0]?.eventId ?? ''],
              memory_object_ids: [input.memoryObjects[0]?.objectId ?? ''],
            },
          ],
          edges: [
            {
              source: `session:${input.sessions[0]?.sessionId ?? ''}`,
              target: 'topic:Agent memory graph',
              kind: 'drives',
              reason: 'agent edge',
            },
          ],
        }),
      })

      expect(result.graphSource).toBe('agent')

      const projectMemoryGraphText = await readFile(
        join(rootDir, '.memory_index', 'project_memory_graph.py'),
        'utf8',
      )
      expect(projectMemoryGraphText).toContain('Agent memory graph')
      expect(projectMemoryGraphText).toContain('Agent session lens')
      expect(projectMemoryGraphText).toContain('Agent file role')

      const memoryGraphJson = JSON.parse(
        await readFile(
          join(rootDir, '.memory_index', 'index', 'memory_graph.json'),
          'utf8',
        ),
      ) as Record<string, unknown>
      expect(memoryGraphJson.source).toBe('agent')
    } finally {
      if (previousCodexHome === undefined) {
        delete process.env.CODEX_HOME
      } else {
        process.env.CODEX_HOME = previousCodexHome
      }
      if (previousClaudeHome === undefined) {
        delete process.env.CLAUDE_CONFIG_DIR
      } else {
        process.env.CLAUDE_CONFIG_DIR = previousClaudeHome
      }
      await rm(rootDir, { recursive: true, force: true })
      await rm(codexHome, { recursive: true, force: true })
      await rm(claudeHome, { recursive: true, force: true })
    }
  })

  it('ingests matching Codex sessions for the same project root', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'claude-memory-index-root-'))
    const codexHome = await mkdtemp(join(tmpdir(), 'claude-memory-index-codex-'))
    const claudeHome = await mkdtemp(join(tmpdir(), 'claude-memory-index-claude-'))
    const previousCodexHome = process.env.CODEX_HOME
    const previousClaudeHome = process.env.CLAUDE_CONFIG_DIR
    process.env.CODEX_HOME = codexHome
    process.env.CLAUDE_CONFIG_DIR = claudeHome

    try {
      await mkdir(join(rootDir, 'src'), { recursive: true })
      const codexSessionsDir = join(codexHome, 'sessions', '2026', '04', '06')
      await mkdir(codexSessionsDir, { recursive: true })

      const sessionPath = join(
        codexSessionsDir,
        'rollout-2026-04-06T12-00-00-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jsonl',
      )
      const unrelatedPath = join(
        codexSessionsDir,
        'rollout-2026-04-06T12-05-00-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jsonl',
      )

      await writeFile(
        sessionPath,
        [
          JSON.stringify({
            timestamp: '2026-04-06T12:00:00.000Z',
            type: 'session_meta',
            payload: {
              id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
              cwd: rootDir,
              source: 'cli',
            },
          }),
          JSON.stringify({
            timestamp: '2026-04-06T12:00:01.000Z',
            type: 'event_msg',
            payload: {
              type: 'user_message',
              message: '继续完善长期记忆，优先保留完整 plan。',
            },
          }),
          JSON.stringify({
            timestamp: '2026-04-06T12:00:02.000Z',
            type: 'event_msg',
            payload: {
              type: 'item_completed',
              item: {
                type: 'Plan',
                id: 'plan-1',
                text: '# Plan\n- capture codex history\n- keep project-local source of truth',
              },
            },
          }),
          JSON.stringify({
            timestamp: '2026-04-06T12:00:03.000Z',
            type: 'response_item',
            payload: {
              type: 'custom_tool_call',
              name: 'apply_patch',
              input: [
                '*** Begin Patch',
                '*** Update File: src/memory.ts',
                '@@',
                '-old',
                '+new',
                '*** End Patch',
              ].join('\n'),
            },
          }),
        ].join('\n') + '\n',
        'utf8',
      )

      await writeFile(
        unrelatedPath,
        [
          JSON.stringify({
            timestamp: '2026-04-06T12:05:00.000Z',
            type: 'session_meta',
            payload: {
              id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
              cwd: '/tmp/other-project',
              source: 'cli',
            },
          }),
          JSON.stringify({
            timestamp: '2026-04-06T12:05:01.000Z',
            type: 'event_msg',
            payload: {
              type: 'user_message',
              message: 'this should be ignored',
            },
          }),
        ].join('\n') + '\n',
        'utf8',
      )

      const result = await buildMemoryIndex({
        rootDir,
      })

      expect(result.manifest.transcriptCount).toBe(1)
      expect(result.manifest.userPromptCount).toBe(1)
      expect(result.manifest.planCount).toBe(1)
      expect(result.manifest.codeEditCount).toBe(1)

      const events = (await readFile(
        join(rootDir, '.memory_index', 'index', 'events.jsonl'),
        'utf8',
      ))
        .trim()
        .split('\n')
        .map(line => JSON.parse(line) as Record<string, unknown>)

      expect(
        events.some(
          event =>
            event.kind === 'user_prompt' &&
            String(event.transcriptRelativePath).startsWith('codex/'),
        ),
      ).toBe(true)
      expect(
        events.some(
          event =>
            event.kind === 'plan' &&
            event.source === 'codex_plan' &&
            String(event.content).includes('capture codex history'),
        ),
      ).toBe(true)

      const codeEdit = events.find(event => event.kind === 'code_edit')
      expect(codeEdit).toBeDefined()
      expect(
        (codeEdit?.files as Array<Record<string, unknown>>)[0]?.relativePath,
      ).toBe('src/memory.ts')
    } finally {
      if (previousCodexHome === undefined) {
        delete process.env.CODEX_HOME
      } else {
        process.env.CODEX_HOME = previousCodexHome
      }
      if (previousClaudeHome === undefined) {
        delete process.env.CLAUDE_CONFIG_DIR
      } else {
        process.env.CLAUDE_CONFIG_DIR = previousClaudeHome
      }
      await rm(rootDir, { recursive: true, force: true })
      await rm(codexHome, { recursive: true, force: true })
      await rm(claudeHome, { recursive: true, force: true })
    }
  })

  it('builds session-to-session relations in project_memory_graph.py', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'claude-memory-index-root-'))
    const codexHome = await mkdtemp(join(tmpdir(), 'claude-memory-index-codex-'))
    const claudeHome = await mkdtemp(join(tmpdir(), 'claude-memory-index-claude-'))
    const previousCodexHome = process.env.CODEX_HOME
    const previousClaudeHome = process.env.CLAUDE_CONFIG_DIR
    process.env.CODEX_HOME = codexHome
    process.env.CLAUDE_CONFIG_DIR = claudeHome

    try {
      const transcriptDir = getProjectConversationTranscriptsDir(rootDir)
      await mkdir(transcriptDir, { recursive: true })

      const sessionOneId = '88888888-8888-8888-8888-888888888888'
      const sessionTwoId = '99999999-9999-9999-9999-999999999999'

      await writeFile(
        join(transcriptDir, `${sessionOneId}.jsonl`),
        `${JSON.stringify({
          parentUuid: null,
          isSidechain: false,
          type: 'user',
          message: {
            role: 'user',
            content: '默认先读 dot，再读 summary。',
          },
          isMeta: false,
          uuid: 'aaaaaaaa-1111-1111-1111-111111111111',
          timestamp: '2026-04-06T02:00:00.000Z',
          userType: 'external',
          cwd: rootDir,
          sessionId: sessionOneId,
          version: '2.1.88+test',
        })}\n`,
        'utf8',
      )

      await writeFile(
        join(transcriptDir, `${sessionTwoId}.jsonl`),
        `${JSON.stringify({
          parentUuid: null,
          isSidechain: false,
          type: 'user',
          message: {
            role: 'user',
            content: '默认先读 dot，再读 summary。继续保持这个习惯。',
          },
          isMeta: false,
          uuid: 'bbbbbbbb-2222-2222-2222-222222222222',
          timestamp: '2026-04-06T03:00:00.000Z',
          userType: 'external',
          cwd: rootDir,
          sessionId: sessionTwoId,
          version: '2.1.88+test',
        })}\n`,
        'utf8',
      )

      await buildMemoryIndex({
        rootDir,
      })

      const projectMemoryGraphText = await readFile(
        join(rootDir, '.memory_index', 'project_memory_graph.py'),
        'utf8',
      )
      expect(projectMemoryGraphText).not.toContain('PROJECT_MEMORY_OVERVIEW')
      expect(projectMemoryGraphText).toContain('class Topics:')
      expect(projectMemoryGraphText).toContain('rel("related_session"')
      expect(projectMemoryGraphText).toContain(sessionOneId)
      expect(projectMemoryGraphText).toContain(sessionTwoId)
      expect(projectMemoryGraphText).toContain('默认先读 dot，再读 summary')
    } finally {
      if (previousCodexHome === undefined) {
        delete process.env.CODEX_HOME
      } else {
        process.env.CODEX_HOME = previousCodexHome
      }
      if (previousClaudeHome === undefined) {
        delete process.env.CLAUDE_CONFIG_DIR
      } else {
        process.env.CLAUDE_CONFIG_DIR = previousClaudeHome
      }
      await rm(rootDir, { recursive: true, force: true })
      await rm(codexHome, { recursive: true, force: true })
      await rm(claudeHome, { recursive: true, force: true })
    }
  })

  it('hydrates matching legacy Claude transcripts and file-history only when explicitly enabled', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'claude-memory-index-root-'))
    const codexHome = await mkdtemp(join(tmpdir(), 'claude-memory-index-codex-'))
    const claudeHome = await mkdtemp(join(tmpdir(), 'claude-memory-index-claude-'))
    const previousCodexHome = process.env.CODEX_HOME
    const previousClaudeHome = process.env.CLAUDE_CONFIG_DIR
    process.env.CODEX_HOME = codexHome
    process.env.CLAUDE_CONFIG_DIR = claudeHome

    try {
      await mkdir(join(rootDir, 'src'), { recursive: true })
      const sessionId = '12121212-1212-1212-1212-121212121212'
      const messageId = '34343434-3434-3434-3434-343434343434'
      const legacyProjectDir = getProjectDir(rootDir)
      await mkdir(legacyProjectDir, { recursive: true })
      await mkdir(join(claudeHome, 'file-history', sessionId), { recursive: true })
      await writeFile(
        join(claudeHome, 'file-history', sessionId, 'legacy-backup'),
        'export const value = 1;\n',
        'utf8',
      )
      await writeFile(
        join(legacyProjectDir, `${sessionId}.jsonl`),
        [
          JSON.stringify({
            type: 'file-history-snapshot',
            messageId,
            snapshot: {
              messageId,
              trackedFileBackups: {
                'src/app.ts': {
                  backupFileName: 'legacy-backup',
                  version: 1,
                  backupTime: '2026-04-06T00:00:00.000Z',
                },
              },
              timestamp: '2026-04-06T00:00:00.000Z',
            },
            isSnapshotUpdate: false,
          }),
          JSON.stringify({
            parentUuid: null,
            isSidechain: false,
            type: 'user',
            message: {
              role: 'user',
              content: '把旧 Claude 历史同步到当前工程里。',
            },
            isMeta: false,
            uuid: messageId,
            timestamp: '2026-04-06T00:00:01.000Z',
            userType: 'external',
            cwd: rootDir,
            sessionId,
            version: '2.1.88+test',
          }),
        ].join('\n') + '\n',
        'utf8',
      )

      const result = await buildMemoryIndex({
        rootDir,
        includeLegacyClaude: true,
      })
      expect(result.manifest.legacyHydratedTranscriptCount).toBe(1)
      expect(result.manifest.legacyHydratedBackupCount).toBe(1)
      expect(
        await readFile(
          join(
            getProjectConversationTranscriptsDir(rootDir),
            `${sessionId}.jsonl`,
          ),
          'utf8',
        ),
      ).toContain('同步到当前工程里')
      expect(
        await readFile(
          join(
            getProjectConversationFileHistoryDir(rootDir),
            sessionId,
            'legacy-backup',
          ),
          'utf8',
        ),
      ).toContain('export const value = 1')
    } finally {
      if (previousCodexHome === undefined) {
        delete process.env.CODEX_HOME
      } else {
        process.env.CODEX_HOME = previousCodexHome
      }
      if (previousClaudeHome === undefined) {
        delete process.env.CLAUDE_CONFIG_DIR
      } else {
        process.env.CLAUDE_CONFIG_DIR = previousClaudeHome
      }
      await rm(rootDir, { recursive: true, force: true })
      await rm(codexHome, { recursive: true, force: true })
      await rm(claudeHome, { recursive: true, force: true })
    }
  })

  it('does not ingest Codex sessions from an ancestor cwd', async () => {
    const parentDir = await mkdtemp(join(tmpdir(), 'claude-memory-index-parent-'))
    const rootDir = join(parentDir, 'current-project')
    const codexHome = await mkdtemp(join(tmpdir(), 'claude-memory-index-codex-'))
    const claudeHome = await mkdtemp(join(tmpdir(), 'claude-memory-index-claude-'))
    const previousCodexHome = process.env.CODEX_HOME
    const previousClaudeHome = process.env.CLAUDE_CONFIG_DIR
    process.env.CODEX_HOME = codexHome
    process.env.CLAUDE_CONFIG_DIR = claudeHome

    try {
      await mkdir(rootDir, { recursive: true })
      const codexSessionsDir = join(codexHome, 'sessions', '2026', '04', '06')
      await mkdir(codexSessionsDir, { recursive: true })
      await writeFile(
        join(
          codexSessionsDir,
          'rollout-2026-04-06T12-10-00-cccccccc-cccc-4ccc-8ccc-cccccccccccc.jsonl',
        ),
        [
          JSON.stringify({
            timestamp: '2026-04-06T12:10:00.000Z',
            type: 'session_meta',
            payload: {
              id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
              cwd: parentDir,
              source: 'cli',
            },
          }),
          JSON.stringify({
            timestamp: '2026-04-06T12:10:01.000Z',
            type: 'event_msg',
            payload: {
              type: 'user_message',
              message: 'this should not be included',
            },
          }),
        ].join('\n') + '\n',
        'utf8',
      )

      const result = await buildMemoryIndex({ rootDir })
      expect(result.manifest.transcriptCount).toBe(0)
    } finally {
      if (previousCodexHome === undefined) {
        delete process.env.CODEX_HOME
      } else {
        process.env.CODEX_HOME = previousCodexHome
      }
      if (previousClaudeHome === undefined) {
        delete process.env.CLAUDE_CONFIG_DIR
      } else {
        process.env.CLAUDE_CONFIG_DIR = previousClaudeHome
      }
      await rm(parentDir, { recursive: true, force: true })
      await rm(codexHome, { recursive: true, force: true })
      await rm(claudeHome, { recursive: true, force: true })
    }
  })

  it('caps the sessions overview DOT and keeps older sessions in shards only', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'claude-memory-index-dot-cap-'))
    const codexHome = await mkdtemp(join(tmpdir(), 'claude-memory-index-dot-cap-codex-'))
    const claudeHome = await mkdtemp(join(tmpdir(), 'claude-memory-index-dot-cap-claude-'))
    const previousCodexHome = process.env.CODEX_HOME
    const previousClaudeHome = process.env.CLAUDE_CONFIG_DIR
    process.env.CODEX_HOME = codexHome
    process.env.CLAUDE_CONFIG_DIR = claudeHome

    try {
      const transcriptDir = getProjectConversationTranscriptsDir(rootDir)
      await mkdir(transcriptDir, { recursive: true })

      for (let index = 0; index < 30; index++) {
        const sessionId = `00000000-0000-0000-0000-${String(index + 1).padStart(12, '0')}`
        await writeFile(
          join(transcriptDir, `${sessionId}.jsonl`),
          `${JSON.stringify({
            parentUuid: null,
            isSidechain: false,
            type: 'user',
            message: {
              role: 'user',
              content: `session ${index + 1} prompt`,
            },
            isMeta: false,
            uuid: `prompt-${index + 1}`,
            timestamp: `2026-04-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
            userType: 'external',
            cwd: rootDir,
            sessionId,
            version: '2.1.88+test',
          })}\n`,
          'utf8',
        )
      }

      await buildMemoryIndex({ rootDir })

      const sessionsDot = await readFile(
        join(rootDir, '.memory_index', 'index', 'sessions.dot'),
        'utf8',
      )
      const overviewSessionCount =
        sessionsDot.match(/\[shape=folder,label=/g)?.length ?? 0
      expect(overviewSessionCount).toBe(24)
      expect(sessionsDot).toContain('00000000-0000-0000-0000-000000000030')
      expect(sessionsDot).not.toContain('00000000-0000-0000-0000-000000000001')

      const dotManifest = JSON.parse(
        await readFile(
          join(rootDir, '.memory_index', 'index', 'dot', 'manifest.json'),
          'utf8',
        ),
      ) as {
        shards: {
          sessions: Array<{ sessionId: string; path: string }>
        }
      }
      expect(
        dotManifest.shards.sessions.some(
          shard =>
            shard.sessionId === '00000000-0000-0000-0000-000000000001',
        ),
      ).toBe(true)
    } finally {
      if (previousCodexHome === undefined) {
        delete process.env.CODEX_HOME
      } else {
        process.env.CODEX_HOME = previousCodexHome
      }
      if (previousClaudeHome === undefined) {
        delete process.env.CLAUDE_CONFIG_DIR
      } else {
        process.env.CLAUDE_CONFIG_DIR = previousClaudeHome
      }
      await rm(rootDir, { recursive: true, force: true })
      await rm(codexHome, { recursive: true, force: true })
      await rm(claudeHome, { recursive: true, force: true })
    }
  })
})
