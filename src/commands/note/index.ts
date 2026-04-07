import { getIsNonInteractiveSession } from '../../bootstrap/state.js'
import type { Command } from '../../commands.js'

const note = {
  type: 'local-jsx',
  name: 'note',
  description:
    'Build a Python novel knowledge skeleton for LLM navigation under .note_index',
  argumentHint: '[path] [--format txt|pdf|md] [--output DIR]',
  disableModelInvocation: true,
  isEnabled: () => !getIsNonInteractiveSession(),
  load: () => import('./noteCommand.js'),
} satisfies Command

const noteNonInteractive = {
  type: 'local',
  name: 'note',
  description:
    'Build a Python novel knowledge skeleton for LLM navigation under .note_index',
  argumentHint: '[path] [--format txt|pdf|md] [--output DIR]',
  supportsNonInteractive: true,
  disableModelInvocation: true,
  isEnabled: () => getIsNonInteractiveSession(),
  get isHidden() {
    return !getIsNonInteractiveSession()
  },
  load: () => import('./noteCommand.noninteractive.js'),
} satisfies Command

export { noteNonInteractive }
export default note
