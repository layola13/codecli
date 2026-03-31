import { writeFile } from 'fs/promises'
import { join } from 'path'
import { getErrnoCode } from '../utils/errors.js'
import { getFsImplementation } from '../utils/fsOperations.js'
import { ensureMemoryDirExists } from './memdir.js'
import { getAutoMemPath, isAutoMemoryEnabled } from './paths.js'
import {
  buildPinnedFactsContext,
  countPinnedFactMatches,
  findExactPinnedFact,
  normalizePinnedFact,
  parsePinnedFactsContent,
  PINNED_FACTS_FILENAME,
  renderPinnedFactsContent,
} from './pinnedFactsFormat.js'

function assertPinnedFactsEnabled(): void {
  if (!isAutoMemoryEnabled()) {
    throw new Error(
      'Pinned facts are unavailable because auto memory is disabled for this session.',
    )
  }
}

export function getPinnedFactsPath(): string {
  return join(getAutoMemPath(), PINNED_FACTS_FILENAME)
}

export async function readPinnedFacts(): Promise<string[]> {
  if (!isAutoMemoryEnabled()) {
    return []
  }

  try {
    const content = await getFsImplementation().readFile(getPinnedFactsPath(), {
      encoding: 'utf-8',
    })
    return parsePinnedFactsContent(content)
  } catch (error) {
    const code = getErrnoCode(error)
    if (code === 'ENOENT' || code === 'EISDIR') {
      return []
    }
    throw error
  }
}

export async function getPinnedFactsContext(): Promise<string | null> {
  if (!isAutoMemoryEnabled()) {
    return null
  }

  return buildPinnedFactsContext(await readPinnedFacts())
}

export async function writePinnedFacts(facts: readonly string[]): Promise<void> {
  assertPinnedFactsEnabled()
  await ensureMemoryDirExists(getAutoMemPath())
  await writeFile(getPinnedFactsPath(), renderPinnedFactsContent(facts), 'utf8')
}

export async function addPinnedFact(rawFact: string): Promise<{
  added: boolean
  fact: string
  facts: string[]
  path: string
}> {
  assertPinnedFactsEnabled()
  const fact = normalizePinnedFact(rawFact)
  if (!fact) {
    throw new Error('Pinned fact cannot be empty.')
  }

  const facts = await readPinnedFacts()
  const existing = findExactPinnedFact(facts, fact)

  if (existing) {
    return {
      added: false,
      fact: existing,
      facts,
      path: getPinnedFactsPath(),
    }
  }

  const nextFacts = [...facts, fact]
  await writePinnedFacts(nextFacts)

  return {
    added: true,
    fact,
    facts: nextFacts,
    path: getPinnedFactsPath(),
  }
}

export async function removePinnedFact(rawQuery: string): Promise<{
  removed: string | null
  remainingFacts: string[]
  path: string
  matchCount: number
}> {
  assertPinnedFactsEnabled()
  const facts = await readPinnedFacts()
  const { matches, normalizedQuery: query } = countPinnedFactMatches(
    facts,
    rawQuery,
  )
  if (!query) {
    throw new Error('Pinned fact match text cannot be empty.')
  }

  if (matches.length === 0) {
    return {
      removed: null,
      remainingFacts: facts,
      path: getPinnedFactsPath(),
      matchCount: 0,
    }
  }

  const removed = matches[0]
  let removedOnce = false
  const remainingFacts = facts.filter(fact => {
    if (removedOnce || fact !== removed) {
      return true
    }
    removedOnce = true
    return false
  })

  await writePinnedFacts(remainingFacts)

  return {
    removed,
    remainingFacts,
    path: getPinnedFactsPath(),
    matchCount: matches.length,
  }
}
