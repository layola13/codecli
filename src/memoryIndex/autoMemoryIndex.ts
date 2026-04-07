import { existsSync } from 'fs'
import { join, dirname, resolve } from 'path'
import { Worker } from 'node:worker_threads'
import { fileURLToPath, pathToFileURL } from 'url'
import { getProjectRoot } from '../bootstrap/state.js'
import type { AgentId } from '../types/ids.js'
import { registerCleanup } from '../utils/cleanupRegistry.js'
import { logForDebugging } from '../utils/debug.js'
import { errorMessage } from '../utils/errors.js'

const AUTO_MEMORY_INDEX_DEBOUNCE_MS = 1500
const DEFAULT_OUTPUT_DIR_NAME = '.memory_index'
const AUTO_MEMORY_INDEX_WORKER_ENTRY_ENV =
  'CLAUDE_CODE_MEMORY_INDEX_WORKER_ENTRY'

type AutoMemoryIndexTarget = {
  outputDir: string
  rootDir: string
}

type AutoMemoryIndexWorkerRequest = {
  outputDir: string
  rootDir: string
}

type AutoMemoryIndexWorkerResponse =
  | {
      ok: true
    }
  | {
      ok: false
      error: string
    }

type PendingRequest = {
  reject: (error: Error) => void
  resolve: () => void
}

let cleanupRegistered = false
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let runningPromise: Promise<void> | null = null
const pendingTargets = new Map<string, AutoMemoryIndexTarget>()

function resolveWorkerEntry(): URL {
  const envOverride = process.env[AUTO_MEMORY_INDEX_WORKER_ENTRY_ENV]
  if (envOverride) {
    const resolvedOverride = resolve(process.cwd(), envOverride)
    if (existsSync(resolvedOverride)) {
      return pathToFileURL(resolvedOverride)
    }
  }

  const candidates = [
    resolve(
      process.cwd(),
      'src/commands/memory-index/autoMemoryIndexWorker.bundle.mjs',
    ),
    resolve(
      dirname(process.execPath),
      '../src/commands/memory-index/autoMemoryIndexWorker.bundle.mjs',
    ),
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      '../commands/memory-index/autoMemoryIndexWorker.bundle.mjs',
    ),
    resolve(process.cwd(), 'src/memoryIndex/autoMemoryIndexWorker.ts'),
    resolve(
      dirname(process.execPath),
      '../src/memoryIndex/autoMemoryIndexWorker.ts',
    ),
    resolve(dirname(fileURLToPath(import.meta.url)), 'autoMemoryIndexWorker.ts'),
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return pathToFileURL(candidate)
    }
  }

  throw new Error('unable to resolve auto memory-index worker entry')
}

class AutoMemoryIndexWorkerClient {
  private readonly worker: Worker
  private closed = false
  private pending: PendingRequest | null = null

  constructor() {
    this.worker = new Worker(resolveWorkerEntry())
    this.worker.on('message', this.handleMessage)
    this.worker.on('error', this.handleError)
    this.worker.on('exit', this.handleExit)
  }

  build(request: AutoMemoryIndexWorkerRequest): Promise<void> {
    if (this.closed) {
      return Promise.reject(new Error('auto memory-index worker is closed'))
    }
    if (this.pending) {
      return Promise.reject(
        new Error('auto memory-index worker received overlapping request'),
      )
    }

    return new Promise<void>((resolve, reject) => {
      this.pending = { resolve, reject }
      this.worker.postMessage(request)
    })
  }

  async close(): Promise<void> {
    if (this.closed) {
      return
    }
    this.closed = true
    this.worker.off('message', this.handleMessage)
    this.worker.off('error', this.handleError)
    this.worker.off('exit', this.handleExit)

    const pending = this.pending
    this.pending = null
    pending?.reject(
      new Error('auto memory-index worker closed before request completed'),
    )

    await this.worker.terminate()
  }

  private readonly handleMessage = (
    message: AutoMemoryIndexWorkerResponse,
  ): void => {
    const pending = this.pending
    this.pending = null
    if (!pending) {
      return
    }

    if (message.ok) {
      pending.resolve()
      return
    }

    pending.reject(new Error(message.error))
  }

  private readonly handleError = (error: Error): void => {
    const pending = this.pending
    this.pending = null
    pending?.reject(error)
  }

  private readonly handleExit = (code: number): void => {
    if (this.closed || code === 0) {
      return
    }

    const pending = this.pending
    this.pending = null
    pending?.reject(new Error(`auto memory-index worker exited with code ${code}`))
  }
}

function registerAutoMemoryIndexCleanup(): void {
  if (cleanupRegistered) {
    return
  }
  cleanupRegistered = true
  registerCleanup(async () => {
    await flushPendingAutoMemoryIndex()
  })
}

export function autoMemoryIndexEnabled(): boolean {
  return process.env.CLAUDE_CODE_AUTO_MEMORY_INDEX !== '0'
}

async function runPendingAutoMemoryIndexTargets(): Promise<void> {
  const targets = [...pendingTargets.values()]
  pendingTargets.clear()

  if (targets.length === 0) {
    return
  }

  const workers = Array.from(
    { length: Math.max(1, Math.min(targets.length, 2)) },
    () => new AutoMemoryIndexWorkerClient(),
  )
  let nextIndex = 0

  try {
    await Promise.all(
      workers.map(async worker => {
        while (true) {
          const currentIndex = nextIndex
          nextIndex++
          if (currentIndex >= targets.length) {
            break
          }
          const target = targets[currentIndex]!
          const startedAt = Date.now()
          try {
            await worker.build({
              rootDir: target.rootDir,
              outputDir: target.outputDir,
            })
            try {
              const { refreshMemoryIndexSkillRuntime } = await import(
                '../commands/memory-index/refreshMemoryIndexSkillRuntime.js'
              )
              await refreshMemoryIndexSkillRuntime()
            } catch (error) {
              logForDebugging(
                `auto-memory-index: skill refresh skipped for ${target.outputDir}: ${errorMessage(error)}`,
                { level: 'debug' },
              )
            }
            logForDebugging(
              `auto-memory-index: updated ${target.outputDir} in ${Date.now() - startedAt}ms`,
              { level: 'debug' },
            )
          } catch (error) {
            logForDebugging(
              `auto-memory-index: failed for ${target.outputDir}: ${errorMessage(error)}`,
              { level: 'warn' },
            )
          }
        }
      }),
    )
  } finally {
    await Promise.all(workers.map(worker => worker.close()))
  }
}

function scheduleAutoMemoryIndexRun(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
  }

  debounceTimer = setTimeout(() => {
    debounceTimer = null
    if (runningPromise) {
      scheduleAutoMemoryIndexRun()
      return
    }

    runningPromise = runPendingAutoMemoryIndexTargets().finally(() => {
      runningPromise = null
      if (pendingTargets.size > 0) {
        scheduleAutoMemoryIndexRun()
      }
    })
  }, AUTO_MEMORY_INDEX_DEBOUNCE_MS)
  debounceTimer.unref?.()
}

async function flushPendingAutoMemoryIndex(): Promise<void> {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }

  if (runningPromise) {
    await runningPromise
  }

  if (pendingTargets.size === 0) {
    return
  }

  runningPromise = runPendingAutoMemoryIndexTargets().finally(() => {
    runningPromise = null
  })
  await runningPromise

  if (pendingTargets.size > 0) {
    await flushPendingAutoMemoryIndex()
  }
}

export function queueAutoMemoryIndexBuild(rootDir: string): void {
  if (!autoMemoryIndexEnabled()) {
    return
  }

  const normalizedRootDir = resolve(rootDir)
  const outputDir = join(normalizedRootDir, DEFAULT_OUTPUT_DIR_NAME)
  registerAutoMemoryIndexCleanup()
  pendingTargets.set(outputDir, {
    rootDir: normalizedRootDir,
    outputDir,
  })
  scheduleAutoMemoryIndexRun()
}

export async function buildAutoMemoryIndexBeforeCompaction(
  agentId?: AgentId,
): Promise<void> {
  if (agentId) {
    return
  }

  queueAutoMemoryIndexBuild(getProjectRoot())
  await flushPendingAutoMemoryIndex()
}

export async function flushPendingAutoMemoryIndexForTesting(): Promise<void> {
  await flushPendingAutoMemoryIndex()
}

export function _resetAutoMemoryIndexStateForTesting(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
  }
  cleanupRegistered = false
  debounceTimer = null
  runningPromise = null
  pendingTargets.clear()
}
