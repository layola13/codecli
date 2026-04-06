import { clearSystemPromptSections } from '../constants/systemPromptSections.js'
import {
  getAutoAllowOptIn,
  setAutoAllowOptIn,
} from '../bootstrap/state.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../services/analytics/index.js'
import type { ToolUseContext } from '../Tool.js'
import { parseToggleState } from '../utils/toggleState.js'
import type {
  Command,
  LocalJSXCommandContext,
  LocalJSXCommandOnDone,
} from '../types/command.js'

const autoallow = {
  type: 'local-jsx',
  name: 'autoallow',
  description: 'Toggle automatic approval of the first allow/continue option',
  argumentHint: '[on|off]',
  immediate: true,
  load: () =>
    Promise.resolve({
      async call(
        onDone: LocalJSXCommandOnDone,
        _context: ToolUseContext & LocalJSXCommandContext,
        args: string,
      ): Promise<React.ReactNode> {
        const current = getAutoAllowOptIn()
        const newState = parseToggleState(args, current, {
          allowToggle: false,
        })

        if (newState === null) {
          onDone('Usage: /autoallow [on|off]', { display: 'system' })
          return null
        }

        if (newState !== current) {
          setAutoAllowOptIn(newState)
          clearSystemPromptSections()
        }

        logEvent('tengu_autoallow_toggled', {
          enabled: newState,
          source:
            'slash_command' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        })

        onDone(
          newState ? 'Autoallow enabled' : 'Autoallow disabled',
          {
            display: 'system',
            metaMessages: [
              `<system-reminder>\n${
                newState
                  ? 'Autoallow is now enabled. When a blocking allow/continue choice dialog appears, automatically choose the first option instead of waiting for the user.'
                  : 'Autoallow is now disabled. Blocking choice dialogs will wait for user selection again.'
              }\n</system-reminder>`,
            ],
          },
        )

        return null
      },
    }),
} satisfies Command

export default autoallow
