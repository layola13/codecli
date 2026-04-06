import { describe, expect, it } from 'bun:test'
import {
  CODE_INDEX_SKILL_NAME,
  getCodeIndexBlockingRequirement,
  getCodeIndexToolDeferralHint,
} from './codeIndexGuidance.js'

describe('codeIndexGuidance', () => {
  it('renders a blocking requirement for system guidance', () => {
    const text = getCodeIndexBlockingRequirement({
      readToolName: 'Read',
      searchTools: 'the Glob or Grep tools',
      skillToolName: 'Skill',
    })

    expect(text).toContain(`\`${CODE_INDEX_SKILL_NAME}\``)
    expect(text).toContain('MUST invoke')
    expect(text).toContain('before using the Glob or Grep tools, Read')
    expect(text).toContain('code map only')
    expect(text).toContain('read the original source')
  })

  it('renders a deferral hint for search tools', () => {
    const text = getCodeIndexToolDeferralHint({
      skillToolName: 'Skill',
      toolName: 'Grep',
    })

    expect(text).toContain('invoke the Skill tool')
    expect(text).toContain('before using Grep')
    expect(text).toContain('code map only')
    expect(text).toContain('read the original source')
  })
})
