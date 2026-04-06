import { describe, expect, it } from 'bun:test'
import FileIndex, { TypeScriptFileIndex } from './index.js'

const FIXTURE_PATHS = [
  'src/hooks/fileSuggestions.ts',
  'src/native-ts/file-index/index.ts',
  'src/native-ts/file-index/typescript.ts',
  'src/utils/envUtils.ts',
  'README.md',
  'test/file-index.spec.ts',
  'docs/file-index-design.md',
  'vendor/file-index-src/lib.rs',
]

describe('file-index', () => {
  it('uses the TypeScript backend for synchronous search', () => {
    const index = new FileIndex()
    const ts = new TypeScriptFileIndex()
    index.loadFromFileList(FIXTURE_PATHS)
    ts.loadFromFileList(FIXTURE_PATHS)

    for (const [query, limit] of [
      ['', 5],
      ['file', 5],
      ['fi', 3],
      ['FileIndex', 5],
      ['test', 5],
      ['srcfi', 5],
    ] as const) {
      expect(index.search(query, limit)).toEqual(ts.search(query, limit))
    }
  })

  it('builds asynchronously and becomes queryable before finishing', async () => {
    const index = new FileIndex()
    const ts = new TypeScriptFileIndex()
    const indexAsync = index.loadFromFileListAsync(FIXTURE_PATHS)
    const tsAsync = ts.loadFromFileListAsync(FIXTURE_PATHS)

    await indexAsync.queryable
    expect(index.search('file', 5).length).toBeGreaterThan(0)

    await Promise.all([indexAsync.done, tsAsync.done])

    expect(index.search('file', 5)).toEqual(ts.search('file', 5))
    expect(index.search('', 5)).toEqual(ts.search('', 5))
  })
})
