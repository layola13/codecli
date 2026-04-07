import { afterAll, describe, expect, it, mock } from 'bun:test'
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import type { LocalJSXCommandContext, LocalJSXCommandOnDone } from '../../types/command.js'

const buildNoteSkeletonMock = mock(async () => ({
  engine: 'scaffold',
  format: 'txt',
  sourceKind: 'library_directory',
  rootPath: '/tmp/input',
  outputDir: '/tmp/input/.note_index',
  bookCount: 2,
  sourceFileCount: 3,
  chapterCount: 3,
  roleCount: 0,
  relationCount: 0,
  eventCount: 0,
  placeCount: 0,
  factionCount: 0,
  abilityCount: 0,
  timelineCount: 0,
}))

const statMock = mock(async () => ({
  isDirectory: () => true,
  isFile: () => false,
}))

mock.module('../../note/build.js', () => ({
  buildNoteSkeleton: buildNoteSkeletonMock,
}))

mock.module('fs/promises', async () => {
  const actual = await import('fs/promises')
  return {
    ...actual,
    stat: statMock,
  }
})

const noteModule = await import('./noteCommand.js')

let fixtureDir = ''
let noteInputDir = ''

async function setupFixture() {
  fixtureDir = await mkdtemp(join(tmpdir(), 'claude-note-command-'))
  noteInputDir = join(fixtureDir, '按书名章节拆分')
  await mkdir(join(noteInputDir, '飞狐外传'), { recursive: true })
  await writeFile(join(noteInputDir, '飞狐外传', '001-第一章.txt'), '章节内容\n', 'utf8')
}

await setupFixture()

afterAll(async () => {
  if (fixtureDir) {
    await rm(fixtureDir, { recursive: true, force: true })
  }
})

function createArgs(withFormat = false) {
  return withFormat ? `${noteInputDir} --format txt` : noteInputDir
}

function createContext(): LocalJSXCommandContext {
  return {
    abortController: new AbortController(),
    readFileTimestamps: {},
    options: {
      isNonInteractiveSession: false,
      tools: undefined,
      mainLoopModel: 'claude-sonnet-4-6',
      mcpClients: [],
      ideInstallationStatus: null,
      theme: 'dark',
    } as LocalJSXCommandContext['options'] & {
      isNonInteractiveSession: boolean
      tools?: unknown
      mainLoopModel?: string
      mcpClients?: unknown[]
    },
    setMessages: mock(() => []),
    onChangeAPIKey: mock(() => {}),
    messageLogName: '',
    canUseTool: undefined,
    getToolPermissionContext: () => undefined,
    permissionMode: 'default',
    getToolPermissionMode: () => 'default',
    getSessionId: () => 'session-id',
    messages: [],
    addToInputHistory: () => {},
    forkSession: async () => undefined,
    getQueuedMessages: () => [],
    clearQueuedMessages: () => {},
  } as unknown as LocalJSXCommandContext
}

describe('noteCommand', () => {
  it('returns a picker UI when format is omitted', async () => {
    buildNoteSkeletonMock.mockClear()
    const onDone = mock<LocalJSXCommandOnDone>(() => {})
    const context = createContext()

    const result = await noteModule.call(onDone, context, createArgs())

    expect(result).not.toBeNull()
    expect(buildNoteSkeletonMock).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('runs directly when format is provided', async () => {
    buildNoteSkeletonMock.mockClear()
    const onDone = mock<LocalJSXCommandOnDone>(() => {})
    const context = createContext()

    const result = await noteModule.call(onDone, context, createArgs(true))

    expect(result).toBeNull()
    await Promise.resolve()
    await Promise.resolve()
    expect(buildNoteSkeletonMock).toHaveBeenCalled()
    expect(buildNoteSkeletonMock.mock.calls[0]?.[0]).toMatchObject({
      format: 'txt',
    })
  })

  it('defaults to txt in non-interactive mode when format is omitted', async () => {
    buildNoteSkeletonMock.mockClear()
    const onDone = mock<LocalJSXCommandOnDone>(() => {})
    const context = createContext()
    ;(context.options as typeof context.options & { isNonInteractiveSession: boolean }).isNonInteractiveSession = true

    const result = await noteModule.call(onDone, context, createArgs())

    expect(result).toBeNull()
    await Promise.resolve()
    await Promise.resolve()
    expect(buildNoteSkeletonMock).toHaveBeenCalled()
    expect(buildNoteSkeletonMock.mock.calls.at(-1)?.[0]).toMatchObject({
      format: 'txt',
    })
  })
})
