import { getQuietModeOptIn } from '../bootstrap/state.js'

export function isQuietModeEnabled(): boolean {
  return getQuietModeOptIn()
}
