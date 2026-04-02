import { getJudgeModeOptIn } from '../bootstrap/state.js'

export function isJudgeModeEnabled(): boolean {
  return getJudgeModeOptIn()
}
