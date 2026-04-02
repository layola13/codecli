import { describe, expect, it } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  getCwdState,
  getOriginalCwd,
  getProjectRoot,
  setCwdState,
  setOriginalCwd,
  setProjectRoot,
} from '../../bootstrap/state.js'
import { runWithCwdOverride } from '../../utils/cwd.js'
import {
  persistCompressedSessionState,
  readCompressedSessionStateForPrompt,
} from './runtime.js'
import { getConversationSummaryPath } from './summary.js'

function createUserMessage(content: string) {
  return {
    type: 'user',
    message: {
      role: 'user',
      content,
    },
  }
}

function createAssistantMessage(content: string) {
  return {
    type: 'assistant',
    message: {
      role: 'assistant',
      content: [{ type: 'text', text: content }],
      stop_reason: 'end_turn',
    },
  }
}

async function withProjectRoot<T>(rootDir: string, fn: () => Promise<T>): Promise<T> {
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

describe('context compression runtime', () => {
  it('persists incrementally under the project root even if cwd points at dist', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'claude-code-compression-runtime-'))
    const installDir = join(rootDir, 'dist')

    try {
      await mkdir(installDir, { recursive: true })

      await withProjectRoot(rootDir, async () => {
        await runWithCwdOverride(installDir, async () => {
          const firstTurn = [
            createUserMessage('我想修复登录流程。'),
            createAssistantMessage('I modified src/auth.ts.'),
          ]

          await persistCompressedSessionState(firstTurn)

          const firstState = JSON.parse(
            await readFile(
              join(rootDir, '.claude', 'context', 'session_state.json'),
              'utf8',
            ),
          ) as Record<string, unknown>

          expect(firstState.totalTurns).toBe(2)
          expect(firstState.rawCharsIngested).toBeGreaterThan(0)
          expect(firstState.lastTurnSignature).toBeTruthy()

          const secondTurn = [
            ...firstTurn,
            createUserMessage('不要用 Axios，改用 fetch。'),
            createAssistantMessage('I updated src/http.ts to use fetch.'),
          ]

          await persistCompressedSessionState(secondTurn)

          const secondState = JSON.parse(
            await readFile(
              join(rootDir, '.claude', 'context', 'session_state.json'),
              'utf8',
            ),
          ) as Record<string, unknown>

          expect(secondState.totalTurns).toBe(4)
          expect(secondState.rawCharsIngested).toBeGreaterThan(
            Number(firstState.rawCharsIngested),
          )

          const pythonState = await readFile(
            join(rootDir, '.claude', 'context', 'session_state.py'),
            'utf8',
          )
          expect(pythonState).toContain('src/http.ts')
          const summaryMarkdown = await readFile(
            getConversationSummaryPath(rootDir),
            'utf8',
          )
          expect(summaryMarkdown).toContain('# Conversation Summary')
          expect(summaryMarkdown).toContain('我想修复登录流程')
          expect(summaryMarkdown).toContain('I updated src/http.ts to use fetch.')
          expect(
            await Bun.file(
              join(installDir, '.claude', 'context', 'session_state.json'),
            ).exists(),
          ).toBe(false)
        })
      })
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  it('rebuilds state when the conversation is rewritten', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'claude-code-compression-runtime-'))
    const installDir = join(rootDir, 'dist')

    try {
      await mkdir(installDir, { recursive: true })

      await withProjectRoot(rootDir, async () => {
        await runWithCwdOverride(installDir, async () => {
          await persistCompressedSessionState([
            createUserMessage('我想修复登录流程。'),
            createAssistantMessage('I modified src/auth.ts.'),
          ])

          await persistCompressedSessionState([
            createUserMessage('我想把全局索引导出重做成更稳定的文件级版本。'),
            createAssistantMessage('I created src/indexing/indexWriter.ts.'),
          ])

          const rebuiltState = JSON.parse(
            await readFile(
              join(rootDir, '.claude', 'context', 'session_state.json'),
              'utf8',
            ),
          ) as Record<string, unknown>

          expect(rebuiltState.primaryGoal).toContain('文件级版本')
          expect(rebuiltState.totalTurns).toBe(2)
        })
      })
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  it('reads prompt-safe session state from disk', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'claude-code-compression-runtime-'))
    const installDir = join(rootDir, 'dist')

    try {
      await mkdir(installDir, { recursive: true })

      await withProjectRoot(rootDir, async () => {
        await runWithCwdOverride(installDir, async () => {
          const contextDir = join(rootDir, '.claude', 'context')
          await mkdir(contextDir, { recursive: true })
          await Bun.write(
            join(contextDir, 'session_state.py'),
            '# session_state.py\nclass CurrentSession:\n    primary_goal = "ship index dot"\n',
          )

          const promptState = await readCompressedSessionStateForPrompt()
          expect(promptState).toContain('primary_goal')
          expect(promptState).toContain('ship index dot')
        })
      })
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })
})
