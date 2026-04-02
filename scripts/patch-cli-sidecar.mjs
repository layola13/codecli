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

function replaceAny(text, befores, after, label) {
  if (text.includes(after)) {
    return text
  }

  for (const before of befores) {
    if (text.includes(before)) {
      return text.replace(before, after)
    }
  }

  throw new Error(`Could not find ${label} patch target in cli.js`)
}

function replaceAnyAll(text, befores, after, label) {
  if (text.includes(after)) {
    return text
  }

  for (const before of befores) {
    if (text.includes(before)) {
      return text.replaceAll(before, after)
    }
  }

  throw new Error(`Could not find ${label} patch target in cli.js`)
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

const importBefore = [
  'import{createRequire as _K5}from"node:module";import indexBuiltinCommand from"./src/commands/index/cliBundle.mjs";',
  'import{createRequire as _K5}from"node:module";import{indexBuiltinCommand,pinBuiltinCommand,unpinBuiltinCommand}from"./src/commands/index/cliBundle.mjs";',
]
const importAfter =
  'import{createRequire as _K5}from"node:module";import{indexBuiltinCommand,pinBuiltinCommand,unpinBuiltinCommand,compressBuiltinCommand,compressStatusBuiltinCommand}from"./src/commands/index/cliBundle.mjs";'

const commandsBefore = [
  'indexBuiltinCommand,ZVK',
  'indexBuiltinCommand,pinBuiltinCommand,unpinBuiltinCommand,ZVK',
]
const commandsAfter =
  'indexBuiltinCommand,pinBuiltinCommand,unpinBuiltinCommand,compressBuiltinCommand,compressStatusBuiltinCommand,ZVK'

const nonInteractiveBefore = [
  'indexBuiltinCommand].filter((q)=>q!==null))',
  'indexBuiltinCommand,pinBuiltinCommand,unpinBuiltinCommand].filter((q)=>q!==null))',
]
const nonInteractiveAfter =
  'indexBuiltinCommand,pinBuiltinCommand,unpinBuiltinCommand,compressBuiltinCommand,compressStatusBuiltinCommand].filter((q)=>q!==null))'

const localCommandSetBefore = [
  'new Set([Uq7,Zg8,Bg8,c37,sK7,V37,indexBuiltinCommand].filter((q)=>q!==null))',
  'new Set([Uq7,Zg8,Bg8,c37,sK7,V37,indexBuiltinCommand,pinBuiltinCommand,unpinBuiltinCommand].filter((q)=>q!==null))',
]
const localCommandSetAfter =
  'new Set([Uq7,Zg8,Bg8,c37,sK7,V37,indexBuiltinCommand,pinBuiltinCommand,unpinBuiltinCommand,compressBuiltinCommand,compressStatusBuiltinCommand].filter((q)=>q!==null))'

const packageJson = JSON.parse(await readFile(PACKAGE_JSON_PATH, 'utf8'))
let cliText = await readFile(CLI_PATH, 'utf8')
cliText = replaceAny(cliText, importBefore, importAfter, 'sidecar import')
cliText = replaceAny(
  cliText,
  commandsBefore,
  commandsAfter,
  'command list injection',
)
cliText = replaceAnyAll(
  cliText,
  commandsBefore,
  commandsAfter,
  'command list injection',
)
cliText = replaceAny(
  cliText,
  nonInteractiveBefore,
  nonInteractiveAfter,
  'non-interactive command injection',
)
cliText = replaceAny(
  cliText,
  localCommandSetBefore,
  localCommandSetAfter,
  'local command set injection',
)
cliText = syncPublishedVersion(cliText, packageJson.version)
await writeFile(CLI_PATH, cliText, 'utf8')
