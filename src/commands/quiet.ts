import { clearSystemPromptSections } from '../constants/systemPromptSections.js'
import {
  getQuietModeOptIn,
  setQuietModeOptIn,
} from '../bootstrap/state.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../services/analytics/index.js'
import type { ToolUseContext } from '../Tool.js'
import type {
  Command,
  LocalJSXCommandContext,
  LocalJSXCommandOnDone,
} from '../types/command.js'

function parseNextState(args: string, current: boolean): boolean | null {
  const trimmed = args.trim().toLowerCase()
  if (!trimmed) return !current
  if (['on', 'enable', 'enabled', 'true'].includes(trimmed)) return true
  if (['off', 'disable', 'disabled', 'false'].includes(trimmed)) return false
  return null
}

const quiet = {
  type: 'local-jsx',
  name: 'quiet',
  description: 'Toggle quiet execution mode',
  argumentHint: '[on|off]',
  immediate: true,
  load: () =>
    Promise.resolve({
      async call(
        onDone: LocalJSXCommandOnDone,
        _context: ToolUseContext & LocalJSXCommandContext,
        args: string,
      ): Promise<React.ReactNode> {
        const current = getQuietModeOptIn()
        const newState = parseNextState(args, current)

        if (newState === null) {
          onDone('Usage: /quiet [on|off]', { display: 'system' })
          return null
        }

        if (newState !== current) {
          setQuietModeOptIn(newState)
          clearSystemPromptSections()
        }

        logEvent('tengu_quiet_mode_toggled', {
          enabled: newState,
          source:
            'slash_command' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        })

        onDone(newState ? 'Quiet mode enabled' : 'Quiet mode disabled', {
          display: 'system',
          metaMessages: [
            `<system-reminder>\n${
              newState
                ? 'Quiet mode is now enabled. Stay silent unless you are blocked, need confirmation for a risky action, or have a final result ready.'
                : 'Quiet mode is now disabled. Default behavior still avoids unsolicited progress updates; only send requested updates, blockers, confirmations, or final results.'
            }\n</system-reminder>`,
          ],
        })
        return null
      },
    }),
} satisfies Command

export default quiet
