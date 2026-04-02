import { describe, expect, it } from 'bun:test'
import { mkdtemp, readFile, rm, stat } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { ContextCompressorEngine } from './engine.js'

describe('ContextCompressorEngine', () => {
  it('persists python/json state with synced compression metrics', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'claude-code-compressor-'))
    const outputDir = join(rootDir, '.claude', 'context')

    try {
      const engine = new ContextCompressorEngine({
        autoSave: false,
        outputDir,
        sessionId: 'session_test',
      })

      engine.ingest('user', '我想实现多租户认证鉴权中间件。', 1)
      engine.ingest('user', 'must use fetch because project policy.', 2)
      engine.ingest('assistant', 'I created src/auth.ts and updated src/session.ts.', 3)
      await engine.save()

      const pythonText = await readFile(engine.outputPythonPath, 'utf8')
      const historyText = await readFile(engine.outputHistoryPath, 'utf8')
      const metricsText = await readFile(engine.outputMetricsPath, 'utf8')
      const jsonText = await readFile(engine.outputJsonPath, 'utf8')
      const jsonState = JSON.parse(jsonText) as Record<string, unknown>

      expect(pythonText).toContain("primary_goal = '实现多租户认证鉴权中间件'")
      expect(historyText).toContain('SessionHistory')
      expect(historyText).toContain('src/auth.ts')
      expect(metricsText).toContain('SessionMetrics')
      expect(metricsText).toContain('compression_ratio')
      expect(pythonText).toContain('# Raw chars ingested:')
      expect(pythonText).toContain('# Compressed chars:')
      expect(jsonState.sessionId).toBe('session_test')
      expect(jsonState.rawCharsIngested).toBeGreaterThan(0)
      expect(jsonState.compressedChars).toBeGreaterThan(0)
      expect((await stat(engine.outputHistoryPath)).isFile()).toBe(true)
      expect((await stat(engine.outputMetricsPath)).isFile()).toBe(true)

      const stats = engine.getStats()
      expect(stats.totalTurns).toBe(3)
      expect(stats.rawCharsIngested).toBeGreaterThan(0)
      expect(stats.compressedChars).toBeGreaterThan(0)
      expect(stats.constraints).toBeGreaterThan(0)
      expect(stats.anchors).toBeGreaterThan(0)

      const reloaded = new ContextCompressorEngine({
        autoSave: false,
        outputDir,
      })
      const loadedState = await reloaded.loadExistingState()

      expect(loadedState?.primaryGoal).toContain('实现多租户认证鉴权中间件')
      expect(reloaded.getStats().totalTurns).toBe(3)
      expect(reloaded.getStats().rawCharsIngested).toBeGreaterThan(0)
      expect(reloaded.getStats().compressedChars).toBeGreaterThan(0)
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  it('captures meaningful state from natural multi-turn coding conversations', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'claude-code-compressor-'))
    const outputDir = join(rootDir, '.claude', 'context')

    try {
      const engine = new ContextCompressorEngine({
        autoSave: false,
        outputDir,
        sessionId: 'session_realistic',
      })

      engine.ingest(
        'user',
        '为项目的/index增加一个导出全局地图的dot，之前完成了一部分，不完整，你继续看看 src/indexing/indexWriter.ts。',
        1,
      )
      engine.ingest(
        'user',
        '另外更新各个skills的skill.md。理论就做到文件级别即可，不需要做到函数级别，dot 文件尽可能体积小。',
        2,
      )
      engine.ingest(
        'user',
        '不要输出到安装目录，改到项目根目录，并且版本号改成 2.1.88+local.3。',
        3,
      )
      engine.ingest(
        'assistant',
        'I updated src/indexing/indexWriter.ts, src/indexing/skillWriter.ts, and src/context/compression/runtime.ts to export the DOT and write under the project root.',
        4,
      )
      await engine.save()

      const pythonText = await readFile(engine.outputPythonPath, 'utf8')
      const jsonText = await readFile(engine.outputJsonPath, 'utf8')
      const jsonState = JSON.parse(jsonText) as Record<string, unknown>
      const tasks = (jsonState.tasks ?? []) as Array<Record<string, unknown>>
      const constraints = (jsonState.constraints ?? []) as Array<Record<string, unknown>>
      const decisions = (jsonState.decisions ?? []) as Array<Record<string, unknown>>
      const facts = (jsonState.facts ?? []) as Array<Record<string, unknown>>
      const anchors = (jsonState.codeAnchors ?? []) as Array<Record<string, unknown>>

      expect(jsonState.primaryGoal).toBe('项目的/index增加一个导出全局地图的dot')
      expect(tasks.length).toBeGreaterThan(0)
      expect(
        constraints.some(
          c => String(c.rule).includes('文件级别') || String(c.rule).includes('函数级别'),
        ),
      ).toBe(true)
      expect(
        decisions.some(d => String(d.choice).includes('项目根目录')),
      ).toBe(true)
      expect(
        facts.some(
          fact => fact.key === 'version' && String(fact.value) === '2.1.88+local.3',
        ),
      ).toBe(true)
      expect(
        anchors.some(anchor => anchor.filePath === 'src/indexing/indexWriter.ts'),
      ).toBe(true)
      expect(
        anchors.some(anchor => anchor.filePath === 'src/context/compression/runtime.ts'),
      ).toBe(true)
      expect(
        anchors.some(anchor => String(anchor.filePath).includes('.code_index/')),
      ).toBe(false)
      expect(pythonText).toContain("primary_goal = '项目的/index增加一个导出全局地图的dot'")
      expect(pythonText).toContain('2.1.88+local.3')
      expect(pythonText).not.toContain('.code_index/__index__.py')
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })
})
