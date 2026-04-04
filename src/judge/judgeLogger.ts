import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getProjectRoot } from '../bootstrap/state.js'
import type { Verdict } from './parseVerdict.js'

/**
 * Save the full judge report to .claude/logs/judge/<timestamp>-<verdict>.md
 * Returns the absolute path of the saved log file.
 */
export async function saveJudgeLog(params: {
  verdict: Verdict
  report: string
  turnNumber: number
  timestamp?: Date
}): Promise<string> {
  const { verdict, report, turnNumber, timestamp = new Date() } = params

  const projectRoot = getProjectRoot()
  const logDir = join(projectRoot, '.claude', 'logs', 'judge')

  await mkdir(logDir, { recursive: true })

  const ts = timestamp.toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filename = `${ts}-turn${turnNumber}-${verdict.toLowerCase()}.md`
  const filepath = join(logDir, filename)

  const content = [
    `# Judge Report — Turn ${turnNumber}`,
    ``,
    `- **Timestamp:** ${timestamp.toISOString()}`,
    `- **Verdict:** ${verdict}`,
    `- **Turn:** ${turnNumber}`,
    ``,
    `---`,
    ``,
    report,
    ``,
  ].join('\n')

  await writeFile(filepath, content, 'utf-8')

  return filepath
}
