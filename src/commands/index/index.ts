import type { Command } from '../../commands.js'

const index = {
  type: 'local',
  name: 'index',
  description:
    'Build a codebase structure index, file dependency DOT, and Python skeleton under .code_index',
  argumentHint:
    '[path] [--output DIR] [--max-file-bytes N] [--max-files N] [--ignore-dir NAME]',
  supportsNonInteractive: true,
  disableModelInvocation: true,
  load: () => import('./indexCommand.js'),
} satisfies Command

export default index
