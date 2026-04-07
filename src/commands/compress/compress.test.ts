import { describe, expect, it } from 'bun:test'
import { mkdtemp, readFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { call } from './compress.js'
import {
  getCwdState,
  getOriginalCwd,
  getProjectRoot,
  setCwdState,
  setOriginalCwd,
  setProjectRoot,
} from '../../bootstrap/state.js'
import { runWithCwdOverride } from '../../utils/cwd.js'
import { getConversationSummaryPath } from '../../context/compression/summary.js'

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

describe('/compress', () => {
  it('reads assistant text blocks and writes compressed state to the project root', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'claude-code-compress-'))

    try {
      const result = await withProjectRoot(rootDir, () =>
        runWithCwdOverride(rootDir, () =>
          call('', {
            messages: [
              {
                role: 'human',
                content: '我想修复压缩输出路径。',
              },
              {
                role: 'assistant',
                content: [
                  {
                    type: 'text',
                    text: 'I updated src/context/compression/runtime.ts to write under the project root.',
                  },
                ],
              },
            ],
          } as never),
        ),
      )

      expect(result.type).toBe('text')
      expect(result.value).toContain('Context compression complete.')
      expect(result.value).toContain('.claude/context/session_state.py')
      expect(result.value).toContain('.claude/context/session_graph.py')

      const pythonState = await readFile(
        join(rootDir, '.claude', 'context', 'session_state.py'),
        'utf8',
      )
      const graphState = await readFile(
        join(rootDir, '.claude', 'context', 'session_graph.py'),
        'utf8',
      )
      const summaryMarkdown = await readFile(
        getConversationSummaryPath(rootDir),
        'utf8',
      )
      expect(pythonState).toContain('primary_goal')
      expect(pythonState).toContain('src/context/compression/runtime.ts')
      expect(graphState).toContain('ConversationGraph')
      expect(summaryMarkdown).toContain('# Conversation Summary')
      expect(summaryMarkdown).toContain('我想修复压缩输出路径')
      expect(summaryMarkdown).toContain('I updated src/context/compression/runtime.ts to write under the project root.')
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })
})
