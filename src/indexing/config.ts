import { basename, resolve } from 'path'
import type { CodeLanguage } from './ir.js'

export const DEFAULT_MAX_FILE_BYTES = 512 * 1024

export const LANGUAGE_BY_EXTENSION: Record<string, CodeLanguage> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.rs': 'generic',
  '.go': 'generic',
  '.java': 'generic',
  '.kt': 'generic',
  '.kts': 'generic',
  '.swift': 'generic',
  '.rb': 'generic',
  '.php': 'generic',
  '.c': 'generic',
  '.h': 'generic',
  '.cc': 'generic',
  '.hh': 'generic',
  '.cpp': 'generic',
  '.hpp': 'generic',
  '.cxx': 'generic',
  '.hxx': 'generic',
  '.cs': 'generic',
  '.lua': 'generic',
  '.sh': 'generic',
  '.bash': 'generic',
  '.zsh': 'generic',
}

export const DEFAULT_IGNORED_DIR_NAMES = new Set([
  '.git',
  '.hg',
  '.svn',
  '.idea',
  '.vscode',
  '.cache',
  '.code_index',
  '.history',
  '.summarizer',
  '.usernotice',
  '.usernotic',
  '.venv',
  '.tox',
  '__pycache__',
  'node_modules',
  'vendor',
  'dist',
  'build',
  'coverage',
  'out',
  'target',
  'tmp',
  '.tmp',
])

export type CodeIndexBuildOptions = {
  rootDir?: string
  outputDir?: string
  maxFileBytes?: number
}

export type CodeIndexConfig = {
  rootDir: string
  outputDir: string
  outputDirName: string
  maxFileBytes: number
  ignoredDirNames: ReadonlySet<string>
}

export function resolveCodeIndexConfig(
  options: CodeIndexBuildOptions = {},
): CodeIndexConfig {
  const cwd = process.cwd()
  const rootDir = resolve(cwd, options.rootDir ?? '.')
  const outputDir = options.outputDir
    ? resolve(cwd, options.outputDir)
    : resolve(rootDir, '.code_index')

  return {
    rootDir,
    outputDir,
    outputDirName: basename(outputDir),
    maxFileBytes: options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES,
    ignoredDirNames: new Set(DEFAULT_IGNORED_DIR_NAMES),
  }
}

export function getCodeLanguageForExtension(
  extension: string,
): CodeLanguage | null {
  return LANGUAGE_BY_EXTENSION[extension.toLowerCase()] ?? null
}
