export const MEMORY_INDEX_SKILL_NAME = 'memory-index'

export const MEMORY_INDEX_TASK_SCOPE =
  'project history, prior user requests, previous plans, earlier code edits, or why code changed'

export const MEMORY_INDEX_USAGE_PRIORITY =
  'Treat the memory index as an on-demand recall layer: higher priority than raw transcript or plan inspection for history-sensitive tasks, but lower priority than `/pin` / pinned facts because it is not an always-on prompt layer.'

export const MEMORY_INDEX_SOURCE_OF_TRUTH_REQUIREMENT =
  'Treat the memory index as a durable memory map built from project-local raw transcript JSONL under `./.claude/projects/context/transcripts`, project-local file-history snapshots under `./.claude/projects/context/file-history`, plus matching Codex session logs under `~/.codex/sessions`: `index/events.jsonl` is the source of truth, preserving `user_prompt.fullText/rawContent`, `plan.content`, `code_edit.files[].diffText/lineRanges` for code, and `code_edit.files[].beforeContent/afterContent` for non-code text when available, while `index/memory_objects.jsonl` is the derived semantic layer for long-term user preferences, stable constraints, decision rationales, and superseded decisions. Do not treat `.claude/context/session_state.py`, `.claude/context/session_history.py`, `.claude/context/session_metrics.py`, or session-memory notes as source of truth; those are lossy compact summaries. Use raw transcript JSONL, matching Codex session logs, or plan files only when you need a detail the memory index still does not preserve.'

export function getMemoryIndexBlockingRequirement(args: {
  readToolName: string
  bashToolName: string
  skillToolName: string
}): string {
  return `If \`${MEMORY_INDEX_SKILL_NAME}\` is available and the task involves ${MEMORY_INDEX_TASK_SCOPE}, treat it as the preferred first-stop recall path before using ${args.readToolName} or the ${args.bashToolName} tool to inspect raw transcript files, plan files, or shell-scan session history. Do NOT treat it as an always-on memory layer like \`/pin\` or pinned facts; invoke it only when older history actually matters. Only skip this when the memory index is stale, missing, or insufficient for the task. ${MEMORY_INDEX_USAGE_PRIORITY} ${MEMORY_INDEX_SOURCE_OF_TRUTH_REQUIREMENT}`
}

export function getMemoryIndexToolDeferralHint(args: {
  skillToolName: string
  toolName: string
}): string {
  return `If \`${MEMORY_INDEX_SKILL_NAME}\` is listed in system reminders and the task involves ${MEMORY_INDEX_TASK_SCOPE}, invoke the ${args.skillToolName} tool for \`${MEMORY_INDEX_SKILL_NAME}\` before using ${args.toolName} to inspect raw transcript JSONL, plan files, or shell-scan session history. This is targeted recall for history-sensitive work, not an always-on layer like \`/pin\`. ${MEMORY_INDEX_USAGE_PRIORITY} ${MEMORY_INDEX_SOURCE_OF_TRUTH_REQUIREMENT}`
}
