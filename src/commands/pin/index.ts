import type { Command } from '../../commands.js'

const pin = {
  type: 'local',
  name: 'pin',
  description: 'Add or inspect project-scoped pinned facts',
  argumentHint: '[text]',
  supportsNonInteractive: true,
  disableModelInvocation: true,
  load: () => import('./pin.js'),
} satisfies Command

export default pin
