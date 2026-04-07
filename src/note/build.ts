import { mkdir, readdir, readFile, stat, writeFile } from 'fs/promises'
import { basename, dirname, extname, join, relative } from 'path'
import { inferEnglishBookId, toPythonSlug } from './naming.js'
import type {
  NoteAbility,
  NoteBook,
  NoteChapter,
  NoteEvent,
  NoteFaction,
  NoteFormat,
  NotePlace,
  NoteRelation,
  NoteRole,
  NoteSourceKind,
  NoteTimeline,
} from './types.js'

type BuildNoteSkeletonInput = {
  rootPath: string
  outputDir: string
  format: NoteFormat
  onProgress?: (message: string) => void
  analyzeBook?: (input: {
    book: DiscoveredBook
    sourceKind: NoteSourceKind
    format: NoteFormat
  }) => Promise<NoteBook | null>
}

type DiscoveredSourceFile = {
  absolutePath: string
  relativePath: string
}

type DiscoveredBook = {
  bookId: string
  bookNameZh: string
  bookNameEn: string
  sourceRoot: string
  sourceFiles: DiscoveredSourceFile[]
}

type BuildNoteSkeletonResult = {
  engine: 'scaffold' | 'agent'
  format: NoteFormat
  sourceKind: NoteSourceKind
  rootPath: string
  outputDir: string
  bookCount: number
  sourceFileCount: number
  chapterCount: number
  roleCount: number
  relationCount: number
  eventCount: number
  placeCount: number
  factionCount: number
  abilityCount: number
  timelineCount: number
}

function emitCommentLines(lines: string[]): string {
  return lines.map(line => `# ${line}`).join('\n')
}

function toPythonStringList(values: string[]): string {
  if (values.length === 0) {
    return '[]'
  }

  return `[${values.map(value => JSON.stringify(value)).join(', ')}]`
}

function toLineRange(content: string): string {
  const lineCount = Math.max(1, content.split(/\r?\n/).length)
  return `L1:L${lineCount}`
}

async function readTextFile(filePath: string): Promise<string> {
  const buffer = await readFile(filePath)
  return buffer.toString('utf8')
}

async function listFilesRecursively(dirPath: string): Promise<string[]> {
  const entries = await readdir(dirPath, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const childPath = join(dirPath, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '.note_index') {
        continue
      }
      files.push(...(await listFilesRecursively(childPath)))
      continue
    }
    if (entry.isFile()) {
      files.push(childPath)
    }
  }

  return files.sort((left, right) => left.localeCompare(right))
}

function matchesFormat(filePath: string, format: NoteFormat): boolean {
  return extname(filePath).toLowerCase() === `.${format}`
}

async function discoverInput(rootPath: string, format: NoteFormat): Promise<{
  sourceKind: NoteSourceKind
  books: DiscoveredBook[]
}> {
  const inputStat = await stat(rootPath)

  if (inputStat.isFile()) {
    if (!matchesFormat(rootPath, format)) {
      throw new Error(`Input file does not match --format ${format}: ${rootPath}`)
    }

    const bookName = basename(rootPath, extname(rootPath))
    return {
      sourceKind: 'file',
      books: [
        {
          bookId: inferEnglishBookId(rootPath, 1),
          bookNameZh: bookName,
          bookNameEn: inferEnglishBookId(rootPath, 1),
          sourceRoot: rootPath,
          sourceFiles: [
            {
              absolutePath: rootPath,
              relativePath: basename(rootPath),
            },
          ],
        },
      ],
    }
  }

  if (!inputStat.isDirectory()) {
    throw new Error(`Unsupported note input: ${rootPath}`)
  }

  const directEntries = await readdir(rootPath, { withFileTypes: true })
  const directFiles = directEntries
    .filter(entry => entry.isFile())
    .map(entry => join(rootPath, entry.name))
    .filter(filePath => matchesFormat(filePath, format))
    .sort((left, right) => left.localeCompare(right))

  const childDirectories = directEntries
    .filter(entry => entry.isDirectory() && entry.name !== '.note_index')
    .map(entry => join(rootPath, entry.name))
    .sort((left, right) => left.localeCompare(right))

  if (directFiles.length > 0 && childDirectories.length === 0) {
    const bookName = basename(rootPath)
    return {
      sourceKind: 'book_directory',
      books: [
        {
          bookId: toPythonSlug(bookName, 'book_001'),
          bookNameZh: bookName,
          bookNameEn: toPythonSlug(bookName, 'book_001'),
          sourceRoot: rootPath,
          sourceFiles: directFiles.map(filePath => ({
            absolutePath: filePath,
            relativePath: relative(rootPath, filePath),
          })),
        },
      ],
    }
  }

  const books: DiscoveredBook[] = []
  for (const directoryPath of childDirectories) {
    const nestedFiles = (await listFilesRecursively(directoryPath)).filter(filePath =>
      matchesFormat(filePath, format),
    )
    if (nestedFiles.length === 0) {
      continue
    }

    const fallbackId = `book_${String(books.length + 1).padStart(3, '0')}`
    const bookName = basename(directoryPath)
    books.push({
      bookId: toPythonSlug(bookName, fallbackId),
      bookNameZh: bookName,
      bookNameEn: toPythonSlug(bookName, fallbackId),
      sourceRoot: directoryPath,
      sourceFiles: nestedFiles.map(filePath => ({
        absolutePath: filePath,
        relativePath: relative(directoryPath, filePath),
      })),
    })
  }

  if (books.length > 0) {
    return {
      sourceKind: 'library_directory',
      books,
    }
  }

  throw new Error(`No .${format} files found under: ${rootPath}`)
}

async function writePythonFile(filePath: string, content: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, content, 'utf8')
}

function chapterModuleName(filePath: string, index: number): string {
  const stem = basename(filePath, extname(filePath))
  return `chapter_${String(index + 1).padStart(3, '0')}_${toPythonSlug(stem, `chapter_${String(index + 1).padStart(3, '0')}`)}`
}

function normalizeList(values: string[] | undefined): string[] {
  return (values ?? []).filter(Boolean)
}

function toModuleInit(moduleNames: string[]): string {
  return moduleNames.map(name => `from .${name} import *`).join('\n') + (moduleNames.length ? '\n' : '')
}

function createScaffoldBook(book: DiscoveredBook, format: NoteFormat): Promise<NoteBook> {
  return Promise.all(
    book.sourceFiles.map(async (sourceFile, index) => {
      const content = await readTextFile(sourceFile.absolutePath)
      const moduleName = chapterModuleName(sourceFile.relativePath, index)
      const chapter: NoteChapter = {
        chapterId: moduleName,
        titleZh: basename(sourceFile.relativePath, extname(sourceFile.relativePath)),
        titleEn: moduleName,
        sourceFile: sourceFile.relativePath,
        lineRange: toLineRange(content),
        roleRefs: [],
        eventRefs: [],
        factionRefs: [],
        placeRefs: [],
        tags: [],
      }
      return chapter
    }),
  ).then(chapters => ({
    bookId: book.bookId,
    bookNameZh: book.bookNameZh,
    bookNameEn: book.bookNameEn,
    format,
    sourceKind: 'book_directory' as const,
    sourceRoot: book.sourceRoot,
    sourceFiles: book.sourceFiles.map(file => file.relativePath),
    chapters,
    roles: [],
    relations: [],
    events: [],
    places: [],
    factions: [],
    abilities: [],
    timelines: [],
  }))
}

function normalizeBookShape(
  analyzed: NoteBook | null,
  discovered: DiscoveredBook,
  sourceKind: NoteSourceKind,
  format: NoteFormat,
): Promise<NoteBook> {
  if (analyzed) {
    return Promise.resolve({
      ...analyzed,
      bookId: analyzed.bookId || discovered.bookId,
      bookNameZh: analyzed.bookNameZh || discovered.bookNameZh,
      bookNameEn: analyzed.bookNameEn || discovered.bookNameEn,
      format,
      sourceKind,
      sourceRoot: discovered.sourceRoot,
      sourceFiles:
        analyzed.sourceFiles.length > 0
          ? analyzed.sourceFiles
          : discovered.sourceFiles.map(file => file.relativePath),
      chapters: analyzed.chapters.map(chapter => ({
        ...chapter,
        roleRefs: normalizeList(chapter.roleRefs),
        eventRefs: normalizeList(chapter.eventRefs),
        factionRefs: normalizeList(chapter.factionRefs),
        placeRefs: normalizeList(chapter.placeRefs),
        tags: normalizeList(chapter.tags),
      })),
      roles: analyzed.roles.map(role => ({
        ...role,
        aliasTokensEn: normalizeList(role.aliasTokensEn),
        aliasTokensZh: normalizeList(role.aliasTokensZh),
        sourceFiles: normalizeList(role.sourceFiles),
        chapterRefs: normalizeList(role.chapterRefs),
        mentionRanges: normalizeList(role.mentionRanges),
        relationRefs: normalizeList(role.relationRefs),
        eventRefs: normalizeList(role.eventRefs),
        abilityRefs: normalizeList(role.abilityRefs),
        factionRefs: normalizeList(role.factionRefs),
        placeRefs: normalizeList(role.placeRefs),
        tags: normalizeList(role.tags),
      })),
      relations: analyzed.relations.map(relation => ({
        ...relation,
        relationTypes: normalizeList(relation.relationTypes),
        chapterRefs: normalizeList(relation.chapterRefs),
        evidenceRanges: normalizeList(relation.evidenceRanges),
        eventRefs: normalizeList(relation.eventRefs),
        tags: normalizeList(relation.tags),
      })),
      events: analyzed.events.map(event => ({
        ...event,
        sourceFiles: normalizeList(event.sourceFiles),
        lineRanges: normalizeList(event.lineRanges),
        participantRefs: normalizeList(event.participantRefs),
        placeRefs: normalizeList(event.placeRefs),
        relationRefs: normalizeList(event.relationRefs),
        precedingEventRefs: normalizeList(event.precedingEventRefs),
        followingEventRefs: normalizeList(event.followingEventRefs),
        tags: normalizeList(event.tags),
      })),
      places: analyzed.places.map(place => ({
        ...place,
        aliasTokensEn: normalizeList(place.aliasTokensEn),
        aliasTokensZh: normalizeList(place.aliasTokensZh),
        sourceFiles: normalizeList(place.sourceFiles),
        chapterRefs: normalizeList(place.chapterRefs),
        mentionRanges: normalizeList(place.mentionRanges),
        eventRefs: normalizeList(place.eventRefs),
        roleRefs: normalizeList(place.roleRefs),
        factionRefs: normalizeList(place.factionRefs),
        tags: normalizeList(place.tags),
      })),
      factions: analyzed.factions.map(faction => ({
        ...faction,
        aliasTokensEn: normalizeList(faction.aliasTokensEn),
        aliasTokensZh: normalizeList(faction.aliasTokensZh),
        sourceFiles: normalizeList(faction.sourceFiles),
        chapterRefs: normalizeList(faction.chapterRefs),
        mentionRanges: normalizeList(faction.mentionRanges),
        roleRefs: normalizeList(faction.roleRefs),
        eventRefs: normalizeList(faction.eventRefs),
        placeRefs: normalizeList(faction.placeRefs),
        tags: normalizeList(faction.tags),
      })),
      abilities: analyzed.abilities.map(ability => ({
        ...ability,
        aliasTokensEn: normalizeList(ability.aliasTokensEn),
        aliasTokensZh: normalizeList(ability.aliasTokensZh),
        ownerRefs: normalizeList(ability.ownerRefs),
        sourceFiles: normalizeList(ability.sourceFiles),
        chapterRefs: normalizeList(ability.chapterRefs),
        mentionRanges: normalizeList(ability.mentionRanges),
        eventRefs: normalizeList(ability.eventRefs),
        tags: normalizeList(ability.tags),
      })),
      timelines: analyzed.timelines.map(timeline => ({
        ...timeline,
        eventRefs: normalizeList(timeline.eventRefs),
        chapterRefs: normalizeList(timeline.chapterRefs),
        tags: normalizeList(timeline.tags),
      })),
    })
  }

  return createScaffoldBook(discovered, format).then(book => ({
    ...book,
    sourceKind,
  }))
}

async function writeChapterFiles(baseDir: string, chapters: NoteChapter[]): Promise<void> {
  const dir = join(baseDir, 'chapters')
  const moduleNames = chapters.map(chapter => chapter.chapterId)

  for (const chapter of chapters) {
    await writePythonFile(
      join(dir, `${chapter.chapterId}.py`),
      [
        emitCommentLines([
          `zh_title: ${chapter.titleZh}`,
          `source_file: ${chapter.sourceFile}`,
        ]),
        '',
        `chapter_id = ${JSON.stringify(chapter.chapterId)}`,
        `title_token_en = ${JSON.stringify(chapter.titleEn)}`,
        `source_file = ${JSON.stringify(chapter.sourceFile)}`,
        `line_range = ${JSON.stringify(chapter.lineRange)}`,
        `role_refs = ${toPythonStringList(chapter.roleRefs)}`,
        `event_refs = ${toPythonStringList(chapter.eventRefs)}`,
        `faction_refs = ${toPythonStringList(chapter.factionRefs)}`,
        `place_refs = ${toPythonStringList(chapter.placeRefs)}`,
        `tags = ${toPythonStringList(chapter.tags)}`,
        '',
      ].join('\n'),
    )
  }

  await writePythonFile(join(dir, '__init__.py'), toModuleInit(moduleNames))
}

async function writeRoleFiles(baseDir: string, roles: NoteRole[]): Promise<void> {
  const dir = join(baseDir, 'roles')
  const moduleNames = roles.map(role => role.nodeId)

  for (const role of roles) {
    await writePythonFile(
      join(dir, `${role.nodeId}.py`),
      [
        emitCommentLines([
          `zh_name: ${role.canonicalNameZh}`,
          `zh_aliases: ${role.aliasTokensZh.join(', ')}`,
        ]),
        '',
        `node_id = ${JSON.stringify(role.nodeId)}`,
        `canonical_name_en = ${JSON.stringify(role.canonicalNameEn)}`,
        `canonical_name_zh = ${JSON.stringify(role.canonicalNameZh)}`,
        `alias_tokens_en = ${toPythonStringList(role.aliasTokensEn)}`,
        `alias_tokens_zh = ${toPythonStringList(role.aliasTokensZh)}`,
        `source_files = ${toPythonStringList(role.sourceFiles)}`,
        `chapter_refs = ${toPythonStringList(role.chapterRefs)}`,
        `mention_ranges = ${toPythonStringList(role.mentionRanges)}`,
        `relation_refs = ${toPythonStringList(role.relationRefs)}`,
        `event_refs = ${toPythonStringList(role.eventRefs)}`,
        `ability_refs = ${toPythonStringList(role.abilityRefs)}`,
        `faction_refs = ${toPythonStringList(role.factionRefs)}`,
        `place_refs = ${toPythonStringList(role.placeRefs)}`,
        `tags = ${toPythonStringList(role.tags)}`,
        '',
      ].join('\n'),
    )
  }

  await writePythonFile(join(dir, '__init__.py'), toModuleInit(moduleNames))
}

async function writeRelationFiles(baseDir: string, relations: NoteRelation[]): Promise<void> {
  const dir = join(baseDir, 'relations')
  const moduleNames = relations.map(relation => relation.nodeId)

  for (const relation of relations) {
    await writePythonFile(
      join(dir, `${relation.nodeId}.py`),
      [
        emitCommentLines([
          `left_zh: ${relation.leftZh}`,
          `right_zh: ${relation.rightZh}`,
        ]),
        '',
        `node_id = ${JSON.stringify(relation.nodeId)}`,
        `left_ref = ${JSON.stringify(relation.leftRef)}`,
        `right_ref = ${JSON.stringify(relation.rightRef)}`,
        `left_zh = ${JSON.stringify(relation.leftZh)}`,
        `right_zh = ${JSON.stringify(relation.rightZh)}`,
        `relation_types = ${toPythonStringList(relation.relationTypes)}`,
        `chapter_refs = ${toPythonStringList(relation.chapterRefs)}`,
        `evidence_ranges = ${toPythonStringList(relation.evidenceRanges)}`,
        `event_refs = ${toPythonStringList(relation.eventRefs)}`,
        `tags = ${toPythonStringList(relation.tags)}`,
        '',
      ].join('\n'),
    )
  }

  await writePythonFile(join(dir, '__init__.py'), toModuleInit(moduleNames))
}

async function writeEventFiles(baseDir: string, events: NoteEvent[]): Promise<void> {
  const dir = join(baseDir, 'events')
  const moduleNames = events.map(event => event.nodeId)

  for (const event of events) {
    await writePythonFile(
      join(dir, `${event.nodeId}.py`),
      [
        emitCommentLines([`zh_label: ${event.labelZh}`]),
        '',
        `node_id = ${JSON.stringify(event.nodeId)}`,
        `label_zh = ${JSON.stringify(event.labelZh)}`,
        `chapter_ref = ${JSON.stringify(event.chapterRef)}`,
        `source_files = ${toPythonStringList(event.sourceFiles)}`,
        `line_ranges = ${toPythonStringList(event.lineRanges)}`,
        `participant_refs = ${toPythonStringList(event.participantRefs)}`,
        `place_refs = ${toPythonStringList(event.placeRefs)}`,
        `relation_refs = ${toPythonStringList(event.relationRefs)}`,
        `preceding_event_refs = ${toPythonStringList(event.precedingEventRefs)}`,
        `following_event_refs = ${toPythonStringList(event.followingEventRefs)}`,
        `tags = ${toPythonStringList(event.tags)}`,
        '',
      ].join('\n'),
    )
  }

  await writePythonFile(join(dir, '__init__.py'), toModuleInit(moduleNames))
}

async function writePlaceFiles(baseDir: string, places: NotePlace[]): Promise<void> {
  const dir = join(baseDir, 'places')
  const moduleNames = places.map(place => place.nodeId)

  for (const place of places) {
    await writePythonFile(
      join(dir, `${place.nodeId}.py`),
      [
        emitCommentLines([
          `zh_name: ${place.canonicalNameZh}`,
          `zh_aliases: ${place.aliasTokensZh.join(', ')}`,
        ]),
        '',
        `node_id = ${JSON.stringify(place.nodeId)}`,
        `canonical_name_en = ${JSON.stringify(place.canonicalNameEn)}`,
        `canonical_name_zh = ${JSON.stringify(place.canonicalNameZh)}`,
        `alias_tokens_en = ${toPythonStringList(place.aliasTokensEn)}`,
        `alias_tokens_zh = ${toPythonStringList(place.aliasTokensZh)}`,
        `source_files = ${toPythonStringList(place.sourceFiles)}`,
        `chapter_refs = ${toPythonStringList(place.chapterRefs)}`,
        `mention_ranges = ${toPythonStringList(place.mentionRanges)}`,
        `event_refs = ${toPythonStringList(place.eventRefs)}`,
        `role_refs = ${toPythonStringList(place.roleRefs)}`,
        `faction_refs = ${toPythonStringList(place.factionRefs)}`,
        `tags = ${toPythonStringList(place.tags)}`,
        '',
      ].join('\n'),
    )
  }

  await writePythonFile(join(dir, '__init__.py'), toModuleInit(moduleNames))
}

async function writeFactionFiles(baseDir: string, factions: NoteFaction[]): Promise<void> {
  const dir = join(baseDir, 'factions')
  const moduleNames = factions.map(faction => faction.nodeId)

  for (const faction of factions) {
    await writePythonFile(
      join(dir, `${faction.nodeId}.py`),
      [
        emitCommentLines([
          `zh_name: ${faction.canonicalNameZh}`,
          `zh_aliases: ${faction.aliasTokensZh.join(', ')}`,
        ]),
        '',
        `node_id = ${JSON.stringify(faction.nodeId)}`,
        `canonical_name_en = ${JSON.stringify(faction.canonicalNameEn)}`,
        `canonical_name_zh = ${JSON.stringify(faction.canonicalNameZh)}`,
        `alias_tokens_en = ${toPythonStringList(faction.aliasTokensEn)}`,
        `alias_tokens_zh = ${toPythonStringList(faction.aliasTokensZh)}`,
        `source_files = ${toPythonStringList(faction.sourceFiles)}`,
        `chapter_refs = ${toPythonStringList(faction.chapterRefs)}`,
        `mention_ranges = ${toPythonStringList(faction.mentionRanges)}`,
        `role_refs = ${toPythonStringList(faction.roleRefs)}`,
        `event_refs = ${toPythonStringList(faction.eventRefs)}`,
        `place_refs = ${toPythonStringList(faction.placeRefs)}`,
        `tags = ${toPythonStringList(faction.tags)}`,
        '',
      ].join('\n'),
    )
  }

  await writePythonFile(join(dir, '__init__.py'), toModuleInit(moduleNames))
}

async function writeAbilityFiles(baseDir: string, abilities: NoteAbility[]): Promise<void> {
  const dir = join(baseDir, 'abilities')
  const moduleNames = abilities.map(ability => ability.nodeId)

  for (const ability of abilities) {
    await writePythonFile(
      join(dir, `${ability.nodeId}.py`),
      [
        emitCommentLines([
          `zh_name: ${ability.canonicalNameZh}`,
          `zh_aliases: ${ability.aliasTokensZh.join(', ')}`,
        ]),
        '',
        `node_id = ${JSON.stringify(ability.nodeId)}`,
        `canonical_name_en = ${JSON.stringify(ability.canonicalNameEn)}`,
        `canonical_name_zh = ${JSON.stringify(ability.canonicalNameZh)}`,
        `alias_tokens_en = ${toPythonStringList(ability.aliasTokensEn)}`,
        `alias_tokens_zh = ${toPythonStringList(ability.aliasTokensZh)}`,
        `owner_refs = ${toPythonStringList(ability.ownerRefs)}`,
        `source_files = ${toPythonStringList(ability.sourceFiles)}`,
        `chapter_refs = ${toPythonStringList(ability.chapterRefs)}`,
        `mention_ranges = ${toPythonStringList(ability.mentionRanges)}`,
        `event_refs = ${toPythonStringList(ability.eventRefs)}`,
        `tags = ${toPythonStringList(ability.tags)}`,
        '',
      ].join('\n'),
    )
  }

  await writePythonFile(join(dir, '__init__.py'), toModuleInit(moduleNames))
}

async function writeTimelineFiles(baseDir: string, timelines: NoteTimeline[]): Promise<void> {
  const dir = join(baseDir, 'timelines')
  const moduleNames = timelines.map(timeline => timeline.nodeId)

  for (const timeline of timelines) {
    await writePythonFile(
      join(dir, `${timeline.nodeId}.py`),
      [
        emitCommentLines([`zh_label: ${timeline.labelZh}`]),
        '',
        `node_id = ${JSON.stringify(timeline.nodeId)}`,
        `label_en = ${JSON.stringify(timeline.labelEn)}`,
        `label_zh = ${JSON.stringify(timeline.labelZh)}`,
        `event_refs = ${toPythonStringList(timeline.eventRefs)}`,
        `chapter_refs = ${toPythonStringList(timeline.chapterRefs)}`,
        `tags = ${toPythonStringList(timeline.tags)}`,
        '',
      ].join('\n'),
    )
  }

  await writePythonFile(join(dir, '__init__.py'), toModuleInit(moduleNames))
}

async function writeBookSkeleton(outputDir: string, book: NoteBook): Promise<void> {
  const bookDir = join(outputDir, 'books', book.bookId)

  await writeChapterFiles(bookDir, book.chapters)
  await writeRoleFiles(bookDir, book.roles)
  await writeRelationFiles(bookDir, book.relations)
  await writeEventFiles(bookDir, book.events)
  await writePlaceFiles(bookDir, book.places)
  await writeFactionFiles(bookDir, book.factions)
  await writeAbilityFiles(bookDir, book.abilities)
  await writeTimelineFiles(bookDir, book.timelines)

  await writePythonFile(
    join(bookDir, 'book.py'),
    [
      emitCommentLines([
        `zh_book: ${book.bookNameZh}`,
        `source_root: ${book.sourceRoot}`,
      ]),
      '',
      `book_id = ${JSON.stringify(book.bookId)}`,
      `book_name_en = ${JSON.stringify(book.bookNameEn)}`,
      `book_name_zh = ${JSON.stringify(book.bookNameZh)}`,
      `source_root = ${JSON.stringify(book.sourceRoot)}`,
      `source_files = ${toPythonStringList(book.sourceFiles)}`,
      `chapter_refs = ${toPythonStringList(book.chapters.map(chapter => chapter.chapterId))}`,
      `role_refs = ${toPythonStringList(book.roles.map(role => role.nodeId))}`,
      `relation_refs = ${toPythonStringList(book.relations.map(relation => relation.nodeId))}`,
      `event_refs = ${toPythonStringList(book.events.map(event => event.nodeId))}`,
      `place_refs = ${toPythonStringList(book.places.map(place => place.nodeId))}`,
      `faction_refs = ${toPythonStringList(book.factions.map(faction => faction.nodeId))}`,
      `ability_refs = ${toPythonStringList(book.abilities.map(ability => ability.nodeId))}`,
      `timeline_refs = ${toPythonStringList(book.timelines.map(timeline => timeline.nodeId))}`,
      '',
    ].join('\n'),
  )

  await writePythonFile(join(bookDir, '__init__.py'), 'from .book import *\n')
}

export async function buildNoteSkeleton(
  input: BuildNoteSkeletonInput,
): Promise<BuildNoteSkeletonResult> {
  input.onProgress?.('discovering input')
  const discovered = await discoverInput(input.rootPath, input.format)

  input.onProgress?.('creating output directories')
  await mkdir(join(input.outputDir, 'books'), { recursive: true })
  await mkdir(join(input.outputDir, 'indexes'), { recursive: true })
  await mkdir(join(input.outputDir, 'graph'), { recursive: true })

  const books: NoteBook[] = []
  let usedAgent = false

  for (const book of discovered.books) {
    input.onProgress?.(`analyzing book ${book.bookId}`)
    const analyzedBook = await input.analyzeBook?.({
      book,
      sourceKind: discovered.sourceKind,
      format: input.format,
    })
    if (analyzedBook) {
      usedAgent = true
    }
    const normalizedBook = await normalizeBookShape(
      analyzedBook ?? null,
      book,
      discovered.sourceKind,
      input.format,
    )
    await writeBookSkeleton(input.outputDir, normalizedBook)
    books.push(normalizedBook)
  }

  const bookRefs = books.map(book => book.bookId)
  const sourceFileCount = books.reduce((sum, book) => sum + book.sourceFiles.length, 0)
  const chapterCount = books.reduce((sum, book) => sum + book.chapters.length, 0)
  const roleCount = books.reduce((sum, book) => sum + book.roles.length, 0)
  const relationCount = books.reduce((sum, book) => sum + book.relations.length, 0)
  const eventCount = books.reduce((sum, book) => sum + book.events.length, 0)
  const placeCount = books.reduce((sum, book) => sum + book.places.length, 0)
  const factionCount = books.reduce((sum, book) => sum + book.factions.length, 0)
  const abilityCount = books.reduce((sum, book) => sum + book.abilities.length, 0)
  const timelineCount = books.reduce((sum, book) => sum + book.timelines.length, 0)

  input.onProgress?.('writing root index files')
  await writePythonFile(join(input.outputDir, '__init__.py'), '')
  await writePythonFile(
    join(input.outputDir, 'manifest.py'),
    [
      `format = ${JSON.stringify(input.format)}`,
      `source_kind = ${JSON.stringify(discovered.sourceKind)}`,
      `book_refs = ${toPythonStringList(bookRefs)}`,
      `book_count = ${books.length}`,
      `source_file_count = ${sourceFileCount}`,
      `chapter_count = ${chapterCount}`,
      `role_count = ${roleCount}`,
      `relation_count = ${relationCount}`,
      `event_count = ${eventCount}`,
      `place_count = ${placeCount}`,
      `faction_count = ${factionCount}`,
      `ability_count = ${abilityCount}`,
      `timeline_count = ${timelineCount}`,
      `engine = ${JSON.stringify(usedAgent ? 'agent' : 'scaffold')}`,
      '',
    ].join('\n'),
  )
  await writePythonFile(
    join(input.outputDir, 'book.py'),
    [
      'class BookRef:',
      '    def __init__(self, book_id: str, module_path: str):',
      '        self.book_id = book_id',
      '        self.module_path = module_path',
      '',
      `BOOK_REFS = [${books.map(book => `BookRef(${JSON.stringify(book.bookId)}, ${JSON.stringify(`books.${book.bookId}.book`)})`).join(', ')}]`,
      '',
    ].join('\n'),
  )
  await writePythonFile(
    join(input.outputDir, 'indexes', 'book_index.py'),
    books
      .map(book => `${book.bookId} = ${JSON.stringify(`books/${book.bookId}/book.py`)}`)
      .join('\n') + '\n',
  )
  await writePythonFile(
    join(input.outputDir, 'indexes', 'role_index.py'),
    books
      .flatMap(book => book.roles.map(role => `${role.nodeId} = ${JSON.stringify(`books/${book.bookId}/roles/${role.nodeId}.py`)}`))
      .join('\n') + '\n',
  )
  await writePythonFile(
    join(input.outputDir, 'indexes', 'relation_index.py'),
    books
      .flatMap(book =>
        book.relations.map(
          relation => `${relation.nodeId} = ${JSON.stringify(`books/${book.bookId}/relations/${relation.nodeId}.py`)}`,
        ),
      )
      .join('\n') + '\n',
  )
  await writePythonFile(
    join(input.outputDir, 'indexes', 'event_index.py'),
    books
      .flatMap(book => book.events.map(event => `${event.nodeId} = ${JSON.stringify(`books/${book.bookId}/events/${event.nodeId}.py`)}`))
      .join('\n') + '\n',
  )
  await writePythonFile(
    join(input.outputDir, 'indexes', 'place_index.py'),
    books
      .flatMap(book => book.places.map(place => `${place.nodeId} = ${JSON.stringify(`books/${book.bookId}/places/${place.nodeId}.py`)}`))
      .join('\n') + '\n',
  )
  await writePythonFile(
    join(input.outputDir, 'indexes', 'faction_index.py'),
    books
      .flatMap(book => book.factions.map(faction => `${faction.nodeId} = ${JSON.stringify(`books/${book.bookId}/factions/${faction.nodeId}.py`)}`))
      .join('\n') + '\n',
  )
  await writePythonFile(
    join(input.outputDir, 'indexes', 'ability_index.py'),
    books
      .flatMap(book => book.abilities.map(ability => `${ability.nodeId} = ${JSON.stringify(`books/${book.bookId}/abilities/${ability.nodeId}.py`)}`))
      .join('\n') + '\n',
  )
  await writePythonFile(
    join(input.outputDir, 'indexes', 'timeline_index.py'),
    books
      .flatMap(book => book.timelines.map(timeline => `${timeline.nodeId} = ${JSON.stringify(`books/${book.bookId}/timelines/${timeline.nodeId}.py`)}`))
      .join('\n') + '\n',
  )
  await writePythonFile(
    join(input.outputDir, 'graph', 'edges.py'),
    [
      'EDGES = [',
      ...books.flatMap(book => [
        ...book.relations.map(relation => `    (${JSON.stringify(relation.leftRef)}, ${JSON.stringify(relation.rightRef)}, ${JSON.stringify(relation.nodeId)}),`),
        ...book.events.flatMap(event => event.participantRefs.map(participant => `    (${JSON.stringify(event.nodeId)}, ${JSON.stringify(participant)}, "participates_in"),`)),
        ...book.places.flatMap(place => place.roleRefs.map(roleRef => `    (${JSON.stringify(place.nodeId)}, ${JSON.stringify(roleRef)}, "place_role"),`)),
        ...book.factions.flatMap(faction => faction.roleRefs.map(roleRef => `    (${JSON.stringify(faction.nodeId)}, ${JSON.stringify(roleRef)}, "faction_role"),`)),
        ...book.abilities.flatMap(ability => ability.ownerRefs.map(ownerRef => `    (${JSON.stringify(ability.nodeId)}, ${JSON.stringify(ownerRef)}, "ability_owner"),`)),
        ...book.timelines.flatMap(timeline => timeline.eventRefs.map(eventRef => `    (${JSON.stringify(timeline.nodeId)}, ${JSON.stringify(eventRef)}, "timeline_event"),`)),
      ]),
      ']',
      '',
    ].join('\n'),
  )
  await writePythonFile(
    join(input.outputDir, 'graph', 'adjacency.py'),
    [
      'ADJACENCY = {',
      ...books.flatMap(book => [
        ...book.roles.map(role =>
          `    ${JSON.stringify(role.nodeId)}: ${toPythonStringList([
            ...role.relationRefs,
            ...role.eventRefs,
            ...role.factionRefs,
            ...role.placeRefs,
            ...role.abilityRefs,
          ])},`,
        ),
        ...book.places.map(place =>
          `    ${JSON.stringify(place.nodeId)}: ${toPythonStringList([
            ...place.eventRefs,
            ...place.roleRefs,
            ...place.factionRefs,
          ])},`,
        ),
        ...book.factions.map(faction =>
          `    ${JSON.stringify(faction.nodeId)}: ${toPythonStringList([
            ...faction.roleRefs,
            ...faction.eventRefs,
            ...faction.placeRefs,
          ])},`,
        ),
        ...book.abilities.map(ability =>
          `    ${JSON.stringify(ability.nodeId)}: ${toPythonStringList([
            ...ability.ownerRefs,
            ...ability.eventRefs,
          ])},`,
        ),
        ...book.timelines.map(timeline =>
          `    ${JSON.stringify(timeline.nodeId)}: ${toPythonStringList([
            ...timeline.eventRefs,
            ...timeline.chapterRefs,
          ])},`,
        ),
      ]),
      '}',
      '',
    ].join('\n'),
  )

  return {
    engine: usedAgent ? 'agent' : 'scaffold',
    format: input.format,
    sourceKind: discovered.sourceKind,
    rootPath: input.rootPath,
    outputDir: input.outputDir,
    bookCount: books.length,
    sourceFileCount,
    chapterCount,
    roleCount,
    relationCount,
    eventCount,
    placeCount,
    factionCount,
    abilityCount,
    timelineCount,
  }
}

export type { DiscoveredBook, DiscoveredSourceFile }
