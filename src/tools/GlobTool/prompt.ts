import { getCodeIndexToolDeferralHint } from '../../utils/codeIndexGuidance.js'
import { SKILL_TOOL_NAME } from '../SkillTool/constants.js'

export const GLOB_TOOL_NAME = 'Glob'

export const DESCRIPTION = `- Fast file pattern matching tool that works with any codebase size
- ${getCodeIndexToolDeferralHint({
  skillToolName: SKILL_TOOL_NAME,
  toolName: GLOB_TOOL_NAME,
})}
- Supports glob patterns like "**/*.js" or "src/**/*.ts"
- Returns matching file paths sorted by modification time
- Use this tool when you need to find files by name patterns
- When you are doing an open ended search that may require multiple rounds of globbing and grepping, use the Agent tool instead`
