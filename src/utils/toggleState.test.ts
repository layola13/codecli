import { describe, expect, it } from 'bun:test'
import { parseToggleState } from './toggleState.js'

describe('parseToggleState', () => {
  it('toggles when no explicit value is provided', () => {
    expect(parseToggleState('', false)).toBe(true)
    expect(parseToggleState('   ', true)).toBe(false)
  })

  it('accepts explicit on and off variants', () => {
    expect(parseToggleState('on', false)).toBe(true)
    expect(parseToggleState('enabled', false)).toBe(true)
    expect(parseToggleState('off', true)).toBe(false)
    expect(parseToggleState('disabled', true)).toBe(false)
  })

  it('supports toggle aliases when allowed', () => {
    expect(parseToggleState('toggle', false)).toBe(true)
    expect(parseToggleState('switch', true)).toBe(false)
  })

  it('rejects toggle aliases when disabled', () => {
    expect(parseToggleState('toggle', false, { allowToggle: false })).toBeNull()
  })

  it('returns null for unknown input', () => {
    expect(parseToggleState('maybe', false)).toBeNull()
  })
})
