import { afterEach, describe, expect, it } from 'bun:test'
import { existsSync } from 'fs'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  getCwdState,
  getOriginalCwd,
  getProjectRoot,
  setCwdState,
  setOriginalCwd,
  setProjectRoot,
} from '../bootstrap/state.js'
import { asAgentId } from '../types/ids.js'
import {
  _resetAutoMemoryIndexStateForTesting,
  buildAutoMemoryIndexBeforeCompaction,
  flushPendingAutoMemoryIndexForTesting,
  queueAutoMemoryIndexBuild,
} from './autoMemoryIndex.js'
import { getProjectConversationTranscriptsDir } from '../utils/projectConversationContext.js'

afterEach(async () => {
  await flushPendingAutoMemoryIndexForTesting()
  _resetAutoMemoryIndexStateForTesting()
  delete process.env.CLAUDE_CODE_AUTO_MEMORY_INDEX
})

async function withProjectRoot<T>(
  rootDir: string,
  fn: () => Promise<T>,
): Promise<T> {
  const previousProjectRoot = getProjectRoot()
  const previousOriginalCwd = getOriginalCwd()
  const previousCwd = getCwdState()

  setProjectRoot(rootDir)
  setOriginalCwd(rootDir)
  setCwdState(rootDir)

  try {
    return await fn()
  } finally {
    setProjectRoot(previousProjectRoot)
    setOriginalCwd(previousOriginalCwd)
    setCwdState(previousCwd)
  }
}

describe('autoMemoryIndex', () => {
  it('proactively builds .memory_index artifacts without a manual command', async () => {
    const rootDir = await mkdtemp(
      join(tmpdir(), 'claude-code-auto-memory-index-'),
    )
    const codexHome = await mkdtemp(
      join(tmpdir(), 'claude-code-auto-memory-index-codex-'),
    )
    const claudeHome = await mkdtemp(
      join(tmpdir(), 'claude-code-auto-memory-index-claude-'),
    )
    const previousCodexHome = process.env.CODEX_HOME
    const previousClaudeHome = process.env.CLAUDE_CONFIG_DIR
    process.env.CODEX_HOME = codexHome
    process.env.CLAUDE_CONFIG_DIR = claudeHome

    try {
      await mkdir(join(rootDir, 'src'), { recursive: true })
      await writeFile(join(rootDir, 'src', 'app.ts'), 'export const value = 1\n')

      const sessionId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      const transcriptDir = getProjectConversationTranscriptsDir(rootDir)
      await mkdir(transcriptDir, { recursive: true })
      await writeFile(
        join(transcriptDir, `${sessionId}.jsonl`),
        `${JSON.stringify({
          parentUuid: null,
          isSidechain: false,
          type: 'user',
          message: {
            role: 'user',
            content: '主动生成 memory index，不要手动命令。',
          },
          isMeta: false,
          uuid: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          timestamp: '2026-04-07T00:00:00.000Z',
          userType: 'external',
          cwd: rootDir,
          sessionId,
          version: '2.1.88+test',
        })}\n`,
        'utf8',
      )

      queueAutoMemoryIndexBuild(rootDir)
      await flushPendingAutoMemoryIndexForTesting()

      expect(
        existsSync(join(rootDir, '.memory_index', 'skeleton', '__index__.py')),
      ).toBe(true)
      expect(
        existsSync(
          join(rootDir, '.memory_index', 'index', 'dot', 'manifest.json'),
        ),
      ).toBe(true)
      const eventsText = await readFile(
        join(rootDir, '.memory_index', 'index', 'events.jsonl'),
        'utf8',
      )
      expect(eventsText).toContain('主动生成 memory index')
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

  it('can be disabled with CLAUDE_CODE_AUTO_MEMORY_INDEX=0', async () => {
    const rootDir = await mkdtemp(
      join(tmpdir(), 'claude-code-auto-memory-index-disabled-'),
    )

    try {
      process.env.CLAUDE_CODE_AUTO_MEMORY_INDEX = '0'
      queueAutoMemoryIndexBuild(rootDir)
      await flushPendingAutoMemoryIndexForTesting()

      expect(existsSync(join(rootDir, '.memory_index'))).toBe(false)
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  it('builds memory-index before compaction for the main thread project root', async () => {
    const rootDir = await mkdtemp(
      join(tmpdir(), 'claude-code-auto-memory-index-compaction-'),
    )
    const codexHome = await mkdtemp(
      join(tmpdir(), 'claude-code-auto-memory-index-compaction-codex-'),
    )
    const claudeHome = await mkdtemp(
      join(tmpdir(), 'claude-code-auto-memory-index-compaction-claude-'),
    )
    const previousCodexHome = process.env.CODEX_HOME
    const previousClaudeHome = process.env.CLAUDE_CONFIG_DIR
    process.env.CODEX_HOME = codexHome
    process.env.CLAUDE_CONFIG_DIR = claudeHome

    try {
      await mkdir(join(rootDir, 'src'), { recursive: true })
      await writeFile(join(rootDir, 'src', 'app.ts'), 'export const value = 1\n')

      const sessionId = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
      const transcriptDir = getProjectConversationTranscriptsDir(rootDir)
      await mkdir(transcriptDir, { recursive: true })
      await writeFile(
        join(transcriptDir, `${sessionId}.jsonl`),
        `${JSON.stringify({
          parentUuid: null,
          isSidechain: false,
          type: 'user',
          message: {
            role: 'user',
            content: '上下文要压缩时再更新 memory index。',
          },
          isMeta: false,
          uuid: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
          timestamp: '2026-04-07T00:00:00.000Z',
          userType: 'external',
          cwd: rootDir,
          sessionId,
          version: '2.1.88+test',
        })}\n`,
        'utf8',
      )

      await withProjectRoot(rootDir, async () => {
        await buildAutoMemoryIndexBeforeCompaction()
      })

      expect(
        existsSync(join(rootDir, '.memory_index', 'skeleton', '__index__.py')),
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

  it('skips pre-compaction memory-index builds for subagents', async () => {
    const rootDir = await mkdtemp(
      join(tmpdir(), 'claude-code-auto-memory-index-subagent-'),
    )

    try {
      await withProjectRoot(rootDir, async () => {
        await buildAutoMemoryIndexBeforeCompaction(
          asAgentId('agent-1234567890abcdef'),
        )
      })

      expect(existsSync(join(rootDir, '.memory_index'))).toBe(false)
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })
})
