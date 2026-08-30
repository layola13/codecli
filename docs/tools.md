# Claude Code 工具定义机制

> 本文档记录 Claude Code(codecli,反编译源码 `E:/projects/codecli/src`)如何定义和组织它的工具(Edit / Write / Read / Bash 等)。

所有工具源码位于 `src/tools/`,每个工具一个子目录。核心定义模式通过 `buildTool({...})` 构建,再以 `satisfies ToolDef<...>` 做类型校验。

---

## 1. 核心定义骨架(`src/Tool.ts`)

工具的"形状"由 `Tool` 类型定义,`buildTool()` 是工厂函数:

```typescript
// src/Tool.ts:785
export function buildTool<D extends AnyToolDef>(def: D): BuiltTool<D> {
  return {
    ...TOOL_DEFAULTS,            // 安全的默认值
    userFacingName: () => def.name,
    ...def,                      // 用户传入的具体定义
  } as BuiltTool<D>
}
```

`buildTool` 提供的默认值(fail-closed,安全优先,见 `Tool.ts:759`):

| 字段 | 默认值 | 含义 |
|------|--------|------|
| `isEnabled` | `() => true` | 默认启用 |
| `isConcurrencySafe` | `() => false` | 默认非并发安全 |
| `isReadOnly` | `() => false` | 默认认为是写操作 |
| `isDestructive` | `() => false` | 默认非破坏性 |
| `checkPermissions` | 自动放行 `{ behavior: 'allow', updatedInput }` | 交给通用权限系统 |
| `toAutoClassifierInput` | `() => ''` | 跳过安全分类器 |
| `userFacingName` | `() => def.name` | 显示名取工具名 |

---

## 2. `Tool` 类型字段一览(`Tool.ts:364`)

| 类别 | 字段 | 作用 |
|------|------|------|
| **标识** | `name`, `aliases`, `searchHint` | 工具名、别名(重命名兼容)、关键词搜索提示(3–10词,ToolSearch用) |
| **Schema** | `inputSchema`(Zod), `outputSchema`, `inputJSONSchema`(MCP用) | 输入输出校验,转成发给模型的 JSON schema |
| **执行** | `call(args, context, canUseTool, parentMessage, onProgress)` | 真正执行逻辑,返回 `Promise<ToolResult<Output>>` |
| **校验链** | `validateInput` → `checkPermissions` | 先校验输入合法性,再问权限 |
| **描述** | `description(input, options)`, `prompt(options)` | 给模型看的描述文字(动态生成) |
| **渲染** | `renderToolUseMessage`, `renderToolResultMessage`, `renderToolUseRejectedMessage`, `renderToolUseErrorMessage`, `renderToolUseTag` | UI 上的展示 |
| **元信息** | `isReadOnly`, `isConcurrencySafe`, `isDestructive`, `isSearchOrReadCommand`, `isOpenWorld`, `shouldDefer`, `alwaysLoad` | 控制行为:是否只读/并发安全/破坏性/是否延迟加载 |
| **路径** | `getPath(input)`, `backfillObservableInput(input)` | 涉及哪个文件;填充可观察输入(给 hook/SDK 流用) |
| **权限匹配** | `preparePermissionMatcher(input)` | 为 hook 的 `if` 条件准备匹配器(如 `Bash(git *)`) |
| **结果转换** | `mapToolResultToToolResultBlockParam(output, toolUseID)` | 把 output 转成发给 API 的 `tool_result` 块 |
| **搜索索引** | `extractSearchText`, `getToolUseSummary`, `getActivityDescription` | 转录检索 / 紧凑视图摘要 / spinner 描述 |
| **输出尺寸** | `maxResultSizeChars` | 超过则落盘给路径预览 |
| **严格模式** | `strict` | 严格遵循参数 schema |

### `ValidationResult`

```typescript
// Tool.ts:95
export type ValidationResult =
  | { result: true }
  | { result: false; message: string; errorCode: number }
```

### `ToolResult<T>`

```typescript
// Tool.ts:323
export type ToolResult<T> = {
  data: T
  newMessages?: (UserMessage | AssistantMessage | AttachmentMessage | SystemMessage)[]
  contextModifier?: (context: ToolUseContext) => ToolUseContext
  mcpMeta?: { _meta?: Record<string, unknown>; structuredContent?: Record<string, unknown> }
}
```

---

## 3. 三个文件工具的实际定义

### 3.1 FileReadTool(只读,`src/tools/FileReadTool/FileReadTool.ts:337`)

```typescript
export const FileReadTool = buildTool({
  name: FILE_READ_TOOL_NAME,
  searchHint: 'read files, images, PDFs, notebooks',
  maxResultSizeChars: Infinity,   // Read 结果永不落盘(否则 Read→文件→Read 循环)
  strict: true,
  isConcurrencySafe() { return true },   // 只读可并发
  isReadOnly() { return true },
  isSearchOrReadCommand() { return { isSearch: false, isRead: true } },
  async validateInput(input, ctx) { ... },   // 校验 pages、deny 规则、二进制、设备文件
  async call({ file_path, offset, limit, pages }, context, ...) { ... },
  mapToolResultToToolResultBlockParam(data, toolUseID) {
    switch (data.type) { case 'image': ...; case 'text': ... }
  },
} satisfies ToolDef<InputSchema, Output>)
```

- **inputSchema**:`z.strictObject({ file_path, offset, limit, pages })`
- **outputSchema**:`z.discriminatedUnion('type', [text, image, notebook, pdf, parts, file_unchanged])` — 按"读出来的是啥"分支
- 特色:
  - 去重:同一 range + mtime 不变则返回 `file_unchanged` stub 省token(可由 `tengu_read_dedup_killswitch` 关闭)
  - 图片按 token 预算压缩(`readImageWithTokenBudget`)
  - PDF 分页提取(`pages` 参数)
  - macOS 截图路径 thin-space(U+202F)兼容

#### 3.1.1 "探测行数"机制(Read 不一次全读)

Read 工具**不是一次性把整个文件读进上下文**。它先按范围读一段,同时**探测并返回总行数**,让模型自行决定是否用 `offset`/`limit` 继续读。这不是一个独立工具,而是 Read 内置的"读 + 探测"行为。

**默认上限**(`src/tools/FileReadTool/prompt.ts`):

```typescript
export const FILE_READ_TOOL_NAME = 'Read'
export const MAX_LINES_TO_READ = 2000          // 默认一次最多读 2000 行
export const LINE_FORMAT_INSTRUCTION =
  '- Results are returned using cat -n format, with line numbers starting at 1'
export const OFFSET_INSTRUCTION_DEFAULT =
  "- You can optionally specify a line offset and limit ... but it's recommended to read the whole file by not providing these parameters"
export const OFFSET_INSTRUCTION_TARGETED =
  '- When you already know which part of the file you need, only read that part.'
```

给模型的 prompt 运行时拼装(`prompt.ts:39`):
> `By default, it reads up to ${MAX_LINES_TO_READ} lines starting from the beginning of the file`

**两条读取路径**(`src/utils/readFileInRange.ts`),都返回相同的"探测"结构:

```typescript
export type ReadFileRangeResult = {
  content: string        // 实际读到的内容
  lineCount: number      // 实际读出的行数(numLines)
  totalLines: number     // ★ 文件总行数(探测结果)—— 范围外的行只计数不入内存
  totalBytes: number
  readBytes: number
  mtimeMs: number
  truncatedByBytes?: boolean
}
```

- **Fast path**(常规文件 < 10MB,`FAST_PATH_MAX_SIZE`):`readFile()` 整文件进内存再 split,**一次性得到 totalLines**。
- **Streaming path**(大文件 / 管道 / 设备):`createReadStream` 逐块扫描 `\n`,**范围外的行只 `currentLineIndex++` 计数后丢弃**,不累积内容 —— 读 100GB 文件的第 1 行也不会爆内存。`lineIndex`/`totalLines` 即"探测"出的行数。

Read 的 `mapToolResultToToolResultBlockParam` 把 `startLine` + `numLines` + `totalLines` 拼成带 `cat -n` 行号的内容回给模型;当 `offset` 超过文件长度,返回 warning:
> `<system-reminder>Warning: the file exists but is shorter than the provided offset (${startLine}). The file has ${totalLines} lines.</system-reminder>`

模型看到 `totalLines` 远大于已读行数,就知道文件没读完,需带 `offset`/`limit` 再调 Read。

**附件(@-mention)流程的截断回退**(`src/utils/attachments.ts:3146`):

```typescript
// 先尝试完整读
try {
  const result = await FileReadTool.call(fileInput, toolUseContext)
  return { type: 'file', filename, content: result.data, ... }
} catch (error) {
  if (error instanceof MaxFileReadTokenExceededError || error instanceof FileTooLargeError) {
    return await readTruncatedFile()   // ★ 回退:只读前 MAX_LINES_TO_READ(2000)行
  }
  throw error
}

async function readTruncatedFile() {
  const truncatedInput = {
    file_path: filename,
    offset: offset ?? 1,
    limit: MAX_LINES_TO_READ,          // 只取前 2000 行
  }
  const result = await FileReadTool.call(truncatedInput, toolUseContext)
  return { type: 'file', filename, content: result.data, truncated: true, ... }
}
```

附件太撑爆 token/字节上限时,回退到只读前 2000 行,并加截断说明(`src/utils/messages.ts:3565`):
> `Note: The file ${filename} was too large and has been truncated to the first ${MAX_LINES_TO_READ} lines. Don't tell the user about this truncation. Use Read to read more of the file if you need.`

> 关键点:
> - 没有"探测行数"独立工具;**探测是 Read 的一部分**(`readFileInRange` 总返回 `totalLines`)。
> - 三道闸门:`maxSizeBytes`(文件总大小,256KB,读前 stat 检查 → `FileTooLargeError`)、`maxTokens`(输出 token,25000,读后 API 计数 → `MaxFileReadTokenExceededError`)、`MAX_LINES_TO_READ`(2000 行,仅 prompt 声称默认 + 截断回退用)。
> - 模型靠返回的 `totalLines` 自行决定是否分页续读 —— 这就是用户观察到的"先探测行数再决定读多少"的实质。

### 3.2 FileEditTool(原地编辑,`src/tools/FileEditTool/FileEditTool.ts:87`)

```typescript
export const FileEditTool = buildTool({
  name: FILE_EDIT_TOOL_NAME,
  searchHint: "modify file contents in place",
  maxResultSizeChars: 100_000,
  strict: true,
  async validateInput(input, ctx) { /* 见下文校验链 */ },
  async call(input, { readFileState, ... }, ...) {
    // 读旧内容 → findActualString(引号归一化) → getPatchForEdit → writeTextContent
    // 通知 LSP(didChange/didSave)、VSCode、更新 readFileState
  },
  mapToolResultToToolResultBlockParam(data, id) {
    return { content: `The file ${filePath} has been updated successfully...` }
  },
} satisfies ToolDef<..., FileEditOutput>)
```

- **inputSchema**:`{ file_path, old_string, new_string, replace_all }`
- **outputSchema**:`{ filePath, oldString, newString, originalFile, structuredPatch, userModified, replaceAll }`
- `validateInput` 校验链(`FileEditTool.ts:138`):
  1. `old_string === new_string` → 拒(errorCode 1)
  2. deny 规则 → 拒(errorCode 2)
  3. **安全**:UNC 路径(`\\`/`//`)跳过 fs 操作,防 NTLM 凭据泄漏
  4. 文件 > 1 GiB → 拒(errorCode 10)
  5. 文件不存在且 `old_string !== ""` → 拒,并 `findSimilarFile` / `suggestPathUnderCwd` 给建议(errorCode 4)
  6. 文件存在但 `old_string === ""` 且文件非空 → 拒(errorCode 3)
  7. `.ipynb` → 拒,提示用 NotebookEditTool(errorCode 5)
  8. **必须先 Read 过**(`readFileState` 查不到或不完整视图)→ 拒(errorCode 6)← Edit 标志性守卫
  9. 文件被外部修改(mtime > 读时戳;Windows 下再用内容比对兜底防误报)→ 拒(errorCode 7)
  10. `old_string` 找不到(`findActualString` 引号归一化后)→ 拒(errorCode 8)
  11. 多匹配但 `replace_all === false` → 拒(errorCode 9)
  12. 对 Claude settings 文件的额外校验(`validateInputForSettingsFileEdit`)

### 3.3 FileWriteTool(全量写,`src/tools/FileWriteTool/FileWriteTool.ts:95`)

```typescript
export const FileWriteTool = buildTool({
  name: FILE_WRITE_TOOL_NAME,
  searchHint: "create or overwrite files",
  maxResultSizeChars: 100_000,
  strict: true,
  async validateInput({ file_path, content }, ctx) { ... },
  async call({ file_path, content }, { readFileState, ... }, ...) {
    // 写时强制 LF —— 不重写行尾(此前会破坏 CRLF 文件)
    // 自动 mkdir -p
  },
  mapToolResultToToolResultBlockParam({ filePath, type }, id) {
    switch (type) {
      case "create": return { content: `File created successfully at: ${filePath}` }
      case "update": return { content: `The file ${filePath} has been updated successfully.` }
    }
  },
} satisfies ToolDef<InputSchema, Output>)
```

- **inputSchema**:`z.strictObject({ file_path, content })`(无 replace_all)
- **outputSchema**:`type`(create/update)+ `filePath` + `content` + `structuredPatch` + `originalFile`(null 表示新建)+ 可选 `gitDiff`
- 与 Edit 的区别:Write 是**整文件覆盖**,Edit 是**精确字符串替换**

---

## 4. Schema 如何给到模型

- 工具用 **Zod v4** 定义 schema:`z.strictObject({ ... .describe("...") })`,`.describe()` 文字自动成为模型可见的参数说明。
- schema 在 `inputSchema` getter 里用 `lazySchema(() => ...)` **惰性求值**,支持运行时 A/B 开关。
- `description()` / `prompt()` 是异步动态生成。例如 Edit 的 prompt 根据是否启用紧凑行号前缀切换文案:
  ```typescript
  // src/tools/FileEditTool/prompt.ts:13
  const prefixFormat = isCompactLinePrefixEnabled()
    ? 'line number + tab'
    : 'spaces + line number + arrow'
  ```
- MCP 工具可直接用 `inputJSONSchema` 提供 JSON Schema,无需从 Zod 转换。

---

## 5. 工具执行流水线

调用一个工具时的顺序大致为:

```
backfillObservableInput       ← 展开 ~、相对路径(hook 绕过防护)
  → validateInput            ← 输入合法性(文件存在 / 已读 / 匹配数)
  → checkPermissions         ← 权限(ask / allow / deny)
  → call(...)                ← 执行,LSP/VSCode 通知,readFileState 更新
  → mapToolResultToToolResultBlockParam  ← 转成 tool_result 发给模型
```

### 关键上下文:`ToolUseContext`(`Tool.ts:160`)

`call()` 与 `validateInput()` 收到的 `context: ToolUseContext` 携带的大量运行时状态,关键成员:

| 成员 | 作用 |
|------|------|
| `readFileState: FileStateCache` | 路径 → {content, timestamp, offset, limit} 缓存,Edit/Write 安全的基石 |
| `getAppState()` / `setAppState()` | 读写全局应用状态(含 `toolPermissionContext`) |
| `abortController` | 取消信号 |
| `options` | tools、commands、mainLoopModel、mcpClients 等 |
| `fileReadingLimits?` | Read 的 maxTokens / maxSizeBytes 覆盖 |
| `dynamicSkillDirTriggers?` | 文件触发的技能目录发现 |
| `nestedMemoryAttachmentTriggers?` | 嵌套内存(CLAUDE.md)附件触发 |
| `requestPrompt?` | 交互式向用户提问(仅 REPL) |

---

## 6. 关键设计点总结

1. **统一骨架**:所有工具走 `buildTool` + `satisfies ToolDef`,缺省值集中在一处,60+ 工具共享。
2. **Zod 驱动 schema**:`.describe()` 文案自动成为模型可见参数说明,无需手写 JSON Schema(MCP 工具可用 `inputJSONSchema` 旁路)。
3. **Read-then-Edit/Wr 守卫**:`readFileState`(路径 → 时间戳 + 内容 + offset/limit 缓存)是写操作安全的基石,Edit/Write 都要求先 Read 过且文件无外部修改;Windows 下 timestamp 变化还会用内容比对兜底防误报。
4. **路径展开与 UNC 防护**:`backfillObservableInput` 统一 `expandPath`(防 hook 绕过);UNC 路径跳过 fs 操作以防 NTLM 凭据泄漏。
5. **惰性 schema**:`lazySchema` 延迟 Zod 构造,支持运行时开关(行号前缀格式、文件读上限等)。
6. **结果尺寸控制**:`maxResultSizeChars` 超过则落盘给路径预览;Read 设为 `Infinity`(自己有 token 上限,且落盘会循环)。
7. **去重省 token**:Read 对同 range + mtime 不变的文件返回 `file_unchanged` stub。
8. **生态通知**:Edit/Write 完成后通知 LSP(didChange/didSave)、VSCode、自动索引;触发路径相关的技能发现与条件激活。

---

## 7. 全部工具清单(`src/tools/`)

文件类:`FileReadTool`、`FileEditTool`、`FileWriteTool`、`NotebookEditTool`、`GlobTool`、`GrepTool`

执行/控制类:`BashTool`、`PowerShellTool`、`REPLTool`、`SleepTool`

Agent / 任务类:`AgentTool`、`TaskCreateTool`、`TaskGetTool`、`TaskListTool`、`TaskUpdateTool`、`TaskOutputTool`、`TaskStopTool`、`TeamCreateTool`、`TeamDeleteTool`、`SendMessageTool`、`WorkflowTool`、`RemoteTriggerTool`、`SuggestBackgroundPRTool`

权限 / 模式类:`EnterPlanModeTool`、`ExitPlanModeTool`、`EnterWorktreeTool`、`ExitWorktreeTool`、`VerifyPlanExecutionTool`、`AskUserQuestionTool`、`BriefTool`、`ConfigTool`

搜索 / 网络类:`WebFetchTool`、`WebSearchTool`、`ToolSearchTool`

MCP / LSP 类:`MCPTool`、`McpAuthTool`、`ListMcpResourcesTool`、`ReadMcpResourceTool`、`LSPTool`

Skill / Todo 类:`SkillTool`、`TodoWriteTool`

调度类:`ScheduleCronTool`

内部 / 特殊类:`TungstenTool`、`SyntheticOutputTool`、`shared`(共享逻辑)、`testing`(测试辅助)

---

## 参考文件索引

- `src/Tool.ts` — `Tool` 类型、`buildTool`、`ToolUseContext`、`ToolResult`、`ValidationResult`
- `src/tools/FileReadTool/FileReadTool.ts` — Read 完整实现
- `src/tools/FileEditTool/FileEditTool.ts` — Edit 完整实现(校验链最复杂)
- `src/tools/FileWriteTool/FileWriteTool.ts` — Write 完整实现
- `src/tools/FileEditTool/prompt.ts`、`FileWriteTool/prompt.ts`、`FileReadTool/prompt.ts` — 各工具给模型的动态描述
- `src/tools/utils.ts` — `sourceToolUseID` 标记辅助
- `src/utils/permissions/filesystem.js` — `checkReadPermissionForTool` / `checkWritePermissionForTool` / `matchingRuleForInput`
