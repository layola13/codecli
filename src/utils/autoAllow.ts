import { getAutoAllowOptIn } from '../bootstrap/state.js'

export function isAutoAllowEnabled(): boolean {
  return getAutoAllowOptIn()
}
