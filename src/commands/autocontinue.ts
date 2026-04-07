import { feature } from 'bun:bundle'
import { clearSystemPromptSections } from '../constants/systemPromptSections.js'
import {
  getAutoContinueOptIn,
  setAutoContinueOptIn,
} from '../bootstrap/state.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../services/analytics/index.js'
import type { ToolUseContext } from '../Tool.js'
import {
  disableAutoContinuePermissionContext,
  enableAutoContinuePermissionContext,
} from '../utils/autoContinue.js'
import { parseToggleState } from '../utils/toggleState.js'
import type {
  Command,
  LocalJSXCommandContext,
  LocalJSXCommandOnDone,
} from '../types/command.js'

const autocontinue = {
  type: 'local-jsx',
  name: 'autocontinue',
  description: 'Keep going through obvious next phases without pausing to ask',
  argumentHint: '[on|off]',
  immediate: true,
  load: () =>
    Promise.resolve({
      async call(
        onDone: LocalJSXCommandOnDone,
        context: ToolUseContext & LocalJSXCommandContext,
        args: string,
      ): Promise<React.ReactNode> {
        const current = getAutoContinueOptIn()
        const newState = parseToggleState(args, current, {
          allowToggle: false,
        })

        if (newState === null) {
          onDone('Usage: /autocontinue [on|off]', { display: 'system' })
          return null
        }

        if (newState !== current) {
          setAutoContinueOptIn(newState)

          if (feature('TRANSCRIPT_CLASSIFIER')) {
            context.setAppState(prev => ({
              ...prev,
              toolPermissionContext: newState
                ? enableAutoContinuePermissionContext(
                    prev.toolPermissionContext,
                  )
                : disableAutoContinuePermissionContext(
                    prev.toolPermissionContext,
                  ),
            }))
          }

          clearSystemPromptSections()
        }

        logEvent('tengu_autocontinue_toggled', {
          enabled: newState,
          source:
            'slash_command' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        })

        onDone(
          newState ? 'Autocontinue enabled' : 'Autocontinue disabled',
          {
            display: 'system',
            metaMessages: [
              `<system-reminder>\n${
                newState
                  ? 'Autocontinue is now enabled. Treat obvious next steps as pre-approved, do not stop at phase boundaries just to ask whether to continue, and continue into the next routine implementation/debugging step automatically without announcing each phase boundary. When auto mode is available, autocontinue also authorizes switching into it for this session.'
                  : 'Autocontinue is now disabled. You may pause at major decision points again when you genuinely need user input, but do not stop just to announce phase completions.'
              }\n</system-reminder>`,
            ],
          },
        )

        return null
      },
    }),
} satisfies Command

export default autocontinue
