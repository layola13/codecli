export const CODE_INDEX_SKILL_NAME = 'code-index'

export const CODE_INDEX_TASK_SCOPE =
  'repository analysis, architecture tracing, dependency tracing, symbol lookup, or locating implementation files'

export const CODE_INDEX_SOURCE_OF_TRUTH_REQUIREMENT =
  'Treat the code index and skeleton as a code map only: use them to find the right files, then read the original source before asserting implementation details, quoting behavior, or making edits.'

export function getCodeIndexBlockingRequirement(args: {
  readToolName: string
  searchTools: string
  skillToolName: string
}): string {
  return `If \`${CODE_INDEX_SKILL_NAME}\` is available and the task involves ${CODE_INDEX_TASK_SCOPE}, you MUST invoke the ${args.skillToolName} tool for \`${CODE_INDEX_SKILL_NAME}\` before using ${args.searchTools}, ${args.readToolName}, or shell-based repo scans. Only skip this when the index is stale, missing the needed detail, or the user explicitly asks for raw source inspection first. ${CODE_INDEX_SOURCE_OF_TRUTH_REQUIREMENT}`
}

export function getCodeIndexToolDeferralHint(args: {
  skillToolName: string
  toolName: string
}): string {
  return `If \`${CODE_INDEX_SKILL_NAME}\` is listed in system reminders and the task involves ${CODE_INDEX_TASK_SCOPE}, invoke the ${args.skillToolName} tool for \`${CODE_INDEX_SKILL_NAME}\` before using ${args.toolName} for broad repository scanning. Use ${args.toolName} after the index points you to the right files or proves insufficient. ${CODE_INDEX_SOURCE_OF_TRUTH_REQUIREMENT}`
}
