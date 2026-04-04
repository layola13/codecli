import { parseVerdict, type Verdict } from './parseVerdict.js'

const MISSING_VERDICT_ISSUE =
  `The judge did not produce a final VERDICT line, so verification is incomplete. ` +
  `Do not mark the task complete yet. Re-run the judge and wait for an explicit ` +
  `VERDICT: PASS, VERDICT: FAIL, or VERDICT: PARTIAL.`

/**
 * Extract a concise issue summary from the judge report for FAIL/PARTIAL verdicts.
 * Takes the first few check items that failed, limited to ~300 chars for the main thread.
 */
function extractConciseIssues(report: string): string {
  const failMatch = report.match(
    /### Check:[^\n]*\n[\s\S]*?Result: FAIL[^\n]*\n?([\s\S]*?)(?=### Check:|VERDICT:|$)/i,
  )
  if (failMatch) {
    const section = failMatch[1].trim()
    return section.length > 400
      ? section.slice(0, 400) + '\n...(see judge log for full details)'
      : section
  }

  return report.length > 300
    ? report.slice(0, 300) + '\n...(see judge log for full details)'
    : report
}

/**
 * Missing/invalid verdicts fail closed so the main task cannot complete
 * without an explicit judge decision.
 */
export function resolveAutoJudgeOutcome(report: string): {
  verdict: Verdict
  conciseIssues: string
} {
  const verdict = parseVerdict(report)
  if (!verdict) {
    return {
      verdict: 'FAIL',
      conciseIssues: MISSING_VERDICT_ISSUE,
    }
  }

  return {
    verdict,
    conciseIssues: verdict === 'PASS' ? '' : extractConciseIssues(report),
  }
}
