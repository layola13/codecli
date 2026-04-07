import { describe, expect, it } from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { call } from './compress-status.js'
import { ContextCompressorEngine } from '../../context/compression/engine.js'
import {
  getCwdState,
  getOriginalCwd,
  getProjectRoot,
  setCwdState,
  setOriginalCwd,
  setProjectRoot,
} from '../../bootstrap/state.js'
import { runWithCwdOverride } from '../../utils/cwd.js'

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

describe('/compress-status', () => {
  it('reports when no compressed context exists', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'claude-code-compress-status-'))

    try {
      const result = await withProjectRoot(rootDir, () =>
        runWithCwdOverride(rootDir, () => call('', {} as never)),
      )

      expect(result.type).toBe('text')
      expect(result.value).toContain('No compressed context found.')
      expect(result.value).toContain('Run `/compress` first.')
      expect(result.value).toContain('.claude/context/session_history.py')
      expect(result.value).toContain('.claude/context/session_metrics.py')
      expect(result.value).toContain('.claude/context/session_graph.py')
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  it('reads saved compression stats from disk', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'claude-code-compress-status-'))
    const outputDir = join(rootDir, '.claude', 'context')

    try {
      const engine = new ContextCompressorEngine({
        autoSave: false,
        outputDir,
        sessionId: 'session_status',
      })
      engine.ingest('user', '我想重构整套多租户认证流程。', 1)
      engine.ingest('assistant', 'I modified src/auth.ts.', 2)
      await engine.save()

      const result = await withProjectRoot(rootDir, () =>
        runWithCwdOverride(rootDir, () => call('', {} as never)),
      )

      expect(result.type).toBe('text')
      expect(result.value).toContain('Context compression status.')
      expect(result.value).toContain('Session ID: session_status')
      expect(result.value).toContain('Primary goal: 重构整套多租户认证流程')
      expect(result.value).toContain('Compressed chars:')
      expect(result.value).toContain(engine.outputPythonPath)
      expect(result.value).toContain(engine.outputHistoryPath)
      expect(result.value).toContain(engine.outputMetricsPath)
      expect(result.value).toContain(engine.outputGraphPath)
      expect(result.value).toContain(engine.outputJsonPath)
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })
})
