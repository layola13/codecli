import type { z } from 'zod/v4'

export const WorkflowTool = {
  name: 'Workflow',
  aliases: [],
  searchHint: 'run workflow scripts',
  async call() {
    return { return_value: '', data: {} }
  },
  async description() {
    return 'Workflow tool'
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
    return 'Workflow'
  },
  toAutoClassifierInput() {
    return ''
  },
  mapToolResultToToolResultBlockParam(_content: unknown, toolUseID: string) {
    return { type: 'tool_result' as const, tool_use_id: toolUseID, content: '' }
  },
}
