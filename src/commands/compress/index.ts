import type { Command } from '../../commands.js'

const compress = {
  type: 'local',
  name: 'compress',
  description:
    'Compress conversation context into structured session state (.py + .json)',
  argumentHint: '',
  supportsNonInteractive: true,
  disableModelInvocation: true,
  load: () => import('./compress.js'),
} satisfies Command

export default compress
