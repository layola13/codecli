import { readFile, writeFile } from 'fs/promises'

const CLI_PATH = new URL('../cli.js', import.meta.url)

function replaceOnce(text, before, after, label) {
  if (text.includes(after)) {
    return text
  }
  if (!text.includes(before)) {
    throw new Error(`Could not find ${label} patch target in cli.js`)
  }
  return text.replace(before, after)
}

const importBefore =
  'import{createRequire as _K5}from"node:module";import indexBuiltinCommand from"./src/commands/index/cliBundle.mjs";'
const importAfter =
  'import{createRequire as _K5}from"node:module";import{indexBuiltinCommand,pinBuiltinCommand,unpinBuiltinCommand}from"./src/commands/index/cliBundle.mjs";'

const commandsBefore = 'indexBuiltinCommand,ZVK'
const commandsAfter =
  'indexBuiltinCommand,pinBuiltinCommand,unpinBuiltinCommand,ZVK'

const nonInteractiveBefore = 'indexBuiltinCommand].filter((q)=>q!==null))'
const nonInteractiveAfter =
  'indexBuiltinCommand,pinBuiltinCommand,unpinBuiltinCommand].filter((q)=>q!==null))'

let cliText = await readFile(CLI_PATH, 'utf8')
cliText = replaceOnce(cliText, importBefore, importAfter, 'sidecar import')
cliText = replaceOnce(
  cliText,
  commandsBefore,
  commandsAfter,
  'command list injection',
)
cliText = replaceOnce(
  cliText,
  nonInteractiveBefore,
  nonInteractiveAfter,
  'non-interactive command injection',
)
await writeFile(CLI_PATH, cliText, 'utf8')
