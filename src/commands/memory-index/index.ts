import type { Command } from '../../commands.js'

const memoryIndex = {
  type: 'local',
  name: 'memory-index',
  description:
    'Build a durable project memory index of user prompts, plans, and code diffs under .memory_index',
  argumentHint: '[path] [--output DIR] [--max-transcripts N]',
  supportsNonInteractive: true,
  disableModelInvocation: true,
  load: () => import('./memoryIndexCommand.js'),
} satisfies Command

export default memoryIndex
