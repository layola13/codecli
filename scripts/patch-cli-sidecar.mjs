import { readFile, writeFile } from 'node:fs/promises'

const cliPath = new URL('../cli.js', import.meta.url)
const packagePath = new URL('../package.json', import.meta.url)
const packageJson = JSON.parse(await readFile(packagePath, 'utf8'))
let cliText = await readFile(cliPath, 'utf8')

const sidecarImport =
  'import{indexBuiltinCommand,pinBuiltinCommand,unpinBuiltinCommand,compressBuiltinCommand,compressStatusBuiltinCommand}from"./src/commands/index/cliBundle.mjs";'
const compatibleImport =
  'import{pinBuiltinCommand,unpinBuiltinCommand,compressBuiltinCommand,compressStatusBuiltinCommand}from"./src/commands/index/cliBundle.mjs";'

if (cliText.includes(sidecarImport)) {
  cliText = cliText.replace(sidecarImport, compatibleImport)
}

cliText = cliText.replaceAll('indexBuiltinCommand,', '')
cliText = cliText.replaceAll('2.1.88+local.3', packageJson.version)

if (cliText.includes('indexBuiltinCommand')) {
  throw new Error('The published bundle still references the removed index command.')
}

if (!cliText.includes(compatibleImport)) {
  throw new Error('The published bundle is missing the sidecar command import.')
}

await writeFile(cliPath, cliText, 'utf8')
