export type Verdict = 'PASS' | 'FAIL' | 'PARTIAL'

const VERDICT_RE = /VERDICT:\s*(PASS|FAIL|PARTIAL)/

/**
 * Parse the VERDICT from a verification agent's output text.
 * Returns null if no verdict line is found.
 */
export function parseVerdict(text: string): Verdict | null {
  const m = text.match(VERDICT_RE)
  return m ? (m[1] as Verdict) : null
}
