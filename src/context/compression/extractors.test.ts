import { describe, expect, it } from 'bun:test'
import { AnchorDetector, MasterExtractor } from './extractors.js'

describe('context compression extractors', () => {
  it('ignores code blocks when extracting goals and constraints', () => {
    const extractor = new MasterExtractor()
    const result = extractor.extract(
      [
        '我想实现多租户认证鉴权中间件，必须使用 fetch。',
        '```ts',
        'const client = axios.create()',
        '// must use axios',
        '```',
      ].join('\n'),
      'user',
      1,
    )

    expect(result.goalUpdate).toContain('实现多租户认证鉴权中间件')
    expect(result.constraints).toHaveLength(1)
    expect(result.constraints[0]?.rule).toContain('fetch')
    expect(result.constraints[0]?.rule).not.toContain('axios')
  })

  it('deduplicates anchors by keeping the highest-priority assistant action', () => {
    const detector = new AnchorDetector()
    const anchors = detector.detect(
      'I referenced src/auth.ts, then modified src/auth.ts, and finally created src/auth.ts.',
      'assistant',
      3,
    )

    expect(anchors).toHaveLength(1)
    expect(anchors[0]?.filePath).toBe('src/auth.ts')
    expect(anchors[0]?.action).toBe('created')
  })

  it('extracts goal, task, and constraints from natural Chinese requests', () => {
    const extractor = new MasterExtractor()
    const result = extractor.extract(
      [
        '为项目的/index增加一个导出全局地图的dot，之前完成了一部分，不完整。',
        '另外更新各个skills的skill.md，告诉他们有这个dot。',
        '理论就做到文件级别即可，不需要做到函数级别，dot 文件尽可能体积小。',
      ].join(''),
      'user',
      1,
    )

    expect(result.goalUpdate).toContain('导出全局地图的dot')
    expect(
      result.tasks.some(
        task => task.action === 'create' && task.description.includes('导出全局地图的dot'),
      ),
    ).toBe(true)
    expect(
      result.tasks.some(
        task => task.action === 'create' && task.description.includes('更新各个skills的skill'),
      ),
    ).toBe(true)
    expect(result.constraints.some(c => c.rule.includes('文件级别'))).toBe(true)
    expect(
      result.constraints.some(
        c => c.rule.includes('FORBIDDEN') && c.rule.includes('函数级别'),
      ),
    ).toBe(true)
  })

  it('ignores low-value generated paths and keeps line references on real files', () => {
    const detector = new AnchorDetector()
    const anchors = detector.detect(
      '先看看 .code_index/__index__.py，再读 src/indexing/indexWriter.ts line 42。',
      'user',
      2,
    )

    expect(anchors).toHaveLength(1)
    expect(anchors[0]?.filePath).toBe('src/indexing/indexWriter.ts')
    expect(anchors[0]?.lineStart).toBe(42)
  })
})
