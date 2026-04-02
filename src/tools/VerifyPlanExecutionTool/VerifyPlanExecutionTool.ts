import type { z } from 'zod/v4'

export const VerifyPlanExecutionTool = {
  name: 'VerifyPlanExecution',
  aliases: [],
  searchHint: 'verify plan execution',
  async call() {
    return { return_value: '', data: {} }
  },
  async description() {
    return 'Verify plan execution tool'
  },
  inputSchema: {} as z.ZodType,
  isConcurrencySafe() {
    return true
  },
  isEnabled() {
    return false
  },
  isReadOnly() {
    return true
  },
  maxResultSizeChars: 100000,
  async checkPermissions() {
    return { result: true as const }
  },
  async prompt() {
    return ''
  },
  userFacingName() {
    return 'VerifyPlanExecution'
  },
  toAutoClassifierInput() {
    return ''
  },
  mapToolResultToToolResultBlockParam(_content: unknown, toolUseID: string) {
    return { type: 'tool_result' as const, tool_use_id: toolUseID, content: '' }
  },
}
