import { describe, expect, it } from 'bun:test'
import { resolveAutoJudgeOutcome } from './resolveAutoJudgeOutcome.js'

describe('resolveAutoJudgeOutcome', () => {
  it('fails closed when the judge does not return a final verdict', () => {
    const result = resolveAutoJudgeOutcome(
      'I ran a few checks, but the report stopped before the final verdict.',
    )

    expect(result.verdict).toBe('FAIL')
    expect(result.conciseIssues).toContain(
      'did not produce a final VERDICT line',
    )
  })

  it('allows completion only on explicit PASS verdicts', () => {
    expect(
      resolveAutoJudgeOutcome('Everything passed.\nVERDICT: PASS'),
    ).toEqual({
      verdict: 'PASS',
      conciseIssues: '',
    })
  })

  it('preserves failing verdicts and their issue summary', () => {
    const result = resolveAutoJudgeOutcome(
      'Command output showed a regression.\nVERDICT: FAIL',
    )

    expect(result.verdict).toBe('FAIL')
    expect(result.conciseIssues).toContain('Command output showed a regression')
  })
})
