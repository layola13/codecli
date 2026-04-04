import { describe, expect, it } from 'bun:test'
import { AUTO_JUDGE_QUERY_SOURCE } from './judgeQuerySource.js'

describe('AUTO_JUDGE_QUERY_SOURCE', () => {
  it('uses the dedicated verification agent source', () => {
    expect(AUTO_JUDGE_QUERY_SOURCE).toBe('verification_agent')
  })
})
