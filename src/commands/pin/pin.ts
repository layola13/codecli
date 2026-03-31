import { getUserContext } from '../../context.js'
import {
  addPinnedFact,
  getPinnedFactsPath,
  readPinnedFacts,
} from '../../memdir/pinnedFacts.js'
import { isAutoMemoryEnabled } from '../../memdir/paths.js'
import type { LocalCommandCall } from '../../types/command.js'
import { errorMessage } from '../../utils/errors.js'

const AUTO_MEMORY_DISABLED_MESSAGE =
  'Pinned facts are unavailable because auto memory is disabled for this session.'

function formatPinnedFactsList(facts: readonly string[], path: string): string {
  if (facts.length === 0) {
    return [
      'No pinned facts saved for this project.',
      'Use "/pin <text>" to add one.',
      `File: ${path}`,
    ].join('\n')
  }

  return [
    `Pinned facts for this project (${facts.length}):`,
    ...facts.map((fact, index) => `${index + 1}. ${fact}`),
    '',
    'Use "/pin <text>" to add another or "/unpin <text>" to remove one.',
    `File: ${path}`,
  ].join('\n')
}

export const call: LocalCommandCall = async args => {
  if (!isAutoMemoryEnabled()) {
    return {
      type: 'text',
      value: AUTO_MEMORY_DISABLED_MESSAGE,
    }
  }

  const rawFact = args.trim()
  const path = getPinnedFactsPath()

  if (!rawFact) {
    return {
      type: 'text',
      value: formatPinnedFactsList(await readPinnedFacts(), path),
    }
  }

  try {
    const result = await addPinnedFact(rawFact)
    getUserContext.cache.clear?.()

    return {
      type: 'text',
      value: result.added
        ? `Pinned fact saved for this project:\n- ${result.fact}\n\nFile: ${result.path}`
        : `Pinned fact already exists for this project:\n- ${result.fact}\n\nFile: ${result.path}`,
    }
  } catch (error) {
    return {
      type: 'text',
      value: `Error updating pinned facts: ${errorMessage(error)}`,
    }
  }
}
