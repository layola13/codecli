import { readFile, writeFile } from 'fs/promises'

const CLI_PATH = new URL('../cli.js', import.meta.url)
const PACKAGE_JSON_PATH = new URL('../package.json', import.meta.url)

function replaceOnce(text, before, after, label) {
  if (text.includes(after)) {
    return text
  }
  if (!text.includes(before)) {
    throw new Error(`Could not find ${label} patch target in cli.js`)
  }
  return text.replace(before, after)
}

function insertBuiltinCommands(text, before, after, label) {
  if (text.includes(after)) {
    return text
  }

  if (!text.includes(before)) {
    throw new Error(`Could not find ${label} patch target in cli.js`)
  }

  return text.replaceAll(before, after)
}

function syncPublishedVersion(text, version) {
  const versionPattern =
    /(\{ISSUES_EXPLAINER:"report the issue at https:\/\/github\.com\/anthropics\/claude-code\/issues",PACKAGE_URL:"@anthropic-ai\/claude-code",README_URL:"https:\/\/code\.claude\.com\/docs\/en\/overview",VERSION:")([^"]+)(",FEEDBACK_CHANNEL:"https:\/\/github\.com\/anthropics\/claude-code\/issues",BUILD_TIME:"[^"]+"\})/g

  if (!versionPattern.test(text)) {
    throw new Error('Could not find published version block in cli.js')
  }

  versionPattern.lastIndex = 0
  return text.replace(versionPattern, `$1${version}$3`)
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

const packageJson = JSON.parse(await readFile(PACKAGE_JSON_PATH, 'utf8'))
let cliText = await readFile(CLI_PATH, 'utf8')
cliText = replaceOnce(cliText, importBefore, importAfter, 'sidecar import')
cliText = replaceOnce(
  cliText,
  commandsBefore,
  commandsAfter,
  'command list injection',
)
cliText = insertBuiltinCommands(
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
cliText = syncPublishedVersion(cliText, packageJson.version)
await writeFile(CLI_PATH, cliText, 'utf8')
