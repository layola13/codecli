export function parseToggleState(
  args: string,
  current: boolean,
  options?: {
    allowToggle?: boolean
  },
): boolean | null {
  const trimmed = args.trim().toLowerCase()
  if (!trimmed) return !current
  if (
    options?.allowToggle !== false &&
    ['toggle', 'switch'].includes(trimmed)
  ) {
    return !current
  }
  if (['on', 'enable', 'enabled', 'true'].includes(trimmed)) return true
  if (['off', 'disable', 'disabled', 'false'].includes(trimmed)) return false
  return null
}
