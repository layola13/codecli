import type { Command } from '../../commands.js'

const compressStatus = {
  type: 'local',
  name: 'compress-status',
  description:
    'Show saved context compression stats from .claude/context/session_state.{py,json} and related history/metrics files',
  argumentHint: '',
  supportsNonInteractive: true,
  disableModelInvocation: true,
  load: () => import('./compress-status.js'),
} satisfies Command

export default compressStatus
