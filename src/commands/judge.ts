import { clearSystemPromptSections } from '../constants/systemPromptSections.js'
import {
  getJudgeModeOptIn,
  setJudgeModeOptIn,
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

const judge = {
  type: 'local-jsx',
  name: 'judge',
  description: 'Toggle judge verification mode',
  argumentHint: '[on|off]',
  immediate: true,
  load: () =>
    Promise.resolve({
      async call(
        onDone: LocalJSXCommandOnDone,
        _context: ToolUseContext & LocalJSXCommandContext,
        args: string,
      ): Promise<React.ReactNode> {
        const current = getJudgeModeOptIn()
        const newState = parseNextState(args, current)

        if (newState === null) {
          onDone('Usage: /judge [on|off]', { display: 'system' })
          return null
        }

        if (newState !== current) {
          setJudgeModeOptIn(newState)
          clearSystemPromptSections()
        }

        logEvent('tengu_judge_mode_toggled', {
          enabled: newState,
          source:
            'slash_command' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        })

        onDone(newState ? 'Judge mode enabled' : 'Judge mode disabled', {
          display: 'system',
          metaMessages: [
            `<system-reminder>\n${
              newState
                ? 'Judge mode is now enabled. Before reporting a task complete, run the verification agent for an independent PASS/FAIL/PARTIAL verdict. If the verdict is FAIL or reveals missing work, continue fixing and verify again.'
                : 'Judge mode is now disabled. Independent verification is no longer mandatory before final completion reports.'
            }\n</system-reminder>`,
          ],
        })
        return null
      },
    }),
} satisfies Command

export default judge
