import type { OptionWithDescription } from './select.js'

export function getAutoSelectFirstValue<T>(
  options: OptionWithDescription<T>[],
): T | undefined {
  return options.find(option => option.type !== 'input' && !option.disabled)
    ?.value
}
