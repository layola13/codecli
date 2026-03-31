import type { Command } from '../../commands.js'

const unpin = {
  type: 'local',
  name: 'unpin',
  aliases: ['upin'],
  description: 'Remove a project-scoped pinned fact',
  argumentHint: '<text>',
  supportsNonInteractive: true,
  disableModelInvocation: true,
  load: () => import('./unpin.js'),
} satisfies Command

export default unpin
