import { clearCommandsCache } from '../../commands.js'
import { resetSentSkillNames } from '../../utils/attachments.js'
import { logError } from '../../utils/log.js'
import { toError } from '../../utils/errors.js'
import { skillChangeDetector } from '../../utils/skills/skillChangeDetector.js'

export async function refreshCodeIndexSkillRuntime(): Promise<void> {
  try {
    await skillChangeDetector.refreshWatchPaths()
    clearCommandsCache()
    resetSentSkillNames()
  } catch (error) {
    logError(toError(error))
  }
}
