#!/usr/bin/env bun

import { access, readFile, writeFile } from 'node:fs/promises'

const bundlePath = new URL('../src/commands/index/cliBundle.mjs', import.meta.url)
await access(bundlePath)

const original = await readFile(bundlePath, 'utf8')
let source = original
if (!source.includes('var cliBundleEntry_default = [')) {
  throw new Error('Invalid command sidecar bundle: default export not found.')
}

const indexStart = source.indexOf('\n// src/indexing/build.ts')
const commandEntryStart = source.indexOf(
  '\n// src/commands/index/cliBundleEntry.ts',
  indexStart + 1,
)
if (indexStart >= 0 && commandEntryStart > indexStart) {
  source = source.slice(0, indexStart) + source.slice(commandEntryStart)
}

const usageStart = source.indexOf('var USAGE2 = [')
const memoryStart = source.indexOf('var AUTO_MEMORY_DISABLED_MESSAGE =', usageStart)
if (usageStart >= 0 && memoryStart > usageStart) {
  source = source.slice(0, usageStart) + source.slice(memoryStart)
}

const indexCommandStart = source.indexOf('var indexBuiltinCommand = {')
const pinCommandStart = source.indexOf('var pinBuiltinCommand = {', indexCommandStart)
if (indexCommandStart >= 0 && pinCommandStart > indexCommandStart) {
  source = source.slice(0, indexCommandStart) + source.slice(pinCommandStart)
}

const sanitized = source
  .replace('  indexBuiltinCommand,\n', '')
  .replace('  indexBuiltinCommand,\n', '')

if (!sanitized.includes('pinBuiltinCommand')) {
  throw new Error('Invalid command sidecar bundle: pin command export not found.')
}

if (sanitized.includes('indexBuiltinCommand') || sanitized.includes('src/indexing/')) {
  throw new Error('The command sidecar bundle still contains the removed index system.')
}

if (sanitized !== original) {
  await writeFile(bundlePath, sanitized, 'utf8')
}
