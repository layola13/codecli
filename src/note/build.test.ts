import { describe, expect, it } from 'bun:test'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { buildNoteSkeleton } from './build.js'

describe('buildNoteSkeleton', () => {
  it('writes a python scaffold for a book directory without copying source text', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'claude-note-root-'))
    const bookDir = join(rootDir, '雪山飞狐')
    const chapterOne = join(bookDir, '001-第一章.txt')
    const chapterTwo = join(bookDir, '002-第二章.txt')

    try {
      await mkdir(bookDir, { recursive: true })
      await writeFile(chapterOne, '这是原文第一行\n这是原文第二行\n', 'utf8')
      await writeFile(chapterTwo, '这是另一段原文\n', 'utf8')

      const result = await buildNoteSkeleton({
        rootPath: bookDir,
        outputDir: join(bookDir, '.note_index'),
        format: 'txt',
      })

      expect(result.engine).toBe('scaffold')
      expect(result.sourceKind).toBe('book_directory')
      expect(result.bookCount).toBe(1)
      expect(result.sourceFileCount).toBe(2)
      expect(result.chapterCount).toBe(2)
      expect(result.roleCount).toBe(0)
      expect(result.relationCount).toBe(0)
      expect(result.eventCount).toBe(0)
      expect(result.placeCount).toBe(0)
      expect(result.factionCount).toBe(0)
      expect(result.abilityCount).toBe(0)
      expect(result.timelineCount).toBe(0)

      const manifest = await readFile(join(bookDir, '.note_index', 'manifest.py'), 'utf8')
      const chapterModule = await readFile(
        join(bookDir, '.note_index', 'books', 'book_001', 'chapters', 'chapter_001_n_001.py'),
        'utf8',
      )

      expect(manifest).toContain('format = "txt"')
      expect(manifest).toContain('engine = "scaffold"')
      expect(chapterModule).toContain('line_range = "L1:L3"')
      expect(chapterModule).toContain('# zh_title: 001-第一章')
      expect(chapterModule).not.toContain('这是原文第一行')
      expect(chapterModule).not.toContain('这是原文第二行')
      expect(chapterModule).toContain('role_refs = []')
      expect(chapterModule).toContain('event_refs = []')
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  it('writes a python scaffold for a library directory with per-book folders', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'claude-note-library-root-'))
    const libraryDir = join(rootDir, '按书名章节拆分')
    const firstBookDir = join(libraryDir, '飞狐外传')
    const secondBookDir = join(libraryDir, '碧血剑')

    try {
      await mkdir(firstBookDir, { recursive: true })
      await mkdir(secondBookDir, { recursive: true })
      await writeFile(join(firstBookDir, '001-第一章.txt'), '第一本第一章\n', 'utf8')
      await writeFile(join(firstBookDir, '002-第二章.txt'), '第一本第二章\n', 'utf8')
      await writeFile(join(secondBookDir, '000-前言.txt'), '第二本前言\n', 'utf8')

      const result = await buildNoteSkeleton({
        rootPath: libraryDir,
        outputDir: join(libraryDir, '.note_index'),
        format: 'txt',
      })

      expect(result.engine).toBe('scaffold')
      expect(result.sourceKind).toBe('library_directory')
      expect(result.bookCount).toBe(2)
      expect(result.sourceFileCount).toBe(3)
      expect(result.chapterCount).toBe(3)

      const manifest = await readFile(join(libraryDir, '.note_index', 'manifest.py'), 'utf8')
      const bookDirs = (await readdir(join(libraryDir, '.note_index', 'books'))).sort()
      expect(bookDirs).toHaveLength(2)

      const firstBookModuleDir = join(libraryDir, '.note_index', 'books', bookDirs[0]!)
      const secondBookModuleDir = join(libraryDir, '.note_index', 'books', bookDirs[1]!)
      const firstBookInit = await readFile(join(firstBookModuleDir, 'book.py'), 'utf8')
      const secondBookInit = await readFile(join(secondBookModuleDir, 'book.py'), 'utf8')
      const firstBookChapters = (await readdir(join(firstBookModuleDir, 'chapters')))
        .filter(name => name.endsWith('.py') && name !== '__init__.py')
        .sort()
      const secondBookChapters = (await readdir(join(secondBookModuleDir, 'chapters')))
        .filter(name => name.endsWith('.py') && name !== '__init__.py')
        .sort()
      const firstBookChapter = await readFile(
        join(firstBookModuleDir, 'chapters', firstBookChapters[0]!),
        'utf8',
      )
      const secondBookChapter = await readFile(
        join(secondBookModuleDir, 'chapters', secondBookChapters[0]!),
        'utf8',
      )

      expect(manifest).toContain('source_kind = "library_directory"')
      expect(manifest).toContain('book_count = 2')
      expect(firstBookInit + secondBookInit).toContain('book_name_zh = "飞狐外传"')
      expect(firstBookInit + secondBookInit).toContain('book_name_zh = "碧血剑"')
      expect(firstBookChapter + secondBookChapter).toContain('source_file = "001-第一章.txt"')
      expect(firstBookChapter + secondBookChapter).toContain('source_file = "000-前言.txt"')
      expect(firstBookChapter).not.toContain('第一本第一章')
      expect(secondBookChapter).not.toContain('第二本前言')
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  it('writes agent-derived role relation and event modules without copying source text', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'claude-note-agent-root-'))
    const bookDir = join(rootDir, '书剑恩仇录')
    const chapterOne = join(bookDir, '001-第一回.txt')
    const chapterTwo = join(bookDir, '002-第二回.txt')

    try {
      await mkdir(bookDir, { recursive: true })
      await writeFile(chapterOne, '陈家洛出场并与红花会众人相见。\n', 'utf8')
      await writeFile(chapterTwo, '陈家洛继续领导红花会。\n', 'utf8')

      const result = await buildNoteSkeleton({
        rootPath: bookDir,
        outputDir: join(bookDir, '.note_index'),
        format: 'txt',
        analyzeBook: async ({ book, format, sourceKind }) => ({
          bookId: book.bookId,
          bookNameZh: book.bookNameZh,
          bookNameEn: book.bookNameEn,
          format,
          sourceKind,
          sourceRoot: book.sourceRoot,
          sourceFiles: book.sourceFiles.map(file => file.relativePath),
          chapters: [
            {
              chapterId: 'chapter_001_meeting',
              titleZh: '第一回',
              titleEn: 'chapter_001_meeting',
              sourceFile: '001-第一回.txt',
              lineRange: 'L1:L1',
              roleRefs: ['chen_jialuo'],
              eventRefs: ['event_001_meeting'],
              factionRefs: ['red_flower_society'],
              placeRefs: [],
              tags: ['opening'],
            },
            {
              chapterId: 'chapter_002_leading',
              titleZh: '第二回',
              titleEn: 'chapter_002_leading',
              sourceFile: '002-第二回.txt',
              lineRange: 'L1:L1',
              roleRefs: ['chen_jialuo'],
              eventRefs: ['event_002_leading'],
              factionRefs: ['red_flower_society'],
              placeRefs: [],
              tags: ['continuation'],
            },
          ],
          roles: [
            {
              nodeId: 'chen_jialuo',
              canonicalNameEn: 'chen_jialuo',
              canonicalNameZh: '陈家洛',
              aliasTokensEn: ['chief'],
              aliasTokensZh: ['总舵主'],
              sourceFiles: ['001-第一回.txt', '002-第二回.txt'],
              chapterRefs: ['chapter_001_meeting', 'chapter_002_leading'],
              mentionRanges: ['L1:L1'],
              relationRefs: ['relation_001_alliance'],
              eventRefs: ['event_001_meeting', 'event_002_leading'],
              abilityRefs: [],
              factionRefs: ['red_flower_society'],
              placeRefs: [],
              tags: ['leader'],
            },
          ],
          relations: [
            {
              nodeId: 'relation_001_alliance',
              leftRef: 'chen_jialuo',
              rightRef: 'red_flower_society',
              leftZh: '陈家洛',
              rightZh: '红花会',
              relationTypes: ['leader'],
              chapterRefs: ['chapter_001_meeting', 'chapter_002_leading'],
              evidenceRanges: ['L1:L1'],
              eventRefs: ['event_001_meeting', 'event_002_leading'],
              tags: ['organization'],
            },
          ],
          events: [
            {
              nodeId: 'event_001_meeting',
              labelZh: '首次会众',
              chapterRef: 'chapter_001_meeting',
              sourceFiles: ['001-第一回.txt'],
              lineRanges: ['L1:L1'],
              participantRefs: ['chen_jialuo'],
              placeRefs: ['red_flower_hall'],
              relationRefs: ['relation_001_alliance'],
              precedingEventRefs: [],
              followingEventRefs: ['event_002_leading'],
              tags: ['opening'],
            },
            {
              nodeId: 'event_002_leading',
              labelZh: '继续领众',
              chapterRef: 'chapter_002_leading',
              sourceFiles: ['002-第二回.txt'],
              lineRanges: ['L1:L1'],
              participantRefs: ['chen_jialuo'],
              placeRefs: ['red_flower_hall'],
              relationRefs: ['relation_001_alliance'],
              precedingEventRefs: ['event_001_meeting'],
              followingEventRefs: [],
              tags: ['continuation'],
            },
          ],
          places: [
            {
              nodeId: 'red_flower_hall',
              canonicalNameEn: 'red_flower_hall',
              canonicalNameZh: '红花会总舵',
              aliasTokensEn: ['hall'],
              aliasTokensZh: ['总舵'],
              sourceFiles: ['001-第一回.txt', '002-第二回.txt'],
              chapterRefs: ['chapter_001_meeting', 'chapter_002_leading'],
              mentionRanges: ['L1:L1'],
              eventRefs: ['event_001_meeting', 'event_002_leading'],
              roleRefs: ['chen_jialuo'],
              factionRefs: ['red_flower_society'],
              tags: ['base'],
            },
          ],
          factions: [
            {
              nodeId: 'red_flower_society',
              canonicalNameEn: 'red_flower_society',
              canonicalNameZh: '红花会',
              aliasTokensEn: ['society'],
              aliasTokensZh: ['帮会'],
              sourceFiles: ['001-第一回.txt', '002-第二回.txt'],
              chapterRefs: ['chapter_001_meeting', 'chapter_002_leading'],
              mentionRanges: ['L1:L1'],
              roleRefs: ['chen_jialuo'],
              eventRefs: ['event_001_meeting', 'event_002_leading'],
              placeRefs: ['red_flower_hall'],
              tags: ['organization'],
            },
          ],
          abilities: [
            {
              nodeId: 'leadership',
              canonicalNameEn: 'leadership',
              canonicalNameZh: '统领',
              aliasTokensEn: ['command'],
              aliasTokensZh: ['领众'],
              ownerRefs: ['chen_jialuo'],
              sourceFiles: ['002-第二回.txt'],
              chapterRefs: ['chapter_002_leading'],
              mentionRanges: ['L1:L1'],
              eventRefs: ['event_002_leading'],
              tags: ['skill'],
            },
          ],
          timelines: [
            {
              nodeId: 'opening_arc',
              labelEn: 'opening_arc',
              labelZh: '开篇线',
              eventRefs: ['event_001_meeting', 'event_002_leading'],
              chapterRefs: ['chapter_001_meeting', 'chapter_002_leading'],
              tags: ['arc'],
            },
          ],
        }),
      })

      expect(result.engine).toBe('agent')
      expect(result.chapterCount).toBe(2)
      expect(result.roleCount).toBe(1)
      expect(result.relationCount).toBe(1)
      expect(result.eventCount).toBe(2)
      expect(result.placeCount).toBe(1)
      expect(result.factionCount).toBe(1)
      expect(result.abilityCount).toBe(1)
      expect(result.timelineCount).toBe(1)

      const manifest = await readFile(join(bookDir, '.note_index', 'manifest.py'), 'utf8')
      const roleModule = await readFile(
        join(bookDir, '.note_index', 'books', 'book_001', 'roles', 'chen_jialuo.py'),
        'utf8',
      )
      const relationModule = await readFile(
        join(bookDir, '.note_index', 'books', 'book_001', 'relations', 'relation_001_alliance.py'),
        'utf8',
      )
      const eventModule = await readFile(
        join(bookDir, '.note_index', 'books', 'book_001', 'events', 'event_001_meeting.py'),
        'utf8',
      )
      const secondEventModule = await readFile(
        join(bookDir, '.note_index', 'books', 'book_001', 'events', 'event_002_leading.py'),
        'utf8',
      )
      const placeModule = await readFile(
        join(bookDir, '.note_index', 'books', 'book_001', 'places', 'red_flower_hall.py'),
        'utf8',
      )
      const factionModule = await readFile(
        join(bookDir, '.note_index', 'books', 'book_001', 'factions', 'red_flower_society.py'),
        'utf8',
      )
      const abilityModule = await readFile(
        join(bookDir, '.note_index', 'books', 'book_001', 'abilities', 'leadership.py'),
        'utf8',
      )
      const timelineModule = await readFile(
        join(bookDir, '.note_index', 'books', 'book_001', 'timelines', 'opening_arc.py'),
        'utf8',
      )
      const edgesModule = await readFile(
        join(bookDir, '.note_index', 'graph', 'edges.py'),
        'utf8',
      )

      expect(manifest).toContain('engine = "agent"')
      expect(roleModule).toContain('canonical_name_en = "chen_jialuo"')
      expect(roleModule).toContain('# zh_name: 陈家洛')
      expect(roleModule).toContain('chapter_refs = ["chapter_001_meeting", "chapter_002_leading"]')
      expect(roleModule).not.toContain('陈家洛出场并与红花会众人相见')
      expect(relationModule).toContain('relation_types = ["leader"]')
      expect(eventModule).toContain('following_event_refs = ["event_002_leading"]')
      expect(secondEventModule).toContain('preceding_event_refs = ["event_001_meeting"]')
      expect(placeModule).toContain('canonical_name_en = "red_flower_hall"')
      expect(factionModule).toContain('canonical_name_en = "red_flower_society"')
      expect(abilityModule).toContain('owner_refs = ["chen_jialuo"]')
      expect(timelineModule).toContain('event_refs = ["event_001_meeting", "event_002_leading"]')
      expect(placeModule).not.toContain('陈家洛出场并与红花会众人相见')
      expect(edgesModule).toContain('(\"chen_jialuo\", \"red_flower_society\", \"relation_001_alliance\")')
      expect(edgesModule).toContain('(\"red_flower_hall\", \"chen_jialuo\", \"place_role\")')
      expect(edgesModule).toContain('(\"leadership\", \"chen_jialuo\", \"ability_owner\")')
      expect(secondEventModule).not.toContain('陈家洛继续领导红花会')
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })
})
