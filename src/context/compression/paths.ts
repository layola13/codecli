import { existsSync } from 'fs'
import { getOriginalCwd, getProjectRoot } from '../../bootstrap/state.js'
import { getCwd } from '../../utils/cwd.js'
import { basename, dirname, join } from 'path'

const CONTEXT_DIRNAME = '.claude/context'

function looksLikeSourceCheckoutRoot(dir: string): boolean {
  return (
    existsSync(join(dir, 'package.json')) &&
    existsSync(join(dir, 'src')) &&
    existsSync(join(dir, 'todo'))
  )
}

function normalizeCompressionProjectRoot(dir: string): string {
  if (basename(dir) !== 'dist') {
    return dir
  }

  const parent = dirname(dir)
  if (parent !== dir && looksLikeSourceCheckoutRoot(parent)) {
    return parent
  }

  return dir
}

export function getCompressionProjectRoot(): string {
  try {
    return normalizeCompressionProjectRoot(getProjectRoot())
  } catch {
    try {
      return normalizeCompressionProjectRoot(getOriginalCwd())
    } catch {
      return normalizeCompressionProjectRoot(getCwd())
    }
  }
}

export function getContextOutputDir(
  projectRoot: string = getCompressionProjectRoot(),
): string {
  return join(projectRoot, CONTEXT_DIRNAME)
}
