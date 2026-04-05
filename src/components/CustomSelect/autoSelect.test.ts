import { describe, expect, it } from 'bun:test'
import { getAutoSelectFirstValue } from './autoSelect.js'

describe('getAutoSelectFirstValue', () => {
  it('returns the first enabled non-input option', () => {
    expect(
      getAutoSelectFirstValue([
        {
          type: 'input',
          label: 'notes',
          value: 'input',
          onChange: () => {},
        },
        {
          label: 'Allow once',
          value: 'allow-once',
          disabled: true,
        },
        {
          label: 'Allow always',
          value: 'allow-always',
        },
      ]),
    ).toBe('allow-always')
  })

  it('returns undefined when no enabled non-input option exists', () => {
    expect(
      getAutoSelectFirstValue([
        {
          type: 'input',
          label: 'notes',
          value: 'input',
          onChange: () => {},
        },
        {
          label: 'Disabled',
          value: 'disabled',
          disabled: true,
        },
      ]),
    ).toBeUndefined()
  })
})
