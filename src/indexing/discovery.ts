import { readdir } from 'fs/promises'
import { extname, relative, sep } from 'path'
import type { CodeIndexConfig } from './config.js'
import { getCodeLanguageForExtension } from './config.js'
import type { CodeLanguage } from './ir.js'

export type DiscoveredSourceFile = {
  absolutePath: string
  relativePath: string
  language: CodeLanguage
}

function shouldSkipDirectory(
  absolutePath: string,
  dirName: string,
  config: CodeIndexConfig,
): boolean {
  if (config.ignoredDirNames.has(dirName)) {
    return true
  }

  if (absolutePath === config.outputDir) {
    return true
  }

  return absolutePath.startsWith(config.outputDir + sep)
}

export async function discoverSourceFiles(
  config: CodeIndexConfig,
): Promise<DiscoveredSourceFile[]> {
  const discovered: DiscoveredSourceFile[] = []

  async function walk(dirPath: string): Promise<void> {
    const entries = await readdir(dirPath, { withFileTypes: true })
    entries.sort((a, b) => a.name.localeCompare(b.name))

    for (const entry of entries) {
      const absolutePath = `${dirPath}${sep}${entry.name}`

      if (entry.isDirectory()) {
        if (shouldSkipDirectory(absolutePath, entry.name, config)) {
          continue
        }
        await walk(absolutePath)
        continue
      }

      if (!entry.isFile()) {
        continue
      }

      const language = getCodeLanguageForExtension(extname(entry.name))
      if (!language) {
        continue
      }

      discovered.push({
        absolutePath,
        relativePath: relative(config.rootDir, absolutePath).split(sep).join('/'),
        language,
      })
    }
  }

  await walk(config.rootDir)
  discovered.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
  return discovered
}

