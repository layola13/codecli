import { describe, expect, it, mock } from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { LOCAL_COMMAND_STDOUT_TAG } from '../../constants/xml.js'

describe('/memory-index command', () => {
  it('streams progress updates into the transcript before the final result', async () => {
    const rootDir = await mkdtemp(
      join(tmpdir(), 'claude-memory-index-command-'),
    )
    const codexHome = await mkdtemp(
      join(tmpdir(), 'claude-memory-index-command-codex-'),
    )
    const claudeHome = await mkdtemp(
      join(tmpdir(), 'claude-memory-index-command-claude-'),
    )
    const previousCodexHome = process.env.CODEX_HOME
    const previousClaudeHome = process.env.CLAUDE_CONFIG_DIR
    process.env.CODEX_HOME = codexHome
    process.env.CLAUDE_CONFIG_DIR = claudeHome

    try {
      mock.module('./refreshMemoryIndexSkillRuntime.js', () => ({
        refreshMemoryIndexSkillRuntime: async () => {},
      }))

      const { call } = await import('./memoryIndexCommand.js')
      const messages: Array<{ content?: string; uuid?: string }> = []
      const outputs: string[] = []
      const context = {
        setMessages(updater: (prev: typeof messages) => typeof messages) {
          const next = updater(messages)
          messages.splice(0, messages.length, ...next)
          const last = messages.at(-1)
          if (typeof last?.content === 'string') {
            outputs.push(last.content)
          }
        },
      } as Parameters<typeof call>[1]

      const result = await call(rootDir, context)

      expect(result).toEqual({ type: 'skip' })
      expect(
        outputs.some(output =>
          output.includes(
            `<${LOCAL_COMMAND_STDOUT_TAG}>Memory indexing project:`,
          ),
        ),
      ).toBe(true)
      expect(
        outputs.some(output => output.includes('Memory index build complete.')),
      ).toBe(true)
      expect(
        outputs.some(output => output.includes('project_memory_graph.py')),
      ).toBe(true)
      expect(
        outputs.some(output => output.includes('memory_graph.dot')),
      ).toBe(true)
      expect(
        outputs.some(output => output.includes('skeleton/__index__.py')),
      ).toBe(true)
      expect(
        outputs.some(output => output.includes('index/dot/manifest.json')),
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

  it('uses the internal graph analysis hook when full tool context exists', async () => {
    const rootDir = await mkdtemp(
      join(tmpdir(), 'claude-memory-index-command-agent-'),
    )
    const codexHome = await mkdtemp(
      join(tmpdir(), 'claude-memory-index-command-agent-codex-'),
    )
    const claudeHome = await mkdtemp(
      join(tmpdir(), 'claude-memory-index-command-agent-claude-'),
    )
    const previousCodexHome = process.env.CODEX_HOME
    const previousClaudeHome = process.env.CLAUDE_CONFIG_DIR
    process.env.CODEX_HOME = codexHome
    process.env.CLAUDE_CONFIG_DIR = claudeHome

    try {
      let analyzeCount = 0
      mock.module('./refreshMemoryIndexSkillRuntime.js', () => ({
        refreshMemoryIndexSkillRuntime: async () => {},
      }))
      mock.module('../../memoryIndex/agentGraphAnalysis.js', () => ({
        analyzeMemoryGraphWithAgent: async () => {
          analyzeCount++
          return null
        },
      }))

      const { call } = await import('./memoryIndexCommand.js')
      const messages: Array<{ content?: string; uuid?: string }> = []
      const context = {
        setMessages(updater: (prev: typeof messages) => typeof messages) {
          const next = updater(messages)
          messages.splice(0, messages.length, ...next)
        },
        options: {
          tools: {},
          mainLoopModel: 'test-model',
          mcpClients: [],
          ideInstallationStatus: null,
          theme: 'dark',
        },
      } as Parameters<typeof call>[1]

      const result = await call(rootDir, context)

      expect(result).toEqual({ type: 'skip' })
      expect(analyzeCount).toBe(1)
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
