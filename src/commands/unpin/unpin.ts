import { getUserContext } from '../../context.js'
import {
  getPinnedFactsPath,
  removePinnedFact,
} from '../../memdir/pinnedFacts.js'
import { isAutoMemoryEnabled } from '../../memdir/paths.js'
import type { LocalCommandCall } from '../../types/command.js'
import { errorMessage } from '../../utils/errors.js'

const AUTO_MEMORY_DISABLED_MESSAGE =
  'Pinned facts are unavailable because auto memory is disabled for this session.'

export const call: LocalCommandCall = async args => {
  if (!isAutoMemoryEnabled()) {
    return {
      type: 'text',
      value: AUTO_MEMORY_DISABLED_MESSAGE,
    }
  }

  const query = args.trim()
  if (!query) {
    return {
      type: 'text',
      value: 'Usage: /unpin <text>',
    }
  }

  try {
    const result = await removePinnedFact(query)

    if (!result.removed) {
      return {
        type: 'text',
        value: `No pinned fact matched "${query}".\nFile: ${result.path}`,
      }
    }

    getUserContext.cache.clear?.()

    return {
      type: 'text',
      value: [
        `Removed pinned fact:`,
        `- ${result.removed}`,
        ...(result.matchCount > 1
          ? [
              '',
              `${result.matchCount} pinned facts matched "${query}"; removed the first exact or substring match.`,
            ]
          : []),
        '',
        `Remaining pinned facts: ${result.remainingFacts.length}`,
        `File: ${result.path}`,
      ].join('\n'),
    }
  } catch (error) {
    return {
      type: 'text',
      value: `Error updating pinned facts: ${errorMessage(error)}`,
    }
  }
}
