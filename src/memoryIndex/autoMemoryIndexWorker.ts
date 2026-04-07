import { parentPort } from 'node:worker_threads'
import { buildMemoryIndex } from './build.js'

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

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

if (!parentPort) {
  throw new Error('auto memory-index worker requires a parent port')
}

parentPort.on('message', async (request: AutoMemoryIndexWorkerRequest) => {
  let response: AutoMemoryIndexWorkerResponse
  try {
    await buildMemoryIndex({
      rootDir: request.rootDir,
      outputDir: request.outputDir,
    })
    response = { ok: true }
  } catch (error) {
    response = {
      ok: false,
      error: describeError(error),
    }
  }

  parentPort.postMessage(response)
})
