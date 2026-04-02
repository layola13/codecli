import type { z } from 'zod/v4'

export const REPLTool = {
  name: 'REPLTool',
  aliases: [],
  searchHint: 'execute REPL commands',
  async call() {
    return { return_value: '', data: { result: [] } }
  },
  async description() {
    return 'REPL tool'
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
  maxResultSizeChars: Infinity,
  async checkPermissions() {
    return { result: true as const }
  },
  async prompt() {
    return ''
  },
  userFacingName() {
    return 'REPL'
  },
  toAutoClassifierInput() {
    return ''
  },
  mapToolResultToToolResultBlockParam(_content: unknown, toolUseID: string) {
    return { type: 'tool_result' as const, tool_use_id: toolUseID, content: '' }
  },
}
