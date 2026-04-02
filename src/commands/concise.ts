import { clearSystemPromptSections } from '../constants/systemPromptSections.js'
import {
  getConciseModeOptIn,
  setConciseModeOptIn,
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

const concise = {
  type: 'local-jsx',
  name: 'concise',
  description: 'Toggle concise output mode',
  argumentHint: '[on|off]',
  immediate: true,
  load: () =>
    Promise.resolve({
      async call(
        onDone: LocalJSXCommandOnDone,
        _context: ToolUseContext & LocalJSXCommandContext,
        args: string,
      ): Promise<React.ReactNode> {
        const current = getConciseModeOptIn()
        const newState = parseNextState(args, current)

        if (newState === null) {
          onDone('Usage: /concise [on|off]', { display: 'system' })
          return null
        }

        if (newState !== current) {
          setConciseModeOptIn(newState)
          clearSystemPromptSections()
        }

        logEvent('tengu_concise_mode_toggled', {
          enabled: newState,
          source:
            'slash_command' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        })

        onDone(
          newState ? 'Concise mode enabled' : 'Concise mode disabled',
          {
            display: 'system',
            metaMessages: [
              `<system-reminder>\n${
                newState
                  ? 'Concise mode is now enabled. Keep intermediate updates very short and keep final responses brief unless the task clearly needs more detail.'
                  : 'Concise mode is now disabled. Match response length to task complexity.'
              }\n</system-reminder>`,
            ],
          },
        )
        return null
      },
    }),
} satisfies Command

export default concise
