import { describe, expect, it } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  getCwdState,
  getOriginalCwd,
  getProjectRoot,
  setCwdState,
  setOriginalCwd,
  setProjectRoot,
} from '../../bootstrap/state.js'
import { getCompressionProjectRoot } from './paths.js'

describe('compression paths', () => {
  it('maps a source checkout dist directory back to the repo root', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'claude-code-compression-paths-'))
    const distDir = join(rootDir, 'dist')
    const previousProjectRoot = getProjectRoot()
    const previousOriginalCwd = getOriginalCwd()
    const previousCwd = getCwdState()

    try {
      await mkdir(distDir, { recursive: true })
      await mkdir(join(rootDir, 'src'), { recursive: true })
      await mkdir(join(rootDir, 'todo'), { recursive: true })
      await writeFile(join(rootDir, 'package.json'), '{}')

      setProjectRoot(distDir)
      setOriginalCwd(distDir)
      setCwdState(distDir)

      expect(getCompressionProjectRoot()).toBe(rootDir)
    } finally {
      setProjectRoot(previousProjectRoot)
      setOriginalCwd(previousOriginalCwd)
      setCwdState(previousCwd)
      await rm(rootDir, { recursive: true, force: true })
    }
  })
})
