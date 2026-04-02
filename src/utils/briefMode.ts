import { getKairosActive, getUserMsgOptIn } from '../bootstrap/state.js'

export function isBriefEntitled(): boolean {
  return true
}

export function isBriefEnabled(): boolean {
  return getKairosActive() || getUserMsgOptIn()
}

export function isBriefLayoutActive({
  isBriefOnly,
  isTranscriptMode = false,
  viewingAgentTaskId,
}: {
  isBriefOnly: boolean
  isTranscriptMode?: boolean
  viewingAgentTaskId?: string | null
}): boolean {
  return (
    isBriefEnabled() &&
    isBriefOnly &&
    !isTranscriptMode &&
    !viewingAgentTaskId
  )
}
