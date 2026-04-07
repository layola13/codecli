import { describe, expect, it } from 'bun:test'
import {
  MEMORY_INDEX_SKILL_NAME,
  getMemoryIndexBlockingRequirement,
  getMemoryIndexToolDeferralHint,
} from './memoryIndexGuidance.js'

describe('memoryIndexGuidance', () => {
  it('renders a high-priority on-demand recall rule for system guidance', () => {
    const text = getMemoryIndexBlockingRequirement({
      readToolName: 'Read',
      bashToolName: 'Bash',
      skillToolName: 'Skill',
    })

    expect(text).toContain(`\`${MEMORY_INDEX_SKILL_NAME}\``)
    expect(text).toContain('preferred first-stop recall path')
    expect(text).toContain('before using Read or the Bash tool')
    expect(text).toContain('always-on memory layer like `/pin`')
    expect(text).toContain('source of truth')
  })

  it('renders a deferral hint that keeps memory-index below pinned facts', () => {
    const text = getMemoryIndexToolDeferralHint({
      skillToolName: 'Skill',
      toolName: 'Read',
    })

    expect(text).toContain('invoke the Skill tool')
    expect(text).toContain('before using Read')
    expect(text).toContain('not an always-on layer like `/pin`')
    expect(text).toContain('history-sensitive work')
  })
})
