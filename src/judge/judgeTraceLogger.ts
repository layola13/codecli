import { appendFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  getJudgeModeOptIn,
  getProjectRoot,
  getSessionId,
} from '../bootstrap/state.js'
import { logForDebugging } from '../utils/debug.js'
import { jsonStringify } from '../utils/slowOperations.js'
import type { Verdict } from './parseVerdict.js'

type JudgeTraceDetails = Record<string, unknown>

export type JudgeTraceEntry = {
  stage: string
  turnNumber?: number
  querySource?: string
  agentId?: string
  appJudgeModeOptIn?: boolean
  shouldRun?: boolean
  reason?: string
  verdict?: Verdict
  logFilePath?: string
  blockingErrorCount?: number
  preventContinuation?: boolean
  assistantMessageCount?: number
  details?: JudgeTraceDetails
}

export function getJudgeTracePath(sessionId = getSessionId()): string {
  return join(getProjectRoot(), '.claude', 'logs', 'judge-trace', `${sessionId}.jsonl`)
}

export async function appendJudgeTrace(entry: JudgeTraceEntry): Promise<void> {
  const logPath = getJudgeTracePath()
  const payload = {
    timestamp: new Date().toISOString(),
    sessionId: getSessionId(),
    bootstrapJudgeModeOptIn: getJudgeModeOptIn(),
    ...entry,
  }

  try {
    await mkdir(dirname(logPath), { recursive: true })
    await appendFile(logPath, jsonStringify(payload) + '\n', 'utf8')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logForDebugging(`[judgeTrace] failed to write ${logPath}: ${message}`, {
      level: 'error',
    })
  }
}
