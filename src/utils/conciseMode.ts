import { getConciseModeOptIn } from '../bootstrap/state.js'

export function isConciseEnabled(): boolean {
  return getConciseModeOptIn()
}
